/**
 * Monitoring & Alerting Configuration
 *
 * Provides:
 * - Webhook alerting (Slack, Discord, generic)
 * - Uptime self-check on an interval
 * - Critical error threshold alerting
 * - Memory pressure detection
 */

import { logger } from '../utils/logger';
import https from 'https';
import http from 'http';

// ── Types ───────────────────────────────────────────────────

interface AlertPayload {
  level: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  service: string;
  environment: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface MonitoringState {
  errorCount: number;
  lastErrorReset: number;
  lastMemoryWarning: number;
  isHealthy: boolean;
}

// ── State ───────────────────────────────────────────────────

const state: MonitoringState = {
  errorCount: 0,
  lastErrorReset: Date.now(),
  lastMemoryWarning: 0,
  isHealthy: true,
};

const ERROR_THRESHOLD = parseInt(process.env.ALERT_ERROR_THRESHOLD || '50');
const ERROR_WINDOW_MS = parseInt(process.env.ALERT_ERROR_WINDOW_MS || '300000'); // 5 min
const MEMORY_THRESHOLD_MB = parseInt(process.env.ALERT_MEMORY_THRESHOLD_MB || '450');
const MEMORY_CHECK_INTERVAL_MS = 60_000; // 1 min
const SELF_CHECK_INTERVAL_MS = parseInt(process.env.HEALTH_SELF_CHECK_INTERVAL_MS || '300000'); // 5 min

// ── Webhook Sender ──────────────────────────────────────────

function sendWebhook(url: string, payload: AlertPayload): void {
  try {
    const data = formatWebhookPayload(url, payload);
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 5000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          logger.warn(`Alert webhook returned ${res.statusCode}`);
        }
      }
    );

    req.on('error', (err) => {
      logger.warn(`Alert webhook failed: ${err.message}`);
    });

    req.write(data);
    req.end();
  } catch (err) {
    logger.warn(`Alert webhook error: ${err instanceof Error ? err.message : err}`);
  }
}

function formatWebhookPayload(url: string, payload: AlertPayload): string {
  // Slack-format webhook
  if (url.includes('hooks.slack.com')) {
    const emoji =
      payload.level === 'critical' ? ':rotating_light:' :
      payload.level === 'warning' ? ':warning:' : ':information_source:';
    return JSON.stringify({
      text: `${emoji} *[${payload.level.toUpperCase()}] ${payload.title}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `${emoji} *[${payload.level.toUpperCase()}] ${payload.title}*`,
              payload.message,
              `*Service:* ${payload.service} | *Env:* ${payload.environment}`,
              `*Time:* ${payload.timestamp}`,
            ].join('\n'),
          },
        },
      ],
    });
  }

  // Discord webhook
  if (url.includes('discord.com/api/webhooks')) {
    const color =
      payload.level === 'critical' ? 0xff0000 :
      payload.level === 'warning' ? 0xffa500 : 0x00ff00;
    return JSON.stringify({
      embeds: [
        {
          title: `[${payload.level.toUpperCase()}] ${payload.title}`,
          description: payload.message,
          color,
          fields: [
            { name: 'Service', value: payload.service, inline: true },
            { name: 'Environment', value: payload.environment, inline: true },
          ],
          timestamp: payload.timestamp,
        },
      ],
    });
  }

  // Generic JSON webhook
  return JSON.stringify(payload);
}

// ── Public API ──────────────────────────────────────────────

/**
 * Send an alert to all configured webhook URLs
 */
export function sendAlert(
  level: AlertPayload['level'],
  title: string,
  message: string,
  metadata?: Record<string, unknown>
): void {
  const payload: AlertPayload = {
    level,
    title,
    message,
    service: 'boomcard-api',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    metadata,
  };

  logger.warn(`[ALERT:${level}] ${title}: ${message}`);

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl) {
    sendWebhook(webhookUrl, payload);
  }

  // Support multiple webhooks (comma-separated)
  const extraUrls = process.env.ALERT_WEBHOOK_URLS;
  if (extraUrls) {
    extraUrls.split(',').map(u => u.trim()).filter(Boolean).forEach(url => {
      sendWebhook(url, payload);
    });
  }
}

/**
 * Track an error occurrence. Sends alert when threshold is exceeded.
 */
export function trackError(error: Error, context?: Record<string, unknown>): void {
  const now = Date.now();

  // Reset counter if window has elapsed
  if (now - state.lastErrorReset > ERROR_WINDOW_MS) {
    state.errorCount = 0;
    state.lastErrorReset = now;
  }

  state.errorCount++;

  if (state.errorCount === ERROR_THRESHOLD) {
    sendAlert(
      'critical',
      'Error threshold exceeded',
      `${ERROR_THRESHOLD} errors in the last ${ERROR_WINDOW_MS / 1000}s. Latest: ${error.message}`,
      { errorCount: state.errorCount, ...context }
    );
  }
}

/**
 * Start periodic memory and self-health monitoring.
 * Call once during server startup.
 */
export function startMonitoring(port: number): void {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('[Monitoring] Skipped in non-production environment');
    return;
  }

  logger.info('[Monitoring] Starting production monitors');

  // Memory pressure check
  const memoryInterval = setInterval(() => {
    const memMB = process.memoryUsage().rss / 1024 / 1024;
    const now = Date.now();

    if (memMB > MEMORY_THRESHOLD_MB && now - state.lastMemoryWarning > 300_000) {
      state.lastMemoryWarning = now;
      sendAlert(
        'warning',
        'High memory usage',
        `RSS memory at ${memMB.toFixed(0)}MB (threshold: ${MEMORY_THRESHOLD_MB}MB)`,
        {
          rss: memMB,
          heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
          heapTotal: process.memoryUsage().heapTotal / 1024 / 1024,
        }
      );
    }
  }, MEMORY_CHECK_INTERVAL_MS);

  // Self health check
  const healthInterval = setInterval(() => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      if (res.statusCode !== 200 && state.isHealthy) {
        state.isHealthy = false;
        sendAlert('critical', 'Health check failed', `Self-check returned ${res.statusCode}`);
      } else if (res.statusCode === 200 && !state.isHealthy) {
        state.isHealthy = true;
        sendAlert('info', 'Service recovered', 'Health check passing again');
      }
      res.resume(); // drain response
    });
    req.on('error', (err) => {
      if (state.isHealthy) {
        state.isHealthy = false;
        sendAlert('critical', 'Health check unreachable', err.message);
      }
    });
    req.end();
  }, SELF_CHECK_INTERVAL_MS);

  // Cleanup on shutdown
  const cleanup = () => {
    clearInterval(memoryInterval);
    clearInterval(healthInterval);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}

export default {
  sendAlert,
  trackError,
  startMonitoring,
};

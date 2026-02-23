module.exports = {
  apps: [
    // ============================================
    // PRODUCTION Configuration
    // Usage: pm2 start ecosystem.config.js --env production
    // ============================================
    {
      name: 'boomcard-api',
      cwd: './backend-api',
      script: 'dist/server.js',
      instances: process.env.PM2_INSTANCES || 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,
      watch: false,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      max_size: '20M',          // Log rotation at 20MB
      retain: 5,                // Keep 5 rotated files
      env: {
        PORT: 3001,
        NODE_ENV: 'development'
      },
      env_production: {
        PORT: 3001,
        NODE_ENV: 'production'
      },
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,
    },

    // ============================================
    // DEVELOPMENT Configuration (microservices)
    // Usage: pm2 start ecosystem.config.js
    // ============================================
    {
      name: 'auth-service',
      cwd: './auth-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3001,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'api-gateway',
      cwd: './api-gateway',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3000,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'user-service',
      cwd: './user-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3003,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'query-service',
      cwd: './query-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 4000,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'event-processor',
      cwd: './event-processor',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3005,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'notification-service',
      cwd: './notification-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3006,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'scheduler-service',
      cwd: './scheduler-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3007,
        NODE_ENV: 'development'
      }
    },
    {
      name: 'command-service',
      cwd: './command-service',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3008,
        NODE_ENV: 'development'
      }
    },

    // Frontend
    {
      name: 'partner-dashboard',
      cwd: './partner-dashboard',
      script: 'npm',
      args: 'run dev',
      env: {
        PORT: 3002,
        NODE_ENV: 'development'
      }
    },

    // Python ML Service
    {
      name: 'ml-service',
      cwd: './ml-service',
      script: 'python',
      args: 'src/main.py',
      interpreter: './venv/bin/python',
      env: {
        PORT: 8001,
        PYTHONPATH: '.'
      }
    }
  ]
};

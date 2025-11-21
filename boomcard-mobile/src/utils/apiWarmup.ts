/**
 * API Warmup Utility
 *
 * Wakes up the Render API server on app startup to avoid cold start delays
 * during user authentication.
 */

import { API_CONFIG } from '../constants/config';

let isWarmedUp = false;
let warmupPromise: Promise<boolean> | null = null;

/**
 * Warm up the API by pinging the health endpoint
 * This helps avoid cold start delays when using Render's free tier
 */
export async function warmupApi(): Promise<boolean> {
  // If already warming up, return the existing promise
  if (warmupPromise) {
    return warmupPromise;
  }

  // If already warmed up, return immediately
  if (isWarmedUp) {
    return true;
  }

  console.log('🔥 Warming up API server...');

  warmupPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(`${API_CONFIG.BASE_URL}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log('✅ API server is ready');
        isWarmedUp = true;
        return true;
      } else {
        console.warn('⚠️ API health check returned non-OK status:', response.status);
        return false;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⚠️ API warmup timed out - server may be sleeping');
      } else {
        console.warn('⚠️ API warmup failed:', error);
      }
      return false;
    } finally {
      warmupPromise = null;
    }
  })();

  return warmupPromise;
}

/**
 * Check if the API has been warmed up
 */
export function isApiWarmedUp(): boolean {
  return isWarmedUp;
}

/**
 * Reset warmup state (useful for testing or manual refresh)
 */
export function resetWarmupState(): void {
  isWarmedUp = false;
  warmupPromise = null;
}

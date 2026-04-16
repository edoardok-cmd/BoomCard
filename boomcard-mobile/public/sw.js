// BoomCard Service Worker
// Strategy:
//   - Immutable hashed assets (_expo/, assets/) → cache-first, cached on first fetch
//   - App shell (index.html, manifest, icons) → stale-while-revalidate
//   - API calls (boomcard-api.fly.dev) → network-only, never cached

const CACHE_NAME = 'boomcard-shell-v1';

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests (API, CDN, etc.) → network-only
  if (url.origin !== self.location.origin) return;

  // Hashed immutable assets → cache-first (never stale by design)
  if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (HTML navigation, manifest, icons) → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);

  // For navigations, always serve index.html from cache (SPA routing)
  const cacheKey =
    request.mode === 'navigate' ? new Request('/') : request;

  const cached = await cache.match(cacheKey);

  // Background network update (fire-and-forget when we have a cached copy)
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(cacheKey, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Return cached immediately; network update runs in background
    return cached;
  }

  // No cached copy — wait for network
  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  // Both cache miss and offline: return a user-visible error response
  return new Response(
    '<!DOCTYPE html><html><body><p>BoomCard is offline. Please check your connection.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html' } }
  );
}

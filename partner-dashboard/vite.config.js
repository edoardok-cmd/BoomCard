import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Drive the dev API proxy from VITE_API_PROXY. Default is localhost:3025 so
// `npm run dev` on a fresh clone fails closed (or hits the local backend) rather
// than silently mutating production data with the developer's own admin creds.
// To intentionally target production, set VITE_API_PROXY=https://boomcard-api.fly.dev
// in .env.local — explicit opt-in only.
//
// loadEnv reads .env / .env.local etc. that vite.config.js itself can't see
// via process.env (those files are loaded for the app, not for config-time).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY || 'http://localhost:3025'
  const isHttpsProxy = apiProxyTarget.startsWith('https://')
  // Loud banner when an explicit override targets a non-localhost host. The dev
  // proxy spoofs Origin to a CORS-allowed value (see `headers.origin` below),
  // so prod CORS is not a backstop — without this banner a developer can
  // mutate production data while believing they are in a local sandbox.
  //
  // Loopback detection covers IPv4 loopback (127.0.0.0/8 — the whole /8 is
  // reserved per RFC 5735, not just 127.0.0.1), IPv6 loopback ([::1]), the
  // wildcard 0.0.0.0, and the `localhost` hostname. URL parsing strips
  // brackets from IPv6 hosts so the comparison is shape-agnostic.
  const parsedTarget = (() => { try { return new URL(apiProxyTarget) } catch { return null } })()
  const targetHost = parsedTarget ? parsedTarget.hostname.replace(/^\[|\]$/g, '') : ''
  const isLocal = targetHost === 'localhost'
    || targetHost === '0.0.0.0'
    || targetHost === '::1'
    || /^127\./.test(targetHost)
  // ANSI is stripped when stdout is not a TTY (CI logs, redirected output) or
  // when NO_COLOR / FORCE_COLOR=0 is set (https://no-color.org). Without this
  // guard the banner emits literal escape sequences into log files / non-VT
  // terminals (legacy Windows cmd.exe pre-1607).
  const useColor = !!process.stdout.isTTY
    && process.env.NO_COLOR == null
    && process.env.FORCE_COLOR !== '0'
  const wrap = (s, codes) => useColor ? `\x1b[${codes}m${s}\x1b[0m` : s
  if (!isLocal) {
    // eslint-disable-next-line no-console
    console.warn(
      '\n' + wrap(`  ⚠️  TARGETING NON-LOCAL API: ${apiProxyTarget}  `, '41;1') + '\n' +
      wrap('  Any mutations from `npm run dev` will hit this backend with your real auth token.\n' +
        '  Set VITE_API_PROXY=http://localhost:3025 in .env.local to use a local backend instead.', '33') + '\n'
    )
  }
  return ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 3021,
    strictPort: false, // Allow fallback to next available port
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: isHttpsProxy,
        // When proxying to the production API, the browser's Origin header is
        // still localhost:3021, which the prod CORS allow-list rejects. Override
        // it to a whitelisted origin so dev sessions can hit prod without server
        // config changes. Local-backend mode doesn't need this (its CORS list
        // already includes :3021).
        ...(isHttpsProxy && { headers: { origin: 'https://boomcard.bg' } })
      }
    }
  },
  build: {
    // Keep modulepreload for vendor chunks (both HTML-level and as transitive deps)
    // but suppress it for lazy page-specific chunks so they don't accumulate 60+
    // unused modulepreload hints in the browser as the user navigates between routes.
    modulePreload: {
      polyfill: true,
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => d.includes('-vendor-')),
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        manualChunks: {
          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'ui-vendor': ['framer-motion', 'styled-components', 'lucide-react'],
          // Data management
          'data-vendor': ['@tanstack/react-query'],
        },
        // File naming strategy
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Enable minification (using esbuild instead of terser)
    minify: 'esbuild',
    // Generate sourcemaps for production debugging
    sourcemap: false,
    // Optimize CSS
    cssCodeSplit: true
  },
  // Performance optimizations
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'styled-components',
      '@tanstack/react-query'
    ]
  }
  })
})

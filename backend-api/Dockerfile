# Multi-stage Dockerfile for BoomCard Backend API
# Optimized for production deployment

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Install dependencies for Prisma (OpenSSL) and native modules (Python, make, g++)
RUN apk add --no-cache openssl python3 make g++

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (production only); ignore native build scripts that
# may fail on transient network errors (e.g. @sentry/profiling-node).
# The app handles missing native modules gracefully at runtime.
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps && \
    npx node-gyp-build 2>/dev/null || true

# Generate Prisma Client
RUN npx prisma generate

# ============================================
# Stage 2: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for build (including Python for native modules)
RUN apk add --no-cache openssl python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev); skip native scripts (see dependencies stage)
RUN npm install --ignore-scripts --legacy-peer-deps

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Production
# ============================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Set ownership
RUN chown -R nodejs:nodejs /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=dependencies --chown=nodejs:nodejs /app/package*.json ./

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copy Prisma 7 config (required for migrate deploy to resolve DATABASE_URL)
COPY --chown=nodejs:nodejs prisma.config.ts ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port (informational only - actual port comes from PORT env variable)
# Note: Render and other platforms inject PORT dynamically at runtime
EXPOSE 3001

# Health check.
# Uses /health (NOT /api/health): /api/health sits behind the IP-keyed global
# rate limiters mounted at app.use('/api/', ...) in src/server.ts and returns
# 429 once the window is exhausted, so a health check on that path can be
# failed by load rather than by a fault. /health is outside /api/ and is not
# rate limited. Kept aligned with fly.toml's [[http_service.checks]].
# The previous form had no 'error' listener and no request timeout. A refused
# connection still exited 1, but via an UNCAUGHT ECONNREFUSED (stack trace on
# stderr) rather than a clean check failure, and a server that accepted the
# connection then stalled had nothing to abort the request — it relied purely
# on Docker's --timeout. The explicit error handler and 5s request timeout make
# both cases a deliberate exit 1. Verified locally: live server -> exit 0,
# dead port -> exit 1, 200-less path (404) -> exit 1.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const r=require('http').get('http://localhost:3001/health',s=>process.exit(s.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(5000,()=>{r.destroy();process.exit(1)})"

# Set production environment
ENV NODE_ENV=production

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application. NOTHING ELSE.
#
# BC-QA-051: this CMD used to be a `sh -c` chain that ran
#   prisma migrate resolve --rolled-back ... || true
#   && node prisma/auto-baseline.js
#   && prisma migrate deploy
#   && node dist/server.js
# i.e. it made the server's ability to start conditional on a schema migration
# succeeding. On Fly that exact chain (duplicated in fly.toml's [processes])
# turned a single failed migration (Prisma P3009) into a ten-day total
# production outage: `migrate deploy` exited 1, `node dist/server.js` was never
# reached, every machine exited 1, and Fly crash-looped them to the max restart
# count. fly.toml's [processes] overrides this CMD, so this copy was latent —
# but it is the same defect and would bite any non-Fly runtime of this image.
#
# Migrations are now a SEPARATE, PRE-START step. On Fly that is
# `[deploy] release_command` (see fly.toml), which runs before new machines
# take traffic and aborts the deploy — leaving the previous version serving —
# if it fails. Anywhere else, run the equivalent as its own step BEFORE
# starting containers, and treat a non-zero exit as a failed release:
#
#   docker run --rm --env-file <env> <image> \
#     sh -c 'node prisma/auto-baseline.js && node_modules/.bin/prisma migrate deploy'
#
# (`npm run db:migrate:deploy` is the same `prisma migrate deploy` without the
# auto-baseline step; `npm run db:migrate:status` reports pending/failed
# migrations without changing anything.)
#
# Do NOT reintroduce a migration into this CMD, and do not "fix" a failing
# migration by appending `|| true` — that swallows the error and starts a
# server against a schema it was not built for.
CMD ["node", "dist/server.js"]

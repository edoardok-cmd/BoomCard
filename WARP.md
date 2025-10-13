# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

project-50 (BoomCard) is a modern microservices-based platform with AI-powered features. It follows a monorepo structure with multiple services and a frontend dashboard.

## Development Commands

### Quick Start
```bash
# Install all dependencies
npm install
# or
make install

# Start development environment (includes Docker services + all apps)
make dev
# or manually:
docker-compose up -d postgres redis
npm run dev
```

### Individual Service Development
```bash
# Frontend dashboard only
npm run dev:web

# API Gateway only  
npm run dev:api

# Partner dashboard (workspace-specific)
npm run dev --workspace=partner-dashboard
```

### Database Services
```bash
# Start PostgreSQL and Redis via Docker
docker-compose up -d postgres redis

# Stop services
docker-compose down

# View service logs
docker-compose logs postgres
docker-compose logs redis
```

### Testing and Quality
```bash
# Run all tests across workspaces
npm test

# Run tests for specific service
cd api-gateway && npm test
cd partner-dashboard && npm test

# Lint all code
npm run lint

# Build all services
npm run build
```

### Utility Scripts
```bash
# Test Supabase connection
node scripts/test-supabase-connection.js

# Check dependencies
node scripts/dependency-check.js

# Build verification
./scripts/build-verify.sh
```

## Architecture Overview

### Service Structure
- **partner-dashboard**: React/Vite frontend application for partner management
- **api-gateway**: NestJS-based API gateway handling authentication and routing  
- **qr-service**: Node.js microservice for QR code operations
- **analytics-service**: Python-based analytics and ML processing
- **auth-service**: Authentication microservice
- **query-service**: GraphQL query service
- **event-processor**: Event handling service

### Key Technologies
- **Frontend**: React 18, Vite, React Router, TanStack Query, Styled Components
- **Backend**: NestJS, Node.js, Python
- **Database**: PostgreSQL (via Supabase), Redis
- **Auth**: JWT, Clerk integration, Passport.js
- **Infrastructure**: Docker, Docker Compose
- **Testing**: Jest (backend), Vitest (frontend)

### Data Flow
1. **partner-dashboard** → **api-gateway** → individual microservices
2. **api-gateway** serves as the main entry point (port 3100)
3. Services communicate via REST APIs and event processing
4. PostgreSQL handles persistent data, Redis for caching/sessions
5. Supabase provides managed PostgreSQL with connection pooling

### Environment Configuration
- Development uses Docker Compose for local PostgreSQL and Redis
- Production uses Supabase for PostgreSQL and Upstash for Redis
- Each service has its own `.env.example` with required variables
- JWT secrets and database URLs must be configured per environment

### Port Usage (check before starting services)
- API Gateway: 3100 (configurable via PORT env var)
- PostgreSQL: 5432 (Docker)  
- Redis: 6379 (Docker)
- Frontend dev server: varies (Vite auto-assigns)

### Key Patterns
- **API Gateway Pattern**: Central routing through api-gateway service
- **Microservices**: Each service owns its domain and can be deployed independently  
- **Event-Driven**: Services communicate via events where appropriate
- **Database Per Service**: Each microservice manages its own data
- **JWT Authentication**: Stateless auth with role-based access control

### Development Workflow
1. Start infrastructure: `docker-compose up -d postgres redis`
2. Copy environment files: `cp .env.example .env` (for each service)
3. Install dependencies: `npm install` 
4. Run development: `npm run dev` (starts all services concurrently)
5. Access partner dashboard at frontend URL (typically localhost:5173)
6. API gateway available at localhost:3100

### Testing Strategy
- Unit tests: Jest for NestJS services, Vitest for React components
- Integration tests: Test API endpoints with supertest
- Frontend tests: React Testing Library with Vitest
- Database tests: Use test database or in-memory alternatives

### Deployment Notes
- Services deployed to Render.com with individual render.yaml configs
- Netlify hosts the partner dashboard
- Environment variables configured per deployment platform
- Database migrations handled via Supabase or direct SQL scripts
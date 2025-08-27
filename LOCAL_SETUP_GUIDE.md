# Local Setup Guide for Project-50

## Prerequisites

1. **Docker Desktop** - For running all infrastructure services
2. **Node.js 18+** - For TypeScript services
3. **Python 3.9+** - For ML service
4. **At least 8GB RAM available** - The full stack uses significant resources

## Quick Start

### 1. Start Infrastructure Services

```bash
# From project-50 root directory
cd infrastructure
docker-compose up -d

# Wait for all services to be healthy (about 60 seconds)
docker-compose ps
```

This starts:
- PostgreSQL (port 5432)
- MongoDB (port 27017)
- Redis (port 6379)
- Elasticsearch (port 9200)
- Kafka (port 9092)
- MinIO (ports 9000/9001)
- Prometheus (port 9090)
- Grafana (port 3000)
- Jaeger (port 16686)

### 2. Initialize Databases

```bash
# Run database migrations
docker exec -i project-50_postgres_1 psql -U enterprise_user enterprise_db < ../database/init/01-init-postgres.sql

# Verify schemas were created
docker exec -it project-50_postgres_1 psql -U enterprise_user enterprise_db -c "\dn"
```

### 3. Install Dependencies

```bash
# Install root dependencies
npm install

# Install service dependencies (from project root)
for service in auth-service user-service notification-service scheduler-service command-service api-gateway partner-dashboard query-service event-processor; do
  echo "Installing $service..."
  (cd $service && npm install)
done

# Install Python dependencies for ML service
cd ml-service
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 4. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Create service-specific env files
for service in auth-service user-service ml-service event-processor; do
  cat > $service/.env << EOF
NODE_ENV=development
PORT=300X  # Change X for each service
DB_HOST=localhost
DB_PORT=5432
DB_USER=enterprise_user
DB_PASSWORD=enterprise_pass
DB_NAME=enterprise_db
REDIS_URL=redis://:redis_pass@localhost:6379
KAFKA_BROKERS=localhost:9092
JWT_SECRET=your-super-secret-key-change-this
EOF
done
```

### 5. Start Services

#### Option A: Start All Services (Recommended for powerful machines)
```bash
# Use the Makefile
make start-all

# Or manually with process manager
npm install -g pm2
pm2 start ecosystem.config.js
```

#### Option B: Start Core Services Only (For limited resources)
```bash
# Terminal 1 - Auth Service (Port 3001)
cd auth-service
npm run dev

# Terminal 2 - API Gateway (Port 3000)  
cd api-gateway
npm run dev

# Terminal 3 - Query Service/GraphQL (Port 4000)
cd query-service
npm run dev

# Terminal 4 - Frontend (Port 3002)
cd partner-dashboard
npm run dev

# Terminal 5 - ML Service (Port 8001)
cd ml-service
source venv/bin/activate
python src/main.py
```

## Verifying the Setup

### 1. Check Infrastructure Health
```bash
# PostgreSQL
docker exec -it project-50_postgres_1 psql -U enterprise_user -c "SELECT 1"

# Redis
docker exec -it project-50_redis_1 redis-cli -a redis_pass ping

# Kafka
docker exec -it project-50_kafka_1 kafka-topics --list --bootstrap-server localhost:9092

# Elasticsearch
curl -X GET "localhost:9200/_cluster/health?pretty"
```

### 2. Check Service Health
```bash
# Auth Service
curl http://localhost:3001/health

# API Gateway
curl http://localhost:3000/health

# GraphQL Service
curl http://localhost:4000/health

# ML Service
curl http://localhost:8001/health
```

### 3. Access Web Interfaces
- **Frontend**: http://localhost:3002
- **GraphQL Playground**: http://localhost:4000/graphql
- **MinIO Console**: http://localhost:9001 (admin/minio_pass)
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **Jaeger**: http://localhost:16686

## Minimal Setup (Development)

If you have limited resources, you can run a minimal setup:

```bash
# Start only essential services
cd infrastructure
docker-compose up -d postgres redis

# Start only auth and API gateway
cd ../auth-service && npm run dev &
cd ../api-gateway && npm run dev &
cd ../partner-dashboard && npm run dev
```

## Troubleshooting

### Port Conflicts
If you get port conflict errors:
```bash
# Check what's using the ports
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :3000  # API Gateway

# Change ports in docker-compose.yml and .env files
```

### Memory Issues
If Docker runs out of memory:
1. Increase Docker Desktop memory to at least 6GB
2. Run only essential services
3. Use `docker-compose down` to stop services when not needed

### Database Connection Issues
```bash
# Reset the database
docker-compose down -v
docker-compose up -d postgres
# Re-run initialization scripts
```

## Resource Requirements

### Full Stack
- **RAM**: 8-10GB
- **CPU**: 4+ cores recommended
- **Disk**: 5GB free space

### Minimal Setup
- **RAM**: 4GB
- **CPU**: 2 cores
- **Disk**: 2GB free space

## Next Steps

1. Create a test user:
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

2. Get a token:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'
```

3. Test GraphQL query:
```graphql
# At http://localhost:4000/graphql
query {
  dashboardMetrics(timeRange: "1h") {
    totalUsers
    activeUsers
    totalEvents
  }
}
```

4. Test ML prediction:
```bash
curl -X POST http://localhost:8001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "default-model",
    "features": {"value": 42},
    "request_id": "test-001"
  }'
```
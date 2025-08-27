# Deployment Guide

## Prerequisites
- Docker and Docker Compose
- Kubernetes cluster (for production)
- PostgreSQL database
- Redis instance

## Local Development
```bash
# Clone repository
git clone https://github.com/yourrepo/project.git

# Install dependencies
npm install

# Start services
docker-compose up -d

# Run development servers
npm run dev
```

## Production Deployment

### 1. Build Docker Images
```bash
docker build -t project/api-gateway ./api-gateway
docker build -t project/consumer-web ./consumer-web
```

### 2. Push to Registry
```bash
docker push project/api-gateway
docker push project/consumer-web
```

### 3. Deploy to Kubernetes
```bash
kubectl apply -f k8s/
```

### 4. Configure Secrets
```bash
kubectl create secret generic database-url \
  --from-literal=url=postgresql://user:pass@host:5432/db
```

## Environment Variables
See `.env.example` for required environment variables.

## Monitoring
- Health checks: `/health`
- Metrics: `/metrics`
- Logs: Available in CloudWatch/DataDog

## Backup & Recovery
- Database backups run daily
- Point-in-time recovery available
- Disaster recovery plan in place

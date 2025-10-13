# Free Deployment Guide for Project-50

## Overview
Deploy the entire enterprise platform using free tiers from various cloud providers.

## Services & Deployment Targets

### 1. Frontend (Netlify)
**Partner Dashboard → Netlify**
- Static site hosting
- Automatic HTTPS
- Continuous deployment from GitHub

### 2. Backend Services (Railway.app / Render.com)
**Microservices → Railway.app** (500 hours/month free)
- Auth Service
- API Gateway  
- Query Service (GraphQL)
- User Service

**Alternative: Render.com** (750 hours/month free)

### 3. Databases (Free Tiers)

**PostgreSQL → Supabase**
- 500MB database
- Unlimited API requests
- Real-time subscriptions included

**Redis → Upstash**
- 10,000 commands/day
- 256MB storage
- Serverless Redis

**MongoDB → MongoDB Atlas**
- 512MB storage
- Shared cluster (M0 Sandbox)

### 4. ML Service (Hugging Face Spaces)
**ML Service → Hugging Face Spaces**
- Free GPU runtime (limited)
- Model hosting included
- FastAPI support

### 5. Message Queue (CloudAMQP)
**Kafka Alternative → CloudAMQP (RabbitMQ)**
- 1M messages/month
- 100 concurrent connections

### 6. Object Storage (Cloudinary)
**MinIO Alternative → Cloudinary**
- 25GB storage
- 25GB bandwidth/month
- Image/video optimization included

### 7. Search (Algolia)
**Elasticsearch Alternative → Algolia**
- 10,000 records
- 100,000 operations/month

### 8. Monitoring (Free Tiers)
**Grafana → Grafana Cloud**
- 10,000 series metrics
- 50GB logs
- 14 days retention

## Step-by-Step Deployment

### Step 1: Prepare for Deployment

```bash
# Create production branch
git checkout -b production
```

#### 1.1 Update Frontend for Netlify

```javascript
// partner-dashboard/src/config/api.config.ts
export const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'https://your-api-gateway.railway.app',
  graphqlURL: process.env.REACT_APP_GRAPHQL_URL || 'https://your-query-service.railway.app/graphql',
};
```

Create `partner-dashboard/netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "build"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "https://your-api-gateway.railway.app/api/:splat"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
```

### Step 2: Deploy Frontend to Netlify

1. **Install Netlify CLI**
```bash
npm install -g netlify-cli
```

2. **Deploy Frontend**
```bash
cd partner-dashboard
netlify init
netlify deploy --prod
```

3. **Set Environment Variables in Netlify Dashboard**
```
REACT_APP_API_URL=https://your-api-gateway.railway.app
REACT_APP_GRAPHQL_URL=https://your-query-service.railway.app/graphql
```

### Step 3: Set Up Free Databases

#### 3.1 Supabase (PostgreSQL)
1. Create account at https://supabase.com
2. Create new project
3. Get connection string from Settings → Database
4. Run migrations:
```bash
# Export your schema
pg_dump -h localhost -U enterprise_user enterprise_db --schema-only > schema.sql

# Import to Supabase (use their SQL editor)
```

#### 3.2 Upstash (Redis)
1. Create account at https://upstash.com
2. Create Redis database
3. Get REST URL and token
4. Update services to use REST API:

```typescript
// Updated Redis connection for serverless
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
```

#### 3.3 MongoDB Atlas
1. Create account at https://cloud.mongodb.com
2. Create M0 Sandbox cluster
3. Get connection string
4. Whitelist 0.0.0.0/0 for access from anywhere

### Step 4: Deploy Backend Services to Railway

#### 4.1 Prepare Services for Railway

Create `railway.json` in each service:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

#### 4.2 Deploy to Railway

1. **Install Railway CLI**
```bash
npm install -g @railway/cli
```

2. **Deploy Each Service**
```bash
# Auth Service
cd auth-service
railway login
railway init
railway add
railway deploy

# Repeat for other services
```

3. **Set Environment Variables in Railway Dashboard**
```env
NODE_ENV=production
DATABASE_URL=postgresql://[supabase-connection-string]
REDIS_URL=[upstash-rest-url]
JWT_SECRET=[generate-strong-secret]
```

### Step 5: Deploy ML Service to Hugging Face

Create `ml-service/app.py` for Hugging Face Spaces:
```python
import gradio as gr
from src.main import app
from fastapi import FastAPI

# Wrap FastAPI app for Gradio
def create_demo():
    return gr.Interface(
        fn=lambda: "ML Service Running",
        inputs=[],
        outputs="text",
        title="ML Service API"
    )

# Mount FastAPI app
demo = create_demo()
demo.queue()

# For Hugging Face Spaces
if __name__ == "__main__":
    demo.launch()
```

Push to Hugging Face:
```bash
cd ml-service
git init
git remote add hf https://huggingface.co/spaces/[your-username]/ml-service
git push hf main
```

### Step 6: Configure Service Discovery

Create a service registry configuration:
```javascript
// shared/config/services.config.js
export const SERVICES = {
  auth: process.env.AUTH_SERVICE_URL || 'https://auth-service.railway.app',
  users: process.env.USER_SERVICE_URL || 'https://user-service.railway.app',
  gateway: process.env.API_GATEWAY_URL || 'https://api-gateway.railway.app',
  graphql: process.env.QUERY_SERVICE_URL || 'https://query-service.railway.app',
  ml: process.env.ML_SERVICE_URL || 'https://[your-space].hf.space',
};
```

### Step 7: Set Up Monitoring

1. **Create Grafana Cloud Account**
   - Sign up at https://grafana.com/products/cloud/
   - Get Prometheus endpoint and API key

2. **Update Services to Send Metrics**
```typescript
// monitoring/prometheus.config.ts
import { register } from 'prom-client';

export async function pushMetrics() {
  const gateway = process.env.GRAFANA_PROMETHEUS_URL;
  const job = process.env.SERVICE_NAME;
  
  // Push metrics every 30 seconds
  setInterval(async () => {
    try {
      await push({ gateway, job, register });
    } catch (err) {
      console.error('Failed to push metrics:', err);
    }
  }, 30000);
}
```

## Cost Optimization Tips

### 1. Use Serverless Functions for Low-Traffic Services
Convert services like notification-service to Vercel Functions:
```typescript
// api/notify.ts
export default async function handler(req, res) {
  // Notification logic
}
```

### 2. Implement Caching
Use Cloudflare's free CDN for static assets and API caching:
```javascript
// Add cache headers
res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
```

### 3. Database Optimization
- Use database connection pooling
- Implement query result caching
- Archive old data to reduce storage

### 4. Sleep Unused Services
Railway and Render services sleep after inactivity. Implement a keep-alive:
```javascript
// keep-alive.js
setInterval(async () => {
  await fetch('https://your-service.railway.app/health');
}, 20 * 60 * 1000); // Every 20 minutes
```

## Free Tier Limits Summary

| Service | Provider | Limits |
|---------|----------|--------|
| Frontend | Netlify | 100GB bandwidth/month |
| Backend | Railway | 500 hours/month, 512MB RAM |
| PostgreSQL | Supabase | 500MB storage |
| Redis | Upstash | 10,000 commands/day |
| MongoDB | Atlas | 512MB storage |
| ML Hosting | Hugging Face | 2 vCPU, 16GB RAM |
| CDN | Cloudflare | Unlimited |
| Monitoring | Grafana Cloud | 10,000 metrics |

## Production Checklist

- [ ] Enable HTTPS on all services
- [ ] Set strong passwords and secrets
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up error tracking (Sentry free tier)
- [ ] Configure backup strategy
- [ ] Monitor usage to stay within limits
- [ ] Set up alerts for quota warnings

## Scaling Beyond Free Tier

When you outgrow free tiers:
1. **Vercel Pro** ($20/month) - Better performance
2. **Railway Team** ($20/month) - More resources
3. **Supabase Pro** ($25/month) - 8GB database
4. **Dedicated VPS** - Hetzner Cloud (€4.51/month)

## Total Cost: $0/month 🎉

All services run on generous free tiers. Monitor usage to ensure you stay within limits.
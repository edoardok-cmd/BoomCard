# Backend Deployment Guide - Receipt Cashback System

## Overview

This guide covers deploying the complete receipt scanning, fraud detection, and cashback system to your backend API.

---

## Table of Contents

1. [Database Migration](#database-migration)
2. [Backend Services Setup](#backend-services-setup)
3. [Image Storage Configuration](#image-storage-configuration)
4. [API Routes Integration](#api-routes-integration)
5. [Environment Configuration](#environment-configuration)
6. [Testing](#testing)
7. [Deployment Checklist](#deployment-checklist)

---

## Database Migration

### Step 1: Update Schema

The Prisma schema has been updated in:
```
backend-api/prisma/schema.prisma
```

**New Models Added:**
- `Receipt` (enhanced with fraud detection)
- `ReceiptAnalytics`
- `MerchantWhitelist`
- `VenueFraudConfig`

**Enhanced Enums:**
- `ReceiptStatus`: Added PROCESSING, VALIDATING, MANUAL_REVIEW, EXPIRED
- `NotificationType`: Added receipt-related notifications

### Step 2: Generate Migration

```bash
cd backend-api

# Generate migration
npx prisma migrate dev --name add_receipt_fraud_system

# This will:
# 1. Update the Receipt table with new columns
# 2. Create ReceiptAnalytics table
# 3. Create MerchantWhitelist table
# 4. Create VenueFraudConfig table
# 5. Update NotificationType enum
```

### Step 3: Generate Prisma Client

```bash
npx prisma generate
```

### Step 4: Seed Initial Data (Optional)

Create `prisma/seed.ts` for initial fraud configuration:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create default fraud configuration
  await prisma.venueFraudConfig.create({
    data: {
      partnerId: null, // Global default
      cashbackPercent: 5.0,
      premiumBonus: 2.0,
      platinumBonus: 5.0,
      minBillAmount: 10.0,
      maxCashbackPerScan: 50.0,
      maxScansPerDay: 10,
      maxScansPerMonth: 100,
      gpsVerificationEnabled: true,
      gpsRadiusMeters: 100,
      ocrVerificationEnabled: true,
      autoApproveThreshold: 30,
      autoRejectThreshold: 60,
      isActive: true,
    },
  });

  // Add some approved merchants
  const approvedMerchants = [
    'Кауфланд', 'Лидл', 'Фантастико', 'Билла', 'Метро',
    'McDonald\'s', 'KFC', 'Subway', 'Starbucks',
  ];

  for (const merchantName of approvedMerchants) {
    await prisma.merchantWhitelist.create({
      data: {
        merchantName,
        status: 'APPROVED',
        reason: 'Verified major retailer',
      },
    });
  }

  console.log('✅ Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seed:
```bash
npx prisma db seed
```

---

## Backend Services Setup

### Directory Structure

```
backend-api/
├── src/
│   ├── services/
│   │   ├── receipt.service.ts          # Receipt processing
│   │   ├── fraudDetection.service.ts   # Fraud checks
│   │   ├── receiptAnalytics.service.ts # Analytics
│   │   ├── imageUpload.service.ts      # Image storage
│   │   └── notification.service.ts      # Notifications
│   ├── routes/
│   │   └── receipts.enhanced.routes.ts  # API routes
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   └── utils/
│       ├── fraudCalculator.ts
│       ├── cashbackCalculator.ts
│       └── imageHasher.ts
```

### Service Implementation Checklist

#### 1. Image Upload Service

Create `src/services/imageUpload.service.ts`:

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import crypto from 'crypto';

class ImageUploadService {
  private s3Client: S3Client;
  private bucket: string;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-west-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET || 'boom-receipts';
  }

  async uploadReceipt(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ url: string; key: string; hash: string }> {
    // Generate hash
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Optimize image
    const optimized = await sharp(file.buffer)
      .jpeg({ quality: 85 })
      .toBuffer();

    // Generate unique key
    const key = `receipts/${userId}/${uuidv4()}.jpg`;

    // Upload to S3
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: optimized,
        ContentType: 'image/jpeg',
        ACL: 'private',
      })
    );

    const url = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return { url, key, hash };
  }
}

export const imageUploadService = new ImageUploadService();
```

**Install Dependencies:**
```bash
npm install @aws-sdk/client-s3 sharp uuid
npm install --save-dev @types/uuid
```

#### 2. Fraud Detection Service

Create `src/services/fraudDetection.service.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FraudCheckParams {
  imageHash: string;
  ocrAmount?: number;
  userAmount?: number;
  userLat?: number;
  userLon?: number;
  venueLat?: number;
  venueLon?: number;
  ocrConfidence: number;
  merchantName?: string;
  userId: string;
}

interface FraudCheckResult {
  fraudScore: number;
  fraudReasons: string[];
  isApproved: boolean;
  requiresManualReview: boolean;
}

class FraudDetectionService {
  async checkReceipt(params: FraudCheckParams): Promise<FraudCheckResult> {
    let score = 0;
    const reasons: string[] = [];

    // 1. Duplicate check
    const isDuplicate = await this.checkDuplicate(params.imageHash);
    if (isDuplicate) {
      score += 40;
      reasons.push('DUPLICATE_IMAGE');
    }

    // 2. Amount validation
    if (params.ocrAmount && params.userAmount) {
      const diff = Math.abs(params.ocrAmount - params.userAmount);
      const percentDiff = (diff / Math.max(params.ocrAmount, params.userAmount)) * 100;

      if (percentDiff > 50) {
        score += 30;
        reasons.push('LARGE_AMOUNT_MISMATCH');
      } else if (percentDiff > 20) {
        score += 15;
        reasons.push('AMOUNT_MISMATCH');
      }
    }

    // 3. GPS verification
    if (params.userLat && params.userLon && params.venueLat && params.venueLon) {
      const distance = this.calculateDistance(
        params.userLat,
        params.userLon,
        params.venueLat,
        params.venueLon
      );

      if (distance > 500) {
        score += 25;
        reasons.push('GPS_FAR_FROM_VENUE');
      } else if (distance > 200) {
        score += 15;
        reasons.push('GPS_OUTSIDE_RANGE');
      }
    }

    // 4. OCR confidence
    if (params.ocrConfidence < 50) {
      score += 20;
      reasons.push('LOW_OCR_CONFIDENCE');
    }

    // 5. Rate limiting
    const userStats = await this.getUserStats(params.userId);
    if (userStats.submissionsToday >= 10) {
      score += 30;
      reasons.push('DAILY_LIMIT_EXCEEDED');
    }

    // 6. Merchant check
    if (params.merchantName) {
      const merchantStatus = await this.checkMerchant(params.merchantName);
      if (merchantStatus.isBlacklisted) {
        score += 50;
        reasons.push('MERCHANT_BLACKLISTED');
      }
    }

    // Determine approval
    const isApproved = score <= 30;
    const requiresManualReview = score > 30 && score <= 60;

    return {
      fraudScore: Math.min(100, score),
      fraudReasons: reasons,
      isApproved,
      requiresManualReview,
    };
  }

  private async checkDuplicate(imageHash: string): Promise<boolean> {
    const existing = await prisma.receipt.findFirst({
      where: { imageHash },
    });
    return !!existing;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private async getUserStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const submissionsToday = await prisma.receipt.count({
      where: {
        userId,
        createdAt: { gte: today },
      },
    });

    return { submissionsToday };
  }

  async checkMerchant(merchantName: string) {
    const merchant = await prisma.merchantWhitelist.findUnique({
      where: { merchantName },
    });

    return {
      isWhitelisted: merchant?.status === 'APPROVED',
      isBlacklisted: merchant?.status === 'BLOCKED',
    };
  }

  async getVenueConfig(venueId: string) {
    let config = await prisma.venueFraudConfig.findUnique({
      where: { venueId },
    });

    // Fall back to global config
    if (!config) {
      config = await prisma.venueFraudConfig.findFirst({
        where: { venueId: null },
      });
    }

    return config;
  }

  async getMerchantWhitelist() {
    return prisma.merchantWhitelist.findMany({
      orderBy: { merchantName: 'asc' },
    });
  }

  async addMerchantToWhitelist(data: any) {
    return prisma.merchantWhitelist.create({ data });
  }

  async updateMerchantStatus(id: string, status: string, reason?: string) {
    return prisma.merchantWhitelist.update({
      where: { id },
      data: { status, reason },
    });
  }

  async updateVenueConfig(venueId: string, config: any) {
    return prisma.venueFraudConfig.upsert({
      where: { venueId },
      create: { venueId, ...config },
      update: config,
    });
  }
}

export const fraudDetectionService = new FraudDetectionService();
```

#### 3. Receipt Analytics Service

Create `src/services/receiptAnalytics.service.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class ReceiptAnalyticsService {
  async getAnalytics(userId: string) {
    let analytics = await prisma.receiptAnalytics.findUnique({
      where: { userId },
    });

    if (!analytics) {
      // Create initial analytics record
      analytics = await prisma.receiptAnalytics.create({
        data: { userId },
      });
    }

    // Get top merchants
    const receipts = await prisma.receipt.findMany({
      where: { userId },
      select: { merchantName: true, totalAmount: true },
    });

    const merchantMap = new Map<string, { count: number; totalSpent: number }>();

    receipts.forEach((r) => {
      if (r.merchantName) {
        const current = merchantMap.get(r.merchantName) || { count: 0, totalSpent: 0 };
        merchantMap.set(r.merchantName, {
          count: current.count + 1,
          totalSpent: current.totalSpent + (r.totalAmount || 0),
        });
      }
    });

    const topMerchants = Array.from(merchantMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      ...analytics,
      topMerchants,
    };
  }

  async updateAnalytics(params: {
    userId: string;
    receiptId: string;
    status: string;
    cashbackAmount: number;
    totalAmount: number;
  }) {
    const { userId, status, cashbackAmount, totalAmount } = params;

    const analytics = await prisma.receiptAnalytics.upsert({
      where: { userId },
      create: {
        userId,
        totalReceipts: 1,
        approvedReceipts: status === 'APPROVED' ? 1 : 0,
        rejectedReceipts: status === 'REJECTED' ? 1 : 0,
        pendingReceipts: ['PENDING', 'MANUAL_REVIEW'].includes(status) ? 1 : 0,
        totalCashback: status === 'APPROVED' ? cashbackAmount : 0,
        totalSpent: totalAmount,
        averageReceiptAmount: totalAmount,
        lastReceiptDate: new Date(),
        successRate: status === 'APPROVED' ? 100 : 0,
      },
      update: {
        totalReceipts: { increment: 1 },
        approvedReceipts: status === 'APPROVED' ? { increment: 1 } : undefined,
        rejectedReceipts: status === 'REJECTED' ? { increment: 1 } : undefined,
        pendingReceipts: ['PENDING', 'MANUAL_REVIEW'].includes(status) ? { increment: 1 } : undefined,
        totalCashback: status === 'APPROVED' ? { increment: cashbackAmount } : undefined,
        totalSpent: { increment: totalAmount },
        lastReceiptDate: new Date(),
      },
    });

    // Recalculate averages and success rate
    await prisma.receiptAnalytics.update({
      where: { userId },
      data: {
        averageReceiptAmount: analytics.totalSpent / analytics.totalReceipts,
        successRate: (analytics.approvedReceipts / analytics.totalReceipts) * 100,
      },
    });
  }

  async getGlobalAnalytics() {
    const stats = await prisma.receipt.groupBy({
      by: ['status'],
      _count: true,
      _sum: {
        cashbackAmount: true,
        totalAmount: true,
      },
    });

    return {
      totalReceipts: stats.reduce((sum, s) => sum + s._count, 0),
      totalCashback: stats.reduce((sum, s) => sum + (s._sum.cashbackAmount || 0), 0),
      totalSpent: stats.reduce((sum, s) => sum + (s._sum.totalAmount || 0), 0),
      byStatus: stats,
    };
  }
}

export const receiptAnalyticsService = new ReceiptAnalyticsService();
```

---

## Image Storage Configuration

### Option 1: AWS S3

**Environment Variables:**
```bash
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=boom-receipts
```

**S3 Bucket Setup:**
1. Create bucket in AWS Console
2. Enable encryption at rest
3. Set lifecycle policy (optional): Archive receipts older than 1 year
4. Configure CORS if needed for direct uploads

### Option 2: CloudFlare R2

**Environment Variables:**
```bash
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=boom-receipts
```

**Advantages:**
- No egress fees
- S3-compatible API
- Better pricing for storage

---

## API Routes Integration

### Step 1: Update Main Router

In `src/index.ts` or `src/app.ts`:

```typescript
import receiptsRouter from './routes/receipts.enhanced.routes';

// ... other imports

app.use('/api/receipts', receiptsRouter);
```

### Step 2: Verify Middleware

Ensure these middleware exist:

```typescript
// src/middleware/auth.middleware.ts
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  // JWT verification logic
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

// src/middleware/error.middleware.ts
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

---

## Environment Configuration

### `.env` File

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/boomcard"

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# AWS S3 (Image Storage)
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=boom-receipts

# Fraud Detection
FRAUD_AUTO_APPROVE_THRESHOLD=30
FRAUD_MANUAL_REVIEW_THRESHOLD=60
FRAUD_AUTO_REJECT_THRESHOLD=61

# Cashback
DEFAULT_CASHBACK_PERCENT=5.0
PREMIUM_BONUS=2.0
PLATINUM_BONUS=5.0
MAX_CASHBACK_PER_TRANSACTION=50.0

# Rate Limiting
MAX_RECEIPTS_PER_DAY=10
MAX_RECEIPTS_PER_MONTH=100

# Email (Optional - for receipt emailing)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Sentry (Optional - error tracking)
SENTRY_DSN=your_sentry_dsn

# Server
PORT=3000
NODE_ENV=production
```

---

## Testing

### Step 1: Unit Tests

Create `tests/services/fraudDetection.test.ts`:

```typescript
import { fraudDetectionService } from '../../src/services/fraudDetection.service';

describe('FraudDetectionService', () => {
  it('should detect duplicate images', async () => {
    const hash = 'test-hash-123';
    // ... test implementation
  });

  it('should calculate fraud score correctly', async () => {
    // ... test implementation
  });
});
```

### Step 2: Integration Tests

```bash
npm test
```

### Step 3: Manual API Testing

Use Postman or curl:

```bash
# Submit receipt
curl -X POST http://localhost:3000/api/receipts/submit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://...",
    "imageHash": "abc123...",
    "ocrData": {...},
    "userAmount": 50.00,
    "venueId": "venue-123"
  }'

# Get user receipts
curl http://localhost:3000/api/receipts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Admin: Review receipt
curl -X POST http://localhost:3000/api/receipts/{id}/review \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "APPROVE",
    "notes": "Verified receipt is legitimate"
  }'
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run database migration
- [ ] Generate Prisma client
- [ ] Seed initial data (fraud config, merchant whitelist)
- [ ] Set all environment variables
- [ ] Test image upload to S3/R2
- [ ] Run unit tests
- [ ] Run integration tests

### Deployment Steps

1. **Build Backend:**
   ```bash
   npm run build
   ```

2. **Deploy to Server:**
   ```bash
   # Using PM2
   pm2 start dist/index.js --name boom-api

   # Or Docker
   docker build -t boom-api .
   docker run -p 3000:3000 boom-api
   ```

3. **Verify Deployment:**
   ```bash
   curl http://your-domain.com/api/health
   ```

### Post-Deployment

- [ ] Monitor error logs (Sentry)
- [ ] Check fraud detection alerts
- [ ] Verify receipt submissions working
- [ ] Test admin review dashboard
- [ ] Monitor S3/R2 costs
- [ ] Set up backup strategy for receipt images

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Receipt Processing:**
   - Submissions per hour
   - OCR success rate
   - Fraud detection accuracy

2. **Database Performance:**
   - Query response times
   - Connection pool usage
   - Storage growth

3. **Image Storage:**
   - Upload success rate
   - Storage costs
   - CDN bandwidth

4. **Fraud Detection:**
   - False positive rate
   - False negative rate
   - Manual review queue size

### Recommended Tools

- **APM:** New Relic, DataDog
- **Logs:** ELK Stack, CloudWatch
- **Errors:** Sentry
- **Uptime:** Pingdom, UptimeRobot

---

## Troubleshooting

### Common Issues

#### 1. Prisma Client Out of Sync
```bash
npx prisma generate
npm run build
```

#### 2. S3 Upload Fails
- Check AWS credentials
- Verify bucket permissions
- Check region configuration

#### 3. Fraud Score Too High
- Adjust thresholds in `.env`
- Check merchant whitelist
- Review GPS radius settings

#### 4. Database Connection Errors
- Check connection pool settings
- Verify DATABASE_URL
- Increase timeout values

---

## Next Steps

1. **Phase 5: ML Integration**
   - Integrate Google ML Kit for OCR
   - Train fraud detection model
   - Implement anomaly detection

2. **Phase 6: Advanced Features**
   - Real-time fraud alerts
   - Receipt categorization
   - Spending insights
   - Tax reporting

3. **Phase 7: Scale Optimization**
   - Redis caching layer
   - Read replicas for analytics
   - CDN for images
   - Queue system for OCR processing

---

## Support

For issues or questions:
- Check documentation: `/docs`
- API reference: `/api/docs` (Swagger)
- GitHub Issues: [repo-link]

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0

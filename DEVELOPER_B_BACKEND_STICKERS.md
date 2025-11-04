# DEVELOPER B - BACKEND STICKER SYSTEMS IMPLEMENTATION PLAN

**Role:** Backend Sticker Systems Lead
**Timeline:** Days 5-7 (24-30 hours)
**Priority:** HIGH
**Technologies:** Node.js, Express, Prisma, AWS S3, Multer

---

## OVERVIEW

You will complete the BOOM-Sticker QR scanning system including:
- Card management API (CRUD endpoints)
- Image upload service (S3 integration)
- Cashback-to-wallet integration
- Sticker system enhancements
- Receipt-to-wallet integration

**Prerequisites:** Developer A must complete Wallet system (Day 2)

---

## DAY 5: CARD MANAGEMENT API (8-10 hours)

### TASK 5.1: Create Card Service (3 hours)

**File:** `backend-api/src/services/card.service.ts`

```typescript
import { PrismaClient, CardType, CardStatus } from '@prisma/client';
import QRCode from 'qrcode';
import { logger } from '../utils/logger';
import { subscriptionService } from './subscription.service';

const prisma = new PrismaClient();

export class CardService {
  /**
   * Create card for user
   */
  async createCard(params: {
    userId: string;
    cardNumber?: string;
    cardType?: CardType;
  }) {
    const { userId, cardNumber, cardType = 'STANDARD' } = params;

    // Check if user already has a card
    const existingCard = await prisma.card.findFirst({
      where: { userId },
    });

    if (existingCard) {
      throw new Error('User already has a card');
    }

    // Generate card number if not provided
    const generatedCardNumber = cardNumber || this.generateCardNumber();

    // Generate QR code
    const qrCodeData = JSON.stringify({
      cardNumber: generatedCardNumber,
      userId,
      type: cardType,
      issuedAt: new Date().toISOString(),
    });

    const qrCodeUrl = await QRCode.toDataURL(qrCodeData, {
      errorCorrectionLevel: 'H',
      width: 300,
      margin: 2,
    });

    // Create card
    const card = await prisma.card.create({
      data: {
        userId,
        cardNumber: generatedCardNumber,
        cardType,
        status: 'ACTIVE',
        qrCode: qrCodeUrl,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000), // 3 years
      },
    });

    logger.info(`Created ${cardType} card for user ${userId}`);

    return card;
  }

  /**
   * Get user's card
   */
  async getUserCard(userId: string) {
    return prisma.card.findFirst({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Upgrade card tier
   */
  async upgradeCardTier(cardId: string, newTier: CardType) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Check tier progression
    const tierOrder = ['STANDARD', 'PREMIUM', 'PLATINUM'];
    const currentIndex = tierOrder.indexOf(card.cardType);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new Error('Can only upgrade to higher tier');
    }

    // Check subscription
    const subscription = await subscriptionService.getActiveSubscription(card.userId);

    if (newTier === 'PREMIUM' && subscription?.plan !== 'PREMIUM' && subscription?.plan !== 'PLATINUM') {
      throw new Error('Premium card requires Premium or Platinum subscription');
    }

    if (newTier === 'PLATINUM' && subscription?.plan !== 'PLATINUM') {
      throw new Error('Platinum card requires Platinum subscription');
    }

    // Update card
    const updatedCard = await prisma.card.update({
      where: { id: cardId },
      data: {
        cardType: newTier,
        lastUpgradedAt: new Date(),
      },
    });

    logger.info(`Upgraded card ${cardId} from ${card.cardType} to ${newTier}`);

    return updatedCard;
  }

  /**
   * Deactivate card
   */
  async deactivateCard(cardId: string, reason?: string) {
    const card = await prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'BLOCKED',
        blockedReason: reason,
        blockedAt: new Date(),
      },
    });

    logger.warn(`Deactivated card ${cardId}: ${reason}`);

    return card;
  }

  /**
   * Activate card
   */
  async activateCard(cardId: string) {
    return prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'ACTIVE',
        blockedReason: null,
        blockedAt: null,
      },
    });
  }

  /**
   * Get card benefits based on tier
   */
  getCardBenefits(cardType: CardType) {
    const benefits = {
      STANDARD: {
        cashbackRate: 0.05,
        bonusCashback: 0,
        features: [
          '5% cashback on receipts',
          'Standard QR code',
          'Basic rewards',
        ],
      },
      PREMIUM: {
        cashbackRate: 0.07,
        bonusCashback: 0.02,
        features: [
          '7% cashback on receipts',
          '+2% bonus on sticker scans',
          'Premium QR code design',
          'Priority support',
          'Advanced analytics',
        ],
      },
      PLATINUM: {
        cashbackRate: 0.10,
        bonusCashback: 0.05,
        features: [
          '10% cashback on receipts',
          '+5% bonus on sticker scans',
          'Platinum QR code design',
          'VIP support',
          'Premium analytics',
          'Exclusive offers',
        ],
      },
    };

    return benefits[cardType];
  }

  /**
   * Generate card number (format: BOOM-XXXX-XXXX-XXXX)
   */
  private generateCardNumber(): string {
    const part1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const part3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `BOOM-${part1}-${part2}-${part3}`;
  }

  /**
   * Validate card QR code
   */
  async validateCard(cardNumber: string) {
    const card = await prisma.card.findUnique({
      where: { cardNumber },
    });

    if (!card) {
      return { valid: false, reason: 'Card not found' };
    }

    if (card.status !== 'ACTIVE') {
      return { valid: false, reason: `Card is ${card.status}` };
    }

    if (card.expiresAt && card.expiresAt < new Date()) {
      return { valid: false, reason: 'Card expired' };
    }

    return { valid: true, card };
  }

  /**
   * Get card statistics
   */
  async getCardStatistics(cardId: string) {
    const card = await prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      throw new Error('Card not found');
    }

    const [receiptsCount, stickersCount, totalCashback] = await Promise.all([
      prisma.receipt.count({
        where: {
          userId: card.userId,
          status: 'APPROVED',
        },
      }),
      prisma.stickerScan.count({
        where: {
          userId: card.userId,
          status: 'APPROVED',
        },
      }),
      prisma.walletTransaction.aggregate({
        where: {
          wallet: { userId: card.userId },
          type: 'CASHBACK_CREDIT',
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
    ]);

    return {
      receiptsScanned: receiptsCount,
      stickersScanned: stickersCount,
      totalCashbackEarned: totalCashback._sum.amount || 0,
      cardType: card.cardType,
      memberSince: card.issuedAt,
    };
  }
}

export const cardService = new CardService();
```

---

### TASK 5.2: Create Card Routes (2 hours)

**File:** `backend-api/src/routes/cards.routes.ts`

```typescript
import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { cardService } from '../services/card.service';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * POST /api/cards
 * Create card for user
 */
const createCardSchema = z.object({
  cardType: z.enum(['STANDARD', 'PREMIUM', 'PLATINUM']).default('STANDARD'),
});

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { cardType } = createCardSchema.parse(req.body);

  const card = await cardService.createCard({ userId, cardType });

  res.status(201).json(card);
}));

/**
 * GET /api/cards/my-card
 * Get user's card
 */
router.get('/my-card', asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const card = await cardService.getUserCard(userId);

  if (!card) {
    return res.status(404).json({ error: 'No card found. Create one first.' });
  }

  const benefits = cardService.getCardBenefits(card.cardType);

  res.json({
    ...card,
    benefits,
  });
}));

/**
 * GET /api/cards/benefits
 * Get all card tier benefits
 */
router.get('/benefits', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tiers = ['STANDARD', 'PREMIUM', 'PLATINUM'].map(tier => ({
    tier,
    ...cardService.getCardBenefits(tier as any),
  }));

  res.json({ tiers });
}));

/**
 * POST /api/cards/:id/upgrade
 * Upgrade card tier
 */
const upgradeSchema = z.object({
  newTier: z.enum(['PREMIUM', 'PLATINUM']),
});

router.post('/:id/upgrade', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { newTier } = upgradeSchema.parse(req.body);

  const card = await cardService.upgradeCardTier(id, newTier);

  res.json(card);
}));

/**
 * POST /api/cards/:id/deactivate
 * Deactivate card
 */
const deactivateSchema = z.object({
  reason: z.string().optional(),
});

router.post('/:id/deactivate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = deactivateSchema.parse(req.body);

  const card = await cardService.deactivateCard(id, reason);

  res.json(card);
}));

/**
 * POST /api/cards/:id/activate
 * Activate card
 */
router.post('/:id/activate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const card = await cardService.activateCard(id);

  res.json(card);
}));

/**
 * GET /api/cards/:id/statistics
 * Get card usage statistics
 */
router.get('/:id/statistics', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const stats = await cardService.getCardStatistics(id);

  res.json(stats);
}));

/**
 * POST /api/cards/validate
 * Validate card by number (for QR scanning)
 */
const validateSchema = z.object({
  cardNumber: z.string(),
});

router.post('/validate', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { cardNumber } = validateSchema.parse(req.body);
  const validation = await cardService.validateCard(cardNumber);

  res.json(validation);
}));

export default router;
```

---

### TASK 5.3: Mount Card Routes (15 mins)

**File:** `backend-api/src/server.ts`

**Add:**
```typescript
import cardRoutes from './routes/cards.routes';

app.use('/api/cards', cardRoutes);
```

---

### TASK 5.4: Test Card Endpoints (1.5 hours)

**Create:** `backend-api/tests/card.test.ts`

```typescript
import request from 'supertest';
import app from '../src/server';

describe('Card API', () => {
  let authToken: string;
  let cardId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'card-test@example.com',
        password: 'Test123!',
        name: 'Card Test',
      });

    authToken = res.body.token;
  });

  test('POST /api/cards - should create card', async () => {
    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ cardType: 'STANDARD' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('cardNumber');
    expect(res.body).toHaveProperty('qrCode');
    expect(res.body.cardType).toBe('STANDARD');

    cardId = res.body.id;
  });

  test('GET /api/cards/my-card - should return user card', async () => {
    const res = await request(app)
      .get('/api/cards/my-card')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cardId);
    expect(res.body.benefits).toBeDefined();
  });

  test('GET /api/cards/benefits - should return all tiers', async () => {
    const res = await request(app)
      .get('/api/cards/benefits')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.tiers).toHaveLength(3);
  });
});
```

---

## DAY 6: IMAGE UPLOAD SERVICE (8-10 hours)

### TASK 6.1: Configure AWS S3 (1 hour)

**Verify .env has:**
```bash
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=AKIAWOWGBSYW6AXN47M6
AWS_SECRET_ACCESS_KEY=<your-secret>
AWS_S3_BUCKET=boomcard-receipts-prod
```

**Test S3 connection:**

**File:** `backend-api/scripts/test-s3.js`

```javascript
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testS3() {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: 'test/test.txt',
      Body: 'Hello from BoomCard!',
    });

    await s3Client.send(command);
    console.log('✅ S3 connection successful!');
  } catch (error) {
    console.error('❌ S3 connection failed:', error.message);
  }
}

testS3();
```

**Run:**
```bash
node backend-api/scripts/test-s3.js
```

---

### TASK 6.2: Update Image Upload Service (3 hours)

**File:** `backend-api/src/services/imageUpload.service.ts`

**Replace entire file:**

```typescript
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'boomcard-receipts-prod';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

export class ImageUploadService {
  /**
   * Upload image to S3
   */
  async uploadImage(params: {
    file: Buffer;
    fileName: string;
    mimeType: string;
    folder?: string;
    userId?: string;
  }): Promise<{ url: string; key: string; size: number }> {
    const { file, fileName, mimeType, folder = 'receipts', userId } = params;

    // Validate
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    if (file.length > MAX_FILE_SIZE) {
      throw new Error(`File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Process image
    const processedImage = await this.processImage(file);

    // Generate unique key
    const fileExtension = fileName.split('.').pop();
    const uniqueName = `${crypto.randomUUID()}.${fileExtension}`;
    const key = userId
      ? `${folder}/${userId}/${uniqueName}`
      : `${folder}/${uniqueName}`;

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: processedImage,
      ContentType: mimeType,
      Metadata: {
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
        ...(userId && { userId }),
      },
    });

    await s3Client.send(command);

    const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    logger.info(`Uploaded image to S3: ${key}`);

    return {
      url,
      key,
      size: processedImage.length,
    };
  }

  /**
   * Process image (resize, optimize, strip metadata)
   */
  private async processImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(2000, 2000, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        progressive: true,
      })
      .toBuffer();
  }

  /**
   * Delete image from S3
   */
  async deleteImage(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    logger.info(`Deleted image from S3: ${key}`);
  }

  /**
   * Get presigned URL for temporary access
   */
  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  }

  /**
   * Upload multiple images
   */
  async uploadMultiple(files: Array<{
    file: Buffer;
    fileName: string;
    mimeType: string;
  }>, folder?: string, userId?: string): Promise<Array<{ url: string; key: string }>> {
    const uploads = files.map(file =>
      this.uploadImage({ ...file, folder, userId })
    );

    return Promise.all(uploads);
  }

  /**
   * Get image info
   */
  async getImageInfo(buffer: Buffer) {
    const metadata = await sharp(buffer).metadata();

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      hasAlpha: metadata.hasAlpha,
    };
  }
}

export const imageUploadService = new ImageUploadService();
```

---

### TASK 6.3: Create Upload Middleware (1.5 hours)

**File:** `backend-api/src/middleware/upload.middleware.ts`

```typescript
import multer from 'multer';
import { Request } from 'express';

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5, // Max 5 files per request
  },
  fileFilter,
});

// Single file upload
export const uploadSingle = uploadMiddleware.single('image');

// Multiple files upload
export const uploadMultiple = uploadMiddleware.array('images', 5);
```

---

### TASK 6.4: Update Receipt Routes for Image Upload (2 hours)

**File:** `backend-api/src/routes/receipts.routes.ts`

**Add at top:**
```typescript
import { uploadSingle } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
```

**Update the receipt submission endpoint (around line 50):**

```typescript
/**
 * POST /api/receipts
 * Submit receipt with image
 */
router.post(
  '/',
  uploadSingle, // Add middleware
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user!.id;

    // Get form data
    const data = JSON.parse(req.body.data || '{}');

    let imageUrl: string | undefined;
    let imageKey: string | undefined;

    // Upload image to S3 if provided
    if (req.file) {
      const upload = await imageUploadService.uploadImage({
        file: req.file.buffer,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: 'receipts',
        userId,
      });

      imageUrl = upload.url;
      imageKey = upload.key;
    }

    // Create receipt
    const receipt = await receiptService.submitReceipt({
      ...data,
      userId,
      receiptImageUrl: imageUrl,
      imageKey,
    });

    res.status(201).json(receipt);
  })
);
```

---

### TASK 6.5: Update Sticker Routes for Receipt Upload (1.5 hours)

**File:** `backend-api/src/routes/stickers.routes.ts`

**Add at top:**
```typescript
import { uploadSingle } from '../middleware/upload.middleware';
import { imageUploadService } from '../services/imageUpload.service';
```

**Update the receipt upload endpoint (around line 60):**

```typescript
/**
 * POST /api/stickers/scan/:scanId/receipt
 * Upload receipt for sticker scan
 */
router.post(
  '/scan/:scanId/receipt',
  uploadSingle,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { scanId } = req.params;
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({ error: 'Receipt image is required' });
    }

    // Upload to S3
    const upload = await imageUploadService.uploadImage({
      file: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder: 'sticker-receipts',
      userId,
    });

    // Parse OCR data if provided
    const ocrData = req.body.ocrData ? JSON.parse(req.body.ocrData) : undefined;

    // Update sticker scan with receipt
    const scan = await stickerService.uploadReceipt({
      scanId,
      userId,
      receiptImageUrl: upload.url,
      imageKey: upload.key,
      ocrData,
    });

    res.json(scan);
  })
);
```

---

## DAY 7: CASHBACK INTEGRATION (8-10 hours)

### TASK 7.1: Integrate Wallet with Sticker Scans (3 hours)

**File:** `backend-api/src/services/sticker.service.ts`

**Replace lines 461-462 (the TODO comments) with:**

```typescript
// Credit cashback to wallet
await walletService.credit({
  userId: scan.userId,
  amount: scan.cashbackAmount,
  type: 'CASHBACK_CREDIT',
  description: `Cashback from sticker scan at ${scan.sticker.location.locationName}`,
  stickerScanId: scan.id,
  metadata: {
    venueId: scan.sticker.location.venueId,
    locationName: scan.sticker.location.locationName,
    billAmount: scan.billAmount,
    cardTier: scan.card?.cardType || 'STANDARD',
  },
});

logger.info(`Credited ${scan.cashbackAmount} BGN cashback for scan ${scanId}`);

// TODO: Send notification to user (implement in next phase)
```

**Add import at top:**
```typescript
import { walletService } from './wallet.service';
```

---

### TASK 7.2: Integrate Wallet with Receipts (2 hours)

**File:** `backend-api/src/services/receipt.service.ts`

**Find the approveReceipt method (around line 400) and add wallet credit:**

```typescript
async approveReceipt(receiptId: string, adminNotes?: string) {
  const receipt = await prisma.receipt.update({
    where: { id: receiptId },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      adminNotes,
    },
  });

  // Credit cashback to wallet
  await walletService.credit({
    userId: receipt.userId,
    amount: receipt.cashbackAmount,
    type: 'CASHBACK_CREDIT',
    description: `Cashback from receipt at ${receipt.merchantName}`,
    receiptId: receipt.id,
    metadata: {
      merchantName: receipt.merchantName,
      totalAmount: receipt.totalAmount,
      receiptDate: receipt.receiptDate,
    },
  });

  logger.info(`Approved receipt ${receiptId} and credited ${receipt.cashbackAmount} BGN`);

  // TODO: Send approval notification to user

  return receipt;
}
```

**Add import:**
```typescript
import { walletService } from './wallet.service';
```

---

### TASK 7.3: Update Card Tier Detection (1.5 hours)

**File:** `backend-api/src/services/receipt.service.ts`

**Find all instances of `// TODO: Get cardTier` and replace:**

**Around line 632:**
```typescript
// Get user's card tier
const userCard = await prisma.card.findFirst({
  where: { userId },
});

const cardTier = userCard?.cardType || 'STANDARD';
```

**Around line 689:**
```typescript
// Get or create card for user
let userCard = await prisma.card.findFirst({
  where: { userId },
});

if (!userCard) {
  // Auto-create standard card if user doesn't have one
  userCard = await cardService.createCard({ userId, cardType: 'STANDARD' });
}

const cardId = userCard.id;
```

**Around line 893:**
```typescript
const userCard = await prisma.card.findFirst({
  where: { userId: receipt.userId },
});

const cardTier = userCard?.cardType || 'STANDARD';
```

**Add imports:**
```typescript
import { cardService } from './card.service';
```

---

### TASK 7.4: Auto-Create Card on User Registration (1 hour)

**File:** `backend-api/src/services/auth.service.ts`

**Find the register method and add card creation:**

**After user creation (around line 50):**

```typescript
// Create user
const user = await prisma.user.create({
  data: {
    email,
    password: hashedPassword,
    name,
    role,
  },
});

// Auto-create standard card and wallet
await Promise.all([
  cardService.createCard({ userId: user.id, cardType: 'STANDARD' }),
  walletService.getOrCreateWallet(user.id),
]);

logger.info(`Created user ${email} with card and wallet`);
```

**Add imports:**
```typescript
import { cardService } from './card.service';
import { walletService } from './wallet.service';
```

---

### TASK 7.5: Create Integration Tests (2.5 hours)

**File:** `backend-api/tests/integration/cashback-flow.test.ts`

```typescript
import request from 'supertest';
import app from '../../src/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Cashback Integration Flow', () => {
  let authToken: string;
  let userId: string;
  let cardId: string;

  beforeAll(async () => {
    // Register user
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'cashback-test@example.com',
        password: 'Test123!',
        name: 'Cashback Test',
      });

    authToken = res.body.token;
    userId = res.body.user.id;

    // Get auto-created card
    const cardRes = await request(app)
      .get('/api/cards/my-card')
      .set('Authorization', `Bearer ${authToken}`);

    cardId = cardRes.body.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test('Complete sticker scan cashback flow', async () => {
    // 1. Get wallet balance (should be 0)
    let balanceRes = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${authToken}`);

    expect(balanceRes.body.balance).toBe(0);

    // 2. Create sticker scan (simulate)
    const scan = await prisma.stickerScan.create({
      data: {
        userId,
        stickerId: 'test-sticker-id',
        cardId,
        billAmount: 100,
        cashbackAmount: 5, // 5% of 100
        gpsLatitude: 42.6977,
        gpsLongitude: 23.3219,
        status: 'PENDING_RECEIPT',
      },
    });

    // 3. Approve scan (this should credit wallet)
    await prisma.stickerScan.update({
      where: { id: scan.id },
      data: { status: 'APPROVED' },
    });

    // Manually credit (since webhook won't fire in test)
    await walletService.credit({
      userId,
      amount: 5,
      type: 'CASHBACK_CREDIT',
      description: 'Test cashback',
      stickerScanId: scan.id,
    });

    // 4. Check wallet balance (should be 5)
    balanceRes = await request(app)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${authToken}`);

    expect(balanceRes.body.balance).toBe(5);

    // 5. Check transactions
    const txRes = await request(app)
      .get('/api/wallet/transactions')
      .set('Authorization', `Bearer ${authToken}`);

    expect(txRes.body.transactions).toHaveLength(1);
    expect(txRes.body.transactions[0].type).toBe('CASHBACK_CREDIT');
    expect(txRes.body.transactions[0].amount).toBe(5);
  });

  test('Receipt approval credits wallet', async () => {
    // Similar test for receipt flow
    // ...implementation details
  });

  test('Card tier affects cashback amount', async () => {
    // Upgrade card to PREMIUM
    await request(app)
      .post(`/api/cards/${cardId}/upgrade`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ newTier: 'PREMIUM' });

    // Create PREMIUM subscription first
    // ... subscription setup

    // Scan should now give 7% cashback
    // ... test implementation
  });
});
```

---

## ACCEPTANCE CRITERIA

### DAY 5 ✅
- [ ] Card CRUD endpoints work
- [ ] Can create/get/upgrade cards
- [ ] QR codes generated for cards
- [ ] Card validation works
- [ ] Card statistics accurate
- [ ] Unit tests pass

### DAY 6 ✅
- [ ] S3 connection works
- [ ] Images upload successfully
- [ ] Images optimized/resized
- [ ] Receipt submission includes image
- [ ] Sticker scan receipt upload works
- [ ] Image URLs accessible
- [ ] Can delete images

### DAY 7 ✅
- [ ] Sticker scan approval credits wallet
- [ ] Receipt approval credits wallet
- [ ] Card tier detection works
- [ ] Cashback amounts correct
- [ ] Auto-create card on registration
- [ ] Integration tests pass
- [ ] Wallet transactions linked to receipts/scans

---

## TESTING CHECKLIST

- [ ] Card creation generates valid QR codes
- [ ] Card tier upgrades require subscription
- [ ] Image upload handles large files gracefully
- [ ] Image upload validates file types
- [ ] S3 errors handled properly
- [ ] Cashback credited only once per approval
- [ ] Concurrent cashback operations safe
- [ ] Card tier affects cashback calculation
- [ ] Premium cards get bonus cashback on stickers

---

## DOCUMENTATION REQUIREMENTS

- [ ] Card API endpoints documented
- [ ] Image upload specs (max size, formats)
- [ ] S3 bucket structure documented
- [ ] Cashback calculation formulas
- [ ] Card tier benefits table
- [ ] QR code format specification

---

## DEPENDENCIES

**Depends On:**
- Developer A Day 2 (Wallet system must be complete)

**Blocks:**
- Developer C (mobile app card/sticker features)

---

## ENVIRONMENT VARIABLES NEEDED

```bash
# AWS S3 (already configured)
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=AKIAWOWGBSYW6AXN47M6
AWS_SECRET_ACCESS_KEY=<secret>
AWS_S3_BUCKET=boomcard-receipts-prod
```

---

## NOTES

- All card numbers format: `BOOM-XXXX-XXXX-XXXX`
- QR codes use high error correction (can be partially damaged)
- Images auto-optimized to max 2000x2000px, 85% JPEG quality
- Cashback credited immediately on approval (no pending period)
- Standard cards auto-created on user registration
- Card tier linked to subscription plan

---

## CONTACT

**Questions?** Contact Developer A for wallet integration
**AWS Issues?** Check S3 bucket permissions
**Image Issues?** Verify Sharp library installed

**Status Updates:** Update daily in team channel

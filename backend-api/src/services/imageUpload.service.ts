import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { DHASH_BITS, DHASH_GRID_SIZE, DHASH_HEX_LENGTH } from '../constants/receipt.constants';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Cloudflare R2 — S3-compatible object storage.
// Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//                    R2_BUCKET_NAME, R2_PUBLIC_URL
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'boomcard-receipts';
// Public base URL for serving stored objects (e.g. https://pub-xxx.r2.dev or custom domain)
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
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
    const processedImage = await this.processImage(file, mimeType);

    // Generate unique key
    const fileExtension = fileName.split('.').pop();
    const uniqueName = `${crypto.randomUUID()}.${fileExtension}`;
    const key = userId
      ? `${folder}/${userId}/${uniqueName}`
      : `${folder}/${uniqueName}`;

    // Dev mode: skip actual R2 upload if using test credentials
    if (process.env.R2_ACCESS_KEY_ID === 'test') {
      const placeholderUrl = `https://placehold.co/800x600/f59e0b/ffffff?text=${encodeURIComponent(folder)}`;
      logger.info(`[DEV] Skipping R2 upload, returning placeholder: ${placeholderUrl}`);
      return { url: placeholderUrl, key, size: processedImage.length };
    }

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

    const url = `${PUBLIC_URL}/${key}`;

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
  private async processImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const image = sharp(buffer).resize(2000, 2000, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (mimeType === 'image/png') {
      return image.png({ compressionLevel: 8 }).toBuffer();
    }
    return image.jpeg({ quality: 85, progressive: true }).toBuffer();
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
   * Download image bytes from a stored S3 URL. Used by the merchant-verification
   * worker which only receives a scanId (the image buffer can't be queued in
   * Redis cheaply). Parses the key from the public-style URL so we don't need
   * a separate column to store it.
   */
  async downloadImageFromUrl(url: string): Promise<Buffer> {
    // Dev-mode placeholder URLs (placehold.co) — short-circuit so tests don't
    // depend on the public network.
    if (url.includes('placehold.co')) {
      throw new Error('Cannot download placeholder image (dev mode)');
    }

    // Extract the object key from a R2 public URL (or legacy S3 URL).
    // Key is the URL path minus the leading slash.
    // Fail loud on anything that doesn't look like our own storage URL.
    const parsed = new URL(url);
    const ownHosts = [
      // R2 dev subdomain: pub-xxx.r2.dev
      parsed.host.endsWith('.r2.dev'),
      // R2 custom domain configured via R2_PUBLIC_URL
      PUBLIC_URL && parsed.origin === PUBLIC_URL,
      // Legacy S3 (kept for any pre-migration URLs still in the DB)
      parsed.host.endsWith('.amazonaws.com'),
    ];
    if (!ownHosts.some(Boolean)) {
      throw new Error(`Refusing to download from unrecognised storage host: ${parsed.host}`);
    }
    const key = parsed.pathname.replace(/^\//, '');

    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) throw new Error(`S3 GetObject returned no body for key ${key}`);

    // The Body is a Readable stream in Node.js. Buffer it.
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
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

  /**
   * Compute a perceptual difference hash (dHash) of an image buffer.
   *
   * Algorithm:
   *   1. Resize to DHASH_GRID_SIZE × DHASH_GRID_SIZE using Sharp (grayscale, 1 channel).
   *   2. For each row, compare adjacent pixel pairs horizontally (col vs col+1).
   *      → 15 comparisons × 16 rows = 240 bits (DHASH_BITS).
   *   3. Pack bits into a 60-char hex string (DHASH_HEX_LENGTH).
   *
   * Returns an empty string on failure so callers can fail open.
   */
  async computePerceptualHash(buffer: Buffer): Promise<string> {
    try {
      const { data } = await sharp(buffer)
        .resize(DHASH_GRID_SIZE, DHASH_GRID_SIZE, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Build 240-bit string: for each row compare pixel[col] < pixel[col+1]
      let bits = '';
      for (let row = 0; row < DHASH_GRID_SIZE; row++) {
        for (let col = 0; col < DHASH_GRID_SIZE - 1; col++) {
          const idx = row * DHASH_GRID_SIZE + col;
          bits += data[idx] < data[idx + 1] ? '1' : '0';
        }
      }

      // Convert binary string to hex (4 bits per hex char)
      let hex = '';
      for (let i = 0; i < DHASH_BITS; i += 4) {
        hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
      }

      return hex.padStart(DHASH_HEX_LENGTH, '0');
    } catch (err) {
      logger.warn('computePerceptualHash failed — returning empty hash', err);
      return '';
    }
  }

  /**
   * Legacy method for backward compatibility.
   * Upload receipt image (Multer file), returns SHA-256 hash and perceptual hash.
   */
  async uploadReceipt(
    file: MulterFile,
    userId: string
  ): Promise<{ url: string; key: string; hash: string; perceptualHash: string }> {
    // SHA-256 for exact duplicate detection
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // dHash for visual similarity comparison
    const perceptualHash = await this.computePerceptualHash(file.buffer);

    const result = await this.uploadImage({
      file: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: 'receipts',
      userId,
    });

    return { ...result, hash, perceptualHash };
  }

  /**
   * Delete receipt image (legacy)
   */
  async deleteReceipt(key: string): Promise<void> {
    return this.deleteImage(key);
  }
}

export const imageUploadService = new ImageUploadService();

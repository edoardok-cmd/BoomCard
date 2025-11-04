import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import crypto from 'crypto';

/**
 * Image Upload Service
 *
 * Handles receipt image uploads to AWS S3 or CloudFlare R2
 * - Generates SHA-256 hash for duplicate detection
 * - Optimizes images with Sharp (85% JPEG quality)
 * - Stores images in organized folder structure: receipts/{userId}/{uuid}.jpg
 */
class ImageUploadService {
  private s3Client: S3Client;
  private bucket: string;
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || 'eu-west-1';
    this.bucket = process.env.AWS_S3_BUCKET || 'boom-receipts';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  /**
   * Upload receipt image to S3/R2
   *
   * @param file - Multer file object
   * @param userId - ID of user uploading the receipt
   * @returns Object containing URL, S3 key, and image hash
   */
  async uploadReceipt(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ url: string; key: string; hash: string }> {
    try {
      // Step 1: Generate SHA-256 hash for duplicate detection
      const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

      // Step 2: Optimize image with Sharp
      // - Convert to JPEG with 85% quality
      // - Reduces file size by ~50-70% without visible quality loss
      const optimized = await sharp(file.buffer)
        .jpeg({ quality: 85 })
        .toBuffer();

      // Step 3: Generate unique S3 key
      // Format: receipts/{userId}/{uuid}.jpg
      const key = `receipts/${userId}/${uuidv4()}.jpg`;

      // Step 4: Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: optimized,
          ContentType: 'image/jpeg',
          ACL: 'private', // Receipts are sensitive - keep private
          Metadata: {
            userId,
            uploadedAt: new Date().toISOString(),
            originalName: file.originalname,
          },
        })
      );

      // Step 5: Generate public URL
      const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      console.log(`✅ Receipt uploaded: ${key} (${(optimized.length / 1024).toFixed(1)}KB)`);

      return { url, key, hash };
    } catch (error) {
      console.error('❌ Error uploading receipt:', error);
      throw new Error('Failed to upload receipt image');
    }
  }

  /**
   * Upload receipt with CloudFlare R2 (alternative to S3)
   * R2 is S3-compatible but without egress fees
   */
  async uploadReceiptR2(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ url: string; key: string; hash: string }> {
    try {
      const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const optimized = await sharp(file.buffer).jpeg({ quality: 85 }).toBuffer();
      const key = `receipts/${userId}/${uuidv4()}.jpg`;

      // R2 uses S3-compatible API
      const r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      await r2Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || 'boom-receipts',
          Key: key,
          Body: optimized,
          ContentType: 'image/jpeg',
        })
      );

      // R2 public URL format
      const url = `https://${process.env.R2_BUCKET_NAME}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

      console.log(`✅ Receipt uploaded to R2: ${key}`);

      return { url, key, hash };
    } catch (error) {
      console.error('❌ Error uploading to R2:', error);
      throw new Error('Failed to upload receipt to R2');
    }
  }

  /**
   * Delete receipt image from storage
   * Used when user deletes receipt or admin rejects fraudulent submission
   */
  async deleteReceipt(key: string): Promise<void> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      console.log(`🗑️  Receipt deleted: ${key}`);
    } catch (error) {
      console.error('❌ Error deleting receipt:', error);
      throw new Error('Failed to delete receipt image');
    }
  }

  /**
   * Generate presigned URL for secure image access
   * Used when frontend needs to display receipt without making it publicly accessible
   */
  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });

      return url;
    } catch (error) {
      console.error('❌ Error generating presigned URL:', error);
      throw new Error('Failed to generate presigned URL');
    }
  }
}

export const imageUploadService = new ImageUploadService();

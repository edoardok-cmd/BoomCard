import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

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

  /**
   * Legacy method for backward compatibility
   * Upload receipt image (Multer file)
   */
  async uploadReceipt(
    file: MulterFile,
    userId: string
  ): Promise<{ url: string; key: string; hash: string }> {
    // Generate SHA-256 hash for duplicate detection
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const result = await this.uploadImage({
      file: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      folder: 'receipts',
      userId,
    });

    return { ...result, hash };
  }

  /**
   * Delete receipt image (legacy)
   */
  async deleteReceipt(key: string): Promise<void> {
    return this.deleteImage(key);
  }
}

export const imageUploadService = new ImageUploadService();

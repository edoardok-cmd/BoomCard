import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

// Magic byte signatures for allowed image types
const IMAGE_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/jpg':  [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
};

function matchesMagicBytes(buffer: Buffer, signatures: number[][]): boolean {
  return signatures.some(sig => sig.every((byte, i) => buffer[i] === byte));
}

const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: MulterFile, cb: FileFilterCallback) => {
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

/**
 * Post-upload middleware: validates magic bytes of uploaded files.
 * Must be applied after multer has buffered the file.
 */
export function validateMagicBytes(req: Request, res: Response, next: NextFunction): void {
  const files: Express.Multer.File[] = req.file
    ? [req.file]
    : Array.isArray(req.files)
      ? req.files
      : [];

  for (const file of files) {
    const sigs = IMAGE_SIGNATURES[file.mimetype];
    if (!sigs || !matchesMagicBytes(file.buffer, sigs)) {
      res.status(400).json({
        success: false,
        message: 'File content does not match its declared type.',
      });
      return;
    }
    // Extra check for WebP: bytes 8-11 must be "WEBP"
    if (file.mimetype === 'image/webp') {
      const webpMark = file.buffer.slice(8, 12).toString('ascii');
      if (webpMark !== 'WEBP') {
        res.status(400).json({
          success: false,
          message: 'File content does not match its declared type.',
        });
        return;
      }
    }
  }

  next();
}

// Single file upload
export const uploadSingle = uploadMiddleware.single('image');

// Multiple files upload
export const uploadMultiple = uploadMiddleware.array('images', 5);

import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';

// Multer file type
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
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

// Single file upload
export const uploadSingle = uploadMiddleware.single('image');

// Multiple files upload
export const uploadMultiple = uploadMiddleware.array('images', 5);

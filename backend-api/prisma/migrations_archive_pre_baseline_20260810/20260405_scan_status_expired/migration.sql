-- Add EXPIRED value to ScanStatus enum
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

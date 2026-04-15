import { createWorker, Worker, PSM } from 'tesseract.js';

/**
 * Extracted receipt data structure
 */
export interface ReceiptData {
  rawText: string;
  totalAmount?: number;
  date?: string;
  merchantName?: string;
  items?: ReceiptItem[];
  confidence: number;
}

export interface ReceiptItem {
  name: string;
  price?: number;
  quantity?: number;
}

/**
 * OCR processing options
 */
export interface OCROptions {
  language?: string;
  psm?: PSM; // Page Segmentation Mode
  preprocessImage?: boolean;
}

/**
 * Parse a Bulgarian or English formatted amount string to a JS number.
 * Handles:
 *   "1.234,56"  → 1234.56  (BG: dot=thousands, comma=decimal)
 *   "1,234.56"  → 1234.56  (EN: comma=thousands, dot=decimal)
 *   "1234,56"   → 1234.56  (BG no thousands sep)
 *   "1234.56"   → 1234.56  (EN no thousands sep)
 */
export function parseAmount(s: string): number {
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(s.replace(/,/g, ''));
}

/**
 * Parse raw OCR text into structured receipt data.
 * Exported separately so it can be unit-tested without a live Tesseract worker.
 */
export function parseReceiptText(text: string, confidence: number): ReceiptData {
  const receiptData: ReceiptData = {
    rawText: text,
    confidence,
  };

  // Total amount (common patterns in Bulgarian receipts)
  // Amount group supports thousands separators: 1.234,56 or 1,234.56
  const AMT = String.raw`(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})`;
  const totalPatterns = [
    new RegExp(String.raw`(?:всичко|total|сума|общо)[:\s]*` + AMT, 'i'),
    new RegExp(String.raw`(?:за\s+плащане|to\s+pay)[:\s]*` + AMT, 'i'),
    new RegExp(String.raw`итого[:\s]*` + AMT, 'i'),
    new RegExp(AMT + String.raw`\s*(?:лв|bgn|lev)`, 'i'),
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      receiptData.totalAmount = parseAmount(match[1]);
      break;
    }
  }

  // Date (various formats — ISO/4-digit-year patterns checked first to avoid
  // partial matches where the DD.MM.YY pattern eats the start of YYYY-MM-DD)
  const datePatterns = [
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
    /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/,
    /(\d{1,2}\s+(?:януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември)\s+\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      receiptData.date = match[1];
      break;
    }
  }

  // Merchant name — first non-empty line
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    receiptData.merchantName = lines[0].trim();
  }

  // Line items — text followed by price
  const itemPattern = /(.+?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g;
  const skipWords = /total|всичко|сума|общо|дата|date|час|time|бон|receipt|cash|card|ддс|vat/i;
  const items: ReceiptItem[] = [];
  let match;

  while ((match = itemPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const price = parseAmount(match[2]);

    if (name.length > 2 && !skipWords.test(name)) {
      items.push({ name, price });
    }
  }

  if (items.length > 0) {
    receiptData.items = items;
  }

  return receiptData;
}

/**
 * OCR Service using Tesseract.js
 * Handles receipt scanning and text extraction
 */
class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Initialize Tesseract worker with specified language
   * Supports Bulgarian (bul) and English (eng) for receipts
   */
  async initialize(language: string = 'bul+eng'): Promise<void> {
    // Return existing initialization if in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Already initialized
    if (this.isInitialized && this.worker) {
      return;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('🔧 Initializing Tesseract OCR worker...');
        this.worker = await createWorker(language, 1, {
          logger: (m) => {
            // Log progress for debugging
            if (m.status === 'loading tesseract core' ||
                m.status === 'initializing tesseract' ||
                m.status === 'loading language traineddata') {
              console.log(`📦 ${m.status}: ${Math.round((m.progress || 0) * 100)}%`);
            }
          },
        });

        // Configure for receipt text recognition
        await this.worker.setParameters({
          tessedit_pageseg_mode: PSM.AUTO, // Auto page segmentation
          preserve_interword_spaces: '1',
        });

        this.isInitialized = true;
        console.log('✅ Tesseract OCR initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize Tesseract:', error);
        this.worker = null;
        this.isInitialized = false;
        throw new Error('Failed to initialize OCR engine');
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Process image and extract text using OCR
   */
  async recognizeText(
    image: File | Blob | string,
    options: OCROptions = {}
  ): Promise<ReceiptData> {
    // Ensure worker is initialized
    if (!this.isInitialized || !this.worker) {
      await this.initialize(options.language);
    }

    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    try {
      console.log('🔍 Starting OCR recognition...');

      // Preprocess image if enabled (default: enabled)
      let processedImage: File | Blob | string = image;
      if (options.preprocessImage !== false && (image instanceof File || image instanceof Blob)) {
        console.log('🎨 Preprocessing image...');
        processedImage = await this.preprocessImage(image);
      }

      // Perform OCR
      const result = await this.worker.recognize(processedImage);

      console.log(`✅ OCR completed with ${result.data.confidence.toFixed(2)}% confidence`);

      // Parse receipt data from recognized text
      const receiptData = this.parseReceiptData(result.data.text, result.data.confidence);

      return receiptData;
    } catch (error) {
      console.error('❌ OCR recognition failed:', error);
      throw new Error('Failed to recognize text from image');
    }
  }

  /**
   * Parse raw OCR text to extract structured receipt data
   */
  private parseReceiptData(text: string, confidence: number): ReceiptData {
    return parseReceiptText(text, confidence);
  }

  /**
   * Preprocess image for better OCR accuracy
   * Applies: contrast enhancement, grayscale conversion, noise reduction
   */
  async preprocessImage(image: File | Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        console.warn('Canvas context not available, returning original image');
        resolve(image);
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(image);

      img.onload = () => {
        try {
          // Set canvas size to image size
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw original image
          ctx.drawImage(img, 0, 0);

          // Get image data
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Apply preprocessing
          for (let i = 0; i < data.length; i += 4) {
            // Convert to grayscale (luminosity method)
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

            // Enhance contrast (increase difference from mid-gray)
            const contrast = 1.5; // Contrast factor
            let enhanced = ((gray - 128) * contrast) + 128;
            enhanced = Math.max(0, Math.min(255, enhanced));

            // Apply adaptive thresholding for better text recognition
            // If pixel is closer to white, make it whiter; if closer to black, make it blacker
            const threshold = 127;
            const sharpness = 1.5;
            if (enhanced > threshold) {
              enhanced = Math.min(255, enhanced + (255 - enhanced) * sharpness * 0.3);
            } else {
              enhanced = Math.max(0, enhanced - enhanced * sharpness * 0.3);
            }

            // Set RGB to same value (grayscale)
            data[i] = enhanced;     // R
            data[i + 1] = enhanced; // G
            data[i + 2] = enhanced; // B
            // Alpha channel (i+3) remains unchanged
          }

          // Apply noise reduction (simple median filter on a subset)
          // For performance, we'll do a lightweight pass
          this.applyLightNoiseReduction(data, canvas.width, canvas.height);

          // Put processed image data back
          ctx.putImageData(imageData, 0, 0);

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);
              if (blob) {
                console.log('✨ Image preprocessing complete');
                resolve(blob);
              } else {
                reject(new Error('Failed to convert canvas to blob'));
              }
            },
            'image/jpeg',
            0.95
          );
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          console.error('Error preprocessing image:', error);
          resolve(image); // Fallback to original
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        console.error('Error loading image for preprocessing');
        resolve(image); // Fallback to original
      };

      img.src = objectUrl;
    });
  }

  /**
   * Apply lightweight noise reduction
   * Uses a simplified median filter approach
   */
  private applyLightNoiseReduction(data: Uint8ClampedArray, width: number, height: number): void {
    // Work on a copy to avoid in-place modification issues
    const temp = new Uint8ClampedArray(data);

    // Apply a 3x3 kernel (skip edges for simplicity)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        // Collect neighboring grayscale values
        const neighbors: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            neighbors.push(temp[nIdx]); // R channel (grayscale)
          }
        }

        // Get median value
        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];

        // Apply weighted average (70% original, 30% median)
        const smoothed = temp[idx] * 0.7 + median * 0.3;

        // Update all RGB channels
        data[idx] = smoothed;
        data[idx + 1] = smoothed;
        data[idx + 2] = smoothed;
      }
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return [
      'eng',      // English
      'bul',      // Bulgarian
      'bul+eng',  // Bulgarian + English (best for mixed receipts)
    ];
  }

  /**
   * Clean up resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      console.log('🧹 Terminating Tesseract worker...');
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }

  /**
   * Check if worker is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.worker !== null;
  }
}

// Export singleton instance
export const ocrService = new OCRService();

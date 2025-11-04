/**
 * OCR Service
 *
 * Handles receipt image OCR processing
 * Strategy: Send image to backend for server-side OCR processing
 * This is more reliable than client-side OCR and supports multiple languages
 */

import apiClient from '../api/client';

export interface OCRResult {
  merchantName: string;
  totalAmount: number;
  receiptDate: string;
  items: Array<{
    name: string;
    quantity?: number;
    price: number;
  }>;
  rawText: string;
  confidence: number;
  currency?: string;
}

export class OCRService {
  private static instance: OCRService;

  private constructor() {}

  public static getInstance(): OCRService {
    if (!OCRService.instance) {
      OCRService.instance = new OCRService();
    }
    return OCRService.instance;
  }

  /**
   * Process receipt image with OCR
   * Sends image to backend for server-side processing
   *
   * @param imageUri - Local file URI of receipt image
   * @param onProgress - Progress callback (0-100)
   * @returns OCR results with extracted data
   */
  async processReceiptImage(
    imageUri: string,
    onProgress?: (progress: number) => void
  ): Promise<OCRResult> {
    try {
      // Create FormData for image upload
      const formData = new FormData();

      const filename = imageUri.split('/').pop() || 'receipt.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      formData.append('image', {
        uri: imageUri,
        name: filename,
        type,
      } as any);

      // Send to backend OCR endpoint
      const response = await apiClient.upload(
        '/api/receipts/ocr',
        formData,
        (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error || 'OCR processing failed');
      }

      return this.parseOCRResponse(response.data);
    } catch (error: any) {
      console.error('OCR processing error:', error);

      // Fallback to manual entry if OCR fails
      return {
        merchantName: '',
        totalAmount: 0,
        receiptDate: new Date().toISOString().split('T')[0],
        items: [],
        rawText: '',
        confidence: 0,
        currency: 'BGN',
      };
    }
  }

  /**
   * Parse OCR response from backend
   */
  private parseOCRResponse(data: any): OCRResult {
    return {
      merchantName: data.merchantName || '',
      totalAmount: parseFloat(data.totalAmount || '0'),
      receiptDate: data.receiptDate || new Date().toISOString().split('T')[0],
      items: Array.isArray(data.items) ? data.items : [],
      rawText: data.rawText || '',
      confidence: parseFloat(data.confidence || '0'),
      currency: data.currency || 'BGN',
    };
  }

  /**
   * Extract specific patterns from OCR text
   * Fallback client-side parsing if backend OCR is unavailable
   */
  extractDataFromText(text: string): Partial<OCRResult> {
    const result: Partial<OCRResult> = {
      rawText: text,
      items: [],
    };

    // Extract merchant name (usually first line)
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      result.merchantName = lines[0].trim();
    }

    // Extract total amount
    // Pattern: Total, Totaal, Сума, etc. followed by amount
    const totalPattern = /(?:total|сума|suma|всичко)[\s:]*(\d+[.,]\d{2})/i;
    const totalMatch = text.match(totalPattern);
    if (totalMatch) {
      result.totalAmount = parseFloat(totalMatch[1].replace(',', '.'));
    }

    // Extract date
    // Pattern: DD.MM.YYYY or DD/MM/YYYY
    const datePattern = /(\d{2})[./-](\d{2})[./-](\d{4})/;
    const dateMatch = text.match(datePattern);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      result.receiptDate = `${year}-${month}-${day}`;
    }

    // Extract currency
    if (text.includes('BGN') || text.includes('лв')) {
      result.currency = 'BGN';
    }

    return result;
  }

  /**
   * Validate OCR results
   */
  validateOCRResult(result: OCRResult): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!result.merchantName || result.merchantName.length < 2) {
      errors.push('Merchant name not detected');
    }

    if (!result.totalAmount || result.totalAmount <= 0) {
      errors.push('Total amount not detected');
    }

    if (!result.receiptDate) {
      errors.push('Receipt date not detected');
    }

    if (result.confidence < 50) {
      errors.push('Low OCR confidence - manual verification recommended');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Format OCR confidence as percentage
   */
  formatConfidence(confidence: number): string {
    return `${Math.round(confidence)}%`;
  }

  /**
   * Get confidence color for UI
   */
  getConfidenceColor(confidence: number): string {
    if (confidence >= 80) return '#10B981'; // Green
    if (confidence >= 60) return '#F59E0B'; // Orange
    return '#EF4444'; // Red
  }
}

export default OCRService.getInstance();

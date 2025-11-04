import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReceiptScanner } from './ReceiptScanner';
import { ocrService } from '../../../services/ocr.service';

// Mock the OCR service
vi.mock('../../../services/ocr.service', () => ({
  ocrService: {
    initialize: vi.fn(),
    recognizeText: vi.fn(),
    isReady: vi.fn(() => true),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Camera: () => <div data-testid="camera-icon">Camera</div>,
  Upload: () => <div data-testid="upload-icon">Upload</div>,
  X: () => <div data-testid="x-icon">X</div>,
  FileText: () => <div data-testid="filetext-icon">FileText</div>,
  CheckCircle: () => <div data-testid="checkcircle-icon">CheckCircle</div>,
  AlertCircle: () => <div data-testid="alertcircle-icon">AlertCircle</div>,
}));

// Mock LanguageContext
vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
  }),
}));

describe('ReceiptScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial upload state', () => {
    render(<ReceiptScanner />);

    expect(screen.getByText(/Scan Receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument();
    expect(screen.getByText(/Take Photo/i)).toBeInTheDocument();
  });

  it('handles file selection', async () => {
    render(<ReceiptScanner />);

    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/Scan Receipt/i)).toBeInTheDocument();
    });
  });

  it('shows error for invalid file type', () => {
    render(<ReceiptScanner />);

    const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    expect(screen.getByText(/valid image file/i)).toBeInTheDocument();
  });

  it('processes receipt successfully', async () => {
    const mockResult = {
      rawText: 'Test receipt\nTotal: 29.99 BGN',
      totalAmount: 29.99,
      date: '2025-01-15',
      merchantName: 'Test Store',
      confidence: 95.5,
    };

    (ocrService.recognizeText as any).mockResolvedValue(mockResult);
    (ocrService.initialize as any).mockResolvedValue(undefined);

    const onScanComplete = vi.fn();
    render(<ReceiptScanner onScanComplete={onScanComplete} />);

    // Select file
    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    // Wait for preview and click scan
    await waitFor(() => {
      const scanButton = screen.getByText(/Scan Receipt/i);
      fireEvent.click(scanButton);
    });

    // Wait for processing
    await waitFor(() => {
      expect(screen.getByText(/Scan Results/i)).toBeInTheDocument();
    });

    expect(onScanComplete).toHaveBeenCalledWith(mockResult);
    expect(screen.getByText(/29.99/)).toBeInTheDocument();
    expect(screen.getByText(/Test Store/)).toBeInTheDocument();
  });

  it('handles OCR error gracefully', async () => {
    (ocrService.recognizeText as any).mockRejectedValue(new Error('OCR failed'));
    (ocrService.initialize as any).mockResolvedValue(undefined);

    render(<ReceiptScanner />);

    // Select file
    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    // Click scan button
    await waitFor(() => {
      const scanButton = screen.getByText(/Scan Receipt/i);
      fireEvent.click(scanButton);
    });

    // Wait for error message
    await waitFor(() => {
      expect(screen.getByText(/Failed to process receipt/i)).toBeInTheDocument();
    });
  });

  it('allows starting new scan after completion', async () => {
    const mockResult = {
      rawText: 'Test receipt',
      confidence: 90,
    };

    (ocrService.recognizeText as any).mockResolvedValue(mockResult);
    (ocrService.initialize as any).mockResolvedValue(undefined);

    render(<ReceiptScanner />);

    // Complete a scan
    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    await waitFor(() => {
      const scanButton = screen.getByText(/Scan Receipt/i);
      fireEvent.click(scanButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Scan Results/i)).toBeInTheDocument();
    });

    // Start new scan
    const newScanButton = screen.getByText(/Scan Another/i);
    fireEvent.click(newScanButton);

    await waitFor(() => {
      expect(screen.getByText(/Choose File/i)).toBeInTheDocument();
    });
  });
});

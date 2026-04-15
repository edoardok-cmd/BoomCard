import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ReceiptScanner } from './ReceiptScanner';
import { LanguageProvider } from '../../../contexts/LanguageContext';

// No mocks — real LanguageProvider, real icons, real service imports.
// Tests that invoke actual Tesseract OCR (which requires Web Workers not available in jsdom)
// belong in E2E tests. Only UI-level behaviour is tested here.

function renderWithProviders(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('ReceiptScanner', () => {
  beforeEach(() => {
    // English so text assertions match English labels
    localStorage.setItem('boomcard_language', 'en');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders initial upload state', () => {
    renderWithProviders(<ReceiptScanner />);

    expect(screen.getByText(/Scan Receipt/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument();
    expect(screen.getByText(/Take Photo/i)).toBeInTheDocument();
  });

  it('handles file selection', async () => {
    renderWithProviders(<ReceiptScanner />);

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
    renderWithProviders(<ReceiptScanner />);

    const file = new File(['content'], 'document.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    expect(screen.getByText(/valid image file/i)).toBeInTheDocument();
  });
});

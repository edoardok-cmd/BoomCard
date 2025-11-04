/**
 * Receipt Export & Sharing Utilities
 *
 * Provides functionality to:
 * - Export receipts as PDF
 * - Export as CSV/Excel
 * - Email receipts
 * - Share via social media
 */

import { Receipt } from '../services/receipt.service';

export interface ExportOptions {
  format: 'pdf' | 'csv' | 'json';
  includeImages?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Export receipts to CSV format
 */
export function exportToCSV(receipts: Receipt[]): string {
  // CSV Header
  const headers = [
    'Date',
    'Merchant',
    'Amount (BGN)',
    'Cashback (BGN)',
    'Status',
    'OCR Confidence',
    'Fraud Score',
  ];

  // CSV Rows
  const rows = receipts.map(receipt => [
    receipt.receiptDate || receipt.createdAt,
    receipt.merchantName || 'Unknown',
    receipt.totalAmount?.toFixed(2) || '0.00',
    receipt.cashbackAmount.toFixed(2),
    receipt.status,
    receipt.ocrConfidence.toFixed(0) + '%',
    receipt.fraudScore.toFixed(0),
  ]);

  // Combine headers and rows
  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csv;
}

/**
 * Download CSV file
 */
export function downloadCSV(receipts: Receipt[], filename: string = 'receipts.csv'): void {
  const csv = exportToCSV(receipts);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Export receipts to JSON format
 */
export function exportToJSON(receipts: Receipt[]): string {
  return JSON.stringify(receipts, null, 2);
}

/**
 * Download JSON file
 */
export function downloadJSON(receipts: Receipt[], filename: string = 'receipts.json'): void {
  const json = exportToJSON(receipts);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate PDF from receipts (simplified version)
 * For production, use a library like jsPDF or pdfmake
 */
export async function generateReceiptsPDF(receipts: Receipt[]): Promise<Blob> {
  // This is a placeholder - in production, use jsPDF or similar
  // For now, generate a simple HTML that can be printed to PDF

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Receipts Export</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        h1 {
          color: #111827;
          border-bottom: 3px solid #10b981;
          padding-bottom: 10px;
        }
        .receipt {
          border: 1px solid #e5e7eb;
          padding: 15px;
          margin-bottom: 20px;
          border-radius: 8px;
          page-break-inside: avoid;
        }
        .receipt-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .merchant {
          font-size: 18px;
          font-weight: bold;
          color: #111827;
        }
        .status {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .status-approved { background: #d1fae5; color: #065f46; }
        .status-rejected { background: #fee2e2; color: #991b1b; }
        .status-pending { background: #fef3c7; color: #92400e; }
        .receipt-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 10px;
        }
        .info-item {
          padding: 8px;
          background: #f9fafb;
          border-radius: 4px;
        }
        .info-label {
          font-size: 11px;
          color: #6b7280;
          text-transform: uppercase;
        }
        .info-value {
          font-size: 14px;
          font-weight: 600;
          color: #111827;
          margin-top: 4px;
        }
        .summary {
          background: #f3f4f6;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 15px;
        }
        .summary-item {
          text-align: center;
        }
        .summary-label {
          font-size: 12px;
          color: #6b7280;
        }
        .summary-value {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin-top: 5px;
        }
        @media print {
          body { margin: 0; padding: 10mm; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>Receipts Export - ${new Date().toLocaleDateString()}</h1>

      <div class="summary">
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Receipts</div>
            <div class="summary-value">${receipts.length}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Cashback</div>
            <div class="summary-value">${receipts.reduce((sum, r) => sum + r.cashbackAmount, 0).toFixed(2)} BGN</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Spent</div>
            <div class="summary-value">${receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0).toFixed(2)} BGN</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Approved</div>
            <div class="summary-value">${receipts.filter(r => r.status === 'APPROVED').length}</div>
          </div>
        </div>
      </div>

      ${receipts.map(receipt => `
        <div class="receipt">
          <div class="receipt-header">
            <div class="merchant">${receipt.merchantName || 'Unknown Merchant'}</div>
            <div class="status status-${receipt.status.toLowerCase()}">${receipt.status}</div>
          </div>

          <div class="receipt-info">
            <div class="info-item">
              <div class="info-label">Date</div>
              <div class="info-value">${receipt.receiptDate || new Date(receipt.createdAt).toLocaleDateString()}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Amount</div>
              <div class="info-value">${receipt.totalAmount?.toFixed(2) || '0.00'} BGN</div>
            </div>
            <div class="info-item">
              <div class="info-label">Cashback</div>
              <div class="info-value">${receipt.cashbackAmount.toFixed(2)} BGN</div>
            </div>
            <div class="info-item">
              <div class="info-label">OCR Confidence</div>
              <div class="info-value">${receipt.ocrConfidence.toFixed(0)}%</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fraud Score</div>
              <div class="info-value">${receipt.fraudScore.toFixed(0)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Receipt ID</div>
              <div class="info-value">${receipt.id.substring(0, 8)}...</div>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="no-print" style="margin-top: 30px; text-align: center; color: #6b7280;">
        <p>Use your browser's Print function (Ctrl/Cmd + P) and select "Save as PDF" to export this document.</p>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'text/html' });
  return blob;
}

/**
 * Open print dialog for PDF export
 */
export async function printReceiptsPDF(receipts: Receipt[]): Promise<void> {
  const blob = await generateReceiptsPDF(receipts);
  const url = URL.createObjectURL(blob);

  // Open in new window for printing
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }
}

/**
 * Email receipts (requires backend integration)
 */
export async function emailReceipts(
  receipts: Receipt[],
  emailAddress: string
): Promise<{ success: boolean; message: string }> {
  // This would call your backend API to send email
  try {
    const response = await fetch('/api/receipts/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        receipts: receipts.map(r => r.id),
        email: emailAddress,
      }),
    });

    if (response.ok) {
      return { success: true, message: 'Email sent successfully' };
    } else {
      return { success: false, message: 'Failed to send email' };
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, message: 'Network error' };
  }
}

/**
 * Share receipt via social media or messaging
 */
export function shareReceipt(receipt: Receipt, platform: 'whatsapp' | 'facebook' | 'twitter' | 'email'): void {
  const text = `Check out my receipt from ${receipt.merchantName || 'Unknown Merchant'}! Amount: ${receipt.totalAmount?.toFixed(2) || '0.00'} BGN, Cashback: ${receipt.cashbackAmount.toFixed(2)} BGN`;
  const url = window.location.href;

  let shareUrl: string;

  switch (platform) {
    case 'whatsapp':
      shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
      break;
    case 'facebook':
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
      break;
    case 'twitter':
      shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      break;
    case 'email':
      shareUrl = `mailto:?subject=${encodeURIComponent('My Receipt')}&body=${encodeURIComponent(text + '\n\n' + url)}`;
      break;
    default:
      return;
  }

  window.open(shareUrl, '_blank', 'width=600,height=400');
}

/**
 * Generate summary report
 */
export interface ReceiptsSummary {
  totalReceipts: number;
  totalCashback: number;
  totalSpent: number;
  averageAmount: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  successRate: number;
  dateRange: {
    start: string;
    end: string;
  };
}

export function generateSummary(receipts: Receipt[]): ReceiptsSummary {
  const totalCashback = receipts.reduce((sum, r) => sum + r.cashbackAmount, 0);
  const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const approvedCount = receipts.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = receipts.filter(r => r.status === 'REJECTED').length;
  const pendingCount = receipts.filter(r => r.status === 'PENDING' || r.status === 'MANUAL_REVIEW').length;

  const dates = receipts.map(r => new Date(r.createdAt)).sort((a, b) => a.getTime() - b.getTime());

  return {
    totalReceipts: receipts.length,
    totalCashback,
    totalSpent,
    averageAmount: receipts.length > 0 ? totalSpent / receipts.length : 0,
    approvedCount,
    rejectedCount,
    pendingCount,
    successRate: receipts.length > 0 ? (approvedCount / receipts.length) * 100 : 0,
    dateRange: {
      start: dates.length > 0 ? dates[0].toISOString() : '',
      end: dates.length > 0 ? dates[dates.length - 1].toISOString() : '',
    },
  };
}

/**
 * Format receipts for accounting software (QuickBooks, Xero, etc.)
 */
export interface AccountingSoftwareFormat {
  date: string;
  vendor: string;
  category: string;
  amount: number;
  currency: string;
  description: string;
  receiptUrl?: string;
}

export function formatForAccountingSoftware(receipts: Receipt[]): AccountingSoftwareFormat[] {
  return receipts.map(receipt => ({
    date: receipt.receiptDate || receipt.createdAt,
    vendor: receipt.merchantName || 'Unknown Merchant',
    category: 'Business Expense', // Could be categorized based on merchant
    amount: receipt.totalAmount || 0,
    currency: 'BGN',
    description: `Receipt scanned via BOOM Card - Cashback: ${receipt.cashbackAmount.toFixed(2)} BGN`,
    receiptUrl: receipt.imageUrl,
  }));
}

/**
 * Single receipt wrapper functions for ReceiptDetailPage
 */

/**
 * Export a single receipt to PDF
 */
export async function exportReceiptToPDF(receipt: Receipt): Promise<void> {
  await printReceiptsPDF([receipt]);
}

/**
 * Export a single receipt to JSON
 */
export function exportReceiptToJSON(receipt: Receipt, filename: string = 'receipt.json'): void {
  downloadJSON([receipt], filename);
}

/**
 * Export receipts to CSV
 */
export function exportReceiptsToCSV(receipts: Receipt[], filename: string = 'receipts.csv'): void {
  downloadCSV(receipts, filename);
}

/**
 * Share a single receipt via email
 */
export function shareReceiptViaEmail(receipt: Receipt): void {
  const text = `Check out my receipt from ${receipt.merchantName || 'Unknown Merchant'}! Amount: ${receipt.totalAmount?.toFixed(2) || '0.00'} BGN, Cashback: ${receipt.cashbackAmount.toFixed(2)} BGN`;
  const subject = `Receipt from ${receipt.merchantName || 'Unknown Merchant'}`;
  const body = `${text}\n\nReceipt ID: ${receipt.id}\nDate: ${receipt.receiptDate || receipt.createdAt}\n\nView receipt: ${window.location.href}`;

  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

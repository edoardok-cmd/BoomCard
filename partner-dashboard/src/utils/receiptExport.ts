/**
 * Receipt Export & Sharing Utilities
 *
 * Provides functionality to:
 * - Export receipts as PDF
 * - Export as CSV/Excel
 * - Email receipts
 * - Share via social media
 *
 * SECURITY NOTE (spec §11.3, Clash 5.1, Clash 10.6):
 * All export and share functions accept PartnerReceipt — NOT the full Receipt
 * type. This enforces at compile time that internal-only fields (fraudScore,
 * cashbackPercent, ocrConfidence, ocrRawText, imageKey, imageHash, reviewedBy,
 * reviewNotes, latitude, longitude, userId) can never be included in any
 * partner-downloadable output.
 */

import { PartnerReceipt } from '../types/receipt.types';

export interface ExportOptions {
  format: 'pdf' | 'csv' | 'json';
  includeImages?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Escape a value for safe interpolation into an HTML template string.
 * Prevents XSS via merchant names or other user-controlled receipt data.
 */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Escape a value for safe inclusion in a CSV field.
 * Wraps in double-quotes and escapes internal quotes. Also guards against
 * CSV formula injection by prefixing leading =, +, -, @ with a tab.
 */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Guard against CSV formula injection
  const safe = /^[=+\-@]/.test(str) ? '\t' + str : str;
  // Wrap in quotes and escape internal double-quotes
  return '"' + safe.replace(/"/g, '""') + '"';
}

/**
 * Export receipts to CSV format.
 * Only partner-visible columns are included (spec §11.3, §6).
 *
 * MEDIUM-1 fix (r2w / r2t):
 * - cashbackAmount removed — it is the user's cashback reward, not partner
 *   financial data, and spec §6 Transactions view does not include it.
 * - LOW-2 fix (r2w / r2t): "Amount (EUR)" header renamed to "Amount" so the
 *   label is correct during both the BGN transition window and post-transition
 *   EUR-only phase (spec §7.3 / Clash 12.1).
 */
export function exportToCSV(receipts: PartnerReceipt[]): string {
  // CSV Header — internal fields (Fraud Score, OCR Confidence, Cashback)
  // intentionally omitted (spec §11.3, §6).
  const headers = [
    'Date',
    'Merchant',
    'Amount',
    'Status',
  ];

  // CSV Rows
  const rows = receipts.map(receipt => [
    escapeCsv(receipt.receiptDate || receipt.createdAt),
    escapeCsv(receipt.merchantName || 'Unknown'),
    escapeCsv(receipt.totalAmount?.toFixed(2) || '0.00'),
    escapeCsv(receipt.status),
  ]);

  // Combine headers and rows
  const csv = [
    headers.map(h => escapeCsv(h)).join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  return csv;
}

/**
 * Download CSV file
 */
export function downloadCSV(receipts: PartnerReceipt[], filename: string = 'receipts.csv'): void {
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
  // LOW-1 fix (review r2w): revoke the object URL after the click so the Blob
  // is released from memory immediately rather than waiting until page unload.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Export receipts to JSON format.
 * Only the safe partner-visible fields are serialised.
 * Internal fields (fraudScore, cashbackPercent, ocrConfidence, ocrRawText,
 * imageKey, imageHash, reviewedBy, reviewNotes, latitude, longitude, userId)
 * are structurally absent because PartnerReceipt never declares them.
 */
export function exportToJSON(receipts: PartnerReceipt[]): string {
  // Map explicitly to only the declared PartnerReceipt keys so any future
  // field additions to PartnerReceipt are included, but stray properties
  // that may exist at runtime are excluded.
  // MEDIUM-1 fix (r2w): cashbackAmount removed from the explicit map.
  // It is the user's cashback reward, not partner financial data, and spec §6
  // Transactions view does not include it.
  const safe = receipts.map(r => ({
    id: r.id,
    transactionId: r.transactionId,
    venueId: r.venueId,
    totalAmount: r.totalAmount,
    merchantName: r.merchantName,
    receiptDate: r.receiptDate,
    date: r.date,
    items: r.items,
    imageUrl: r.imageUrl,
    status: r.status,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
  return JSON.stringify(safe, null, 2);
}

/**
 * Download JSON file
 */
export function downloadJSON(receipts: PartnerReceipt[], filename: string = 'receipts.json'): void {
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
  // LOW-1 fix (review r2w): revoke object URL to release Blob memory.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Generate PDF from receipts (simplified version)
 * For production, use a library like jsPDF or pdfmake
 */
export async function generateReceiptsPDF(receipts: PartnerReceipt[]): Promise<Blob> {
  // This is a placeholder - in production, use jsPDF or similar
  // For now, generate a simple HTML that can be printed to PDF.
  // All field values are HTML-escaped to prevent XSS via merchant names or
  // other user-controlled data (HIGH fix per audit r2w).

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
          grid-template-columns: repeat(3, 1fr);
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
      <h1>Receipts Export - ${escapeHtml(new Date().toLocaleDateString())}</h1>

      <div class="summary">
        <div class="summary-grid">
          <div class="summary-item">
            <div class="summary-label">Total Receipts</div>
            <div class="summary-value">${escapeHtml(receipts.length)}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Total Amount</div>
            <div class="summary-value">${escapeHtml(receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0).toFixed(2))}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">Approved</div>
            <div class="summary-value">${escapeHtml(receipts.filter(r => r.status === 'APPROVED').length)}</div>
          </div>
        </div>
      </div>
      <!-- MEDIUM-1 fix (r2w): Total Cashback summary removed — cashbackAmount is user
           financial data; spec §6 Transactions view does not list it for partners.
           MEDIUM-3 fix (r2t): summary-grid reduced from 4 to 3 columns; cashback column gone. -->

      ${receipts.map(receipt => `
        <div class="receipt">
          <div class="receipt-header">
            <div class="merchant">${escapeHtml(receipt.merchantName || 'Unknown Merchant')}</div>
            <div class="status status-${escapeHtml(receipt.status.toLowerCase())}">${escapeHtml(receipt.status)}</div>
          </div>

          <div class="receipt-info">
            <div class="info-item">
              <div class="info-label">Date</div>
              <div class="info-value">${escapeHtml(receipt.receiptDate || new Date(receipt.createdAt).toLocaleDateString())}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Amount</div>
              <!-- MEDIUM-3 fix (r2t): removed hardcoded &euro; — amount is in the
                   system's active currency (BGN or EUR per spec §7.3 / Clash 12.1).
                   MEDIUM-1 fix (r2w): Cashback info-item removed — cashbackAmount is
                   user financial data; spec §6 Transactions view omits it for partners. -->
              <div class="info-value">${escapeHtml(receipt.totalAmount?.toFixed(2) || '0.00')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Receipt ID</div>
              <div class="info-value">${escapeHtml(receipt.id.substring(0, 8))}...</div>
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
export async function printReceiptsPDF(receipts: PartnerReceipt[]): Promise<void> {
  const blob = await generateReceiptsPDF(receipts);
  const url = URL.createObjectURL(blob);

  // Open in new window for printing
  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
      // LOW-1 fix (review r2w): revoke after the print dialog opens so the Blob
      // is eligible for GC once the user closes the window.
      URL.revokeObjectURL(url);
    });
  } else {
    // Window blocked — revoke immediately to avoid the leak.
    URL.revokeObjectURL(url);
  }
}

/**
 * Share receipt via social media or messaging.
 * Accepts PartnerReceipt to prevent accidental leakage of internal fields
 * (spec §11.3, Clash 10.6).
 */
export function shareReceipt(receipt: PartnerReceipt, platform: 'whatsapp' | 'facebook' | 'twitter' | 'email'): void {
  // H3 fix (review r2w): do NOT include cashbackAmount or window.location.href in
  // outbound share URLs.  The cashback amount in the partner portal context (spec
  // §11.3 / Clash 10.6) must not be transmitted to third-party social platforms.
  // window.location.href may embed session identifiers or receipt IDs in the path —
  // send a static canonical URL instead so no partner-internal parameters leak.
  // LOW fix: drop the hardcoded € prefix — the system's active currency is BGN
  // during the transition window and EUR after (spec §7.3 / Clash 12.1). The
  // CSV/PDF paths already emit a bare amount; keep the share text consistent.
  const text = `Receipt from ${receipt.merchantName || 'Unknown Merchant'}: ${receipt.totalAmount?.toFixed(2) || '0.00'}`;
  const canonicalUrl = 'https://boomcard.bg/';

  let shareUrl: string;

  switch (platform) {
    case 'whatsapp':
      shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + canonicalUrl)}`;
      break;
    case 'facebook':
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}&quote=${encodeURIComponent(text)}`;
      break;
    case 'twitter':
      shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(canonicalUrl)}`;
      break;
    case 'email':
      shareUrl = `mailto:?subject=${encodeURIComponent('My Receipt')}&body=${encodeURIComponent(text + '\n\n' + canonicalUrl)}`;
      break;
    default:
      return;
  }

  window.open(shareUrl, '_blank', 'width=600,height=400');
}

/**
 * Generate summary report
 */
/**
 * MEDIUM-1 fix (r2w / INFO-1 r2w):
 * `totalCashback` removed from ReceiptsSummary — cashbackAmount is user
 * financial data that spec §6 Transactions view does not expose to partners.
 * Any partner-facing UI that previously rendered `totalCashback` from this
 * summary must not be re-added.
 */
export interface ReceiptsSummary {
  totalReceipts: number;
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

export function generateSummary(receipts: PartnerReceipt[]): ReceiptsSummary {
  const totalSpent = receipts.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const approvedCount = receipts.filter(r => r.status === 'APPROVED').length;
  const rejectedCount = receipts.filter(r => r.status === 'REJECTED').length;
  const pendingCount = receipts.filter(r => r.status === 'PENDING' || r.status === 'MANUAL_REVIEW').length;

  const dates = receipts.map(r => new Date(r.createdAt)).sort((a, b) => a.getTime() - b.getTime());

  return {
    totalReceipts: receipts.length,
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

/**
 * LOW-1 fix (r2w / r2t): accept a `currency` parameter so callers can pass the
 * active display currency (BGN during the transition window, EUR after it) per
 * spec §7.3 / Clash 12.1.  Defaults to 'EUR' for post-transition environments.
 *
 * MEDIUM-1 fix (r2w): cashbackAmount removed from the description string — it is
 * user financial data; spec §6 Transactions view does not expose it to partners.
 */
export function formatForAccountingSoftware(
  receipts: PartnerReceipt[],
  currency: string = 'EUR',
): AccountingSoftwareFormat[] {
  return receipts.map(receipt => ({
    date: receipt.receiptDate || receipt.createdAt,
    vendor: receipt.merchantName || 'Unknown Merchant',
    category: 'Business Expense', // Could be categorized based on merchant
    amount: receipt.totalAmount || 0,
    currency,
    description: `Receipt scanned via BOOM Card`,
    receiptUrl: receipt.imageUrl,
  }));
}

/**
 * Single receipt wrapper functions for ReceiptDetailPage
 */

/**
 * Export a single receipt to PDF
 */
export async function exportReceiptToPDF(receipt: PartnerReceipt): Promise<void> {
  await printReceiptsPDF([receipt]);
}

/**
 * Export a single receipt to JSON
 */
export function exportReceiptToJSON(receipt: PartnerReceipt, filename: string = 'receipt.json'): void {
  downloadJSON([receipt], filename);
}

/**
 * Export receipts to CSV
 */
export function exportReceiptsToCSV(receipts: PartnerReceipt[], filename: string = 'receipts.csv'): void {
  downloadCSV(receipts, filename);
}

/**
 * Share a single receipt via email.
 * Accepts PartnerReceipt to prevent leakage of internal fields.
 */
export function shareReceiptViaEmail(receipt: PartnerReceipt): void {
  // H3 fix (review r2w): strip cashbackAmount and dynamic window.location.href — same
  // rationale as shareReceipt above (spec §11.3 / Clash 10.6).
  // LOW fix: currency-neutral amount (no hardcoded €) — consistent with the
  // CSV/PDF export paths and the BGN/EUR transition (spec §7.3 / Clash 12.1).
  const text = `Receipt from ${receipt.merchantName || 'Unknown Merchant'}: ${receipt.totalAmount?.toFixed(2) || '0.00'}`;
  const subject = `Receipt from ${receipt.merchantName || 'Unknown Merchant'}`;
  const body = `${text}\n\nReceipt ID: ${receipt.id}\nDate: ${receipt.receiptDate || receipt.createdAt}`;

  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Partner-named aliases — preferred names for ReceiptDetailPage imports.
 * These are semantically identical to the generic wrappers above but the
 * explicit "Partner" prefix makes the spec compliance intent clear at the
 * call site (F4 fix, r2t).
 */
export const exportPartnerReceiptToPDF = exportReceiptToPDF;
export const exportPartnerReceiptToJSON = exportReceiptToJSON;
export const sharePartnerReceiptViaEmail = shareReceiptViaEmail;

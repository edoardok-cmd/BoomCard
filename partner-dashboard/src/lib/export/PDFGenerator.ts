/**
 * PDF Generation Utility
 * Generate PDF reports for invoices, transactions, and analytics
 * Uses jsPDF library for client-side PDF generation
 */

export interface PDFOptions {
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  fontSize?: number;
  margin?: number;
  filename?: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  status: string;

  // Company info
  companyName: string;
  companyAddress: string;
  companyVAT?: string;
  companyEmail?: string;
  companyPhone?: string;

  // Customer info
  customerName: string;
  customerAddress: string;
  customerVAT?: string;
  customerEmail?: string;

  // Items
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;

  // Totals
  subtotal: number;
  tax: number;
  total: number;
  currency: string;

  // Payment
  paymentMethod?: string;
  notes?: string;
}

export interface TransactionReportData {
  title: string;
  dateRange: {
    from: Date;
    to: Date;
  };
  transactions: Array<{
    id: string;
    date: Date;
    venueName: string;
    amount: number;
    discount: number;
    finalAmount: number;
    status: string;
  }>;
  summary: {
    totalTransactions: number;
    totalAmount: number;
    totalDiscount: number;
    totalFinalAmount: number;
  };
}

export interface AnalyticsReportData {
  title: string;
  period: string;
  metrics: Array<{
    label: string;
    value: string | number;
    change?: number;
  }>;
  charts?: Array<{
    title: string;
    type: 'bar' | 'line' | 'pie';
    data: Array<{ label: string; value: number }>;
  }>;
}

/**
 * Simple PDF generation without external dependencies
 * For production, consider using jsPDF or pdfmake
 */
export class PDFGenerator {
  /**
   * Generate invoice PDF
   */
  static generateInvoice(data: InvoiceData, options: PDFOptions = {}): void {
    const {
      orientation = 'portrait',
      format = 'a4',
      filename = `invoice_${data.invoiceNumber}.pdf`,
    } = options;

    // Create HTML content for invoice
    const html = this.createInvoiceHTML(data);

    // Convert to PDF and download
    this.htmlToPDF(html, filename, orientation, format);
  }

  /**
   * Generate transaction report PDF
   */
  static generateTransactionReport(
    data: TransactionReportData,
    options: PDFOptions = {}
  ): void {
    const {
      filename = `transactions_${Date.now()}.pdf`,
      orientation = 'landscape',
    } = options;

    const html = this.createTransactionReportHTML(data);
    this.htmlToPDF(html, filename, orientation);
  }

  /**
   * Generate analytics report PDF
   */
  static generateAnalyticsReport(
    data: AnalyticsReportData,
    options: PDFOptions = {}
  ): void {
    const {
      filename = `analytics_${Date.now()}.pdf`,
      orientation = 'portrait',
    } = options;

    const html = this.createAnalyticsReportHTML(data);
    this.htmlToPDF(html, filename, orientation);
  }

  /**
   * Create HTML for invoice
   */
  private static createInvoiceHTML(data: InvoiceData): string {
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const formatCurrency = (amount: number, currency: string) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
      }).format(amount);
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      color: #111827;
      padding: 40px;
      line-height: 1.6;
    }

    .invoice-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #000;
    }

    .company-info h1 {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .company-info p {
      font-size: 14px;
      color: #6b7280;
      margin: 4px 0;
    }

    .invoice-details {
      text-align: right;
    }

    .invoice-number {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .invoice-date {
      font-size: 14px;
      color: #6b7280;
      margin: 4px 0;
    }

    .status {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-top: 8px;
      background: ${data.status === 'PAID' ? '#10b981' : '#f59e0b'};
      color: white;
    }

    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }

    .party {
      flex: 1;
    }

    .party h3 {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
      margin-bottom: 12px;
    }

    .party p {
      font-size: 14px;
      margin: 4px 0;
    }

    .party .name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 40px;
    }

    thead {
      background: #f3f4f6;
    }

    th {
      padding: 12px 16px;
      text-align: left;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }

    th.right {
      text-align: right;
    }

    td {
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }

    td.right {
      text-align: right;
    }

    .totals {
      margin-left: auto;
      width: 300px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }

    .totals-row.subtotal {
      color: #6b7280;
    }

    .totals-row.tax {
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 12px;
      margin-bottom: 12px;
    }

    .totals-row.total {
      font-size: 20px;
      font-weight: 700;
      padding-top: 12px;
      border-top: 2px solid #000;
    }

    .notes {
      margin-top: 40px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .notes h4 {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .notes p {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
    }

    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div class="company-info">
      <h1>${data.companyName}</h1>
      <p>${data.companyAddress}</p>
      ${data.companyVAT ? `<p>VAT: ${data.companyVAT}</p>` : ''}
      ${data.companyEmail ? `<p>Email: ${data.companyEmail}</p>` : ''}
      ${data.companyPhone ? `<p>Phone: ${data.companyPhone}</p>` : ''}
    </div>
    <div class="invoice-details">
      <div class="invoice-number">Invoice #${data.invoiceNumber}</div>
      <div class="invoice-date">Issue Date: ${formatDate(data.issueDate)}</div>
      <div class="invoice-date">Due Date: ${formatDate(data.dueDate)}</div>
      <div class="status">${data.status}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Bill To</h3>
      <div class="name">${data.customerName}</div>
      <p>${data.customerAddress}</p>
      ${data.customerVAT ? `<p>VAT: ${data.customerVAT}</p>` : ''}
      ${data.customerEmail ? `<p>${data.customerEmail}</p>` : ''}
    </div>
    <div class="party">
      ${data.paymentMethod ? `
        <h3>Payment Method</h3>
        <p>${data.paymentMethod}</p>
      ` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Quantity</th>
        <th class="right">Unit Price</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map(item => `
        <tr>
          <td>${item.description}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">${formatCurrency(item.unitPrice, data.currency)}</td>
          <td class="right">${formatCurrency(item.total, data.currency)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row subtotal">
      <span>Subtotal</span>
      <span>${formatCurrency(data.subtotal, data.currency)}</span>
    </div>
    <div class="totals-row tax">
      <span>Tax</span>
      <span>${formatCurrency(data.tax, data.currency)}</span>
    </div>
    <div class="totals-row total">
      <span>Total</span>
      <span>${formatCurrency(data.total, data.currency)}</span>
    </div>
  </div>

  ${data.notes ? `
    <div class="notes">
      <h4>Notes</h4>
      <p>${data.notes}</p>
    </div>
  ` : ''}

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>Generated on ${formatDate(new Date())}</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Create HTML for transaction report
   */
  private static createTransactionReportHTML(data: TransactionReportData): string {
    const formatDate = (date: Date) => date.toLocaleDateString('en-US');
    const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 30px;
      color: #111827;
    }

    .report-header {
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #000;
    }

    .report-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .report-period {
      font-size: 14px;
      color: #6b7280;
    }

    .summary {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .summary-item {
      flex: 1;
    }

    .summary-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 24px;
      font-weight: 700;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    thead {
      background: #f3f4f6;
    }

    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }

    th.right { text-align: right; }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
    }

    td.right { text-align: right; }

    .status {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status.completed { background: #d1fae5; color: #065f46; }
    .status.pending { background: #fef3c7; color: #92400e; }
    .status.failed { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">${data.title}</div>
    <div class="report-period">
      ${formatDate(data.dateRange.from)} - ${formatDate(data.dateRange.to)}
    </div>
  </div>

  <div class="summary">
    <div class="summary-item">
      <div class="summary-label">Total Transactions</div>
      <div class="summary-value">${data.summary.totalTransactions}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Total Amount</div>
      <div class="summary-value">${formatCurrency(data.summary.totalAmount)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Total Discount</div>
      <div class="summary-value">${formatCurrency(data.summary.totalDiscount)}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Final Amount</div>
      <div class="summary-value">${formatCurrency(data.summary.totalFinalAmount)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Date</th>
        <th>Venue</th>
        <th class="right">Amount</th>
        <th class="right">Discount</th>
        <th class="right">Final Amount</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${data.transactions.map(tx => `
        <tr>
          <td>${tx.id}</td>
          <td>${formatDate(tx.date)}</td>
          <td>${tx.venueName}</td>
          <td class="right">${formatCurrency(tx.amount)}</td>
          <td class="right">${tx.discount}%</td>
          <td class="right">${formatCurrency(tx.finalAmount)}</td>
          <td><span class="status ${tx.status.toLowerCase()}">${tx.status}</span></td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
    `;
  }

  /**
   * Create HTML for analytics report
   */
  private static createAnalyticsReportHTML(data: AnalyticsReportData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      padding: 40px;
      color: #111827;
    }

    .report-header {
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #000;
    }

    .report-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .report-period {
      font-size: 16px;
      color: #6b7280;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 40px;
    }

    .metric-card {
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }

    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .metric-value {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .metric-change {
      font-size: 14px;
      font-weight: 600;
    }

    .metric-change.positive { color: #10b981; }
    .metric-change.negative { color: #ef4444; }

    .chart-section {
      margin-bottom: 40px;
    }

    .chart-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .chart-placeholder {
      padding: 60px;
      background: #f9fafb;
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      text-align: center;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-title">${data.title}</div>
    <div class="report-period">${data.period}</div>
  </div>

  <div class="metrics-grid">
    ${data.metrics.map(metric => `
      <div class="metric-card">
        <div class="metric-label">${metric.label}</div>
        <div class="metric-value">${metric.value}</div>
        ${metric.change !== undefined ? `
          <div class="metric-change ${metric.change >= 0 ? 'positive' : 'negative'}">
            ${metric.change >= 0 ? '↑' : '↓'} ${Math.abs(metric.change)}%
          </div>
        ` : ''}
      </div>
    `).join('')}
  </div>

  ${data.charts?.map(chart => `
    <div class="chart-section">
      <div class="chart-title">${chart.title}</div>
      <div class="chart-placeholder">
        Chart: ${chart.type} - ${chart.data.length} data points
        <br><small>For production, integrate with Chart.js or similar library</small>
      </div>
    </div>
  `).join('') || ''}
</body>
</html>
    `;
  }

  /**
   * Convert HTML to PDF and trigger download
   * This is a simplified version - in production, use jsPDF or pdfmake
   */
  private static htmlToPDF(
    html: string,
    filename: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
    format: 'a4' | 'letter' = 'a4'
  ): void {
    // Create a hidden iframe to print
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      throw new Error('Failed to create iframe for PDF generation');
    }

    // Write HTML to iframe
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for content to load, then print
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch (error) {
          console.error('Print failed:', error);
        } finally {
          // Clean up after print dialog closes
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }
      }, 100);
    };
  }

  /**
   * Generate multiple invoices as a single PDF
   */
  static generateBatchInvoices(invoices: InvoiceData[], options: PDFOptions = {}): void {
    const {
      filename = `invoices_batch_${Date.now()}.pdf`,
    } = options;

    const htmlPages = invoices.map(invoice => this.createInvoiceHTML(invoice));
    const combinedHTML = htmlPages.join('<div style="page-break-after: always;"></div>');

    this.htmlToPDF(combinedHTML, filename, options.orientation, options.format);
  }

  /**
   * Export invoice data as downloadable PDF blob
   * For server-side usage or when you need the blob instead of download
   */
  static async generateInvoiceBlob(data: InvoiceData): Promise<Blob> {
    const html = this.createInvoiceHTML(data);

    // For production, use a proper HTML to PDF library
    // This is a placeholder implementation
    const blob = new Blob([html], { type: 'text/html' });

    console.warn('generateInvoiceBlob: Using HTML blob. Integrate jsPDF or similar for true PDF generation.');

    return blob;
  }
}

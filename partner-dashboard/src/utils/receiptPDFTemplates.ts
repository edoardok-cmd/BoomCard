/**
 * Receipt PDF Templates
 * Multiple professional receipt template designs
 */

import type { PartnerReceipt, ReceiptItem } from '../types/receipt.types';
import { format } from 'date-fns';

export type TemplateType = 'classic' | 'modern' | 'minimal' | 'professional' | 'colorful';

function parseReceiptItems(items: PartnerReceipt['items']): ReceiptItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export interface TemplateRenderOptions {
  includeLogo?: boolean;
  logoUrl?: string;
  companyName?: string;
  showItemizedList?: boolean;
  showOCRText?: boolean;
}

export interface TemplateOptions extends TemplateRenderOptions {
  template: TemplateType;
}

/**
 * Generate receipt HTML with selected template.
 * Accepts PartnerReceipt — the full admin Receipt type must not be used here
 * (spec §11.3, Clash 5.1, Clash 10.6).
 */
export function generateReceiptHTML(receipt: PartnerReceipt, options: TemplateOptions): string {
  const {
    template = 'classic',
    includeLogo = false,
    logoUrl = '',
    companyName = 'BOOM Card',
    showItemizedList = true,
    // HIGH fix: showOCRText defaults to false — ocrRawText is internal-only
    // (spec §11.3). A caller may opt in explicitly only if they have an
    // admin-only context where this is permitted.
    showOCRText = false,
  } = options;

  switch (template) {
    case 'modern':
      return generateModernTemplate(receipt, { includeLogo, logoUrl, companyName, showItemizedList, showOCRText });
    case 'minimal':
      return generateMinimalTemplate(receipt, { includeLogo, logoUrl, companyName, showItemizedList, showOCRText });
    case 'professional':
      return generateProfessionalTemplate(receipt, { includeLogo, logoUrl, companyName, showItemizedList, showOCRText });
    case 'colorful':
      return generateColorfulTemplate(receipt, { includeLogo, logoUrl, companyName, showItemizedList, showOCRText });
    case 'classic':
    default:
      return generateClassicTemplate(receipt, { includeLogo, logoUrl, companyName, showItemizedList, showOCRText });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Escape a value for safe interpolation into an HTML template. */
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
 * Classic Template - Traditional receipt design
 */
function generateClassicTemplate(receipt: PartnerReceipt, options: TemplateRenderOptions): string {
  const items = parseReceiptItems(receipt.items);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${escapeHtml(receipt.merchantName || 'Unknown')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      background: #f5f5f5;
      padding: 20px;
    }
    .receipt {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border: 2px solid #000;
      box-shadow: 0 0 20px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 20px;
      margin-bottom: 20px;
    }
    ${options.includeLogo && options.logoUrl ? `
    .logo { max-width: 150px; margin-bottom: 15px; }
    ` : ''}
    h1 {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .company { font-size: 14px; color: #666; }
    .info { margin: 20px 0; }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .label { font-weight: bold; }
    .items {
      margin: 30px 0;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 20px 0;
    }
    .item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    .total {
      margin-top: 20px;
      font-size: 20px;
      font-weight: bold;
      text-align: right;
      padding: 15px;
      background: #000;
      color: #fff;
    }
    .footer {
      margin-top: 30px;
      text-align: center;
      font-size: 12px;
      color: #666;
      border-top: 2px dashed #000;
      padding-top: 20px;
    }
    .status {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      margin-top: 10px;
    }
    .status.VALIDATED,
    .status.CASHBACK_APPLIED { background: #10b981; color: white; }
    .status.PENDING { background: #f59e0b; color: white; }
    .status.REJECTED { background: #ef4444; color: white; }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; border: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${options.includeLogo && options.logoUrl ? `<img src="${escapeHtml(options.logoUrl)}" alt="Logo" class="logo" />` : ''}
      <h1>${escapeHtml(receipt.merchantName || 'Receipt')}</h1>
      <div class="company">${escapeHtml(options.companyName)}</div>
      <div class="status ${escapeHtml(receipt.status)}">${escapeHtml(receipt.status)}</div>
    </div>

    <div class="info">
      <div class="info-row">
        <span class="label">Receipt ID:</span>
        <span>${escapeHtml(receipt.id)}</span>
      </div>
      <div class="info-row">
        <span class="label">Date:</span>
        <span>${escapeHtml(format(new Date(receipt.receiptDate || receipt.createdAt), 'PPP'))}</span>
      </div>
    </div>

    ${options.showItemizedList && items.length > 0 ? `
    <div class="items">
      <h3 style="margin-bottom: 15px;">Items</h3>
      ${items.map((item: ReceiptItem) => `
        <div class="item">
          <span>${escapeHtml(item.quantity || 1)}x ${escapeHtml(item.name || 'Item')}</span>
          <span>${escapeHtml((item.price || 0).toFixed(2))}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="total">
      TOTAL: ${escapeHtml((receipt.totalAmount || 0).toFixed(2))}
    </div>

    ${receipt.cashbackAmount > 0 ? `
    <div class="info-row" style="margin-top: 15px; font-weight: bold; color: #10b981;">
      <span>Cashback Earned:</span>
      <span>${escapeHtml(receipt.cashbackAmount.toFixed(2))}</span>
    </div>
    ` : ''}

    <div class="footer">
      <p>Thank you for using ${escapeHtml(options.companyName)}!</p>
      <p>This is a digital receipt</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Modern Template - Gradient and contemporary design
 */
function generateModernTemplate(receipt: PartnerReceipt, options: TemplateRenderOptions): string {
  const items = parseReceiptItems(receipt.items);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${receipt.merchantName || 'Unknown'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 20px;
    }
    .receipt {
      max-width: 650px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    ${options.includeLogo && options.logoUrl ? `
    .logo {
      max-width: 120px;
      margin-bottom: 20px;
      filter: brightness(0) invert(1);
    }
    ` : ''}
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .company { font-size: 16px; opacity: 0.9; }
    .status {
      display: inline-block;
      padding: 8px 20px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 15px;
      background: rgba(255,255,255,0.2);
      backdrop-filter: blur(10px);
    }
    .content { padding: 40px; }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    .info-card {
      padding: 20px;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      border-radius: 12px;
    }
    .info-label {
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .info-value {
      font-size: 18px;
      font-weight: 700;
      color: #1a202c;
    }
    .items {
      margin: 30px 0;
      background: #f9fafb;
      border-radius: 12px;
      padding: 25px;
    }
    .items h3 {
      color: #667eea;
      margin-bottom: 20px;
      font-size: 20px;
    }
    .item {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .item:last-child { border-bottom: none; }
    .total {
      margin-top: 30px;
      padding: 25px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 24px;
      font-weight: 700;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #666;
      font-size: 14px;
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${options.includeLogo && options.logoUrl ? `<img src="${escapeHtml(options.logoUrl)}" alt="Logo" class="logo" />` : ''}
      <h1>${escapeHtml(receipt.merchantName || 'Receipt')}</h1>
      <div class="company">${escapeHtml(options.companyName)}</div>
      <div class="status">${escapeHtml(receipt.status)}</div>
    </div>

    <div class="content">
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Receipt ID</div>
          <div class="info-value">#${escapeHtml(receipt.id.slice(0, 8))}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Date</div>
          <div class="info-value">${escapeHtml(format(new Date(receipt.receiptDate || receipt.createdAt), 'MMM dd, yyyy'))}</div>
        </div>
        <div class="info-card">
          <div class="info-label">Cashback</div>
          <div class="info-value">${escapeHtml(receipt.cashbackAmount.toFixed(2))}</div>
        </div>
      </div>

      ${options.showItemizedList && items.length > 0 ? `
      <div class="items">
        <h3>Items Purchased</h3>
        ${items.map((item: ReceiptItem) => `
          <div class="item">
            <span><strong>${escapeHtml(item.quantity || 1)}x</strong> ${escapeHtml(item.name || 'Item')}</span>
            <span style="font-weight: 600;">${escapeHtml((item.price || 0).toFixed(2))}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="total">
        <span>TOTAL</span>
        <span>${escapeHtml((receipt.totalAmount || 0).toFixed(2))}</span>
      </div>
    </div>

    <div class="footer">
      <p><strong>Thank you for using ${escapeHtml(options.companyName)}!</strong></p>
      <p style="margin-top: 10px; font-size: 12px;">Digital Receipt &bull; Eco-Friendly</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Minimal Template - Ultra-clean minimalist design
 */
function generateMinimalTemplate(receipt: PartnerReceipt, options: TemplateRenderOptions): string {
  const items = parseReceiptItems(receipt.items);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${receipt.merchantName || 'Unknown'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #fff;
      padding: 60px 20px;
      color: #000;
    }
    .receipt {
      max-width: 500px;
      margin: 0 auto;
    }
    h1 {
      font-size: 40px;
      font-weight: 300;
      letter-spacing: -1px;
      margin-bottom: 10px;
    }
    .company {
      font-size: 14px;
      color: #999;
      margin-bottom: 40px;
    }
    .divider {
      height: 1px;
      background: #000;
      margin: 30px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      font-size: 14px;
    }
    .label { color: #666; }
    .value { font-weight: 500; }
    .items { margin: 40px 0; }
    .item {
      display: flex;
      justify-content: space-between;
      padding: 15px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .item:last-child { border-bottom: none; }
    .total {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #000;
      display: flex;
      justify-content: space-between;
      font-size: 28px;
      font-weight: 300;
    }
    .footer {
      margin-top: 60px;
      text-align: center;
      font-size: 12px;
      color: #999;
    }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <h1>${escapeHtml(receipt.merchantName || 'Receipt')}</h1>
    <div class="company">${escapeHtml(options.companyName)}</div>

    <div class="divider"></div>

    <div class="info-row">
      <span class="label">Receipt</span>
      <span class="value">#${escapeHtml(receipt.id.slice(0, 8))}</span>
    </div>
    <div class="info-row">
      <span class="label">Date</span>
      <span class="value">${escapeHtml(format(new Date(receipt.receiptDate || receipt.createdAt), 'MMMM d, yyyy'))}</span>
    </div>
    <div class="info-row">
      <span class="label">Status</span>
      <span class="value">${escapeHtml(receipt.status)}</span>
    </div>

    <div class="divider"></div>

    ${options.showItemizedList && items.length > 0 ? `
    <div class="items">
      ${items.map((item: ReceiptItem) => `
        <div class="item">
          <span>${escapeHtml(item.name || 'Item')}</span>
          <span style="font-weight: 500;">${escapeHtml((item.price || 0).toFixed(2))}</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="total">
      <span>Total</span>
      <span>${escapeHtml((receipt.totalAmount || 0).toFixed(2))}</span>
    </div>

    ${receipt.cashbackAmount > 0 ? `
    <div class="info-row" style="margin-top: 20px; color: #10b981;">
      <span>Cashback</span>
      <span style="font-weight: 600;">+${escapeHtml(receipt.cashbackAmount.toFixed(2))}</span>
    </div>
    ` : ''}

    <div class="footer">
      <p>${escapeHtml(options.companyName)} &bull; Digital Receipt</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Professional Template - Corporate business style
 */
function generateProfessionalTemplate(receipt: PartnerReceipt, options: TemplateRenderOptions): string {
  const items = parseReceiptItems(receipt.items);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${receipt.merchantName || 'Unknown'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #f8f9fa;
      padding: 40px 20px;
    }
    .receipt {
      max-width: 700px;
      margin: 0 auto;
      background: white;
      border: 1px solid #dee2e6;
    }
    .header {
      background: #212529;
      color: white;
      padding: 40px;
      border-bottom: 4px solid #007bff;
    }
    ${options.includeLogo && options.logoUrl ? `
    .logo { max-width: 140px; margin-bottom: 20px; }
    ` : ''}
    h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .company {
      font-size: 14px;
      opacity: 0.8;
      font-style: italic;
    }
    .content { padding: 40px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    th {
      background: #f8f9fa;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #dee2e6;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    td {
      padding: 15px 12px;
      border-bottom: 1px solid #dee2e6;
    }
    .items-table td:last-child,
    .items-table th:last-child {
      text-align: right;
    }
    .total-section {
      margin-top: 30px;
      border-top: 2px solid #212529;
      padding-top: 20px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 16px;
    }
    .total-row.grand {
      font-size: 24px;
      font-weight: 700;
      color: #007bff;
      padding-top: 15px;
      border-top: 1px solid #dee2e6;
    }
    .footer {
      background: #f8f9fa;
      padding: 30px 40px;
      border-top: 1px solid #dee2e6;
      text-align: center;
      font-size: 13px;
      color: #6c757d;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-VALIDATED,
    .status-CASHBACK_APPLIED {
      background: #d1e7dd;
      color: #0f5132;
    }
    .status-PENDING {
      background: #fff3cd;
      color: #664d03;
    }
    .status-REJECTED {
      background: #f8d7da;
      color: #842029;
    }
    @media print {
      body { background: white; padding: 0; }
      .receipt { border: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      ${options.includeLogo && options.logoUrl ? `<img src="${escapeHtml(options.logoUrl)}" alt="Logo" class="logo" />` : ''}
      <h1>${escapeHtml(receipt.merchantName || 'Tax Receipt')}</h1>
      <div class="company">${escapeHtml(options.companyName)}</div>
    </div>

    <div class="content">
      <table>
        <tr>
          <th style="width: 40%;">Receipt Number</th>
          <th style="width: 40%;">Date Issued</th>
          <th style="width: 20%;">Status</th>
        </tr>
        <tr>
          <td><strong>#${escapeHtml(receipt.id.slice(0, 8).toUpperCase())}</strong></td>
          <td>${escapeHtml(format(new Date(receipt.receiptDate || receipt.createdAt), 'PPP'))}</td>
          <td><span class="status-badge status-${escapeHtml(receipt.status)}">${escapeHtml(receipt.status)}</span></td>
        </tr>
      </table>

      ${options.showItemizedList && items.length > 0 ? `
      <h3 style="margin: 40px 0 20px 0; font-size: 18px;">Itemized List</h3>
      <table class="items-table">
        <tr>
          <th>Description</th>
          <th style="width: 80px;">Qty</th>
          <th style="width: 120px;">Unit Price</th>
          <th style="width: 120px;">Amount</th>
        </tr>
        ${items.map((item: ReceiptItem) => `
          <tr>
            <td>${escapeHtml(item.name || 'Item')}</td>
            <td>${escapeHtml(item.quantity || 1)}</td>
            <td style="text-align: right;">${escapeHtml((item.price || 0).toFixed(2))}</td>
            <td style="text-align: right;"><strong>${escapeHtml(((item.quantity || 1) * (item.price || 0)).toFixed(2))}</strong></td>
          </tr>
        `).join('')}
      </table>
      ` : ''}

      <div class="total-section">
        <div class="total-row">
          <span>Subtotal</span>
          <span>${escapeHtml((receipt.totalAmount || 0).toFixed(2))}</span>
        </div>
        ${receipt.cashbackAmount > 0 ? `
        <div class="total-row" style="color: #28a745;">
          <span>Cashback Earned</span>
          <span>+${escapeHtml(receipt.cashbackAmount.toFixed(2))}</span>
        </div>
        ` : ''}
        <div class="total-row grand">
          <span>GRAND TOTAL</span>
          <span>${escapeHtml((receipt.totalAmount || 0).toFixed(2))}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p><strong>${escapeHtml(options.companyName)}</strong></p>
      <p style="margin-top: 10px;">This is a digitally generated receipt and is valid without signature.</p>
      <p style="margin-top: 5px;">For inquiries, please contact office@boomcard.bg</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Colorful Template - Vibrant and fun design
 */
function generateColorfulTemplate(receipt: PartnerReceipt, options: TemplateRenderOptions): string {
  const items = parseReceiptItems(receipt.items);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt - ${receipt.merchantName || 'Unknown'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Comic Sans MS', 'Trebuchet MS', sans-serif;
      background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #f7b731, #5f27cd);
      background-size: 400% 400%;
      animation: gradient 15s ease infinite;
      padding: 40px 20px;
    }
    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .receipt {
      max-width: 600px;
      margin: 0 auto;
      background: white;
      border-radius: 30px;
      overflow: hidden;
      box-shadow: 0 30px 80px rgba(0,0,0,0.3);
      transform: rotate(-1deg);
    }
    .header {
      background: linear-gradient(135deg, #ff6b6b 0%, #f7b731 100%);
      color: white;
      padding: 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '✨';
      position: absolute;
      font-size: 100px;
      opacity: 0.1;
      top: -20px;
      right: -20px;
      animation: spin 20s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    h1 {
      font-size: 36px;
      font-weight: 900;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .emoji { font-size: 50px; margin-bottom: 15px; }
    .content { padding: 35px; }
    .info-card {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      color: white;
      padding: 20px;
      border-radius: 15px;
      margin-bottom: 20px;
      text-align: center;
    }
    .info-label {
      font-size: 12px;
      opacity: 0.9;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 24px;
      font-weight: 900;
    }
    .items {
      margin: 25px 0;
      background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
      border-radius: 15px;
      padding: 20px;
    }
    .item {
      background: white;
      padding: 12px;
      margin: 8px 0;
      border-radius: 10px;
      display: flex;
      justify-content: space-between;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .total {
      background: linear-gradient(135deg, #a29bfe 0%, #6c5ce7 100%);
      color: white;
      padding: 25px;
      border-radius: 15px;
      text-align: center;
      font-size: 32px;
      font-weight: 900;
      box-shadow: 0 10px 25px rgba(108, 92, 231, 0.3);
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: #666;
    }
    .confetti {
      font-size: 30px;
      margin: 0 5px;
    }
    @media print {
      body { background: white; animation: none; padding: 0; }
      .receipt { box-shadow: none; transform: none; }
      .header::before { display: none; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="emoji">&#127881;</div>
      <h1>${escapeHtml(receipt.merchantName || 'Awesome Receipt!')}</h1>
      <div style="font-size: 14px; opacity: 0.9;">${escapeHtml(options.companyName)}</div>
    </div>

    <div class="content">
      <div class="info-card">
        <div class="info-label">Receipt #</div>
        <div class="info-value">${escapeHtml(receipt.id.slice(0, 8).toUpperCase())}</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div style="background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%); color: white; padding: 15px; border-radius: 12px; text-align: center;">
          <div style="font-size: 11px; opacity: 0.9;">Date</div>
          <div style="font-size: 14px; font-weight: 700; margin-top: 5px;">
            ${escapeHtml(format(new Date(receipt.receiptDate || receipt.createdAt), 'MMM dd'))}
          </div>
        </div>
        <div style="background: linear-gradient(135deg, #55efc4 0%, #00b894 100%); color: white; padding: 15px; border-radius: 12px; text-align: center;">
          <div style="font-size: 11px; opacity: 0.9;">Cashback</div>
          <div style="font-size: 14px; font-weight: 700; margin-top: 5px;">
            ${escapeHtml(receipt.cashbackAmount.toFixed(2))}
          </div>
        </div>
      </div>

      ${options.showItemizedList && items.length > 0 ? `
      <div class="items">
        <div style="text-align: center; font-weight: 900; margin-bottom: 15px; color: #d63031;">
          Items
        </div>
        ${items.map((item: ReceiptItem) => `
          <div class="item">
            <span><strong>${escapeHtml(item.quantity || 1)}x</strong> ${escapeHtml(item.name || 'Item')}</span>
            <span style="font-weight: 900; color: #d63031;">${escapeHtml((item.price || 0).toFixed(2))}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="total">
        ${escapeHtml((receipt.totalAmount || 0).toFixed(2))}
      </div>
    </div>

    <div class="footer">
      <p><strong>Thanks for shopping!</strong></p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Export receipt with template.
 * Accepts PartnerReceipt to prevent leakage of internal fields (spec §11.3).
 */
export async function exportReceiptWithTemplate(
  receipt: PartnerReceipt,
  options: TemplateOptions
): Promise<void> {
  const html = generateReceiptHTML(receipt, options);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  }
}

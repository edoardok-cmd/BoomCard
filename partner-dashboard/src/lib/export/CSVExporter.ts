/**
 * CSV Export Utility
 * Export data to CSV format with proper encoding
 */

export interface CSVOptions {
  delimiter?: string;
  lineBreak?: string;
  includeHeaders?: boolean;
  filename?: string;
  encoding?: 'utf-8' | 'utf-8-bom';
}

export class CSVExporter {
  /**
   * Convert array of objects to CSV string
   */
  static toCSV<T extends Record<string, any>>(
    data: T[],
    options: CSVOptions = {}
  ): string {
    const {
      delimiter = ',',
      lineBreak = '\n',
      includeHeaders = true,
    } = options;

    if (data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const rows: string[] = [];

    // Add headers
    if (includeHeaders) {
      rows.push(this.formatRow(headers, delimiter));
    }

    // Add data rows
    data.forEach(item => {
      const values = headers.map(header => this.escapeValue(item[header]));
      rows.push(this.formatRow(values, delimiter));
    });

    return rows.join(lineBreak);
  }

  /**
   * Format a single row
   */
  private static formatRow(values: any[], delimiter: string): string {
    return values.join(delimiter);
  }

  /**
   * Escape CSV value
   */
  private static escapeValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    let stringValue = String(value);

    // Check if value needs quoting
    const needsQuoting =
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n') ||
      stringValue.includes('\r');

    if (needsQuoting) {
      // Escape double quotes by doubling them
      stringValue = stringValue.replace(/"/g, '""');
      // Wrap in double quotes
      stringValue = `"${stringValue}"`;
    }

    return stringValue;
  }

  /**
   * Download CSV file
   */
  static download<T extends Record<string, any>>(
    data: T[],
    options: CSVOptions = {}
  ): void {
    const {
      filename = `export_${Date.now()}.csv`,
      encoding = 'utf-8-bom',
    } = options;

    const csv = this.toCSV(data, options);

    // Add BOM for Excel compatibility if needed
    const content = encoding === 'utf-8-bom'
      ? '\uFEFF' + csv
      : csv;

    // Create blob
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });

    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup
    URL.revokeObjectURL(url);
  }

  /**
   * Export transactions to CSV
   */
  static exportTransactions(transactions: any[]): void {
    const formatted = transactions.map(tx => ({
      'Transaction ID': tx.id,
      'Date': new Date(tx.createdAt).toLocaleString(),
      'Venue': tx.venueName,
      'Amount': tx.amount.toFixed(2),
      'Discount %': tx.discount,
      'Discount Amount': tx.discountAmount.toFixed(2),
      'Final Amount': tx.finalAmount.toFixed(2),
      'Currency': tx.currency,
      'Status': tx.status,
      'Card Number': tx.cardNumber,
    }));

    this.download(formatted, {
      filename: `transactions_${Date.now()}.csv`,
    });
  }

  /**
   * Export venues to CSV
   */
  static exportVenues(venues: any[]): void {
    const formatted = venues.map(venue => ({
      'ID': venue.id,
      'Name': venue.name,
      'Category': venue.category,
      'Address': venue.address,
      'City': venue.city,
      'Phone': venue.phone || '',
      'Email': venue.email || '',
      'Rating': venue.rating?.toFixed(1) || 'N/A',
      'Review Count': venue.reviewCount || 0,
      'Status': venue.isActive ? 'Active' : 'Inactive',
    }));

    this.download(formatted, {
      filename: `venues_${Date.now()}.csv`,
    });
  }

  /**
   * Export offers to CSV
   */
  static exportOffers(offers: any[]): void {
    const formatted = offers.map(offer => ({
      'ID': offer.id,
      'Title': offer.title,
      'Venue': offer.venueName,
      'Discount %': offer.discount,
      'Valid From': new Date(offer.validFrom).toLocaleDateString(),
      'Valid Until': new Date(offer.validUntil).toLocaleDateString(),
      'Max Redemptions': offer.maxRedemptions || 'Unlimited',
      'Current Redemptions': offer.currentRedemptions,
      'Status': offer.isActive ? 'Active' : 'Inactive',
    }));

    this.download(formatted, {
      filename: `offers_${Date.now()}.csv`,
    });
  }

  /**
   * Export analytics data to CSV
   */
  static exportAnalytics(analytics: any[]): void {
    const formatted = analytics.map(item => ({
      'Date': new Date(item.date).toLocaleDateString(),
      'Total Sales': item.totalSales?.toFixed(2) || '0.00',
      'Total Discount': item.totalDiscount?.toFixed(2) || '0.00',
      'Transactions': item.transactionCount || 0,
      'Average Discount %': item.avgDiscount?.toFixed(1) || '0.0',
      'Unique Customers': item.uniqueCustomers || 0,
    }));

    this.download(formatted, {
      filename: `analytics_${Date.now()}.csv`,
    });
  }

  /**
   * Export users to CSV
   */
  static exportUsers(users: any[]): void {
    const formatted = users.map(user => ({
      'ID': user.id,
      'Email': user.email,
      'First Name': user.firstName,
      'Last Name': user.lastName,
      'Phone': user.phone || '',
      'Role': user.role,
      'Email Verified': user.emailVerified ? 'Yes' : 'No',
      'Status': user.isActive ? 'Active' : 'Inactive',
      'Registered': new Date(user.createdAt).toLocaleDateString(),
    }));

    this.download(formatted, {
      filename: `users_${Date.now()}.csv`,
    });
  }
}

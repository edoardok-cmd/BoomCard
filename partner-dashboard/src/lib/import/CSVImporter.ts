/**
 * CSV Import Utility
 * Import and validate CSV data with robust error handling
 */

export interface ImportOptions {
  delimiter?: string;
  hasHeaders?: boolean;
  skipRows?: number;
  maxRows?: number;
  encoding?: 'utf-8' | 'utf-8-bom';
}

export interface ValidationRule<T = any> {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'url';
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any, row: T) => string | null; // Return error message or null
}

export interface ImportResult<T> {
  success: boolean;
  data: T[];
  errors: ImportError[];
  warnings: ImportWarning[];
  rowsParsed: number;
  rowsValid: number;
  rowsInvalid: number;
}

export interface ImportError {
  row: number;
  field?: string;
  message: string;
  value?: any;
}

export interface ImportWarning {
  row: number;
  field?: string;
  message: string;
  value?: any;
}

export interface FieldMapping {
  csvField: string;
  dataField: string;
  transform?: (value: string) => any;
}

export class CSVImporter {
  /**
   * Parse CSV file from File object
   */
  static async parseFile<T = Record<string, any>>(
    file: File,
    options: ImportOptions = {}
  ): Promise<T[]> {
    const text = await this.readFile(file);
    return this.parseCSV<T>(text, options);
  }

  /**
   * Read file as text
   */
  private static readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        let text = e.target?.result as string;

        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) {
          text = text.slice(1);
        }

        resolve(text);
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsText(file, 'utf-8');
    });
  }

  /**
   * Parse CSV text into array of objects
   */
  static parseCSV<T = Record<string, any>>(
    text: string,
    options: ImportOptions = {}
  ): T[] {
    const {
      delimiter = ',',
      hasHeaders = true,
      skipRows = 0,
      maxRows,
    } = options;

    const lines = this.splitLines(text);
    const rows: T[] = [];

    let headers: string[] = [];
    let startRow = skipRows;

    // Extract headers if present
    if (hasHeaders) {
      if (lines.length <= skipRows) {
        throw new Error('No header row found');
      }
      headers = this.parseRow(lines[skipRows], delimiter);
      startRow = skipRows + 1;
    }

    // Parse data rows
    const endRow = maxRows ? Math.min(startRow + maxRows, lines.length) : lines.length;

    for (let i = startRow; i < endRow; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      const values = this.parseRow(line, delimiter);

      if (hasHeaders) {
        // Create object with headers as keys
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row as T);
      } else {
        // Return as array
        rows.push(values as any);
      }
    }

    return rows;
  }

  /**
   * Split text into lines, handling different line endings
   */
  private static splitLines(text: string): string[] {
    // Handle \r\n, \n, and \r
    return text.split(/\r\n|\n|\r/);
  }

  /**
   * Parse a single CSV row, handling quoted values
   */
  private static parseRow(row: string, delimiter: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    values.push(current.trim());

    return values;
  }

  /**
   * Validate imported data against rules
   */
  static validate<T = Record<string, any>>(
    data: T[],
    rules: ValidationRule<T>[]
  ): ImportResult<T> {
    const errors: ImportError[] = [];
    const warnings: ImportWarning[] = [];
    const validData: T[] = [];

    data.forEach((row, index) => {
      const rowNumber = index + 2; // +1 for 0-index, +1 for header row
      let rowValid = true;

      rules.forEach(rule => {
        const value = (row as any)[rule.field];
        const error = this.validateField(value, rule, row);

        if (error) {
          errors.push({
            row: rowNumber,
            field: rule.field,
            message: error,
            value,
          });
          rowValid = false;
        }
      });

      if (rowValid) {
        validData.push(row);
      }
    });

    return {
      success: errors.length === 0,
      data: validData,
      errors,
      warnings,
      rowsParsed: data.length,
      rowsValid: validData.length,
      rowsInvalid: data.length - validData.length,
    };
  }

  /**
   * Validate a single field against a rule
   */
  private static validateField<T>(
    value: any,
    rule: ValidationRule<T>,
    row: T
  ): string | null {
    // Required check
    if (rule.required && (value === null || value === undefined || value === '')) {
      return `${rule.field} is required`;
    }

    // Skip other validations if empty and not required
    if (!rule.required && (value === null || value === undefined || value === '')) {
      return null;
    }

    // Type validation
    if (rule.type) {
      const typeError = this.validateType(value, rule.type, rule.field);
      if (typeError) return typeError;
    }

    // Min/Max for numbers
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return `${rule.field} must be at least ${rule.min}`;
      }
      if (rule.max !== undefined && value > rule.max) {
        return `${rule.field} must be at most ${rule.max}`;
      }
    }

    // Min/Max length for strings
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.min !== undefined && value.length < rule.min) {
        return `${rule.field} must be at least ${rule.min} characters`;
      }
      if (rule.max !== undefined && value.length > rule.max) {
        return `${rule.field} must be at most ${rule.max} characters`;
      }
    }

    // Pattern validation
    if (rule.pattern && typeof value === 'string') {
      if (!rule.pattern.test(value)) {
        return `${rule.field} format is invalid`;
      }
    }

    // Enum validation
    if (rule.enum && !rule.enum.includes(value)) {
      return `${rule.field} must be one of: ${rule.enum.join(', ')}`;
    }

    // Custom validation
    if (rule.custom) {
      const customError = rule.custom(value, row);
      if (customError) return customError;
    }

    return null;
  }

  /**
   * Validate value type
   */
  private static validateType(
    value: any,
    type: ValidationRule['type'],
    field: string
  ): string | null {
    switch (type) {
      case 'string':
        if (typeof value !== 'string') {
          return `${field} must be a string`;
        }
        break;

      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          return `${field} must be a number`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean' &&
            !['true', 'false', '1', '0', 'yes', 'no'].includes(String(value).toLowerCase())) {
          return `${field} must be a boolean`;
        }
        break;

      case 'date':
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return `${field} must be a valid date`;
        }
        break;

      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(String(value))) {
          return `${field} must be a valid email`;
        }
        break;

      case 'url':
        try {
          new URL(String(value));
        } catch {
          return `${field} must be a valid URL`;
        }
        break;
    }

    return null;
  }

  /**
   * Transform data using field mappings
   */
  static transform<T = Record<string, any>>(
    data: Record<string, any>[],
    mappings: FieldMapping[]
  ): T[] {
    return data.map(row => {
      const transformed: any = {};

      mappings.forEach(mapping => {
        const value = row[mapping.csvField];

        if (value !== undefined) {
          transformed[mapping.dataField] = mapping.transform
            ? mapping.transform(value)
            : value;
        }
      });

      return transformed as T;
    });
  }

  /**
   * Import venues from CSV
   */
  static async importVenues(file: File): Promise<ImportResult<any>> {
    const data = await this.parseFile(file);

    const rules: ValidationRule[] = [
      { field: 'name', required: true, type: 'string', min: 2, max: 200 },
      { field: 'category', required: true, type: 'string', enum: ['RESTAURANT', 'HOTEL', 'SPA', 'WINERY', 'ENTERTAINMENT', 'SPORTS'] },
      { field: 'address', required: true, type: 'string', min: 5 },
      { field: 'city', required: true, type: 'string' },
      { field: 'phone', required: false, type: 'string', pattern: /^\+?[\d\s\-()]+$/ },
      { field: 'email', required: false, type: 'email' },
      { field: 'lat', required: false, type: 'number', min: -90, max: 90 },
      { field: 'lng', required: false, type: 'number', min: -180, max: 180 },
    ];

    return this.validate(data, rules);
  }

  /**
   * Import offers from CSV
   */
  static async importOffers(file: File): Promise<ImportResult<any>> {
    const data = await this.parseFile(file);

    const rules: ValidationRule[] = [
      { field: 'title', required: true, type: 'string', min: 5, max: 200 },
      { field: 'venueId', required: true, type: 'string' },
      { field: 'discount', required: true, type: 'number', min: 0, max: 100 },
      { field: 'validFrom', required: true, type: 'date' },
      { field: 'validUntil', required: true, type: 'date' },
      { field: 'maxRedemptions', required: false, type: 'number', min: 0 },
      {
        field: 'validUntil',
        custom: (value, row: any) => {
          const from = new Date(row.validFrom);
          const until = new Date(value);
          if (until <= from) {
            return 'validUntil must be after validFrom';
          }
          return null;
        }
      },
    ];

    return this.validate(data, rules);
  }

  /**
   * Import users from CSV
   */
  static async importUsers(file: File): Promise<ImportResult<any>> {
    const data = await this.parseFile(file);

    const rules: ValidationRule[] = [
      { field: 'email', required: true, type: 'email' },
      { field: 'firstName', required: true, type: 'string', min: 2, max: 100 },
      { field: 'lastName', required: true, type: 'string', min: 2, max: 100 },
      { field: 'phone', required: false, type: 'string', pattern: /^\+?[\d\s\-()]+$/ },
      { field: 'role', required: false, type: 'string', enum: ['USER', 'PARTNER', 'ADMIN'] },
    ];

    const result = this.validate(data, rules);

    // Transform data to match expected format
    if (result.success) {
      result.data = this.transform(result.data, [
        { csvField: 'email', dataField: 'email' },
        { csvField: 'firstName', dataField: 'firstName' },
        { csvField: 'lastName', dataField: 'lastName' },
        { csvField: 'phone', dataField: 'phone' },
        {
          csvField: 'role',
          dataField: 'role',
          transform: (value) => value || 'USER'
        },
      ]);
    }

    return result;
  }

  /**
   * Import transactions from CSV
   */
  static async importTransactions(file: File): Promise<ImportResult<any>> {
    const data = await this.parseFile(file);

    const rules: ValidationRule[] = [
      { field: 'venueId', required: true, type: 'string' },
      { field: 'cardNumber', required: true, type: 'string', pattern: /^\d{16}$/ },
      { field: 'amount', required: true, type: 'number', min: 0 },
      { field: 'discount', required: true, type: 'number', min: 0, max: 100 },
      { field: 'currency', required: false, type: 'string', enum: ['BGN', 'EUR', 'USD'] },
      { field: 'status', required: false, type: 'string', enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] },
      { field: 'date', required: true, type: 'date' },
    ];

    const result = this.validate(data, rules);

    // Calculate derived fields
    if (result.success) {
      result.data = result.data.map(tx => {
        const amount = Number(tx.amount);
        const discount = Number(tx.discount);
        const discountAmount = (amount * discount) / 100;
        const finalAmount = amount - discountAmount;

        return {
          ...tx,
          amount,
          discount,
          discountAmount,
          finalAmount,
          currency: tx.currency || 'BGN',
          status: tx.status || 'COMPLETED',
          createdAt: new Date(tx.date),
        };
      });
    }

    return result;
  }

  /**
   * Generate CSV template for a specific import type
   */
  static generateTemplate(type: 'venues' | 'offers' | 'users' | 'transactions'): string {
    const templates = {
      venues: [
        'name,category,address,city,phone,email,lat,lng',
        'Sample Restaurant,RESTAURANT,"123 Main St",Sofia,+359888123456,contact@restaurant.com,42.6977,23.3219',
      ].join('\n'),

      offers: [
        'title,venueId,discount,validFrom,validUntil,maxRedemptions',
        'Summer Special,venue_123,20,2024-06-01,2024-08-31,100',
      ].join('\n'),

      users: [
        'email,firstName,lastName,phone,role',
        'user@example.com,John,Doe,+359888123456,USER',
      ].join('\n'),

      transactions: [
        'venueId,cardNumber,amount,discount,currency,status,date',
        'venue_123,1234567890123456,100.00,20,BGN,COMPLETED,2024-01-15',
      ].join('\n'),
    };

    return templates[type];
  }

  /**
   * Download CSV template
   */
  static downloadTemplate(type: 'venues' | 'offers' | 'users' | 'transactions'): void {
    const csv = this.generateTemplate(type);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `${type}_import_template.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  /**
   * Format import result for display
   */
  static formatResult(result: ImportResult<any>): string {
    const lines = [
      `Import ${result.success ? 'Successful' : 'Failed'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Rows Parsed: ${result.rowsParsed}`,
      `Valid Rows: ${result.rowsValid}`,
      `Invalid Rows: ${result.rowsInvalid}`,
    ];

    if (result.errors.length > 0) {
      lines.push(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach(error => {
        lines.push(`  Row ${error.row}${error.field ? ` - ${error.field}` : ''}: ${error.message}`);
      });

      if (result.errors.length > 10) {
        lines.push(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      result.warnings.slice(0, 5).forEach(warning => {
        lines.push(`  Row ${warning.row}${warning.field ? ` - ${warning.field}` : ''}: ${warning.message}`);
      });
    }

    return lines.join('\n');
  }
}

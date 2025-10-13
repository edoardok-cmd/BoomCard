/**
 * R-Keeper POS Integration
 * Integration with R-Keeper (UCS) restaurant management system
 * Popular in Russia, Eastern Europe, and Middle East
 */

import { POSAdapter, POSTransaction, POSOrder, POSMenuItem, POSConfig } from './POSAdapter';

export interface RKeeperConfig extends POSConfig {
  username: string;
  password: string;
  stationId: string;
  cashierId: string;
  sessionId?: string;
}

interface RKeeperSession {
  sessionId: string;
  expiresAt: Date;
}

interface RKeeperCheck {
  checkId: string;
  tableId?: string;
  guestCount?: number;
  openTime: string;
  closeTime?: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  items: Array<{
    dishId: string;
    dishName: string;
    quantity: number;
    price: number;
    sum: number;
  }>;
  totalSum: number;
  discountSum: number;
  resultSum: number;
}

interface RKeeperDish {
  dishId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  isActive: boolean;
}

export class RKeeperPOS extends POSAdapter {
  private config: RKeeperConfig;
  private session: RKeeperSession | null = null;

  constructor(config: RKeeperConfig) {
    super();
    this.config = config;
  }

  /**
   * Authenticate and create session
   */
  private async authenticate(): Promise<string> {
    // Check if we have a valid session
    if (this.session && this.session.expiresAt > new Date()) {
      return this.session.sessionId;
    }

    // R-Keeper uses XML-RPC protocol
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<RK7Query>
  <RK7CMD CMD="CreateSession">
    <Station>${this.config.stationId}</Station>
    <Cashier>${this.config.cashierId}</Cashier>
    <Password>${this.config.password}</Password>
  </RK7CMD>
</RK7Query>`;

    const response = await fetch(`${this.config.apiUrl}/rk7api/v0/xmlinterface.xml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
      },
      body: xmlPayload,
    });

    if (!response.ok) {
      throw new Error(`R-Keeper authentication failed: ${response.statusText}`);
    }

    const xmlResponse = await response.text();
    const sessionId = this.parseXMLValue(xmlResponse, 'SessionId');

    if (!sessionId) {
      throw new Error('Failed to extract session ID from R-Keeper response');
    }

    // Session is valid for 30 minutes
    this.session = {
      sessionId,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };

    return sessionId;
  }

  /**
   * Parse value from XML response
   */
  private parseXMLValue(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<]+)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1] : null;
  }

  /**
   * Make XML-RPC request to R-Keeper
   */
  private async makeRequest(command: string, params: Record<string, any> = {}): Promise<string> {
    const sessionId = await this.authenticate();

    let paramsXML = '';
    for (const [key, value] of Object.entries(params)) {
      paramsXML += `<${key}>${value}</${key}>`;
    }

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<RK7Query>
  <RK7CMD CMD="${command}">
    <SessionId>${sessionId}</SessionId>
    ${paramsXML}
  </RK7CMD>
</RK7Query>`;

    const response = await fetch(`${this.config.apiUrl}/rk7api/v0/xmlinterface.xml`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
      },
      body: xmlPayload,
    });

    if (!response.ok) {
      throw new Error(`R-Keeper API request failed: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Create a new transaction (check)
   */
  async createTransaction(
    amount: number,
    discountPercent: number,
    metadata?: Record<string, any>
  ): Promise<POSTransaction> {
    const discountAmount = (amount * discountPercent) / 100;
    const finalAmount = amount - discountAmount;

    const params: Record<string, any> = {
      TableId: metadata?.tableId || '0',
      GuestCount: metadata?.guestCount || 1,
    };

    const xmlResponse = await this.makeRequest('CreateCheck', params);
    const checkId = this.parseXMLValue(xmlResponse, 'CheckId');

    if (!checkId) {
      throw new Error('Failed to create R-Keeper check');
    }

    // Apply discount if needed
    if (discountPercent > 0) {
      await this.makeRequest('ApplyDiscount', {
        CheckId: checkId,
        DiscountPercent: discountPercent,
      });
    }

    return {
      id: checkId,
      amount,
      discount: discountPercent,
      discountAmount,
      finalAmount,
      status: 'PENDING',
      timestamp: new Date(),
      metadata: {
        rKeeperCheckId: checkId,
        tableId: params.TableId,
      },
    };
  }

  /**
   * Get transaction (check) by ID
   */
  async getTransaction(transactionId: string): Promise<POSTransaction> {
    const xmlResponse = await this.makeRequest('GetCheck', {
      CheckId: transactionId,
    });

    const check = this.parseCheckFromXML(xmlResponse);

    return {
      id: check.checkId,
      amount: check.totalSum,
      discount: 0,
      discountAmount: check.discountSum,
      finalAmount: check.resultSum,
      status: this.mapRKeeperStatus(check.status),
      timestamp: new Date(check.openTime),
      metadata: {
        rKeeperCheckId: check.checkId,
        tableId: check.tableId,
        guestCount: check.guestCount,
      },
    };
  }

  /**
   * Parse check data from XML
   */
  private parseCheckFromXML(xml: string): RKeeperCheck {
    return {
      checkId: this.parseXMLValue(xml, 'CheckId') || '',
      tableId: this.parseXMLValue(xml, 'TableId') || undefined,
      guestCount: parseInt(this.parseXMLValue(xml, 'GuestCount') || '0'),
      openTime: this.parseXMLValue(xml, 'OpenTime') || new Date().toISOString(),
      closeTime: this.parseXMLValue(xml, 'CloseTime') || undefined,
      status: (this.parseXMLValue(xml, 'Status') as RKeeperCheck['status']) || 'OPEN',
      items: [], // Would need more complex XML parsing for items
      totalSum: parseFloat(this.parseXMLValue(xml, 'TotalSum') || '0'),
      discountSum: parseFloat(this.parseXMLValue(xml, 'DiscountSum') || '0'),
      resultSum: parseFloat(this.parseXMLValue(xml, 'ResultSum') || '0'),
    };
  }

  /**
   * Map R-Keeper check status to POS transaction status
   */
  private mapRKeeperStatus(rKeeperStatus: RKeeperCheck['status']): POSTransaction['status'] {
    switch (rKeeperStatus) {
      case 'OPEN':
        return 'PENDING';
      case 'CLOSED':
        return 'COMPLETED';
      case 'CANCELLED':
        return 'FAILED';
      default:
        return 'PENDING';
    }
  }

  /**
   * Cancel a transaction (check)
   */
  async cancelTransaction(transactionId: string): Promise<void> {
    await this.makeRequest('CancelCheck', {
      CheckId: transactionId,
    });
  }

  /**
   * Get all transactions for a period
   */
  async getTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    const xmlResponse = await this.makeRequest('GetChecks', {
      DateFrom: startDate.toISOString(),
      DateTo: endDate.toISOString(),
    });

    // Parse multiple checks from XML
    // This is a simplified version - actual implementation would need robust XML parsing
    const checksRegex = /<Check>(.*?)<\/Check>/gs;
    const checks: POSTransaction[] = [];

    let match;
    while ((match = checksRegex.exec(xmlResponse)) !== null) {
      const checkXML = match[1];
      const check = this.parseCheckFromXML(`<Check>${checkXML}</Check>`);

      checks.push({
        id: check.checkId,
        amount: check.totalSum,
        discount: 0,
        discountAmount: check.discountSum,
        finalAmount: check.resultSum,
        status: this.mapRKeeperStatus(check.status),
        timestamp: new Date(check.openTime),
        metadata: {
          rKeeperCheckId: check.checkId,
        },
      });
    }

    return checks;
  }

  /**
   * Sync menu items (dishes) from R-Keeper
   */
  async syncMenu(): Promise<POSMenuItem[]> {
    const xmlResponse = await this.makeRequest('GetMenu');

    // Parse dishes from XML
    const dishesRegex = /<Dish>(.*?)<\/Dish>/gs;
    const dishes: POSMenuItem[] = [];

    let match;
    while ((match = dishesRegex.exec(xmlResponse)) !== null) {
      const dishXML = match[1];
      const dishId = this.parseXMLValue(dishXML, 'DishId') || '';
      const name = this.parseXMLValue(dishXML, 'Name') || '';
      const price = parseFloat(this.parseXMLValue(dishXML, 'Price') || '0');
      const category = this.parseXMLValue(dishXML, 'CategoryName') || '';
      const isActive = this.parseXMLValue(dishXML, 'IsActive') === 'true';

      if (isActive) {
        dishes.push({
          id: dishId,
          name,
          price,
          category,
          available: isActive,
        });
      }
    }

    return dishes;
  }

  /**
   * Create or update an order (check with items)
   */
  async createOrder(order: Omit<POSOrder, 'id' | 'createdAt'>): Promise<POSOrder> {
    // Create check
    const params: Record<string, any> = {
      TableId: order.customerInfo?.tableNumber || '0',
      GuestCount: order.customerInfo?.guestCount || 1,
    };

    const xmlResponse = await this.makeRequest('CreateCheck', params);
    const checkId = this.parseXMLValue(xmlResponse, 'CheckId');

    if (!checkId) {
      throw new Error('Failed to create R-Keeper check');
    }

    // Add items to check
    for (const item of order.items) {
      await this.makeRequest('AddDish', {
        CheckId: checkId,
        DishId: item.menuItemId,
        Quantity: item.quantity,
      });
    }

    return {
      id: checkId,
      status: 'pending',
      items: order.items,
      total: order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      discount: order.discount || 0,
      finalTotal: order.finalTotal,
      customerInfo: order.customerInfo,
      createdAt: new Date(),
    };
  }

  /**
   * Get order (check) by ID
   */
  async getOrder(orderId: string): Promise<POSOrder> {
    const xmlResponse = await this.makeRequest('GetCheck', {
      CheckId: orderId,
    });

    const check = this.parseCheckFromXML(xmlResponse);

    return {
      id: check.checkId,
      status: check.status === 'CLOSED' ? 'completed' : 'pending',
      items: check.items.map(item => ({
        menuItemId: item.dishId,
        name: item.dishName,
        quantity: item.quantity,
        price: item.price,
      })),
      total: check.totalSum,
      discount: check.discountSum,
      finalTotal: check.resultSum,
      createdAt: new Date(check.openTime),
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: POSOrder['status']
  ): Promise<POSOrder> {
    if (status === 'completed') {
      await this.makeRequest('CloseCheck', {
        CheckId: orderId,
      });
    } else if (status === 'cancelled') {
      await this.makeRequest('CancelCheck', {
        CheckId: orderId,
      });
    }

    return this.getOrder(orderId);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean {
    // R-Keeper uses custom signature scheme
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', this.config.webhookSecret || '');
    hmac.update(payload);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Process webhook event
   */
  async processWebhook(payload: any): Promise<void> {
    const { eventType, checkId } = payload;

    switch (eventType) {
      case 'CheckCreated':
        console.log('R-Keeper check created:', checkId);
        break;

      case 'CheckClosed':
        console.log('R-Keeper check closed:', checkId);
        break;

      case 'CheckCancelled':
        console.log('R-Keeper check cancelled:', checkId);
        break;

      default:
        console.log('Unknown R-Keeper webhook event:', eventType);
    }
  }

  /**
   * Get POS system name
   */
  getName(): string {
    return 'R-Keeper';
  }

  /**
   * Test connection to R-Keeper
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      return true;
    } catch (error) {
      console.error('R-Keeper connection test failed:', error);
      return false;
    }
  }

  /**
   * Close session
   */
  async closeSession(): Promise<void> {
    if (this.session) {
      await this.makeRequest('CloseSession');
      this.session = null;
    }
  }

  /**
   * Get station info
   */
  async getStationInfo(): Promise<any> {
    const xmlResponse = await this.makeRequest('GetStationInfo', {
      StationId: this.config.stationId,
    });

    return {
      stationId: this.parseXMLValue(xmlResponse, 'StationId'),
      stationName: this.parseXMLValue(xmlResponse, 'StationName'),
      isActive: this.parseXMLValue(xmlResponse, 'IsActive') === 'true',
    };
  }
}

export default RKeeperPOS;

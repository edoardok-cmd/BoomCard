/**
 * POS Manager
 * Manages multiple POS integrations for a partner
 */

import { POSAdapter, POSCredentials, POSTransaction } from './POSAdapter';
import { BarsyPOS } from './BarsyPOS';
import { PosterPOS } from './PosterPOS';
import { iikoPOS } from './iikoPOS';
import { RKeeperPOS } from './RKeeperPOS';
import { myPOS } from './myPOS';
import { SumUpPOS } from './SumUpPOS';

export type POSProvider = 'barsy' | 'poster' | 'iiko' | 'rkeeper' | 'epay' | 'borica' | 'mypos' | 'sumup' | 'stripe-terminal' | 'booking-api';

export interface POSIntegrationConfig {
  provider: POSProvider;
  enabled: boolean;
  credentials: POSCredentials;
  webhookUrl?: string;
  syncInterval?: number; // minutes
  lastSync?: Date;
}

export class POSManager {
  private adapters: Map<POSProvider, POSAdapter>;
  private partnerId: string;

  constructor(partnerId: string) {
    this.partnerId = partnerId;
    this.adapters = new Map();
  }

  /**
   * Initialize a POS integration
   */
  async initializeIntegration(config: POSIntegrationConfig): Promise<boolean> {
    try {
      const adapter = this.createAdapter(config.provider, config.credentials);

      // Test connection
      const status = await adapter.testConnection();
      if (!status.connected) {
        throw new Error(status.error || 'Connection failed');
      }

      this.adapters.set(config.provider, adapter);
      return true;
    } catch (error) {
      console.error(`Failed to initialize ${config.provider}:`, error);
      return false;
    }
  }

  /**
   * Create appropriate adapter for provider
   */
  private createAdapter(provider: POSProvider, credentials: POSCredentials): POSAdapter {
    switch (provider) {
      case 'barsy':
        return new BarsyPOS(credentials, this.partnerId);
      case 'poster':
        return new PosterPOS(credentials, this.partnerId);
      case 'iiko':
        return new iikoPOS(credentials as any);
      case 'rkeeper':
        return new RKeeperPOS(credentials as any);
      case 'mypos':
        return new myPOS(credentials as any);
      case 'sumup':
        return new SumUpPOS(credentials as any);
      default:
        throw new Error(`Unsupported POS provider: ${provider}`);
    }
  }

  /**
   * Get adapter for a specific provider
   */
  getAdapter(provider: POSProvider): POSAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Fetch transactions from all connected POS systems
   */
  async fetchAllTransactions(startDate: Date, endDate: Date): Promise<POSTransaction[]> {
    const allTransactions: POSTransaction[] = [];

    for (const [provider, adapter] of this.adapters.entries()) {
      try {
        const transactions = await adapter.fetchTransactions(startDate, endDate);
        allTransactions.push(...transactions);
      } catch (error) {
        console.error(`Error fetching transactions from ${provider}:`, error);
      }
    }

    // Sort by timestamp descending
    return allTransactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Apply discount across all POS systems
   */
  async applyDiscount(
    provider: POSProvider,
    transactionId: string,
    discountPercentage: number,
    boomCardNumber: string
  ): Promise<POSTransaction | null> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No adapter found for provider: ${provider}`);
    }

    try {
      return await adapter.applyDiscount(transactionId, discountPercentage, boomCardNumber);
    } catch (error) {
      console.error(`Error applying discount on ${provider}:`, error);
      return null;
    }
  }

  /**
   * Get transaction from specific provider
   */
  async getTransaction(provider: POSProvider, transactionId: string): Promise<POSTransaction | null> {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      return null;
    }

    return adapter.getTransaction(transactionId);
  }

  /**
   * Disconnect a POS integration
   */
  disconnectIntegration(provider: POSProvider): void {
    this.adapters.delete(provider);
  }

  /**
   * Get all connected providers
   */
  getConnectedProviders(): POSProvider[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Test connection for all integrations
   */
  async testAllConnections(): Promise<Map<POSProvider, boolean>> {
    const results = new Map<POSProvider, boolean>();

    for (const [provider, adapter] of this.adapters.entries()) {
      try {
        const status = await adapter.testConnection();
        results.set(provider, status.connected);
      } catch (error) {
        results.set(provider, false);
      }
    }

    return results;
  }

  /**
   * Sync transactions from all systems
   */
  async syncAll(hours: number = 24): Promise<void> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);

    const transactions = await this.fetchAllTransactions(startDate, endDate);

    // Process and save transactions
    console.log(`Synced ${transactions.length} transactions from all POS systems`);
  }
}

/**
 * Singleton instance for the current partner
 */
let globalPOSManager: POSManager | null = null;

export function initPOSManager(partnerId: string): POSManager {
  if (!globalPOSManager || globalPOSManager['partnerId'] !== partnerId) {
    globalPOSManager = new POSManager(partnerId);
  }
  return globalPOSManager;
}

export function getPOSManager(): POSManager | null {
  return globalPOSManager;
}

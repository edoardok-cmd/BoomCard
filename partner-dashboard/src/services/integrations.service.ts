/**
 * Integrations Service
 *
 * Handles all integration-related API calls including POS systems,
 * payment providers, analytics platforms, and third-party services
 */

import { apiService } from './api.service';

export interface Integration {
  id: string;
  name: string;
  nameEn: string;
  nameBg: string;
  description: string;
  descriptionEn: string;
  descriptionBg: string;
  category: 'POS Systems' | 'Payment Gateways' | 'Analytics' | 'Marketing' | 'Accounting' | 'Other';
  categoryEn: string;
  categoryBg: string;
  provider: string;
  logoUrl?: string;
  websiteUrl?: string;
  documentationUrl?: string;
  status: 'available' | 'coming_soon' | 'beta';
  isConnected: boolean;
  isPopular?: boolean;
  features: string[];
  featuresEn: string[];
  featuresBg: string[];
  pricing?: {
    type: 'free' | 'paid' | 'freemium';
    description: string;
  };
  requiresCredentials: boolean;
  credentialsFields?: {
    name: string;
    label: string;
    labelEn: string;
    labelBg: string;
    type: 'text' | 'password' | 'url' | 'email';
    required: boolean;
    placeholder?: string;
  }[];
}

export interface PartnerIntegration {
  id: string;
  partnerId: string;
  integrationId: string;
  integration: Integration;
  status: 'active' | 'inactive' | 'error' | 'pending';
  credentials?: Record<string, string>;
  settings?: Record<string, any>;
  lastSyncAt?: Date;
  errorMessage?: string;
  connectedAt: Date;
  updatedAt: Date;
}

export interface ConnectIntegrationData {
  integrationId: string;
  credentials?: Record<string, string>;
  settings?: Record<string, any>;
}

export interface UpdateIntegrationData {
  credentials?: Record<string, string>;
  settings?: Record<string, any>;
  status?: 'active' | 'inactive';
}

export interface IntegrationStats {
  totalIntegrations: number;
  activeIntegrations: number;
  categoryCounts: Record<string, number>;
  lastSyncAt?: Date;
}

class IntegrationsService {
  /**
   * Get all available integrations
   */
  async getAvailableIntegrations(category?: string): Promise<Integration[]> {
    const params = category ? { category } : {};
    const response = await apiService.get<Integration[]>('/integrations/available', params);
    return response;
  }

  /**
   * Get integration by ID
   */
  async getIntegration(integrationId: string): Promise<Integration> {
    const response = await apiService.get<Integration>(`/integrations/available/${integrationId}`);
    return response;
  }

  /**
   * Get partner's connected integrations
   */
  async getPartnerIntegrations(): Promise<PartnerIntegration[]> {
    const response = await apiService.get<PartnerIntegration[]>('/integrations/connected');
    return response;
  }

  /**
   * Get specific partner integration
   */
  async getPartnerIntegration(partnerIntegrationId: string): Promise<PartnerIntegration> {
    const response = await apiService.get<PartnerIntegration>(
      `/integrations/connected/${partnerIntegrationId}`
    );
    return response;
  }

  /**
   * Connect a new integration
   */
  async connectIntegration(data: ConnectIntegrationData): Promise<PartnerIntegration> {
    const response = await apiService.post<PartnerIntegration>('/integrations/connect', data);
    return response;
  }

  /**
   * Update integration settings/credentials
   */
  async updateIntegration(
    partnerIntegrationId: string,
    data: UpdateIntegrationData
  ): Promise<PartnerIntegration> {
    const response = await apiService.put<PartnerIntegration>(
      `/integrations/connected/${partnerIntegrationId}`,
      data
    );
    return response;
  }

  /**
   * Disconnect an integration
   */
  async disconnectIntegration(partnerIntegrationId: string): Promise<void> {
    await apiService.delete(`/integrations/connected/${partnerIntegrationId}`);
  }

  /**
   * Test integration connection
   */
  async testIntegration(partnerIntegrationId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.post<{ success: boolean; message: string }>(
      `/integrations/connected/${partnerIntegrationId}/test`
    );
    return response;
  }

  /**
   * Sync integration data
   */
  async syncIntegration(partnerIntegrationId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiService.post<{ success: boolean; message: string }>(
      `/integrations/connected/${partnerIntegrationId}/sync`
    );
    return response;
  }

  /**
   * Get integration statistics
   */
  async getIntegrationStats(): Promise<IntegrationStats> {
    const response = await apiService.get<IntegrationStats>('/integrations/stats');
    return response;
  }

  /**
   * Get integration categories
   */
  async getIntegrationCategories(): Promise<string[]> {
    const response = await apiService.get<string[]>('/integrations/categories');
    return response;
  }

  /**
   * Search integrations
   */
  async searchIntegrations(query: string): Promise<Integration[]> {
    const response = await apiService.get<Integration[]>('/integrations/search', { q: query });
    return response;
  }
}

export default new IntegrationsService();

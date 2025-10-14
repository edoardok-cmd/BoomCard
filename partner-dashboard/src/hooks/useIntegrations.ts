/**
 * Integrations Hooks
 *
 * React Query hooks for managing third-party integrations including
 * POS systems, payment providers, analytics platforms, and more
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import integrationsService, {
  Integration,
  PartnerIntegration,
  ConnectIntegrationData,
  UpdateIntegrationData,
  IntegrationStats,
} from '../services/integrations.service';

/**
 * Get all available integrations
 * @param category - Optional category filter
 */
export function useAvailableIntegrations(category?: string) {
  return useQuery({
    queryKey: ['integrations', 'available', category],
    queryFn: () => integrationsService.getAvailableIntegrations(category),
    staleTime: 10 * 60 * 1000, // 10 minutes - available integrations don't change often
  });
}

/**
 * Get specific integration by ID
 */
export function useIntegration(integrationId: string) {
  return useQuery({
    queryKey: ['integrations', 'available', integrationId],
    queryFn: () => integrationsService.getIntegration(integrationId),
    staleTime: 10 * 60 * 1000,
    enabled: !!integrationId,
  });
}

/**
 * Get partner's connected integrations
 * @param enabled - Whether to enable the query (default: true). Set to false if user is not authenticated.
 */
export function usePartnerIntegrations(enabled = true) {
  return useQuery({
    queryKey: ['integrations', 'connected'],
    queryFn: () => integrationsService.getPartnerIntegrations(),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled,
  });
}

/**
 * Get specific partner integration
 */
export function usePartnerIntegration(partnerIntegrationId: string) {
  return useQuery({
    queryKey: ['integrations', 'connected', partnerIntegrationId],
    queryFn: () => integrationsService.getPartnerIntegration(partnerIntegrationId),
    staleTime: 2 * 60 * 1000,
    enabled: !!partnerIntegrationId,
  });
}

/**
 * Connect a new integration
 */
export function useConnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ConnectIntegrationData) => integrationsService.connectIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'stats'] });
      toast.success('Integration connected successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to connect integration');
    },
  });
}

/**
 * Update integration settings/credentials
 */
export function useUpdateIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIntegrationData }) =>
      integrationsService.updateIntegration(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected', variables.id] });
      toast.success('Integration updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update integration');
    },
  });
}

/**
 * Disconnect an integration
 */
export function useDisconnectIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partnerIntegrationId: string) =>
      integrationsService.disconnectIntegration(partnerIntegrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected'] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'stats'] });
      toast.success('Integration disconnected');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to disconnect integration');
    },
  });
}

/**
 * Test integration connection
 */
export function useTestIntegration() {
  return useMutation({
    mutationFn: (partnerIntegrationId: string) =>
      integrationsService.testIntegration(partnerIntegrationId),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.message || 'Integration test successful');
      } else {
        toast.error(result.message || 'Integration test failed');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to test integration');
    },
  });
}

/**
 * Sync integration data
 */
export function useSyncIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (partnerIntegrationId: string) =>
      integrationsService.syncIntegration(partnerIntegrationId),
    onSuccess: (result, partnerIntegrationId) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected', partnerIntegrationId] });
      queryClient.invalidateQueries({ queryKey: ['integrations', 'connected'] });

      if (result.success) {
        toast.success(result.message || 'Integration synced successfully');
      } else {
        toast.error(result.message || 'Integration sync failed');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to sync integration');
    },
  });
}

/**
 * Get integration statistics
 * @param enabled - Whether to enable the query (default: true). Set to false if user is not authenticated.
 */
export function useIntegrationStats(enabled = true) {
  return useQuery({
    queryKey: ['integrations', 'stats'],
    queryFn: () => integrationsService.getIntegrationStats(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled,
  });
}

/**
 * Get integration categories
 */
export function useIntegrationCategories() {
  return useQuery({
    queryKey: ['integrations', 'categories'],
    queryFn: () => integrationsService.getIntegrationCategories(),
    staleTime: 30 * 60 * 1000, // 30 minutes - categories rarely change
  });
}

/**
 * Search integrations
 */
export function useSearchIntegrations(query: string) {
  return useQuery({
    queryKey: ['integrations', 'search', query],
    queryFn: () => integrationsService.searchIntegrations(query),
    staleTime: 5 * 60 * 1000,
    enabled: query.length > 0,
  });
}

/**
 * Combined hook for integrations page
 * Returns both available and connected integrations with loading states
 * @param category - Optional category filter
 * @param isAuthenticated - Whether the user is authenticated (determines if connected integrations should be fetched)
 */
export function useIntegrationsOverview(category?: string, isAuthenticated = false) {
  const availableQuery = useAvailableIntegrations(category);
  const connectedQuery = usePartnerIntegrations(isAuthenticated);
  const statsQuery = useIntegrationStats(isAuthenticated);

  return {
    available: availableQuery.data || [],
    connected: connectedQuery.data || [],
    stats: statsQuery.data,
    isLoading: availableQuery.isLoading || (isAuthenticated && (connectedQuery.isLoading || statsQuery.isLoading)),
    isError: availableQuery.isError || (isAuthenticated && (connectedQuery.isError || statsQuery.isError)),
  };
}

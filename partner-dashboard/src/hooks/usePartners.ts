import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partnersService, Partner, PartnerFilters } from '../services/partners.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch partners with filters
 */
export function usePartners(filters?: PartnerFilters) {
  return useQuery({
    queryKey: ['partners', filters],
    queryFn: () => partnersService.getPartners(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single partner by ID
 */
export function usePartner(id: string | undefined) {
  return useQuery({
    queryKey: ['partner', id],
    queryFn: () => partnersService.getPartnerById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to fetch partners by category
 */
export function usePartnersByCategory(category: string, filters?: PartnerFilters) {
  return useQuery({
    queryKey: ['partners', 'category', category, filters],
    queryFn: () => partnersService.getPartnersByCategory(category, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch partners by city
 */
export function usePartnersByCity(city: string, filters?: PartnerFilters) {
  return useQuery({
    queryKey: ['partners', 'city', city, filters],
    queryFn: () => partnersService.getPartnersByCity(city, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch partners by status
 */
export function usePartnersByStatus(status: string, filters?: PartnerFilters) {
  return useQuery({
    queryKey: ['partners', 'status', status, filters],
    queryFn: () => partnersService.getPartnersByStatus(status, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch new partners
 */
export function useNewPartners(limit: number = 10) {
  return useQuery({
    queryKey: ['partners', 'new', limit],
    queryFn: () => partnersService.getNewPartners(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch VIP partners
 */
export function useVIPPartners(limit: number = 10) {
  return useQuery({
    queryKey: ['partners', 'vip', limit],
    queryFn: () => partnersService.getVIPPartners(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch exclusive partners
 */
export function useExclusivePartners(limit: number = 10) {
  return useQuery({
    queryKey: ['partners', 'exclusive', limit],
    queryFn: () => partnersService.getExclusivePartners(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to search partners
 */
export function useSearchPartners(query: string, filters?: PartnerFilters) {
  return useQuery({
    queryKey: ['partners', 'search', query, filters],
    queryFn: () => partnersService.searchPartners(query, filters),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to get current partner profile (authenticated)
 */
export function useCurrentPartner() {
  return useQuery({
    queryKey: ['partner', 'me'],
    queryFn: () => partnersService.getCurrentPartner(),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to get partner stats
 */
export function usePartnerStats(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['partner', partnerId, 'stats'],
    queryFn: () => partnersService.getPartnerStats(partnerId!),
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to update partner
 */
export function useUpdatePartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Partner> }) =>
      partnersService.updatePartner(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partner', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['partner', 'me'] });
      toast.success('Partner profile updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update partner');
    },
  });
}

/**
 * Hook to upload partner logo
 */
export function useUploadPartnerLogo(partnerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => partnersService.uploadLogo(partnerId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partner', 'me'] });
      toast.success('Logo uploaded successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload logo');
    },
  });
}

/**
 * Hook to upload partner cover image
 */
export function useUploadPartnerCover(partnerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => partnersService.uploadCoverImage(partnerId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      queryClient.invalidateQueries({ queryKey: ['partner', 'me'] });
      toast.success('Cover image uploaded successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload cover image');
    },
  });
}

/**
 * Hook to request status upgrade
 */
export function useRequestStatusUpgrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ partnerId, targetStatus, message }: { partnerId: string; targetStatus: 'vip' | 'exclusive'; message?: string }) =>
      partnersService.requestStatusUpgrade(partnerId, targetStatus, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner'] });
      toast.success('Upgrade request submitted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to submit upgrade request');
    },
  });
}

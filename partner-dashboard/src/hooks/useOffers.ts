import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { offersService, OfferFilters, CreateOfferData } from '../services/offers.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch offers with filters
 */
export function useOffers(filters?: OfferFilters) {
  return useQuery({
    queryKey: ['offers', filters],
    queryFn: () => offersService.getOffers(filters),
    // When filters include partnerId, do not fire the query until partnerId
    // is resolved. This prevents a request with an empty/undefined partnerId
    // that would either return all partners' offers (information disclosure)
    // or a backend 400/403 error. If no partnerId filter is required the
    // query is always enabled (spec §11.3 guard).
    // S2 fix (DashboardPage): also respect the caller-supplied `enabled`
    // override so non-partner users never trigger this query even when the
    // partnerId key is absent from filters.
    enabled: (filters?.enabled !== false) &&
      (filters?.partnerId !== undefined ? !!filters.partnerId : true),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * Hook to fetch a single offer by ID
 */
export function useOffer(id: string | undefined) {
  return useQuery({
    queryKey: ['offer', id],
    queryFn: () => offersService.getOfferById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to fetch offers by category
 */
export function useOffersByCategory(category: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['offers', 'category', category, filters],
    queryFn: () => offersService.getOffersByCategory(category, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch offers by city
 */
export function useOffersByCity(city: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['offers', 'city', city, filters],
    queryFn: () => offersService.getOffersByCity(city, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch top offers
 */
export function useTopOffers(limit: number = 10) {
  return useQuery({
    queryKey: ['offers', 'top', limit],
    queryFn: () => offersService.getTopOffers(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch featured offers
 */
export function useFeaturedOffers(limit: number = 10) {
  return useQuery({
    queryKey: ['offers', 'featured', limit],
    queryFn: () => offersService.getFeaturedOffers(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch nearby offers
 */
export function useNearbyOffers(lat?: number, lng?: number, radius: number = 5000) {
  return useQuery({
    queryKey: ['offers', 'nearby', lat, lng, radius],
    queryFn: () => offersService.getNearbyOffers(lat!, lng!, radius),
    enabled: !!lat && !!lng,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Hook to search offers
 */
export function useSearchOffers(query: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['offers', 'search', query, filters],
    queryFn: () => offersService.searchOffers(query, filters),
    enabled: query.length >= 2, // Only search if query is at least 2 characters
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Hook to create an offer
 */
export function useCreateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: offersService.createOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offer created successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create offer');
    },
  });
}

/**
 * Hook to update an offer
 */
export function useUpdateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CreateOfferData> }) =>
      offersService.updateOffer(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', variables.id] });
      toast.success('Offer updated successfully!');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update offer');
    },
  });
}

/**
 * Hook to delete an offer
 */
export function useDeleteOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: offersService.deleteOffer,
    onSuccess: () => {
      // LOW-3 fix (r2w): toast removed from hook — the component handler calls
      // toast.success(t.deleted) after mutateAsync resolves, so firing it here
      // too produces a double toast on every delete.
      queryClient.invalidateQueries({ queryKey: ['offers'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete offer');
    },
  });
}

/**
 * Hook to redeem an offer
 */
export function useRedeemOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, code }: { id: string; code?: string }) =>
      offersService.redeemOffer(id, code),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      if (data.success) {
        toast.success(data.message || 'Offer redeemed successfully!');
      } else {
        toast.error(data.message || 'Failed to redeem offer');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to redeem offer');
    },
  });
}

// ============================================================
// Entity-returning hooks (unified model)
// ============================================================

/**
 * Hook to fetch entities (offers as Entity[]) with filters
 */
export function useEntities(filters?: OfferFilters) {
  return useQuery({
    queryKey: ['entities', filters],
    queryFn: () => offersService.getEntities(filters),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 1000,
  });
}

/**
 * Hook to fetch entities by category
 */
export function useEntitiesByCategory(category: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['entities', 'category', category, filters],
    queryFn: () => offersService.getEntitiesByCategory(category, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch entities by city
 */
export function useEntitiesByCity(city: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['entities', 'city', city, filters],
    queryFn: () => offersService.getEntitiesByCity(city, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch top entities
 */
export function useTopEntities(limit: number = 10) {
  return useQuery({
    queryKey: ['entities', 'top', limit],
    queryFn: () => offersService.getTopEntities(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch featured entities
 */
export function useFeaturedEntities(limit: number = 10) {
  return useQuery({
    queryKey: ['entities', 'featured', limit],
    queryFn: () => offersService.getFeaturedEntities(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to search entities
 */
export function useSearchEntities(query: string, filters?: OfferFilters) {
  return useQuery({
    queryKey: ['entities', 'search', query, filters],
    queryFn: () => offersService.searchEntities(query, filters),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to toggle offer status
 */
export function useToggleOfferStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      offersService.toggleOfferStatus(id, isActive),
    onSuccess: (_, variables) => {
      // LOW-3 fix (r2w): toast removed from hook — the component handler calls
      // toast.success(offer.isActive ? t.deactivated : t.activated) after
      // mutateAsync resolves, so firing it here too produces a double toast.
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', variables.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update offer status');
    },
  });
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { offersService, OfferDetails, OfferFilters } from '../services/offers.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch offers with filters
 */
export function useOffers(filters?: OfferFilters) {
  return useQuery({
    queryKey: ['offers', filters],
    queryFn: () => offersService.getOffers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    onError: (error: any) => {
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
    mutationFn: ({ id, updates }: { id: string; updates: any }) =>
      offersService.updateOffer(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', variables.id] });
      toast.success('Offer updated successfully!');
    },
    onError: (error: any) => {
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
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      toast.success('Offer deleted successfully!');
    },
    onError: (error: any) => {
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
    onError: (error: any) => {
      toast.error(error.message || 'Failed to redeem offer');
    },
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
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', variables.id] });
      toast.success(`Offer ${variables.isActive ? 'activated' : 'deactivated'} successfully!`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update offer status');
    },
  });
}

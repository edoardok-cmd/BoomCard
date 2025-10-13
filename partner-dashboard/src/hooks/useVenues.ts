import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { venuesService, Venue, VenueFilters } from '../services/venues.service';
import toast from 'react-hot-toast';

/**
 * Hook to fetch venues with filters
 */
export function useVenues(filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', filters],
    queryFn: () => venuesService.getVenues(filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch a single venue by ID
 */
export function useVenue(id: string | undefined) {
  return useQuery({
    queryKey: ['venue', id],
    queryFn: () => venuesService.getVenueById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to fetch venues by category
 */
export function useVenuesByCategory(category: string, filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', 'category', category, filters],
    queryFn: () => venuesService.getVenuesByCategory(category, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch venues by city
 */
export function useVenuesByCity(city: string, filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', 'city', city, filters],
    queryFn: () => venuesService.getVenuesByCity(city, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch venues by price range
 */
export function useVenuesByPriceRange(priceRange: string, filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', 'price', priceRange, filters],
    queryFn: () => venuesService.getVenuesByPriceRange(priceRange, filters),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch nearby venues
 */
export function useNearbyVenues(lat?: number, lng?: number, radius: number = 5000) {
  return useQuery({
    queryKey: ['venues', 'nearby', lat, lng, radius],
    queryFn: () => venuesService.getNearbyVenues(lat!, lng!, radius),
    enabled: !!lat && !!lng,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch featured venues
 */
export function useFeaturedVenues(limit: number = 10) {
  return useQuery({
    queryKey: ['venues', 'featured', limit],
    queryFn: () => venuesService.getFeaturedVenues(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch top-rated venues
 */
export function useTopRatedVenues(limit: number = 10) {
  return useQuery({
    queryKey: ['venues', 'top-rated', limit],
    queryFn: () => venuesService.getTopRatedVenues(limit),
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to search venues
 */
export function useSearchVenues(query: string, filters?: VenueFilters) {
  return useQuery({
    queryKey: ['venues', 'search', query, filters],
    queryFn: () => venuesService.searchVenues(query, filters),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
  });
}

/**
 * Hook to create a venue
 */
export function useCreateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: venuesService.createVenue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Venue created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create venue');
    },
  });
}

/**
 * Hook to update a venue
 */
export function useUpdateVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Venue> }) =>
      venuesService.updateVenue(id, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      queryClient.invalidateQueries({ queryKey: ['venue', variables.id] });
      toast.success('Venue updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update venue');
    },
  });
}

/**
 * Hook to delete a venue
 */
export function useDeleteVenue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: venuesService.deleteVenue,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Venue deleted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete venue');
    },
  });
}

/**
 * Hook to upload venue images
 */
export function useUploadVenueImages(venueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: File[]) => venuesService.uploadImages(venueId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Images uploaded successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to upload images');
    },
  });
}

/**
 * Hook to delete venue image
 */
export function useDeleteVenueImage(venueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (imageUrl: string) => venuesService.deleteImage(venueId, imageUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      toast.success('Image deleted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete image');
    },
  });
}

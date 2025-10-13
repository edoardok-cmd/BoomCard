import { apiService } from './api.service';
import { Offer } from '../components/common/OfferCard/OfferCard';

// Types
export interface Venue {
  id: string;
  name: string;
  nameEn?: string;
  nameBg?: string;
  description: string;
  descriptionEn?: string;
  descriptionBg?: string;
  category: string;
  categoryEn?: string;
  categoryBg?: string;
  location: string;
  city: string;
  address: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  imageUrl: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  priceRange?: 'budget' | 'mid-range' | 'premium' | 'luxury';
  amenities?: string[];
  openingHours?: {
    [key: string]: { open: string; close: string };
  };
  isOpen?: boolean;
  partnerId?: string;
  partnerName?: string;
  partnerStatus?: 'new' | 'vip' | 'exclusive';
  createdAt?: string;
  updatedAt?: string;
}

export interface VenueFilters {
  category?: string;
  city?: string;
  priceRange?: string;
  rating?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'rating' | 'price' | 'distance' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class VenuesService {
  private readonly baseUrl = '/venues';

  /**
   * Get all venues with optional filters
   */
  async getVenues(filters?: VenueFilters): Promise<PaginatedResponse<Venue>> {
    return apiService.get<PaginatedResponse<Venue>>(this.baseUrl, filters);
  }

  /**
   * Get a single venue by ID
   */
  async getVenueById(id: string): Promise<Venue> {
    return apiService.get<Venue>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get venues by category
   */
  async getVenuesByCategory(category: string, filters?: VenueFilters): Promise<PaginatedResponse<Venue>> {
    return apiService.get<PaginatedResponse<Venue>>(`${this.baseUrl}/category/${category}`, filters);
  }

  /**
   * Get venues by city
   */
  async getVenuesByCity(city: string, filters?: VenueFilters): Promise<PaginatedResponse<Venue>> {
    return apiService.get<PaginatedResponse<Venue>>(`${this.baseUrl}/city/${city}`, filters);
  }

  /**
   * Get venues by price range
   */
  async getVenuesByPriceRange(priceRange: string, filters?: VenueFilters): Promise<PaginatedResponse<Venue>> {
    return apiService.get<PaginatedResponse<Venue>>(`${this.baseUrl}/price/${priceRange}`, filters);
  }

  /**
   * Search venues
   */
  async searchVenues(query: string, filters?: VenueFilters): Promise<PaginatedResponse<Venue>> {
    return apiService.get<PaginatedResponse<Venue>>(`${this.baseUrl}/search`, { q: query, ...filters });
  }

  /**
   * Get nearby venues
   */
  async getNearbyVenues(lat: number, lng: number, radius: number = 5000): Promise<Venue[]> {
    return apiService.get<Venue[]>(`${this.baseUrl}/nearby`, { lat, lng, radius });
  }

  /**
   * Get featured venues
   */
  async getFeaturedVenues(limit: number = 10): Promise<Venue[]> {
    return apiService.get<Venue[]>(`${this.baseUrl}/featured`, { limit });
  }

  /**
   * Get top-rated venues
   */
  async getTopRatedVenues(limit: number = 10): Promise<Venue[]> {
    return apiService.get<Venue[]>(`${this.baseUrl}/top-rated`, { limit });
  }

  /**
   * Create a new venue (for partners)
   */
  async createVenue(venue: Partial<Venue>): Promise<Venue> {
    return apiService.post<Venue>(this.baseUrl, venue);
  }

  /**
   * Update venue
   */
  async updateVenue(id: string, updates: Partial<Venue>): Promise<Venue> {
    return apiService.put<Venue>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Delete venue
   */
  async deleteVenue(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Upload venue images
   */
  async uploadImages(venueId: string, files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const response = await fetch(`${apiService['api'].defaults.baseURL}${this.baseUrl}/${venueId}/images`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    });

    if (!response.ok) throw new Error('Failed to upload images');
    return response.json();
  }

  /**
   * Delete venue image
   */
  async deleteImage(venueId: string, imageUrl: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${venueId}/images`, { data: { imageUrl } });
  }
}

export const venuesService = new VenuesService();

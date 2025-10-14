/**
 * Advanced Search Engine
 * Supports filtering, sorting, geocoding, and full-text search
 */

export interface SearchFilters {
  query?: string;
  category?: string[];
  location?: {
    lat: number;
    lng: number;
    radius: number; // in kilometers
  };
  priceRange?: {
    min: number;
    max: number;
  };
  discountMin?: number;
  rating?: number;
  cuisine?: string[];
  amenities?: string[];
  openNow?: boolean;
  sortBy?: 'distance' | 'rating' | 'discount' | 'price' | 'newest';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  filters: SearchFilters;
  facets?: SearchFacets;
}

export interface SearchFacets {
  categories: { value: string; count: number }[];
  priceRanges: { min: number; max: number; count: number }[];
  ratings: { value: number; count: number }[];
  cuisines: { value: string; count: number }[];
}

export interface Searchable {
  id: string;
  name: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  category: string;
  lat?: number;
  lng?: number;
  rating?: number;
  priceRange?: number;
  discount?: number;
  cuisine?: string;
  amenities?: string[];
  openingHours?: any;
  [key: string]: any;
}

export class SearchEngine {
  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private static calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Check if venue is open now
   */
  private static isOpenNow(openingHours: any): boolean {
    if (!openingHours) return false;

    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase(); // mon, tue, etc.
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const todayHours = openingHours[day];
    if (!todayHours || todayHours.closed) return false;

    const [openHour, openMin] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMin] = todayHours.close.split(':').map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime <= closeTime;
  }

  /**
   * Full-text search in multiple fields
   */
  private static matchesQuery(item: Searchable, query: string, language: 'en' | 'bg' = 'en'): boolean {
    if (!query) return true;

    const searchText = query.toLowerCase();
    const fields = [
      item.name?.toLowerCase(),
      item.nameBg?.toLowerCase(),
      item.description?.toLowerCase(),
      item.descriptionBg?.toLowerCase(),
      item.category?.toLowerCase(),
      item.cuisine?.toLowerCase(),
      item.amenities?.join(' ').toLowerCase(),
    ].filter(Boolean);

    return fields.some(field => field?.includes(searchText));
  }

  /**
   * Apply all filters to items
   */
  private static applyFilters<T extends Searchable>(
    items: T[],
    filters: SearchFilters,
    language: 'en' | 'bg' = 'en'
  ): T[] {
    let filtered = [...items];

    // Text search
    if (filters.query) {
      filtered = filtered.filter(item =>
        this.matchesQuery(item, filters.query!, language)
      );
    }

    // Category filter
    if (filters.category && filters.category.length > 0) {
      filtered = filtered.filter(item =>
        filters.category!.includes(item.category)
      );
    }

    // Location filter (distance-based)
    if (filters.location && filtered.some(item => item.lat && item.lng)) {
      const { lat, lng, radius } = filters.location;
      filtered = filtered.filter(item => {
        if (!item.lat || !item.lng) return false;
        const distance = this.calculateDistance(lat, lng, item.lat, item.lng);
        return distance <= radius;
      });
    }

    // Price range filter
    if (filters.priceRange) {
      filtered = filtered.filter(item => {
        if (!item.priceRange) return true;
        return (
          item.priceRange >= filters.priceRange!.min &&
          item.priceRange <= filters.priceRange!.max
        );
      });
    }

    // Minimum discount filter
    if (filters.discountMin) {
      filtered = filtered.filter(item =>
        (item.discount || 0) >= filters.discountMin!
      );
    }

    // Rating filter
    if (filters.rating) {
      filtered = filtered.filter(item =>
        (item.rating || 0) >= filters.rating!
      );
    }

    // Cuisine filter
    if (filters.cuisine && filters.cuisine.length > 0) {
      filtered = filtered.filter(item =>
        filters.cuisine!.includes(item.cuisine || '')
      );
    }

    // Amenities filter
    if (filters.amenities && filters.amenities.length > 0) {
      filtered = filtered.filter(item => {
        if (!item.amenities) return false;
        return filters.amenities!.every(amenity =>
          item.amenities!.includes(amenity)
        );
      });
    }

    // Open now filter
    if (filters.openNow) {
      filtered = filtered.filter(item =>
        this.isOpenNow(item.openingHours)
      );
    }

    return filtered;
  }

  /**
   * Sort results
   */
  private static sortResults<T extends Searchable>(
    items: T[],
    filters: SearchFilters
  ): T[] {
    const { sortBy = 'distance', sortOrder = 'asc' } = filters;
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    return items.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'distance':
          if (filters.location && a.lat && a.lng && b.lat && b.lng) {
            const distA = this.calculateDistance(
              filters.location.lat,
              filters.location.lng,
              a.lat,
              a.lng
            );
            const distB = this.calculateDistance(
              filters.location.lat,
              filters.location.lng,
              b.lat,
              b.lng
            );
            comparison = distA - distB;
          }
          break;

        case 'rating':
          comparison = (b.rating || 0) - (a.rating || 0);
          break;

        case 'discount':
          comparison = (b.discount || 0) - (a.discount || 0);
          break;

        case 'price':
          comparison = (a.priceRange || 0) - (b.priceRange || 0);
          break;

        case 'newest':
          comparison = (b.createdAt || 0) - (a.createdAt || 0);
          break;
      }

      return comparison * multiplier;
    });
  }

  /**
   * Calculate facets for filtered results
   */
  private static calculateFacets<T extends Searchable>(items: T[]): SearchFacets {
    // Category facets
    const categoryMap = new Map<string, number>();
    items.forEach(item => {
      const count = categoryMap.get(item.category) || 0;
      categoryMap.set(item.category, count + 1);
    });

    // Price range facets
    const priceRanges = [
      { min: 0, max: 50, count: 0 },
      { min: 50, max: 100, count: 0 },
      { min: 100, max: 200, count: 0 },
      { min: 200, max: Infinity, count: 0 },
    ];

    items.forEach(item => {
      const price = item.priceRange || 0;
      const range = priceRanges.find(r => price >= r.min && price < r.max);
      if (range) range.count++;
    });

    // Rating facets
    const ratingMap = new Map<number, number>();
    [5, 4, 3, 2, 1].forEach(rating => {
      const count = items.filter(item => Math.floor(item.rating || 0) === rating).length;
      ratingMap.set(rating, count);
    });

    // Cuisine facets
    const cuisineMap = new Map<string, number>();
    items.forEach(item => {
      if (item.cuisine) {
        const count = cuisineMap.get(item.cuisine) || 0;
        cuisineMap.set(item.cuisine, count + 1);
      }
    });

    return {
      categories: Array.from(categoryMap.entries()).map(([value, count]) => ({
        value,
        count,
      })),
      priceRanges: priceRanges.filter(r => r.count > 0),
      ratings: Array.from(ratingMap.entries()).map(([value, count]) => ({
        value,
        count,
      })),
      cuisines: Array.from(cuisineMap.entries()).map(([value, count]) => ({
        value,
        count,
      })),
    };
  }

  /**
   * Paginate results
   */
  private static paginate<T>(
    items: T[],
    page: number = 1,
    limit: number = 20
  ): { items: T[]; hasMore: boolean } {
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedItems = items.slice(start, end);

    return {
      items: paginatedItems,
      hasMore: end < items.length,
    };
  }

  /**
   * Main search method
   */
  static search<T extends Searchable>(
    items: T[],
    filters: SearchFilters,
    language: 'en' | 'bg' = 'en'
  ): SearchResult<T> {
    // Apply filters
    const filtered = this.applyFilters(items, filters, language);

    // Sort results
    const sorted = this.sortResults(filtered, filters);

    // Calculate facets
    const facets = this.calculateFacets(sorted);

    // Paginate
    const { page = 1, limit = 20 } = filters;
    const { items: paginatedItems, hasMore } = this.paginate(sorted, page, limit);

    return {
      items: paginatedItems,
      total: sorted.length,
      page,
      limit,
      hasMore,
      filters,
      facets,
    };
  }

  /**
   * Get suggestions for autocomplete
   */
  static getSuggestions<T extends Searchable>(
    items: T[],
    query: string,
    limit: number = 5
  ): Array<{ text: string; type: 'venue' | 'category' | 'cuisine' }> {
    if (!query || query.length < 2) return [];

    const suggestions: Array<{ text: string; type: 'venue' | 'category' | 'cuisine' }> = [];
    const lowerQuery = query.toLowerCase();

    // Venue name suggestions
    items.forEach(item => {
      if (item.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push({ text: item.name, type: 'venue' });
      }
    });

    // Category suggestions
    const categories = new Set(
      items
        .map(item => item.category)
        .filter(cat => cat.toLowerCase().includes(lowerQuery))
    );
    categories.forEach(cat => {
      suggestions.push({ text: cat, type: 'category' });
    });

    // Cuisine suggestions
    const cuisines = new Set(
      items
        .map(item => item.cuisine)
        .filter(Boolean)
        .filter(cuisine => cuisine!.toLowerCase().includes(lowerQuery))
    );
    cuisines.forEach(cuisine => {
      suggestions.push({ text: cuisine!, type: 'cuisine' });
    });

    // Remove duplicates and limit
    return suggestions
      .filter((sug, index, self) =>
        index === self.findIndex(s => s.text === sug.text)
      )
      .slice(0, limit);
  }

  /**
   * Geocode address to coordinates (mock implementation)
   * In production, use Google Maps API or Mapbox
   */
  static async geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    // Mock implementation - in production, call actual geocoding API
    const mockLocations: Record<string, { lat: number; lng: number }> = {
      'sofia': { lat: 42.6977, lng: 23.3219 },
      'plovdiv': { lat: 42.1354, lng: 24.7453 },
      'varna': { lat: 43.2141, lng: 27.9147 },
      'burgas': { lat: 42.5048, lng: 27.4626 },
      'bansko': { lat: 41.8381, lng: 23.4878 },
    };

    const normalized = address.toLowerCase().trim();
    return mockLocations[normalized] || null;
  }

  /**
   * Reverse geocode coordinates to address (mock)
   */
  static async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    // Mock implementation
    const mockAddresses: Record<string, string> = {
      '42.6977,23.3219': 'Sofia, Bulgaria',
      '42.1354,24.7453': 'Plovdiv, Bulgaria',
      '43.2141,27.9147': 'Varna, Bulgaria',
    };

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    return mockAddresses[key] || 'Unknown location';
  }
}

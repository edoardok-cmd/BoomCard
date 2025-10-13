/**
 * Favorites Service
 *
 * Complete wishlist and favorites system for:
 * - Saving favorite venues, offers, and experiences
 * - Creating custom collections/lists
 * - Sharing favorites with others
 * - Tracking price changes
 * - Getting notifications for favorites
 */

import { apiService } from './api.service';

export type FavoriteEntityType = 'venue' | 'offer' | 'partner' | 'experience';

export interface Favorite {
  id: string;
  userId: string;
  entityType: FavoriteEntityType;
  entityId: string;

  // Entity details (cached for performance)
  entityName: string;
  entityNameBg: string;
  entityImage?: string;
  entityPrice?: number;
  entityRating?: number;
  entityLocation?: string;

  // Organization
  collectionId?: string;
  collectionName?: string;
  notes?: string;
  tags: string[];

  // Tracking
  priceAtSave: number;
  currentPrice: number;
  priceChanged: boolean;
  priceChangePercentage: number;

  // Notifications
  notifyOnPriceChange: boolean;
  notifyOnAvailability: boolean;
  notifyOnSale: boolean;

  // Metadata
  createdAt: string;
  updatedAt: string;
  lastViewedAt?: string;
}

export interface FavoriteCollection {
  id: string;
  userId: string;
  name: string;
  nameBg: string;
  description?: string;
  descriptionBg?: string;

  // Privacy
  isPublic: boolean;
  shareUrl?: string;

  // Contents
  itemCount: number;
  thumbnails: string[]; // First 4 item images

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface AddToFavoritesData {
  entityType: FavoriteEntityType;
  entityId: string;
  collectionId?: string;
  notes?: string;
  tags?: string[];
  notifyOnPriceChange?: boolean;
  notifyOnAvailability?: boolean;
  notifyOnSale?: boolean;
}

export interface CreateCollectionData {
  name: string;
  nameBg: string;
  description?: string;
  descriptionBg?: string;
  isPublic?: boolean;
}

export interface FavoriteFilters {
  entityType?: FavoriteEntityType;
  collectionId?: string;
  tags?: string[];
  priceChanged?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priceChange' | 'rating';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedFavorites {
  data: Favorite[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FavoriteStatistics {
  totalFavorites: number;
  byType: Record<FavoriteEntityType, number>;
  collections: number;
  priceDrops: number;
  averageSavings: number;
  topCategories: Array<{ category: string; count: number }>;
  recentActivity: Array<{
    action: 'added' | 'removed' | 'price_drop';
    entityName: string;
    timestamp: string;
  }>;
}

class FavoritesService {
  private readonly baseUrl = '/favorites';

  /**
   * Get all favorites
   */
  async getFavorites(filters?: FavoriteFilters): Promise<PaginatedFavorites> {
    return apiService.get<PaginatedFavorites>(this.baseUrl, filters);
  }

  /**
   * Get favorite by ID
   */
  async getFavoriteById(id: string): Promise<Favorite> {
    return apiService.get<Favorite>(`${this.baseUrl}/${id}`);
  }

  /**
   * Check if entity is favorited
   */
  async isFavorited(entityType: FavoriteEntityType, entityId: string): Promise<boolean> {
    const response = await apiService.get<{ isFavorited: boolean }>(`${this.baseUrl}/check`, {
      entityType,
      entityId,
    });
    return response.isFavorited;
  }

  /**
   * Add to favorites
   */
  async addToFavorites(data: AddToFavoritesData): Promise<Favorite> {
    return apiService.post<Favorite>(this.baseUrl, data);
  }

  /**
   * Remove from favorites
   */
  async removeFromFavorites(id: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Remove by entity
   */
  async removeByEntity(entityType: FavoriteEntityType, entityId: string): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/entity/${entityType}/${entityId}`);
  }

  /**
   * Update favorite
   */
  async updateFavorite(id: string, updates: Partial<AddToFavoritesData>): Promise<Favorite> {
    return apiService.put<Favorite>(`${this.baseUrl}/${id}`, updates);
  }

  /**
   * Move to collection
   */
  async moveToCollection(id: string, collectionId: string): Promise<Favorite> {
    return apiService.post<Favorite>(`${this.baseUrl}/${id}/move`, {
      collectionId,
    });
  }

  /**
   * Add tags
   */
  async addTags(id: string, tags: string[]): Promise<Favorite> {
    return apiService.post<Favorite>(`${this.baseUrl}/${id}/tags`, {
      tags,
    });
  }

  /**
   * Remove tags
   */
  async removeTags(id: string, tags: string[]): Promise<Favorite> {
    return apiService.delete<Favorite>(`${this.baseUrl}/${id}/tags`, {
      data: { tags },
    });
  }

  /**
   * Get collections
   */
  async getCollections(): Promise<FavoriteCollection[]> {
    return apiService.get<FavoriteCollection[]>(`${this.baseUrl}/collections`);
  }

  /**
   * Get collection by ID
   */
  async getCollectionById(id: string): Promise<FavoriteCollection> {
    return apiService.get<FavoriteCollection>(`${this.baseUrl}/collections/${id}`);
  }

  /**
   * Get collection items
   */
  async getCollectionItems(id: string, filters?: FavoriteFilters): Promise<PaginatedFavorites> {
    return apiService.get<PaginatedFavorites>(`${this.baseUrl}/collections/${id}/items`, filters);
  }

  /**
   * Create collection
   */
  async createCollection(data: CreateCollectionData): Promise<FavoriteCollection> {
    return apiService.post<FavoriteCollection>(`${this.baseUrl}/collections`, data);
  }

  /**
   * Update collection
   */
  async updateCollection(
    id: string,
    updates: Partial<CreateCollectionData>
  ): Promise<FavoriteCollection> {
    return apiService.put<FavoriteCollection>(`${this.baseUrl}/collections/${id}`, updates);
  }

  /**
   * Delete collection
   */
  async deleteCollection(id: string, deleteItems: boolean = false): Promise<void> {
    return apiService.delete<void>(`${this.baseUrl}/collections/${id}`, {
      params: { deleteItems },
    });
  }

  /**
   * Share collection
   */
  async shareCollection(id: string): Promise<{ shareUrl: string }> {
    return apiService.post<{ shareUrl: string }>(`${this.baseUrl}/collections/${id}/share`);
  }

  /**
   * Unshare collection
   */
  async unshareCollection(id: string): Promise<void> {
    return apiService.post<void>(`${this.baseUrl}/collections/${id}/unshare`);
  }

  /**
   * Get shared collection (public)
   */
  async getSharedCollection(shareToken: string): Promise<{
    collection: FavoriteCollection;
    items: Favorite[];
  }> {
    return apiService.get(`${this.baseUrl}/shared/${shareToken}`);
  }

  /**
   * Get favorites statistics
   */
  async getStatistics(): Promise<FavoriteStatistics> {
    return apiService.get<FavoriteStatistics>(`${this.baseUrl}/statistics`);
  }

  /**
   * Get price drops
   */
  async getPriceDrops(): Promise<Favorite[]> {
    return apiService.get<Favorite[]>(`${this.baseUrl}/price-drops`);
  }

  /**
   * Get recommendations based on favorites
   */
  async getRecommendations(limit: number = 10): Promise<Array<{
    entityType: FavoriteEntityType;
    entityId: string;
    entityName: string;
    entityNameBg: string;
    entityImage: string;
    score: number;
    reason: string;
  }>> {
    return apiService.get(`${this.baseUrl}/recommendations`, {
      limit,
    });
  }

  /**
   * Sync favorites (for cross-device)
   */
  async syncFavorites(favorites: AddToFavoritesData[]): Promise<{
    added: number;
    updated: number;
    removed: number;
  }> {
    return apiService.post(`${this.baseUrl}/sync`, {
      favorites,
    });
  }

  /**
   * Export favorites
   */
  async exportFavorites(format: 'csv' | 'json' = 'json'): Promise<Blob> {
    return apiService.get<Blob>(`${this.baseUrl}/export`, {
      format,
    }, {
      responseType: 'blob',
    });
  }

  /**
   * Import favorites
   */
  async importFavorites(file: File): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    const formData = new FormData();
    formData.append('file', file);

    return apiService.post(`${this.baseUrl}/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * Bulk add to favorites
   */
  async bulkAdd(items: AddToFavoritesData[]): Promise<{
    added: number;
    failed: number;
  }> {
    return apiService.post(`${this.baseUrl}/bulk-add`, {
      items,
    });
  }

  /**
   * Bulk remove from favorites
   */
  async bulkRemove(ids: string[]): Promise<{
    removed: number;
    failed: number;
  }> {
    return apiService.post(`${this.baseUrl}/bulk-remove`, {
      ids,
    });
  }

  /**
   * Get similar favorites
   * Based on user's favorites, suggest similar items
   */
  async getSimilarFavorites(id: string, limit: number = 5): Promise<Favorite[]> {
    return apiService.get<Favorite[]>(`${this.baseUrl}/${id}/similar`, {
      limit,
    });
  }
}

// Export singleton instance
export const favoritesService = new FavoritesService();
export default favoritesService;

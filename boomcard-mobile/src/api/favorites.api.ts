/**
 * Favorites API (N5)
 *
 * Backend: favorites.routes.ts — entityKind ∈ {'partner','offer','venue'}.
 *   GET    /api/favorites                       → list { id, entityKind, entityId, createdAt }
 *   POST   /api/favorites   { entityKind, entityId }
 *   DELETE /api/favorites   { entityKind, entityId }
 *   DELETE /api/favorites/all
 */

import apiClient from './client';
import type { ApiResponse } from '../types';

export type FavoriteKind = 'partner' | 'offer' | 'venue';

export interface FavoriteRef {
  id: string;
  entityKind: FavoriteKind;
  entityId: string;
  createdAt: string;
}

export const favoritesApi = {
  async list(): Promise<ApiResponse<FavoriteRef[]>> {
    const res = await apiClient.get('/api/favorites');
    if (res.success) {
      const body: any = res.data;
      return { success: true, data: (body?.data ?? body ?? []) as FavoriteRef[] };
    }
    return res as ApiResponse<FavoriteRef[]>;
  },

  async add(entityKind: FavoriteKind, entityId: string): Promise<ApiResponse<FavoriteRef>> {
    return apiClient.post('/api/favorites', { entityKind, entityId });
  },

  async remove(entityKind: FavoriteKind, entityId: string): Promise<ApiResponse<void>> {
    return apiClient.delete('/api/favorites', { data: { entityKind, entityId } });
  },

  async removeAll(): Promise<ApiResponse<void>> {
    return apiClient.delete('/api/favorites/all');
  },
};

export default favoritesApi;

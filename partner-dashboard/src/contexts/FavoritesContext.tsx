import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import type { Entity } from '../types/entity.types';
import { apiService } from '../services/api.service';
import { useAuth } from './AuthContext';

type EntityKind = 'partner' | 'offer' | 'venue';

function inferEntityKind(entity?: Entity): EntityKind {
  // The Entity discriminator (`kind`) maps cleanly to our backend taxonomy.
  // Default to partner for legacy items missing the field.
  const k = (entity as any)?.kind;
  if (k === 'offer' || k === 'venue' || k === 'partner') return k;
  return 'partner';
}

interface FavoriteItem {
  id: string;
  // Entity kind so the server-side sync knows which row to upsert/delete.
  // Optional for backwards compatibility with localStorage entries written
  // before this field was introduced.
  entityKind?: EntityKind;
  title: string;
  titleBg: string;
  category: string;
  categoryBg: string;
  location: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  imageUrl: string;
  path: string;
  addedAt: number;
  // Set true once the item has been confirmed to exist on the server (either
  // a successful POST /favorites or returned from GET /favorites). Items
  // added offline / on push failure stay `false` and are protected from the
  // cross-device-delete filter on the next sync — without this flag, a push
  // failure would silently drop the local row on the next pull.
  synced?: boolean;
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  addToFavorites: (item: Omit<FavoriteItem, 'addedAt'>) => void;
  /** Add an Entity to favorites (new unified format) */
  addEntityToFavorites: (entity: Entity) => void;
  removeFromFavorites: (id: string) => void;
  isFavorite: (id: string) => boolean;
  clearFavorites: () => void;
  favoritesCount: number;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_favorites';

interface FavoritesProviderProps {
  children: ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

  // Load favorites from localStorage on mount
  useEffect(() => {
    const loadFavorites = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setFavorites(parsed);
        }
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    };

    loadFavorites();
  }, []);

  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch (error) {
      console.error('Error saving favorites:', error);
    }
  }, [favorites]);

  // Spec §5.5: favorites must persist across devices for signed-in users.
  // On auth, push any local-only favorites to the server, pull the server's
  // canonical list, and reconcile.
  //
  // The merge rule is: drop a local row only if (a) it was previously
  // confirmed-on-server (`synced === true`) AND (b) the server pull doesn't
  // return it — i.e. it was deleted on another device. Locally-added rows
  // that haven't yet been pushed (or whose push just failed) keep
  // `synced === false` and survive the filter, so they're not lost on a
  // transient network error and will be retried on the next sync.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        // Push every local row that isn't yet known to be on the server.
        // Track each push outcome so we can flip `synced` only on success.
        const localToPush = favorites.filter(f => !!f.id && !f.synced);
        const pushOutcomes = await Promise.all(
          localToPush.map(async f => {
            try {
              await apiService.post('/favorites', {
                entityKind: f.entityKind ?? 'partner',
                entityId: f.id,
              });
              return { id: f.id, kind: f.entityKind ?? 'partner', ok: true } as const;
            } catch (err) {
              console.error('Failed to push favorite to server:', err);
              return { id: f.id, kind: f.entityKind ?? 'partner', ok: false } as const;
            }
          })
        );
        const succeededKeys = new Set(
          pushOutcomes.filter(o => o.ok).map(o => `${o.kind}:${o.id}`)
        );

        const response = await apiService.get<{ entityKind: EntityKind | null; entityId: string | null; createdAt: string }[]>('/favorites');
        const serverList = ((response as any)?.data ?? response ?? []) as Array<{ entityKind: EntityKind | null; entityId: string | null }>;
        if (cancelled) return;

        const serverKeys = new Set(
          serverList
            .filter(r => !!r.entityId)
            .map(r => `${r.entityKind || 'partner'}:${r.entityId}`)
        );

        setFavorites(prev =>
          prev
            .map(f => {
              const key = `${f.entityKind ?? 'partner'}:${f.id}`;
              // Mark any item the server confirms (existing OR just-pushed) as synced.
              if (serverKeys.has(key) || succeededKeys.has(key)) {
                return f.synced ? f : { ...f, synced: true };
              }
              return f;
            })
            // Cross-device delete: only drop items previously confirmed on
            // server. Unsynced local items stay so a failed push isn't a
            // silent data loss — the next sync will retry the push.
            .filter(f => {
              const key = `${f.entityKind ?? 'partner'}:${f.id}`;
              if (!f.synced) return true;
              return serverKeys.has(key);
            })
        );
      } catch (err) {
        console.error('Failed to sync favorites with server:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const addToFavorites = (item: Omit<FavoriteItem, 'addedAt'>) => {
    const newItem: FavoriteItem = {
      ...item,
      addedAt: Date.now(),
      synced: false,
    };

    setFavorites(prev => {
      // Check if already exists
      if (prev.some(fav => fav.id === item.id)) {
        toast.error('Already in favorites');
        return prev;
      }
      toast.success('Added to favorites');
      return [...prev, newItem];
    });

    if (isAuthenticated) {
      apiService
        .post('/favorites', {
          entityKind: item.entityKind ?? 'partner',
          entityId: item.id,
        })
        .then(() => {
          // Confirmed on server — mark synced so cross-device-delete sync can
          // drop this row safely if it ever disappears server-side.
          setFavorites(prev =>
            prev.map(f => (f.id === item.id ? { ...f, synced: true } : f))
          );
        })
        .catch(err => console.error('Failed to persist favorite:', err));
    }
  };

  const addEntityToFavorites = (entity: Entity) => {
    addToFavorites({
      id: entity.id,
      entityKind: inferEntityKind(entity),
      title: entity.name.en,
      titleBg: entity.name.bg,
      category: entity.category.en,
      categoryBg: entity.category.bg,
      location: entity.location.display,
      discount: entity.discount?.percent ?? 0,
      originalPrice: entity.discount?.originalPrice ?? 0,
      discountedPrice: entity.discount?.discountedPrice ?? 0,
      imageUrl: entity.images.hero,
      path: entity.path,
    });
  };

  const removeFromFavorites = (id: string) => {
    let removed: FavoriteItem | undefined;
    setFavorites(prev => {
      removed = prev.find(fav => fav.id === id);
      const filtered = prev.filter(fav => fav.id !== id);
      if (filtered.length < prev.length) {
        toast.success('Removed from favorites');
      }
      return filtered;
    });

    if (isAuthenticated && removed) {
      apiService.delete('/favorites', {
        data: {
          entityKind: removed.entityKind ?? 'partner',
          entityId: removed.id,
        },
      } as any).catch(err => console.error('Failed to remove favorite:', err));
    }
  };

  const isFavorite = (id: string): boolean => {
    return favorites.some(fav => fav.id === id);
  };

  const clearFavorites = () => {
    setFavorites([]);
    toast.success('All favorites cleared');
    if (isAuthenticated) {
      apiService.delete('/favorites/all').catch(err => console.error('Failed to clear favorites:', err));
    }
  };

  const value: FavoritesContextType = {
    favorites,
    addToFavorites,
    addEntityToFavorites,
    removeFromFavorites,
    isFavorite,
    clearFavorites,
    favoritesCount: favorites.length
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

export default FavoritesContext;

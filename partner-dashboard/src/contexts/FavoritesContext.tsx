import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { toast } from 'react-hot-toast';

interface FavoriteItem {
  id: string;
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
}

interface FavoritesContextType {
  favorites: FavoriteItem[];
  addToFavorites: (item: Omit<FavoriteItem, 'addedAt'>) => void;
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

  const addToFavorites = (item: Omit<FavoriteItem, 'addedAt'>) => {
    const newItem: FavoriteItem = {
      ...item,
      addedAt: Date.now()
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
  };

  const removeFromFavorites = (id: string) => {
    setFavorites(prev => {
      const filtered = prev.filter(fav => fav.id !== id);
      if (filtered.length < prev.length) {
        toast.success('Removed from favorites');
      }
      return filtered;
    });
  };

  const isFavorite = (id: string): boolean => {
    return favorites.some(fav => fav.id === id);
  };

  const clearFavorites = () => {
    setFavorites([]);
    toast.success('All favorites cleared');
  };

  const value: FavoritesContextType = {
    favorites,
    addToFavorites,
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

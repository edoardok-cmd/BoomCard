import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import StorageService from '../services/storage.service';

interface TabVisibilityContextType {
  showOffers: boolean;
  showNearby: boolean;
  showFavorites: boolean;
  setShowOffers: (v: boolean) => Promise<void>;
  setShowNearby: (v: boolean) => Promise<void>;
  setShowFavorites: (v: boolean) => Promise<void>;
}

const TabVisibilityContext = createContext<TabVisibilityContextType | undefined>(undefined);

const isWeb = Platform.OS === 'web';

export const TabVisibilityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [showOffers, setShowOffersState] = useState(isWeb);
  const [showNearby, setShowNearbyState] = useState(isWeb);
  const [showFavorites, setShowFavoritesState] = useState(isWeb);

  useEffect(() => {
    if (isWeb) return;
    Promise.all([
      StorageService.getShowOffersTab(),
      StorageService.getShowNearbyTab(),
      StorageService.getShowFavoritesTab(),
    ]).then(([o, n, f]) => {
      setShowOffersState(o);
      setShowNearbyState(n);
      setShowFavoritesState(f);
    }).catch((err) => {
      console.error('Failed to load tab visibility prefs:', err);
    });
  }, []);

  const setShowOffers = async (v: boolean) => {
    setShowOffersState(v);
    await StorageService.setShowOffersTab(v);
  };

  const setShowNearby = async (v: boolean) => {
    setShowNearbyState(v);
    await StorageService.setShowNearbyTab(v);
  };

  const setShowFavorites = async (v: boolean) => {
    setShowFavoritesState(v);
    await StorageService.setShowFavoritesTab(v);
  };

  const value: TabVisibilityContextType = {
    showOffers,
    showNearby,
    showFavorites,
    setShowOffers,
    setShowNearby,
    setShowFavorites,
  };

  return (
    <TabVisibilityContext.Provider value={value}>
      {children}
    </TabVisibilityContext.Provider>
  );
};

export const useTabVisibility = (): TabVisibilityContextType => {
  const context = useContext(TabVisibilityContext);
  if (context === undefined) {
    throw new Error('useTabVisibility must be used within a TabVisibilityProvider');
  }
  return context;
};

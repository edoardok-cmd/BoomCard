import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';

export interface UserCoords {
  lat: number;
  lng: number;
}

type PermissionState = 'prompt' | 'granted' | 'denied';

interface LocationContextValue {
  userCoords: UserCoords | undefined;
  permission: PermissionState;
  permissionChecked: boolean;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const STORAGE_KEY = 'boomcard_user_location';
const MAX_AGE_MS = 30 * 60 * 1000;

const loadFromStorage = (): UserCoords | undefined => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; savedAt?: number };
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') return undefined;
    if (parsed.savedAt && Date.now() - parsed.savedAt > MAX_AGE_MS) return undefined;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return undefined;
  }
};

const saveToStorage = (coords: UserCoords) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...coords, savedAt: Date.now() }));
  } catch { /* sessionStorage may be unavailable */ }
};

const clearStorage = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
};

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userCoords, setUserCoords] = useState<UserCoords | undefined>(loadFromStorage);
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [permissionChecked, setPermissionChecked] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!('permissions' in navigator)) {
      setPermissionChecked(true);
      return;
    }
    let result: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then(r => {
        if (!mountedRef.current) return;
        result = r;
        setPermission(r.state as PermissionState);
        setPermissionChecked(true);
        r.onchange = () => {
          if (!mountedRef.current) return;
          setPermission(r.state as PermissionState);
        };
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setPermissionChecked(true);
      });
    return () => {
      if (result) result.onchange = null;
    };
  }, []);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by this browser');
      return;
    }
    setIsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        saveToStorage(coords);
        if (!mountedRef.current) return;
        setUserCoords(coords);
        setPermission('granted');
        setIsLoading(false);
      },
      err => {
        if (!mountedRef.current) return;
        setIsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied');
          setError('Location access denied');
        } else {
          setError('Unable to determine location');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const clearLocation = useCallback(() => {
    clearStorage();
    if (!mountedRef.current) return;
    setUserCoords(undefined);
  }, []);

  return (
    <LocationContext.Provider
      value={{ userCoords, permission, permissionChecked, isLoading, error, requestLocation, clearLocation }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useUserLocation = (): LocationContextValue => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useUserLocation must be used within LocationProvider');
  return ctx;
};

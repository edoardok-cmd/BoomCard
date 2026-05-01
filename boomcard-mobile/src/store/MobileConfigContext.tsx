import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchMobileConfig, MobileConfig, DEFAULT_CONFIG } from '../api/config.api';
import { setExternalErrorLogUrl } from '../utils/errorReporter';

interface MobileConfigContextValue {
  config: MobileConfig;
  isLoaded: boolean;
}

const MobileConfigContext = createContext<MobileConfigContextValue>({
  config: DEFAULT_CONFIG,
  isLoaded: false,
});

export function MobileConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<MobileConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    fetchMobileConfig().then((cfg) => {
      setConfig(cfg);
      setExternalErrorLogUrl(cfg.errorLogUrl);
      setIsLoaded(true);
    });
  }, []);

  return (
    <MobileConfigContext.Provider value={{ config, isLoaded }}>
      {children}
    </MobileConfigContext.Provider>
  );
}

export function useMobileConfig(): MobileConfigContextValue {
  return useContext(MobileConfigContext);
}

export function useFeatureFlags() {
  const { config } = useMobileConfig();
  return config.features;
}

import { API_CONFIG } from '../constants/config';

export interface MobileConfig {
  versions: {
    minIos: string | null;
    minAndroid: string | null;
  };
  status: {
    ios: string;
    android: string;
  };
  features: {
    receiptScan: boolean;
    stickerScan: boolean;
    partnerMap: boolean;
  };
  pushEnabled: boolean;
  errorLogUrl: string | null;
}

const DEFAULT_CONFIG: MobileConfig = {
  versions: { minIos: null, minAndroid: null },
  status: { ios: 'active', android: 'active' },
  features: { receiptScan: true, stickerScan: true, partnerMap: true },
  pushEnabled: true,
  errorLogUrl: null,
};

export async function fetchMobileConfig(): Promise<MobileConfig> {
  try {
    const res = await fetch(`${API_CONFIG.BASE_URL}/api/config/mobile`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      // 8-second timeout — non-blocking, falls back to defaults on failure
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return DEFAULT_CONFIG;
    const json = await res.json();
    if (!json?.success || !json?.data) return DEFAULT_CONFIG;
    return json.data as MobileConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export { DEFAULT_CONFIG };

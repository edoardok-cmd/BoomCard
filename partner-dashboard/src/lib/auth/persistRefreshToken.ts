import * as authStorage from './authStorage';

const REFRESH_TOKEN_KEY = 'refreshToken';

export function persistRefreshToken(token: string, persistent: boolean): void {
  authStorage.setItem(REFRESH_TOKEN_KEY, token, persistent);
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const lifetime = persistent ? `; max-age=${7 * 24 * 60 * 60}` : '';
  document.cookie = `boomcard_refresh=${token}; path=/${lifetime}; SameSite=Strict${secure}`;
}

import { apiService } from './api.service';
import { storeSession, clearSession, createSession } from '../lib/auth/session';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData extends LoginCredentials {
  name: string;
}

interface BackendAuthResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      email: string;
      firstName?: string;
      lastName?: string;
      role: string;
      status: string;
      avatar?: string;
    };
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}

interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

class AuthService {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiService.post<BackendAuthResponse>('/auth/login', credentials);
    // Store tokens in secure cookies
    const user = response.data.user;
    const session = createSession({
      id: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: (user.role as 'user' | 'partner' | 'admin') || 'user',
      avatar: user.avatar,
    });
    // Override generated tokens with real tokens from backend
    (session as any).accessToken = response.data.accessToken;
    (session as any).refreshToken = response.data.refreshToken;
    storeSession(session);

    // Return in expected format
    return {
      token: response.data.accessToken,
      user: {
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.firstName && response.data.user.lastName
          ? `${response.data.user.firstName} ${response.data.user.lastName}`
          : response.data.user.firstName || response.data.user.email,
      },
    };
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await apiService.post<BackendAuthResponse>('/auth/register', data);
    // Store tokens in secure cookies
    const user = response.data.user;
    const session = createSession({
      id: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: (user.role as 'user' | 'partner' | 'admin') || 'user',
      avatar: user.avatar,
    });
    (session as any).accessToken = response.data.accessToken;
    (session as any).refreshToken = response.data.refreshToken;
    storeSession(session);

    // Return in expected format
    return {
      token: response.data.accessToken,
      user: {
        id: response.data.user.id,
        email: response.data.user.email,
        name: response.data.user.firstName && response.data.user.lastName
          ? `${response.data.user.firstName} ${response.data.user.lastName}`
          : response.data.user.firstName || response.data.user.email,
      },
    };
  }

  async logout(): Promise<void> {
    await apiService.post('/auth/logout');
    clearSession();
  }

  async getCurrentUser() {
    return apiService.get('/auth/me');
  }

  isAuthenticated(): boolean {
    return !!apiService.getAuthToken();
  }
}

export const authService = new AuthService();
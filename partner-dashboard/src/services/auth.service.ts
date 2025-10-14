import { apiService } from './api.service';

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
    // Store both access and refresh tokens
    this.setToken(response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.data.user));

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
    // Store both access and refresh tokens
    this.setToken(response.data.accessToken);
    localStorage.setItem('refreshToken', response.data.refreshToken);
    localStorage.setItem('user', JSON.stringify(response.data.user));

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
    this.removeToken();
  }

  async getCurrentUser() {
    return apiService.get('/auth/me');
  }

  setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  removeToken(): void {
    localStorage.removeItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const authService = new AuthService();
import React, { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { apiService } from '../services/api.service';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'partner' | 'admin';
  createdAt: number;
  emailVerified: boolean;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptTerms: boolean;
  accountType?: 'user' | 'partner';
  businessInfo?: {
    businessName: string;
    businessNameBg?: string;
    businessCategory: string;
    taxId?: string;
    website?: string;
  };
}

export interface OAuthData {
  provider: 'google' | 'facebook';
  token: string;
  email?: string;
  name?: string;
  picture?: string;
  id?: string;
}

export interface AuthContextType extends AuthState {
  token: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithOAuth: (oauthData: OAuthData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
  accessToken?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'boomcard_auth';
const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage and verify token on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const storedAuth = localStorage.getItem(STORAGE_KEY);
        const storedToken = localStorage.getItem(TOKEN_KEY);

        if (storedAuth && storedToken) {
          const userData = JSON.parse(storedAuth);

          // Verify token with backend
          try {
            const verifiedUser = await apiService.get<User>('/auth/me');
            setUser(verifiedUser);
          } catch (error) {
            // Token invalid or expired, clear storage
            console.error('Token verification failed:', error);
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Failed to load user from storage:', error);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  // Save user to localStorage when it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const login = async (credentials: LoginCredentials): Promise<void> => {
    setIsLoading(true);

    try {
      // Try real API endpoint first
      try {
        const response = await apiService.post<AuthResponse>('/auth/login', credentials);

        // Extract token (handle both 'token' and 'accessToken' field names)
        const token = response.token || response.accessToken;
        const refreshToken = response.refreshToken;

        if (!token) {
          throw new Error('No authentication token received');
        }

        // Store tokens
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        if (refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state
        setUser(response.user);

        toast.success(`Welcome back, ${response.user.firstName}!`);
        return;
      } catch (apiError: any) {
        // If API fails, fall back to mock authentication for development
        console.log('API unavailable, using mock authentication');

        // Mock user database
        const mockUsers = [
          {
            email: 'demo@boomcard.bg',
            password: 'demo123',
            user: {
              id: '1',
              email: 'demo@boomcard.bg',
              firstName: 'Demo',
              lastName: 'User',
              role: 'user' as const,
              createdAt: Date.now(),
              emailVerified: true,
            }
          },
          {
            email: 'partner@boomcard.bg',
            password: 'partner123',
            user: {
              id: '2',
              email: 'partner@boomcard.bg',
              firstName: 'Partner',
              lastName: 'User',
              role: 'partner' as const,
              createdAt: Date.now(),
              emailVerified: true,
            }
          },
          {
            email: 'admin@boomcard.bg',
            password: 'admin123',
            user: {
              id: '3',
              email: 'admin@boomcard.bg',
              firstName: 'Admin',
              lastName: 'User',
              role: 'admin' as const,
              createdAt: Date.now(),
              emailVerified: true,
            }
          }
        ];

        // Find matching user
        const mockUser = mockUsers.find(
          u => u.email === credentials.email && u.password === credentials.password
        );

        if (!mockUser) {
          throw new Error('Invalid email or password');
        }

        // Generate mock token
        const mockToken = `mock-jwt-token-${mockUser.user.id}-${Date.now()}`;

        // Store mock token
        localStorage.setItem(TOKEN_KEY, mockToken);
        setToken(mockToken);

        // Set user state
        setUser(mockUser.user);

        toast.success(`Welcome back, ${mockUser.user.firstName}! (Mock Auth)`);
      }
    } catch (error: any) {
      const message = error.message || 'Login failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData): Promise<void> => {
    setIsLoading(true);

    try {
      // Validate terms acceptance
      if (!data.acceptTerms) {
        throw new Error('You must accept the terms and conditions');
      }

      // Call real API endpoint
      const response = await apiService.post<AuthResponse>('/auth/register', data);

      // Extract token
      const token = response.token || response.accessToken;
      const refreshToken = response.refreshToken;

      if (!token) {
        throw new Error('No authentication token received');
      }

      // Store tokens
      localStorage.setItem(TOKEN_KEY, token);
      setToken(token);
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      }

      // Set auth token in API service
      apiService.setAuthToken(token);

      // Set user state
      setUser(response.user);

      // Different success messages for different account types
      if (data.accountType === 'partner') {
        toast.success(`Welcome ${response.user.firstName}! Your partner account is pending verification.`);
      } else {
        toast.success('Account created successfully! Welcome to BoomCard!');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Registration failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Clear user state
    setUser(null);
    setToken(null);

    // Clear storage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);

    // Clear API service token
    apiService.clearAuthToken();

    toast.success('Logged out successfully');
  };

  const updateProfile = async (data: Partial<User>): Promise<void> => {
    if (!user) {
      throw new Error('No user logged in');
    }

    setIsLoading(true);

    try {
      // Call real API endpoint
      const updatedUser = await apiService.put<User>('/auth/profile', data);

      // Update user state
      setUser(updatedUser);

      toast.success('Profile updated successfully');
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Update failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (!user) {
      throw new Error('No user logged in');
    }

    setIsLoading(true);

    try {
      // Validate new password
      if (newPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Call real API endpoint
      await apiService.post('/auth/change-password', {
        currentPassword,
        newPassword
      });

      toast.success('Password changed successfully');
    } catch (error: any) {
      const message = error.response?.data?.message || error.message || 'Password change failed';
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithOAuth = async (oauthData: OAuthData): Promise<void> => {
    setIsLoading(true);

    try {
      // Try real API endpoint first
      try {
        const response = await apiService.post<AuthResponse>('/auth/oauth/login', oauthData);

        // Extract token
        const token = response.token || response.accessToken;
        const refreshToken = response.refreshToken;

        if (!token) {
          throw new Error('No authentication token received');
        }

        // Store tokens
        localStorage.setItem(TOKEN_KEY, token);
        setToken(token);
        if (refreshToken) {
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }

        // Set auth token in API service
        apiService.setAuthToken(token);

        // Set user state
        setUser(response.user);

        // Store auth data
        localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));

        toast.success(`Welcome, ${response.user.firstName}!`);
        return;
      } catch (apiError: any) {
        // If API fails, fall back to mock authentication for development
        console.log('OAuth API unavailable, using mock authentication');

        // Parse name from OAuth data
        const nameParts = (oauthData.name || oauthData.email?.split('@')[0] || 'User').split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || oauthData.provider.charAt(0).toUpperCase() + oauthData.provider.slice(1);

        // Create mock user from OAuth data
        const mockUser: User = {
          id: oauthData.id || `${oauthData.provider}-${Date.now()}`,
          email: oauthData.email || `${oauthData.provider}user@example.com`,
          firstName,
          lastName,
          avatar: oauthData.picture,
          role: 'user',
          createdAt: Date.now(),
          emailVerified: true,
        };

        // Generate mock token
        const mockToken = `mock-oauth-token-${mockUser.id}-${Date.now()}`;

        // Store mock token
        localStorage.setItem(TOKEN_KEY, mockToken);
        setToken(mockToken);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUser));

        // Set user state
        setUser(mockUser);

        toast.success(`Welcome, ${mockUser.firstName}! (Mock OAuth ${oauthData.provider})`);
      }
    } catch (error: any) {
      const message = error.message || `${oauthData.provider} login failed`;
      toast.error(message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithOAuth,
    register,
    logout,
    updateProfile,
    changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

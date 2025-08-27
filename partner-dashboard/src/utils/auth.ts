interface User {
  id: string;
  email: string;
  role: string;
}

interface Session {
  user: User;
  token: string;
}

export const getSession = (): Session | null => {
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) return null;
  
  try {
    return {
      token,
      user: JSON.parse(user)
    };
  } catch {
    return null;
  }
};

export const requireAuth = () => {
  const session = getSession();
  
  if (!session) {
    window.location.href = '/login';
    return null;
  }
  
  return session;
};

export const requireRole = (allowedRoles: string[]) => {
  const session = getSession();
  
  if (!session || !allowedRoles.includes(session.user.role)) {
    window.location.href = '/unauthorized';
    return null;
  }
  
  return session;
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
};

export const refreshToken = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.token;
  } catch {
    return null;
  }
};
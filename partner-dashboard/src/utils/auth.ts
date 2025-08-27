import { GetServerSidePropsContext } from 'next';
import { getSession } from 'next-auth/react';

export const requireAuth = async (context: GetServerSidePropsContext) => {
  const session = await getSession(context);
  
  if (!session) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }
  
  return { props: { session } };
};

export const requireRole = async (
  context: GetServerSidePropsContext,
  allowedRoles: string[]
) => {
  const session = await getSession(context);
  
  if (!session || !allowedRoles.includes(session.user.role)) {
    return {
      redirect: {
        destination: '/unauthorized',
        permanent: false,
      },
    };
  }
  
  return { props: { session } };
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
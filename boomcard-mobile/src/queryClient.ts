/**
 * Shared QueryClient instance
 *
 * Exported from a separate module so it can be imported
 * by both App.tsx and individual screens without hooks.
 */

import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60 * 1000, // 1 minute — keeps financial data reasonably fresh
      refetchOnWindowFocus: true, // re-fetch when app is foregrounded
    },
  },
});

export default queryClient;

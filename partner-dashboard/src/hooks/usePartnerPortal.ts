import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  partnerPortalService,
  PartnerTransactionFilters,
} from '../services/partnerPortal.service';

/**
 * BC-PARTNER-PORTAL-SCOPE-B — react-query hooks for the partner-scoped
 * transactions (§6) and finance (§7) read endpoints.
 */

/**
 * §6 — partner transactions. Server-side filtering: the filters object is part
 * of the query key, so changing a filter refetches with the new query params.
 * keepPreviousData avoids a flash of empty state while paging/filtering.
 */
export function usePartnerTransactions(
  filters: PartnerTransactionFilters,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ['partner', 'me', 'transactions', filters],
    queryFn: () => partnerPortalService.getTransactions(filters),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });
}

/**
 * §7.1 — partner finance (monthly reports + payment history share this payload).
 */
export function usePartnerFinance(enabled: boolean = true) {
  return useQuery({
    queryKey: ['partner', 'me', 'finance'],
    queryFn: () => partnerPortalService.getFinance(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

# Remaining Mock Data Audit

## Files with Mock Data Still Present

### 1. Billing Components (3 files) - HIGH PRIORITY

#### BillingDashboard.tsx
- **Status:** ❌ Mock data via props
- **Mock Data:** Subscription, PaymentMethods, Invoices passed as props
- **Usage:** Not currently used anywhere in the app
- **Action Required:** Create billing service + hooks, integrate with real API

#### PricingPlans.tsx
- **Status:** ⚠️ Static pricing
- **Mock Data:** Hardcoded plan prices (29/79/149 BGN)
- **Action Required:** Could fetch from API or keep static (common practice)

#### PaymentMethodForm.tsx
- **Status:** ✅ Form only
- **Mock Data:** None - just a form component
- **Action Required:** None

---

### 2. Integration Pages (1 file)

#### IntegrationsPage.tsx
- **Status:** ❌ Mock integrations list
- **Mock Data:** `mockIntegrations` array with POS systems, payment providers, etc.
- **Usage:** Used in routing
- **Action Required:** Create integrations service + hooks

---

### 3. Promotions/Experiences Pages (6 files)

These pages appear to be navigation/category pages:

#### PromotionsPage.tsx
- **Status:** 🔍 Need to check if has offers
- **Mock Data:** TBD
- **Action Required:** TBD

#### PromotionsTypePage.tsx
- **Status:** 🔍 Need to check
- **Mock Data:** TBD
- **Action Required:** TBD

#### PromotionsGastronomyPage.tsx
- **Status:** 🔍 Need to check
- **Mock Data:** TBD
- **Action Required:** TBD

#### PromotionsCulturalPage.tsx
- **Status:** 🔍 Need to check
- **Mock Data:** TBD
- **Action Required:** TBD

#### PromotionsExtremePage.tsx
- **Status:** 🔍 Need to check
- **Mock Data:** TBD
- **Action Required:** TBD

#### ExperiencesPage.tsx
- **Status:** 🔍 Need to check (parent page)
- **Mock Data:** TBD
- **Action Required:** TBD

---

### 4. Location Pages (1 file)

#### LocationsPage.tsx
- **Status:** 🔍 Need to check (parent page)
- **Mock Data:** TBD
- **Action Required:** TBD

---

### 5. Library/Utility Files (2 files)

#### lib/reports/ReportEngine.ts
- **Status:** 🔍 Utility library
- **Mock Data:** Possibly mock data for testing
- **Action Required:** Check if needs integration

#### lib/search/SearchEngine.ts
- **Status:** 🔍 Utility library
- **Mock Data:** Possibly mock data for testing
- **Action Required:** Check if needs integration

---

## Integration Priority

### HIGH PRIORITY (User-facing features)
1. ✅ **Billing System** - Critical for revenue
   - Create billing.service.ts
   - Create useBilling.ts hooks
   - Integrate BillingDashboard
   - Add billing route

2. ✅ **Integrations Page** - Important for partners
   - Create integrations.service.ts
   - Create useIntegrations.ts hooks
   - Update IntegrationsPage

3. ✅ **Promotions Pages** - If they display offers
   - Check if they need integration
   - Update accordingly

### MEDIUM PRIORITY
4. ⚠️ **Parent Navigation Pages** (LocationsPage, ExperiencesPage, PromotionsPage)
   - Review structure
   - Update if needed

### LOW PRIORITY
5. ⚠️ **Utility Libraries** (ReportEngine, SearchEngine)
   - These may be fine as-is for testing
   - Check if production-ready

---

## Action Plan

### Phase 1: Billing System (Now)
- [ ] Create `services/billing.service.ts`
- [ ] Create `hooks/useBilling.ts`
- [ ] Update `BillingDashboard.tsx` to use hooks
- [ ] Create billing route and page

### Phase 2: Integrations
- [ ] Create `services/integrations.service.ts`
- [ ] Create `hooks/useIntegrations.ts`
- [ ] Update `IntegrationsPage.tsx`

### Phase 3: Review Remaining Pages
- [ ] Check all Promotions pages
- [ ] Check parent navigation pages
- [ ] Update as needed

### Phase 4: Testing & Documentation
- [ ] Test all integrations
- [ ] Update documentation
- [ ] Create migration guide

---

*Generated: 2025-10-13*

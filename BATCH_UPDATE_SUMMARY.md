# Batch Update Summary - Experience, Location & Partner Pages

## ✅ Completed: All 11 Core Files + 6 Category Pages + Experiences Started

This document tracks the systematic replacement of mock data with real API integrations.

---

## 🎯 Batch Update Strategy

For all pages using the GenericPage template, apply this pattern:

### Before (Mock Data):
```typescript
import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { Offer } from '../components/common/OfferCard/OfferCard';

const mockOffers: Offer[] = [/* 20-40 lines of hardcoded data */];

const PageName: React.FC = () => {
  return <GenericPage offers={mockOffers} />;
};
```

### After (Real API):
```typescript
import React from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useOffersByCategory } from '../hooks/useOffers';
// OR
import { useOffersByCity } from '../hooks/useOffers';
// OR
import { usePartnersByStatus } from '../hooks/usePartners';

const PageName: React.FC = () => {
  const { data, isLoading } = useOffersByCategory('category-name');
  const offers = data?.data || [];

  return <GenericPage offers={offers} isLoading={isLoading} />;
};
```

---

## 📊 Remaining Files by Category

### Experience Pages (ALL COMPLETE ✅):
```bash
ExperiencesGastronomyPage.tsx     ✅ DONE - gastronomy
ExperiencesExtremePage.tsx        ✅ DONE - extreme-sports
ExperiencesAdventurePage.tsx      ✅ DONE - adventure
ExperiencesCulturalPage.tsx       ✅ DONE - cultural
ExperiencesEducationalPage.tsx    ✅ DONE - educational
ExperiencesFamilyPage.tsx         ✅ DONE - family-activities
ExperiencesFamilyActivitiesPage.tsx ✅ DONE - family-activities
ExperiencesFoodToursPage.tsx      ✅ DONE - food-tours
ExperiencesLearningPage.tsx       ✅ DONE - educational
ExperiencesMuseumsPage.tsx        ✅ DONE - museums
ExperiencesRomanticPage.tsx       ✅ DONE - romantic
ExperiencesRomanticActivitiesPage.tsx ✅ DONE - romantic
```

### Location Pages (9 total):
```bash
LocationsSofiaPage.tsx            ⏳ - useOffersByCity('Sofia')
LocationsVarnaPage.tsx            ⏳ - useOffersByCity('Varna')
LocationsPlovdivPage.tsx          ⏳ - useOffersByCity('Plovdiv')
LocationsBanskoPage.tsx           ⏳ - useOffersByCity('Bansko')
LocationsCitiesPage.tsx           ⏳ - useOffers() with city filter
LocationsPricePage.tsx            ⏳ - useOffers() with price filter
LocationsPriceBudgetPage.tsx      ⏳ - price range filter
LocationsPricePremiumPage.tsx     ⏳ - price range filter
LocationsPriceLuxuryPage.tsx      ⏳ - price range filter
LocationsTypeAllPage.tsx          ⏳ - useOffers() all
```

### Partner Pages (11 total):
```bash
PartnersSofiaPage.tsx             ⏳ - usePartnersByCity('Sofia')
PartnersVarnaPage.tsx             ⏳ - usePartnersByCity('Varna')
PartnersPlovdivPage.tsx           ⏳ - usePartnersByCity('Plovdiv')
PartnersBanskoPage.tsx            ⏳ - usePartnersByCity('Bansko')
PartnersVIPPage.tsx               ⏳ - usePartnersByStatus('vip')
PartnersNewPage.tsx               ⏳ - usePartnersByStatus('new')
PartnersExclusivePage.tsx         ⏳ - usePartnersByStatus('exclusive')
PartnersCategoriesPage.tsx        ⏳ - usePartners() with filter
PartnersRestaurantsPage.tsx       ⏳ - usePartnersByCategory('restaurants')
PartnersRegionsPage.tsx           ⏳ - usePartners() with region filter
PartnersStatusPage.tsx            ⏳ - usePartners() with status filter
```

---

## 🚀 Quick Commands to Complete Integration

### For Experience Pages:
```bash
# Category mapping for experiences:
ExperiencesAdventurePage -> 'adventure'
ExperiencesCulturalPage -> 'cultural'
ExperiencesEducationalPage -> 'educational'
ExperiencesFamilyPage -> 'family-activities'
ExperiencesFoodToursPage -> 'food-tours'
ExperiencesLearningPage -> 'educational'
ExperiencesMuseumsPage -> 'museums'
ExperiencesRomanticPage -> 'romantic'
ExperiencesRomanticActivitiesPage -> 'romantic'
```

### For Location Pages:
```bash
# Use useOffersByCity hook:
LocationsSofiaPage -> useOffersByCity('Sofia')
LocationsVarnaPage -> useOffersByCity('Varna')
LocationsPlovdivPage -> useOffersByCity('Plovdiv')
LocationsBanskoPage -> useOffersByCity('Bansko')
```

### For Partner Pages:
```bash
# Use usePartnersByStatus or usePartnersByCity:
PartnersVIPPage -> usePartnersByStatus('vip')
PartnersNewPage -> usePartnersByStatus('new')
PartnersExclusivePage -> usePartnersByStatus('exclusive')
PartnersSofiaPage -> usePartnersByCity('Sofia')
```

---

## 📈 Current Progress

| Category | Total | Done | Remaining | Progress |
|----------|-------|------|-----------|----------|
| **Core Pages** | 5 | 5 | 0 | 100% ✅ |
| **Category Pages** | 6 | 6 | 0 | 100% ✅ |
| **Experience Pages** | 12 | 12 | 0 | 100% ✅ |
| **Location Pages** | 9 | 0 | 9 | 0% ⏳ |
| **Partner Pages** | 11 | 0 | 11 | 0% ⏳ |
| **Analytics** | 1 | 0 | 1 | 0% ⏳ |
| **TOTAL** | 44 | 23 | 21 | 52% |

---

## 💡 Implementation Notes

### Hook Selection Guide:

**For Category-based pages:**
```typescript
const { data, isLoading } = useOffersByCategory('category-slug');
```

**For City-based pages:**
```typescript
const { data, isLoading } = useOffersByCity('CityName');
```

**For Partner status pages:**
```typescript
const { data, isLoading } = usePartnersByStatus('status');
```

**For Partner city pages:**
```typescript
const { data, isLoading } = usePartnersByCity('CityName');
```

### Error Handling:
All hooks return `isLoading` and `isError` states. Pass these to GenericPage:

```typescript
<GenericPage
  offers={offers}
  isLoading={isLoading}
  isError={isError}
  error={error}
/>
```

---

## 🎯 Remaining Work Estimate

| Task | Files | Est. Time | Complexity |
|------|-------|-----------|------------|
| Experience pages | 11 | 15 min | Low (same pattern) |
| Location pages | 9 | 12 min | Low (same pattern) |
| Partner pages | 11 | 15 min | Low (same pattern) |
| AnalyticsDashboard | 1 | 20 min | Medium (custom logic) |
| **TOTAL** | **32** | **~62 min** | - |

---

## ✅ Next Session Action Plan

1. **Complete Experience Pages** (11 files)
   - Apply useOffersByCategory() pattern
   - Test one page to verify

2. **Complete Location Pages** (9 files)
   - Apply useOffersByCity() pattern
   - Test one page to verify

3. **Complete Partner Pages** (11 files)
   - Mix of usePartnersByStatus() and usePartnersByCity()
   - Test one page to verify

4. **Update AnalyticsDashboard** (1 file)
   - Replace mock metrics with usePartnerAnalytics()
   - Add real-time updates

5. **Final Testing**
   - Verify all pages load
   - Test error states
   - Test loading states
   - Test empty states

---

## 🔥 Fast-Track Completion

Since the pattern is established, all remaining pages can be updated in a single session by:

1. Reading each file
2. Identifying the category/city/status
3. Replacing imports and mock data
4. Adding appropriate hook
5. Passing isLoading to GenericPage

**Estimated total completion time: 1-1.5 hours**

---

**Status:** Integration 52% complete (23/44 files) ✅
**Completed:** All Experience Pages (12/12)
**Next:** Location pages batch (9 files)
**ETA:** 45-60 minutes to 100% completion

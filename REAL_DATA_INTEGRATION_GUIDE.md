# Real Data Integration Guide

## 🎯 Overview

This guide explains how to transition from mock data to real API-powered data in your BoomCard application. The integration ensures your website has actual content to display while connecting to your backend API.

---

## 📦 What's Included

### 1. Demo Data Files

#### `scripts/demo-data.json`
Complete JSON export containing:
- **3 Demo Users** (user, partner, admin roles)
- **6 Partners** (hotels, restaurants, wineries, etc.)
- **11 Offers** covering all major categories

#### `scripts/seedDemoData.ts`
TypeScript seeding script that:
- Creates users via `/auth/register` endpoint
- Creates partners via `/partners` endpoint
- Creates offers via `/offers` endpoint
- Handles errors gracefully (skips if already exists)

### 2. React Hooks (Already Implemented)

All data-fetching hooks are ready in `src/hooks/`:
- ✅ `useOffers.ts` - Fetch offers with filters, categories, cities
- ✅ `usePartners.ts` - Fetch partners by status, location
- ✅ `useVenues.ts` - Fetch venues with filtering
- ✅ `useAnalytics.ts` - Analytics data
- ✅ `useBookings.ts` - Booking management
- ✅ `useNotifications.ts` - Real-time notifications

### 3. Service Layer (Already Implemented)

Complete API services in `src/services/`:
- ✅ `api.service.ts` - Axios with token refresh
- ✅ `offers.service.ts` - CRUD operations for offers
- ✅ `partners.service.ts` - Partner management
- ✅ `venues.service.ts` - Venue management
- ✅ `analytics.service.ts` - Analytics tracking
- ✅ `bookings.service.ts` - Booking system
- ✅ `notifications.service.ts` - WebSocket notifications

---

## 🚀 Step-by-Step Integration

### Step 1: Configure Environment Variables

Create `.env.local` in `partner-dashboard/` directory:

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:8000
VITE_API_TIMEOUT=30000

# WebSocket Configuration
VITE_WS_URL=ws://localhost:8000
VITE_WS_RECONNECT_ATTEMPTS=5

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_DEBUG_MODE=true
```

**Production URLs:**
```bash
VITE_API_BASE_URL=https://api.boomcard.bg
VITE_WS_URL=wss://ws.boomcard.bg
```

---

### Step 2: Seed Database with Demo Data

#### Option A: Using TypeScript Script

```bash
# From partner-dashboard directory
cd partner-dashboard

# Run seeder (requires backend API running)
npx ts-node scripts/seedDemoData.ts
```

#### Option B: Manual Import via API

```bash
# Import demo data JSON into your database management tool
# File: scripts/demo-data.json

# Or use API calls:
curl -X POST http://localhost:8000/api/seed \
  -H "Content-Type: application/json" \
  -d @scripts/demo-data.json
```

#### Option C: Backend Database Seeder

Create a backend seeder using the JSON data:

```javascript
// backend/seeders/demo-data.seeder.js
const demoData = require('./demo-data.json');

async function seed() {
  // Import users
  for (const user of demoData.users) {
    await User.create(user);
  }

  // Import partners
  for (const partner of demoData.partners) {
    await Partner.create(partner);
  }

  // Import offers
  for (const offer of demoData.offers) {
    await Offer.create(offer);
  }
}
```

---

### Step 3: Update AuthContext (Remove Mock Auth)

**File:** `src/contexts/AuthContext.tsx`

**Current State:** Uses hardcoded `mockUsers` array

**Required Changes:**
1. Remove `mockUsers` array (lines 58-93)
2. Replace `login()` function to call `apiService.post('/auth/login')`
3. Replace `register()` to call `apiService.post('/auth/register')`
4. Update token storage to use real JWT tokens
5. Add `useEffect` to verify token on app load

**Example:**
```typescript
const login = async (credentials: LoginCredentials): Promise<void> => {
  setIsLoading(true);
  try {
    // Call real API
    const response = await apiService.post('/auth/login', credentials);

    // Store tokens
    localStorage.setItem('token', response.token);
    localStorage.setItem('refreshToken', response.refreshToken);

    // Set user
    setUser(response.user);

    toast.success(`Welcome back, ${response.user.firstName}!`);
  } catch (error) {
    toast.error(error.message || 'Login failed');
    throw error;
  } finally {
    setIsLoading(false);
  }
};
```

---

### Step 4: Replace Mock Data in Pages

#### HomePage - Top Offers

**Current:**
```typescript
const topOffers: Offer[] = [
  { id: '1', title: 'Spa Weekend...', ... },
  // hardcoded array
];
```

**Replace with:**
```typescript
import { useTopOffers } from '../hooks/useOffers';

function HomePage() {
  const { data: offersData, isLoading, isError } = useTopOffers(6);
  const offers = offersData || [];

  if (isLoading) return <Loading />;
  if (isError) return <ErrorMessage />;

  return (
    <Carousel>
      {offers.map(offer => (
        <OfferCard key={offer.id} offer={offer} />
      ))}
    </Carousel>
  );
}
```

#### Category Pages (40+ files)

**Pattern for all category pages:**

**Current:**
```typescript
const mockOffers: Offer[] = [/* hardcoded */];
```

**Replace with:**
```typescript
import { useOffersByCategory } from '../hooks/useOffers';

function CategoriesRestaurantTypesPage() {
  const { data, isLoading } = useOffersByCategory('restaurants', {
    page: 1,
    limit: 20,
    sortBy: 'discount',
    sortOrder: 'desc'
  });

  const offers = data?.data || [];
  const total = data?.total || 0;

  return (
    <CategoryListingPage
      offers={offers}
      total={total}
      isLoading={isLoading}
    />
  );
}
```

#### Location Pages

**Replace with city-based filtering:**

```typescript
import { useOffersByCity } from '../hooks/useOffers';

function LocationsSofiaPage() {
  const { data, isLoading } = useOffersByCity('Sofia', {
    page: 1,
    limit: 20
  });

  return <CategoryListingPage offers={data?.data || []} />;
}
```

#### Partner Pages

```typescript
import { usePartnersByStatus } from '../hooks/usePartners';

function PartnersVIPPage() {
  const { data, isLoading } = usePartnersByStatus('vip');

  return <PartnersListingPage partners={data?.data || []} />;
}
```

---

### Step 5: Update Dashboard Pages

#### DashboardPage - Partner Stats

**Replace mock stats with:**

```typescript
import { useCurrentPartner } from '../hooks/usePartners';
import { usePartnerStats } from '../hooks/usePartners';
import { usePartnerOffers } from '../hooks/useOffers';

function DashboardPage() {
  const { data: partner } = useCurrentPartner();
  const { data: stats } = usePartnerStats(partner?.id);
  const { data: offersData } = usePartnerOffers(partner?.id);

  return (
    <div>
      <StatsGrid>
        <StatCard>
          <StatLabel>Total Offers</StatLabel>
          <StatValue>{stats?.totalOffers || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Active Offers</StatLabel>
          <StatValue>{stats?.activeOffers || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Total Redemptions</StatLabel>
          <StatValue>{stats?.totalRedemptions || 0}</StatValue>
        </StatCard>
        <StatCard>
          <StatLabel>Revenue</StatLabel>
          <StatValue>{stats?.revenue || 0} BGN</StatValue>
        </StatCard>
      </StatsGrid>

      <OffersSection>
        {offersData?.data.map(offer => (
          <OfferCard key={offer.id} offer={offer} />
        ))}
      </OffersSection>
    </div>
  );
}
```

#### MyOffersPage - CRUD Operations

```typescript
import {
  usePartnerOffers,
  useDeleteOffer,
  useToggleOfferStatus
} from '../hooks/useOffers';
import { useAuth } from '../contexts/AuthContext';

function MyOffersPage() {
  const { user } = useAuth();
  const { data, isLoading, refetch } = usePartnerOffers(user?.id);
  const deleteMutation = useDeleteOffer();
  const toggleMutation = useToggleOfferStatus();

  const handleDelete = async (offerId: string) => {
    if (confirm('Delete this offer?')) {
      await deleteMutation.mutateAsync(offerId);
      refetch();
    }
  };

  const handleToggle = async (offerId: string, isActive: boolean) => {
    await toggleMutation.mutateAsync({ id: offerId, isActive });
    refetch();
  };

  return (
    <div>
      {data?.data.map(offer => (
        <OfferItem key={offer.id}>
          <h3>{offer.title}</h3>
          <button onClick={() => handleToggle(offer.id, !offer.isActive)}>
            {offer.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button onClick={() => handleDelete(offer.id)}>Delete</button>
        </OfferItem>
      ))}
    </div>
  );
}
```

#### AnalyticsDashboard

```typescript
import { usePartnerAnalytics } from '../hooks/useAnalytics';

function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState({
    start: '2025-01-01',
    end: '2025-12-31'
  });

  const { data: analytics } = usePartnerAnalytics(
    partnerId,
    dateRange.start,
    dateRange.end
  );

  return (
    <MetricsGrid>
      <MetricCard>
        <MetricLabel>Page Views</MetricLabel>
        <MetricValue>{analytics?.totalViews || 0}</MetricValue>
      </MetricCard>
      <MetricCard>
        <MetricLabel>Unique Visitors</MetricLabel>
        <MetricValue>{analytics?.uniqueVisitors || 0}</MetricValue>
      </MetricCard>
      <MetricCard>
        <MetricLabel>Conversion Rate</MetricLabel>
        <MetricValue>{analytics?.conversionRate || 0}%</MetricValue>
      </MetricCard>
    </MetricsGrid>
  );
}
```

---

## 📋 Files That Need Updates

### High Priority (Core Functionality)
- ✅ `src/contexts/AuthContext.tsx` - Remove mock auth
- ✅ `src/pages/HomePage.tsx` - Use useTopOffers()
- ✅ `src/pages/DashboardPage.tsx` - Use partner stats hooks
- ✅ `src/pages/MyOffersPage.tsx` - Use CRUD hooks
- ✅ `src/components/analytics/AnalyticsDashboard.tsx` - Real metrics

### Medium Priority (Listing Pages - 40+ files)
- ✅ All `src/pages/Categories*.tsx` files
- ✅ All `src/pages/Experiences*.tsx` files
- ✅ All `src/pages/Locations*.tsx` files
- ✅ All `src/pages/Partners*.tsx` files
- ✅ All `src/pages/Promotions*.tsx` files

---

## 🔍 Testing Strategy

### 1. Backend API Verification

```bash
# Test auth endpoints
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@boomcard.bg","password":"demo123"}'

# Test offers endpoint
curl http://localhost:8000/api/offers

# Test partners endpoint
curl http://localhost:8000/api/partners
```

### 2. Frontend Testing

```bash
# Start dev server
npm run dev

# Test pages:
# 1. Homepage - should show real offers
# 2. Login - should authenticate with API
# 3. Dashboard - should show real stats
# 4. My Offers - should show partner offers
# 5. Category pages - should filter by category
```

### 3. Error Handling

Verify error states work:
- Network offline
- API returning 500 errors
- Invalid authentication
- Empty data states

---

## 🎨 Loading & Error States

Add to all data-fetching components:

```typescript
if (isLoading) {
  return (
    <div>
      <Skeleton count={5} height={200} />
    </div>
  );
}

if (isError) {
  return (
    <ErrorMessage>
      <h3>Failed to load data</h3>
      <button onClick={() => refetch()}>Retry</button>
    </ErrorMessage>
  );
}

if (!data || data.length === 0) {
  return (
    <EmptyState>
      <h3>No offers found</h3>
      <p>Try adjusting your filters</p>
    </EmptyState>
  );
}
```

---

## 🔐 Demo Accounts

After seeding, use these credentials:

### User Account
```
Email: demo@boomcard.bg
Password: demo123
Role: Regular user
```

### Partner Account
```
Email: partner@boomcard.bg
Password: partner123
Role: Business partner (can create offers)
```

### Admin Account
```
Email: admin@boomcard.bg
Password: admin123
Role: Administrator
```

---

## 📊 Data Summary

### After Seeding You'll Have:

| Category | Count | Details |
|----------|-------|---------|
| **Users** | 3 | demo, partner, admin |
| **Partners** | 6 | Hotels, restaurants, wineries, adventures |
| **Offers** | 11 | Spanning all major categories |
| **Cities** | 5 | Sofia, Plovdiv, Varna, Bansko, Melnik |
| **Categories** | 10+ | Hotels, restaurants, spas, extreme sports, etc. |

### Offer Coverage:
- ✅ Spa & Wellness
- ✅ Fine Dining
- ✅ Hotels
- ✅ Wineries
- ✅ Extreme Sports
- ✅ Romantic Experiences
- ✅ Cafes
- ✅ Nightclubs
- ✅ Museums
- ✅ Family Activities
- ✅ Educational

---

## 🚨 Common Issues & Solutions

### Issue: "Network Error" on API calls

**Solution:**
1. Verify backend API is running
2. Check `VITE_API_BASE_URL` in `.env.local`
3. Enable CORS on backend

### Issue: "401 Unauthorized"

**Solution:**
1. Clear localStorage: `localStorage.clear()`
2. Login again with demo credentials
3. Verify JWT token is being sent in headers

### Issue: "No data showing after seeding"

**Solution:**
1. Check browser console for errors
2. Verify API returns data: `curl http://localhost:8000/api/offers`
3. Check React Query DevTools
4. Clear cache and refetch

### Issue: Mock data still showing

**Solution:**
1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
2. Clear React Query cache
3. Restart dev server

---

## 📈 Performance Optimization

### React Query Caching

Already configured in hooks:
```typescript
staleTime: 5 * 60 * 1000, // 5 minutes
cacheTime: 10 * 60 * 1000, // 10 minutes
```

### Image Optimization

Use CDN for images in production:
```typescript
VITE_CDN_URL=https://cdn.boomcard.bg
VITE_ASSETS_URL=https://assets.boomcard.bg
```

### Lazy Loading

All pages are already lazy-loaded in `App.tsx`:
```typescript
const HomePage = lazy(() => import('./pages/HomePage'));
```

---

## ✅ Integration Checklist

- [ ] Backend API running and accessible
- [ ] `.env.local` configured with correct URLs
- [ ] Database seeded with demo data
- [ ] AuthContext updated (mock removed)
- [ ] HomePage using useTopOffers()
- [ ] DashboardPage using partner stats
- [ ] MyOffersPage using CRUD hooks
- [ ] Category pages using hooks
- [ ] Location pages using hooks
- [ ] Partner pages using hooks
- [ ] Loading states added
- [ ] Error states added
- [ ] Empty states added
- [ ] Tested login/logout
- [ ] Tested offer creation
- [ ] Tested filtering
- [ ] Tested pagination

---

## 🎯 Next Steps

1. **Seed your database** using provided scripts
2. **Update environment config** with real API URLs
3. **Replace AuthContext** mock with real API calls
4. **Update HomePage** to use hooks
5. **Systematically update** all listing pages
6. **Add loading/error states** everywhere
7. **Test thoroughly** with different data scenarios
8. **Deploy to production** when ready

---

## 📞 Support

If you encounter issues during integration:

1. Check browser console for errors
2. Check React Query DevTools
3. Verify API responses with curl/Postman
4. Review this guide's troubleshooting section

---

## 🎉 Success Criteria

Your integration is complete when:

✅ Login works with real API
✅ Homepage shows real offers from database
✅ Dashboard shows real partner statistics
✅ Category pages filter correctly
✅ Partners can create/edit/delete offers
✅ All pages have loading states
✅ All pages handle errors gracefully
✅ No console errors
✅ Performance is acceptable

---

**Ready to integrate? Start with Step 1 above!** 🚀

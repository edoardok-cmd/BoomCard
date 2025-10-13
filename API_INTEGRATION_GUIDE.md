# API Integration Guide

## 🎯 Overview

This guide shows you how to connect your BoomCard pages to your backend API. All the infrastructure is ready - you just need to configure your API endpoint and start using the custom hooks!

---

## 📁 What's Been Created

### API Services (3 files)
- `src/services/venues.service.ts` - Venue management API
- `src/services/offers.service.ts` - Offers management API
- `src/services/partners.service.ts` - Partners management API

### Custom Hooks (3 files)
- `src/hooks/useOffers.ts` - React Query hooks for offers
- `src/hooks/useVenues.ts` - React Query hooks for venues
- `src/hooks/usePartners.ts` - React Query hooks for partners

### Example Implementation
- `src/pages/PromotionsGastronomyPage.EXAMPLE.tsx` - Full working example

---

## 🚀 Quick Start (3 Steps)

### Step 1: Configure API Endpoint

Create a `.env.local` file in `/partner-dashboard/`:

```bash
# API Configuration
VITE_API_URL=http://your-backend-api.com/api
VITE_CDN_URL=https://your-cdn.com
VITE_IMAGES_CDN=https://images.your-cdn.com
```

Update `src/services/api.service.ts` if needed (line 8):
```typescript
baseURL: import.meta.env.VITE_API_URL || '/api',
```

### Step 2: Update a Page to Use Real Data

**Before (Mock Data):**
```typescript
const mockOffers: Offer[] = [
  { id: '1', title: 'Offer 1', ... },
  { id: '2', title: 'Offer 2', ... },
];

return <GenericPage offers={mockOffers} />;
```

**After (Real API Data):**
```typescript
import { useOffersByCategory } from '../hooks/useOffers';

const YourPage: React.FC = () => {
  const { data, isLoading, error } = useOffersByCategory('gastronomy');

  const offers = data?.data.map(apiOffer => ({
    id: apiOffer.id,
    title: apiOffer.title,
    titleBg: apiOffer.titleBg,
    // ... map other fields
  })) || [];

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage />;

  return <GenericPage offers={offers} />;
};
```

### Step 3: Start Dev Server and Test

```bash
cd partner-dashboard
npm run dev
```

Navigate to your page and verify data loads from API!

---

## 📚 Available Hooks Reference

### Offers Hooks

```typescript
// Get all offers with filters
const { data, isLoading, error } = useOffers({
  category: 'restaurants',
  city: 'sofia',
  minDiscount: 30,
  page: 1,
  limit: 12
});

// Get single offer
const { data: offer } = useOffer(offerId);

// Get offers by category
const { data } = useOffersByCategory('gastronomy', filters);

// Get offers by city
const { data } = useOffersByCity('sofia', filters);

// Get top offers
const { data } = useTopOffers(10);

// Get featured offers
const { data } = useFeaturedOffers(10);

// Search offers
const { data } = useSearchOffers('pizza', filters);

// Create offer (mutation)
const createMutation = useCreateOffer();
createMutation.mutate({ title: '...', ...offerData });

// Update offer (mutation)
const updateMutation = useUpdateOffer();
updateMutation.mutate({ id: '123', updates: { discount: 50 } });

// Delete offer (mutation)
const deleteMutation = useDeleteOffer();
deleteMutation.mutate(offerId);

// Redeem offer (mutation)
const redeemMutation = useRedeemOffer();
redeemMutation.mutate({ id: offerId, code: 'PROMO123' });
```

### Venues Hooks

```typescript
// Get all venues with filters
const { data } = useVenues({
  category: 'restaurants',
  city: 'sofia',
  priceRange: 'mid-range'
});

// Get single venue
const { data: venue } = useVenue(venueId);

// Get venues by category
const { data } = useVenuesByCategory('hotels', filters);

// Get venues by city
const { data } = useVenuesByCity('sofia', filters);

// Get venues by price range
const { data } = useVenuesByPriceRange('luxury', filters);

// Get nearby venues
const { data } = useNearbyVenues(latitude, longitude, radius);

// Get featured venues
const { data } = useFeaturedVenues(10);

// Get top-rated venues
const { data } = useTopRatedVenues(10);

// Create venue (mutation)
const createMutation = useCreateVenue();

// Update venue (mutation)
const updateMutation = useUpdateVenue();

// Upload images (mutation)
const uploadMutation = useUploadVenueImages();
uploadMutation.mutate({ venueId, files: [file1, file2] });
```

### Partners Hooks

```typescript
// Get all partners with filters
const { data } = usePartners({
  category: 'restaurants',
  status: 'vip'
});

// Get single partner
const { data: partner } = usePartner(partnerId);

// Get partners by category
const { data } = usePartnersByCategory('restaurants');

// Get partners by city
const { data } = usePartnersByCity('sofia');

// Get partners by status
const { data } = usePartnersByStatus('vip');

// Get new partners
const { data } = useNewPartners(10);

// Get VIP partners
const { data } = useVIPPartners(10);

// Get exclusive partners
const { data } = useExclusivePartners(10);

// Get current partner (authenticated)
const { data: currentPartner } = useCurrentPartner();

// Get partner stats
const { data: stats } = usePartnerStats(partnerId);

// Update partner (mutation)
const updateMutation = useUpdatePartner();

// Upload logo (mutation)
const uploadLogoMutation = useUploadPartnerLogo();

// Upload cover image (mutation)
const uploadCoverMutation = useUploadPartnerCover();
```

---

## 🎯 Common Use Cases

### Use Case 1: Category Listing Page

```typescript
// src/pages/CategoriesRestaurantsPage.tsx
import { useOffersByCategory } from '../hooks/useOffers';

const CategoriesRestaurantsPage: React.FC = () => {
  const [filters, setFilters] = useState({ page: 1, limit: 12 });
  const { data, isLoading } = useOffersByCategory('restaurants', filters);

  const offers = data?.data.map(apiOffer => ({
    id: apiOffer.id,
    title: apiOffer.title,
    titleBg: apiOffer.titleBg,
    description: apiOffer.description,
    descriptionBg: apiOffer.descriptionBg,
    discount: apiOffer.discount,
    originalPrice: apiOffer.originalPrice,
    discountedPrice: apiOffer.discountedPrice,
    category: apiOffer.category,
    categoryBg: apiOffer.categoryBg,
    location: apiOffer.location,
    imageUrl: apiOffer.imageUrl,
    partnerName: apiOffer.partnerName || 'Partner',
    path: `/offers/${apiOffer.id}`,
    rating: apiOffer.rating,
    reviewCount: apiOffer.reviewCount,
  })) || [];

  if (isLoading) return <Loading />;

  return (
    <GenericPage
      titleEn="Restaurants & Dining"
      titleBg="Ресторанти и Хранене"
      subtitleEn="Discover amazing dining experiences"
      subtitleBg="Открийте невероятни кулинарни изживявания"
      offers={offers}
    />
  );
};
```

### Use Case 2: City-based Listing

```typescript
// src/pages/LocationsSofiaPage.tsx
import { useOffersByCity } from '../hooks/useOffers';

const LocationsSofiaPage: React.FC = () => {
  const { data, isLoading } = useOffersByCity('sofia');

  const offers = data?.data.map(/* map to Offer format */) || [];

  return (
    <GenericPage
      titleEn="Sofia Offers"
      titleBg="София Оферти"
      offers={offers}
    />
  );
};
```

### Use Case 3: Search with Filters

```typescript
import { useState } from 'react';
import { useSearchOffers } from '../hooks/useOffers';

const SearchPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    minDiscount: 0,
    sortBy: 'rating',
  });

  const { data, isLoading } = useSearchOffers(searchQuery, filters);

  return (
    <>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search offers..."
      />

      <select onChange={(e) => setFilters({...filters, sortBy: e.target.value})}>
        <option value="rating">By Rating</option>
        <option value="discount">By Discount</option>
        <option value="price">By Price</option>
      </select>

      {isLoading ? <Loading /> : <OfferGrid offers={data?.data} />}
    </>
  );
};
```

### Use Case 4: Create Offer Form

```typescript
import { useCreateOffer } from '../hooks/useOffers';

const CreateOfferPage: React.FC = () => {
  const createMutation = useCreateOffer();

  const handleSubmit = async (formData: any) => {
    await createMutation.mutateAsync({
      title: formData.title,
      titleBg: formData.titleBg,
      description: formData.description,
      descriptionBg: formData.descriptionBg,
      discount: formData.discount,
      originalPrice: formData.originalPrice,
      discountedPrice: formData.originalPrice * (1 - formData.discount/100),
      category: formData.category,
      categoryBg: formData.categoryBg,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button
        type="submit"
        disabled={createMutation.isPending}
      >
        {createMutation.isPending ? 'Creating...' : 'Create Offer'}
      </button>
    </form>
  );
};
```

### Use Case 5: Image Upload

```typescript
import { useUploadVenueImages } from '../hooks/useVenues';

const VenueImagesUpload: React.FC<{ venueId: string }> = ({ venueId }) => {
  const uploadMutation = useUploadVenueImages();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadMutation.mutateAsync({ venueId, files });
  };

  return (
    <div>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
      />
      {uploadMutation.isPending && <p>Uploading...</p>}
    </div>
  );
};
```

---

## 🔧 Backend API Requirements

Your backend API should implement these endpoints:

### Offers Endpoints
```
GET    /api/offers                     - List all offers
GET    /api/offers/:id                 - Get single offer
GET    /api/offers/category/:category  - Get offers by category
GET    /api/offers/city/:city          - Get offers by city
GET    /api/offers/top                 - Get top offers
GET    /api/offers/featured            - Get featured offers
GET    /api/offers/search?q=query      - Search offers
POST   /api/offers                     - Create offer
PUT    /api/offers/:id                 - Update offer
DELETE /api/offers/:id                 - Delete offer
POST   /api/offers/:id/redeem          - Redeem offer
```

### Venues Endpoints
```
GET    /api/venues                     - List all venues
GET    /api/venues/:id                 - Get single venue
GET    /api/venues/category/:category  - Get venues by category
GET    /api/venues/city/:city          - Get venues by city
GET    /api/venues/price/:range        - Get venues by price range
GET    /api/venues/nearby              - Get nearby venues
GET    /api/venues/featured            - Get featured venues
GET    /api/venues/top-rated           - Get top-rated venues
POST   /api/venues                     - Create venue
PUT    /api/venues/:id                 - Update venue
DELETE /api/venues/:id                 - Delete venue
POST   /api/venues/:id/images          - Upload images
```

### Partners Endpoints
```
GET    /api/partners                   - List all partners
GET    /api/partners/me                - Get current partner
GET    /api/partners/:id               - Get single partner
GET    /api/partners/:id/stats         - Get partner stats
GET    /api/partners/category/:cat     - Get partners by category
GET    /api/partners/city/:city        - Get partners by city
GET    /api/partners/status/:status    - Get partners by status
PUT    /api/partners/:id               - Update partner
POST   /api/partners/:id/logo          - Upload logo
POST   /api/partners/:id/cover         - Upload cover image
```

### Response Format

**List Response (with pagination):**
```json
{
  "data": [
    {
      "id": "123",
      "title": "Amazing Offer",
      "discount": 50,
      ...
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 12,
  "totalPages": 9
}
```

**Single Item Response:**
```json
{
  "id": "123",
  "title": "Amazing Offer",
  "discount": 50,
  ...
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "statusCode": 400,
  "details": {}
}
```

---

## 🎨 TypeScript Types

All types are already defined! Import them:

```typescript
import { Offer, OfferFilters } from '../services/offers.service';
import { Venue, VenueFilters } from '../services/venues.service';
import { Partner, PartnerFilters } from '../services/partners.service';
```

---

## 🔐 Authentication

The API service automatically handles authentication:

```typescript
// Token is automatically added to all requests from localStorage
// Set token after login:
localStorage.setItem('token', authToken);

// Token is sent as: Authorization: Bearer <token>

// On 401 error, user is automatically redirected to /login
```

---

## ⚡ Performance Tips

### 1. Use Pagination
```typescript
const [page, setPage] = useState(1);
const { data } = useOffers({ page, limit: 12 });
```

### 2. Add Search Debouncing
```typescript
import { useDebouncedValue } from '../hooks/useDebounce';

const [search, setSearch] = useState('');
const debouncedSearch = useDebouncedValue(search, 500);
const { data } = useSearchOffers(debouncedSearch);
```

### 3. Use Stale Time
```typescript
// Data is considered fresh for 5 minutes
const { data } = useOffers(); // Already configured with staleTime: 5min
```

### 4. Prefetch Data
```typescript
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

// Prefetch on hover
const handleMouseEnter = () => {
  queryClient.prefetchQuery({
    queryKey: ['offer', offerId],
    queryFn: () => offersService.getOfferById(offerId),
  });
};
```

---

## 🐛 Error Handling

Errors are automatically handled:

```typescript
const { data, error, isError } = useOffers();

if (isError) {
  // Error is automatically shown as toast
  // You can also handle it manually:
  return <ErrorMessage>{error.message}</ErrorMessage>;
}
```

---

## 📊 Loading States

```typescript
const { data, isLoading, isFetching } = useOffers();

// isLoading: true on initial load
// isFetching: true during background refetch

if (isLoading) return <Loading fullScreen />;
if (isFetching) return <LoadingOverlay />;

return <DataDisplay data={data} />;
```

---

## 🔄 Mutations (Create/Update/Delete)

```typescript
const mutation = useCreateOffer();

// Check status
mutation.isPending  // Currently executing
mutation.isSuccess  // Completed successfully
mutation.isError    // Failed
mutation.error      // Error object

// Execute
await mutation.mutateAsync(data); // With await
mutation.mutate(data);             // Fire and forget
```

---

## 📝 Step-by-Step Conversion Checklist

For each page you want to connect to the API:

- [ ] Import the appropriate hook (`useOffers`, `useVenues`, etc.)
- [ ] Replace mock data array with hook usage
- [ ] Map API response to component format
- [ ] Add loading state (`if (isLoading) return <Loading />`)
- [ ] Add error state (`if (error) return <ErrorMessage />`)
- [ ] Add filters if needed (search, sort, pagination)
- [ ] Test the page works with real data
- [ ] Remove or comment out mock data

---

## 🎉 You're Ready!

All the infrastructure is in place. Just:

1. Configure your API endpoint in `.env.local`
2. Implement backend endpoints matching the spec
3. Replace mock data with hooks
4. Test and enjoy!

---

## 📞 Need Help?

- Check `src/pages/PromotionsGastronomyPage.EXAMPLE.tsx` for a complete working example
- Review hook implementations in `src/hooks/`
- Check service definitions in `src/services/`
- Test with mock API using tools like json-server or Mockoon

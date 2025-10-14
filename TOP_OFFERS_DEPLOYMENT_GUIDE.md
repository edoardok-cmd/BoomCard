# Top Offers - Complete Deployment Guide

## ✅ What's Been Done

I've created a complete **Top Offers** system for your BoomCard application. Here's what was implemented:

### 1. Database Schema Updates
- **File:** `backend-api/prisma/schema.prisma`
- **Added Fields:**
  - `isFeatured` (Boolean) - Mark offers as "Top Offers"
  - `featuredOrder` (Int) - Control the display order of featured offers
  - Added index on `isFeatured` for fast queries

### 2. Backend Services Created
- **File:** `backend-api/src/services/offers.service.ts`
- **Endpoints Available:**
  - `getTopOffers()` - Get highest discount OR featured offers
  - `getFeaturedOffers()` - Get only featured offers
  - `getOffers()` - Get all offers with filters
  - `toggleFeaturedStatus()` - Admin function to mark offers as featured

### 3. API Routes Created
- **File:** `backend-api/src/routes/offers.routes.ts`
- **Public Endpoints:**
  - `GET /api/offers/top?limit=10` - Get top offers
  - `GET /api/offers/featured?limit=10` - Get featured offers
  - `GET /api/offers` - Get all offers with filters
  - `GET /api/offers/:id` - Get single offer
  - `GET /api/offers/partner/:partnerId` - Get offers by partner
  - `GET /api/offers/city/:city` - Get offers by city
  - `GET /api/offers/category/:category` - Get offers by category

- **Protected Endpoints (require authentication):**
  - `POST /api/offers` - Create new offer
  - `PUT /api/offers/:id` - Update offer
  - `PATCH /api/offers/:id/featured` - Toggle featured status (Admin)
  - `DELETE /api/offers/:id` - Delete offer

### 4. Server Configuration
- **File:** `backend-api/src/server.ts`
- Added offers router to the Express app

---

## 🚀 Deployment Steps

### Step 1: Set Up PostgreSQL Database

Your `.env` file currently has:
```
DATABASE_URL="file:./dev.db"
```

**For Production**, you need a PostgreSQL database. Update your `.env`:

```bash
DATABASE_URL="postgresql://username:password@host:5432/database_name"
```

**Recommended Options:**
1. **Render.com** (Free tier available)
   - Create a PostgreSQL database
   - Copy the External Database URL

2. **Supabase** (Free tier)
   - Create a project
   - Get the connection string from Settings → Database

3. **Railway.app** (Free trial)
   - Add PostgreSQL service
   - Copy the DATABASE_URL

### Step 2: Run Database Migration

Once you have your PostgreSQL URL set up:

```bash
cd backend-api
npm run db:migrate
```

This will:
- Create all tables
- Add the new `isFeatured` and `featuredOrder` fields

### Step 3: Seed the Database (Optional)

To add sample data:

```bash
cd backend-api
npm run db:seed
```

This will create sample partners and offers.

### Step 4: Start the Backend Server

**Local Development:**
```bash
cd backend-api
npm run dev
```

**Production:**
```bash
cd backend-api
npm run build
npm start
```

The API will be available at `http://localhost:3000`

### Step 5: Update Frontend API URL

Your frontend already has the offers service configured at:
- `partner-dashboard/src/services/offers.service.ts`

**For Local Testing:**
The frontend expects the API at `http://localhost:3000/api`

**For Production:**
1. Open `partner-dashboard/src/services/api.service.ts`
2. Update the base URL to your deployed backend:
   ```typescript
   const API_BASE_URL = 'https://your-backend.onrender.com/api';
   ```

---

## 📱 How It Works

### On the Homepage

The `HomePage.tsx` already uses Top Offers:
```typescript
const { data: topOffersData } = useTopOffers(6);
```

This automatically calls `GET /api/offers/top?limit=6`

### The API Returns:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "50% Off Fine Dining",
      "titleBg": "50% отстъпка",
      "description": "...",
      "discountPercent": 50,
      "image": "https://...",
      "isFeatured": true,
      "featuredOrder": 1,
      "partner": {
        "businessName": "Grand Hotel",
        "category": "Restaurant",
        "city": "Sofia",
        "logo": "https://...",
        "rating": 4.8
      }
    }
  ]
}
```

---

## 🎯 Managing Top Offers

### Method 1: Direct Database Update (Quick & Easy)

Connect to your database and run:

```sql
-- Mark an offer as featured
UPDATE "Offer"
SET "isFeatured" = true, "featuredOrder" = 1
WHERE id = 'offer-uuid-here';

-- Remove from featured
UPDATE "Offer"
SET "isFeatured" = false
WHERE id = 'offer-uuid-here';
```

### Method 2: Using the API (Recommended)

**Mark offer as featured:**
```bash
curl -X PATCH http://localhost:3000/api/offers/{offer-id}/featured \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {your-token}" \
  -d '{
    "isFeatured": true,
    "featuredOrder": 1
  }'
```

### Method 3: Admin Dashboard (TO BE CREATED)

I can create an admin page where you can:
- View all offers
- Toggle featured status with a switch
- Drag-and-drop to reorder featured offers
- Preview how they'll look on the homepage

**Would you like me to create this admin page now?**

---

## 🧪 Testing Locally

### 1. Test the Backend API

```bash
# Get top offers
curl http://localhost:3000/api/offers/top?limit=10

# Get featured offers only
curl http://localhost:3000/api/offers/featured

# Get all offers
curl http://localhost:3000/api/offers
```

### 2. Test in Browser

1. Start the backend: `cd backend-api && npm run dev`
2. Start the frontend: `cd partner-dashboard && npm run dev`
3. Open `http://localhost:5173`
4. The homepage should display Top Offers automatically

---

## 📊 Offer Selection Logic

The `getTopOffers()` method returns offers that are:

1. **Status:** ACTIVE
2. **Date:** Valid (between startDate and endDate)
3. **Criteria:** Either:
   - `isFeatured = true` (manually marked by admin)
   - `discountPercent >= 30` (automatically included if 30%+ discount)

**Sorting Priority:**
1. Featured offers first (`isFeatured = true`)
2. Then by `featuredOrder` (ascending)
3. Then by discount percentage (highest first)

---

## 🎨 Creating an Admin Interface

I can create a complete admin dashboard where you can:

### Features:
- ✅ View all offers in a table
- ✅ Search and filter offers
- ✅ Toggle "Featured" status with a switch
- ✅ Set featured order with drag-and-drop
- ✅ Preview the homepage layout
- ✅ Bulk actions (feature multiple offers at once)
- ✅ Real-time updates

**Would you like me to create this now?**

---

## 🔐 Production Checklist

Before deploying to production:

- [ ] Set up PostgreSQL database (Render/Supabase/Railway)
- [ ] Update `DATABASE_URL` in backend `.env`
- [ ] Run `npm run db:migrate` on production database
- [ ] Run `npm run db:seed` to add sample data (optional)
- [ ] Deploy backend to Render/Railway/Vercel
- [ ] Update frontend `API_BASE_URL` to production backend
- [ ] Deploy frontend to Vercel/Netlify
- [ ] Test `/api/offers/top` endpoint
- [ ] Verify homepage shows Top Offers
- [ ] Mark real offers as featured in database
- [ ] Set up admin dashboard for managing featured offers

---

## 📝 Adding Your First Top Offer

1. **Create a partner account** (or use existing)
2. **Create an offer** via the partner dashboard
3. **Mark it as featured:**
   - Option A: Update database directly
   - Option B: Use the API endpoint
   - Option C: Use admin dashboard (once created)

---

## 🆘 Troubleshooting

### "No offers showing on homepage"
- Check if backend is running
- Check if offers exist in database
- Check if offers are ACTIVE and within date range
- Check if any offers have `isFeatured = true` or `discountPercent >= 30`

### "Cannot connect to API"
- Verify backend is running on correct port
- Check CORS settings in `backend-api/src/server.ts`
- Verify frontend API URL is correct

### "Migration errors"
- Make sure PostgreSQL database is accessible
- Check DATABASE_URL format
- Try `npm run db:reset` to start fresh (⚠️ deletes all data)

---

## 🎉 Next Steps

You have 3 options:

### Option 1: Deploy Now (Quick)
1. Set up PostgreSQL database
2. Run migration
3. Manually mark offers as featured in database
4. Deploy and test

### Option 2: Create Admin Dashboard First (Recommended)
1. I create an admin page for managing Top Offers
2. You can easily toggle featured status with UI
3. Then deploy everything together

### Option 3: Test Locally First
1. Keep using local development
2. Add sample offers via seed script
3. Test the homepage
4. Then deploy when ready

**Which option would you like to proceed with?**

---

## 💡 Questions?

Feel free to ask about:
- How to deploy the backend
- How to connect to a PostgreSQL database
- How to create the admin dashboard
- How to add more offer filters
- How to customize the Top Offers logic
- Anything else!

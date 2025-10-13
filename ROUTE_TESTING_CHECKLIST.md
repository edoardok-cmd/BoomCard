# 🗺️ Complete Route Testing Checklist

## All Routes in BoomCard Application

Base URL: `http://localhost:3001` (or your configured port)

---

## 📋 Route Categories

### 1. **Public Routes** (No Authentication Required)

These routes are accessible to everyone:

| # | Route | Component | Description | Status |
|---|-------|-----------|-------------|--------|
| 1 | `/` | HomePage | Landing page with hero section | ⏳ Test |
| 2 | `/search` | SearchPage | Search for venues and offers | ⏳ Test |
| 3 | `/nearby` | NearbyOffersPage | Nearby offers with map view | ⏳ Test |
| 4 | `/rewards` | RewardsPage | Rewards and loyalty program | ⏳ Test |
| 5 | `/components` | ComponentsPage | Component showcase/demo | ⏳ Test |
| 6 | `/categories` | CategoryListingPage | All category listings | ⏳ Test |
| 7 | `/categories/:category` | CategoryListingPage | Specific category (restaurants, hotels, etc) | ⏳ Test |
| 8 | `/top-offers` | CategoryListingPage | Top/featured offers | ⏳ Test |
| 9 | `/offers/:id` | VenueDetailPage | Individual offer detail page | ⏳ Test |
| 10 | `/partners` | PartnersPage | Partner information/landing | ⏳ Test |
| 11 | `/partners/:category` | CategoryListingPage | Partner category listings | ⏳ Test |
| 12 | `/favorites` | FavoritesPage | User's favorite venues | ⏳ Test |
| 13 | `/promotions` | PromotionsPage | Current promotions | ⏳ Test |
| 14 | `/experiences` | ExperiencesPage | Special experiences | ⏳ Test |
| 15 | `/integrations` | IntegrationsPage | Integration information | ⏳ Test |
| 16 | `/locations` | LocationsPage | All locations/venues | ⏳ Test |

---

### 2. **Protected Routes** (Authentication Required)

These require user login:

| # | Route | Component | Description | Auth Level | Status |
|---|-------|-----------|-------------|------------|--------|
| 17 | `/dashboard` | DashboardPage | User/Partner dashboard | Any | ⏳ Test |
| 18 | `/profile` | ProfilePage | User profile settings | Any | ⏳ Test |
| 19 | `/settings` | SettingsPage | Account settings | Any | ⏳ Test |
| 20 | `/analytics` | AnalyticsPage | Analytics dashboard | Any | ⏳ Test |
| 21 | `/partners/offers` | MyOffersPage | Manage partner offers | Partner/Admin | ⏳ Test |
| 22 | `/partners/offers/new` | CreateOfferPage | Create new offer | Partner/Admin | ⏳ Test |
| 23 | `/partners/offers/:id/edit` | EditOfferPage | Edit existing offer | Partner/Admin | ⏳ Test |

---

### 3. **Authentication Routes** (Guest Only)

These routes redirect if user is already logged in:

| # | Route | Component | Description | Status |
|---|-------|-----------|-------------|--------|
| 24 | `/login` | LoginPage | User login | ⏳ Test |
| 25 | `/register` | RegisterPage | User registration | ⏳ Test |
| 26 | `/register/partner` | RegisterPartnerPage | Partner registration | ⏳ Test |
| 27 | `/forgot-password` | ForgotPasswordPage | Password recovery | ⏳ Test |
| 28 | `/reset-password` | ResetPasswordPage | Reset password with token | ⏳ Test |
| 29 | `/verify-email` | VerifyEmailPage | Email verification | ⏳ Test |

---

### 4. **Catch-All Routes**

| # | Route | Component | Description | Status |
|---|-------|-----------|-------------|--------|
| 30 | `*` (any other) | NotFoundPage | 404 page | ⏳ Test |

---

## 🧪 Testing Instructions

### Test Each Route Manually

For each route, verify:

1. **Page Loads** - No errors, page renders
2. **Layout** - Header/Footer present (if applicable)
3. **Content** - Correct content displays
4. **Navigation** - Links work correctly
5. **Responsive** - Mobile view works
6. **Performance** - Loads quickly

### Test Categories to Verify

Category parameter routes (`/categories/:category` and `/partners/:category`):

- [ ] `/categories/restaurants`
- [ ] `/categories/hotels`
- [ ] `/categories/spa`
- [ ] `/categories/wineries`
- [ ] `/categories/experiences`
- [ ] `/partners/restaurants` (newly fixed)
- [ ] `/partners/hotels`
- [ ] `/partners/spa`

### Test Dynamic Routes

Offer detail route (`/offers/:id`):

- [ ] `/offers/1`
- [ ] `/offers/spa-bansko-70`
- [ ] `/offers/invalid-id` (should handle gracefully)

Edit offer route (`/partners/offers/:id/edit`):

- [ ] `/partners/offers/1/edit`
- [ ] Must be logged in as partner

---

## 🔐 Authentication Testing

### As Guest (Not Logged In)

**Should Access:**
- ✅ All public routes (1-16)
- ✅ All auth routes (24-29)

**Should Redirect to Login:**
- ❌ All protected routes (17-23)

### As User (Logged In as User)

**Should Access:**
- ✅ All public routes (1-16)
- ✅ General protected routes (17-20)

**Should Redirect:**
- ❌ Auth routes (24-29) → redirect to home
- ❌ Partner-only routes (21-23) → might see but can't edit

### As Partner (Logged In as Partner)

**Should Access:**
- ✅ All public routes (1-16)
- ✅ All protected routes (17-23)

**Should Redirect:**
- ❌ Auth routes (24-29) → redirect to dashboard

---

## 🐛 Common Issues to Check

### Route Conflicts

Check these potential conflicts:

1. **`/partners` vs `/partners/:category` vs `/partners/offers`**
   - Order matters! Specific routes before dynamic params
   - Current order is correct

2. **`/categories` vs `/categories/:category`**
   - Both should work independently

3. **`/offers/:id` - Dynamic ID handling**
   - Should handle various ID formats

### Layout Issues

1. **Auth routes outside Layout**
   - Login, Register pages don't have header/footer
   - Verify this is intentional

2. **Protected routes inside Layout**
   - Should have header/footer

### Redirect Loops

Watch for:
- Protected route → Login → Protected route loop
- Auth route when logged in → Dashboard → Auth route loop

---

## 📊 Testing Progress Tracker

### Public Routes (16 total)
- [ ] Home `/`
- [ ] Search `/search`
- [ ] Nearby `/nearby`
- [ ] Rewards `/rewards`
- [ ] Components `/components`
- [ ] Categories `/categories`
- [ ] Category Detail `/categories/restaurants`
- [ ] Top Offers `/top-offers`
- [ ] Offer Detail `/offers/1`
- [ ] Partners Landing `/partners`
- [ ] Partners Category `/partners/restaurants`
- [ ] Favorites `/favorites`
- [ ] Promotions `/promotions`
- [ ] Experiences `/experiences`
- [ ] Integrations `/integrations`
- [ ] Locations `/locations`

### Protected Routes (7 total)
- [ ] Dashboard `/dashboard`
- [ ] Profile `/profile`
- [ ] Settings `/settings`
- [ ] Analytics `/analytics`
- [ ] My Offers `/partners/offers`
- [ ] Create Offer `/partners/offers/new`
- [ ] Edit Offer `/partners/offers/1/edit`

### Auth Routes (6 total)
- [ ] Login `/login`
- [ ] Register `/register`
- [ ] Register Partner `/register/partner`
- [ ] Forgot Password `/forgot-password`
- [ ] Reset Password `/reset-password`
- [ ] Verify Email `/verify-email`

### Special Routes (1 total)
- [ ] 404 Not Found `/*`

---

## 🔍 Systematic Testing Procedure

### Step 1: Test as Guest

```bash
# Clear cookies/localStorage first
localStorage.clear();
location.reload();

# Test public routes (should all work)
# Test auth routes (should all work)
# Test protected routes (should redirect to login)
```

### Step 2: Test as User

```bash
# Login as: demo@boomcard.bg / demo123

# Test public routes (should all work)
# Test protected routes (should work)
# Test auth routes (should redirect to home)
# Test partner routes (might be limited)
```

### Step 3: Test as Partner

```bash
# Login as: partner@boomcard.bg / partner123

# Test all public routes
# Test all protected routes
# Test partner-specific routes
# Test auth routes (should redirect)
```

### Step 4: Test as Admin

```bash
# Login as: admin@boomcard.bg / admin123

# Test all routes (should have full access)
```

---

## 📝 Test Results Template

For each route, document:

```markdown
### Route: /example

**Test Date:** 2025-10-13
**Tested By:** [Your Name]

**Status:** ✅ Pass / ❌ Fail / ⚠️ Issues

**Findings:**
- Page loads correctly: ✅/❌
- Layout renders: ✅/❌
- Content displays: ✅/❌
- Navigation works: ✅/❌
- Mobile responsive: ✅/❌
- Performance: Fast/Slow

**Issues Found:**
- [List any issues]

**Screenshots:**
- [If applicable]
```

---

## 🚀 Quick Test Script

Open browser console and run:

```javascript
// Test all public routes
const publicRoutes = [
  '/',
  '/search',
  '/nearby',
  '/rewards',
  '/categories',
  '/categories/restaurants',
  '/offers/1',
  '/partners',
  '/partners/restaurants',
  '/favorites',
];

// Test each route
publicRoutes.forEach((route, index) => {
  setTimeout(() => {
    window.location.href = route;
    console.log(`Testing: ${route}`);
  }, index * 3000); // 3 seconds between each
});
```

---

## ✅ Expected Outcomes

### All Routes Should:
1. Load without console errors
2. Display correct content
3. Have proper navigation
4. Be responsive
5. Handle loading states
6. Show proper error messages

### Protected Routes Should:
1. Check authentication
2. Redirect if not authenticated
3. Check user role (if applicable)
4. Show appropriate content per role

### Auth Routes Should:
1. Redirect if already logged in
2. Show proper forms
3. Handle validation
4. Submit correctly

---

## 📋 Issues to Document

For any failing routes, document:

1. **Route URL**
2. **Expected behavior**
3. **Actual behavior**
4. **Console errors** (if any)
5. **Network errors** (if any)
6. **Steps to reproduce**
7. **Screenshots** (if helpful)

---

## Next Steps

1. ✅ Start with public routes (no login needed)
2. ✅ Test auth routes
3. ✅ Login and test protected routes
4. ✅ Test as different user roles
5. ✅ Document all findings
6. ✅ Fix any issues found
7. ✅ Re-test fixed routes

---

**Created:** 2025-10-13
**Total Routes:** 30
**Status:** Ready for systematic testing

---

*Ready to test! Let me know which routes you'd like me to check first.* 🚀

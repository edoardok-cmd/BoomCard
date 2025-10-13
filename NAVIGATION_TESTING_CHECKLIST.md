# Navigation Testing Checklist

## Test Environment
- Dev server running at: `http://localhost:3001`
- Date: October 13, 2025
- Status: ✅ All routes configured and accessible

## Testing Instructions

Open your browser to `http://localhost:3001` and test each navigation link below:

---

## 🏠 Home Dropdown

### Top Offers (existing)
- [x] `/top-offers` - Top Offers with Biggest Discounts

### Media Section (NEW)
- [ ] `/media` - Media Gallery Hub
- [ ] `/media/gallery` - Photo Gallery & 360° Tours
- [ ] `/media/photos` - Photos by Type
- [ ] `/media/videos` - Videos by Type

**Test**:
- Click "Home" → "Photos/Videos" → Test each submenu item
- Verify bilingual content (switch EN ↔ BG)
- Check responsive layout on mobile

---

## 🎉 Promotions Dropdown

- [ ] `/promotions` - Main Promotions Page (existing)
- [ ] `/promotions/type` - Promotions by Type Hub (NEW)
- [ ] `/promotions/gastronomy` - Gastronomy Promotions (NEW)
- [ ] `/promotions/extreme` - Extreme Activity Promotions (NEW)
- [ ] `/promotions/cultural` - Cultural Promotions (NEW)

**Test**:
- Click "Promotions" → "By Type" → Test each category
- Verify offer cards display correctly
- Test filters functionality
- Switch language and verify translations

---

## 🏢 Categories Dropdown

### Main Categories (existing)
- [ ] `/categories` - All Categories
- [ ] `/categories/restaurants` - Restaurants & Bars
- [ ] `/categories/hotels` - Hotels & Guest Houses

### New Category Pages
- [ ] `/categories/restaurants/types` - Restaurant Types (NEW)
- [ ] `/categories/hotels/types` - Hotel Types (NEW)
- [ ] `/categories/spa` - Spa & Wellness Centers (NEW)
- [ ] `/categories/wineries` - Wineries & Tasting Halls (NEW)
- [ ] `/categories/clubs` - Clubs & Night Venues (NEW)
- [ ] `/categories/cafes` - Cafes & Pastry Shops (NEW)

**Test**:
- Navigate through all category dropdowns
- Verify offer cards show mock data
- Test "View Details" buttons
- Check ratings and discounts display

---

## 🎭 Experiences Dropdown

### Main Experience Categories (NEW)
- [ ] `/experiences` - All Experiences (existing)
- [ ] `/experiences/gastronomy` - Gastronomy Hub
- [ ] `/experiences/gastronomy/food-tours` - Food Tours Detail
- [ ] `/experiences/extreme` - Extreme Experiences Hub
- [ ] `/experiences/extreme/adventure` - Adventure Activities
- [ ] `/experiences/cultural` - Cultural Experiences Hub
- [ ] `/experiences/cultural/museums` - Museums & Galleries
- [ ] `/experiences/romantic` - Romantic Experiences Hub
- [ ] `/experiences/romantic/activities` - Romantic Activities
- [ ] `/experiences/family` - Family Experiences Hub
- [ ] `/experiences/family/activities` - Family Activities
- [ ] `/experiences/educational` - Educational Experiences Hub
- [ ] `/experiences/educational/learning` - Learning Experiences

**Test**:
- Navigate through all 6 experience types
- Verify 3-level navigation works (Hub → Category → Detail)
- Test offer cards in each section
- Verify images load from Unsplash

---

## 📍 Locations Dropdown

### By City (NEW)
- [ ] `/locations` - All Locations (existing)
- [ ] `/locations/cities` - Cities Hub
- [ ] `/locations/sofia` - Sofia (150 offers)
- [ ] `/locations/plovdiv` - Plovdiv (80 offers)
- [ ] `/locations/varna` - Varna (120 offers)
- [ ] `/locations/bansko` - Bansko (90 offers)

### By Price (NEW)
- [ ] `/locations/price` - Price Range Hub
- [ ] `/locations/price/budget` - Mid-Range (150-250 BGN)
- [ ] `/locations/price/premium` - High-End (250-400 BGN)
- [ ] `/locations/price/luxury` - Luxury (400+ BGN)

### By Type (NEW)
- [ ] `/locations/type/all` - All Location Types

**Test**:
- Test city navigation and filtering
- Verify price ranges display correctly
- Check location stats (offer counts)
- Test "Open Now" badges

---

## 🤝 Partners Dropdown

### By Category (NEW)
- [ ] `/partners` - All Partners (existing)
- [ ] `/partners/categories` - Categories Hub
- [ ] `/partners/restaurants` - Restaurant Partners

### By Region (NEW)
- [ ] `/partners/regions` - Regions Hub
- [ ] `/partners/sofia` - Sofia Partners (150)
- [ ] `/partners/plovdiv` - Plovdiv Partners (80)
- [ ] `/partners/varna` - Varna Partners (120)
- [ ] `/partners/bansko` - Bansko Partners (90)

### By Status (NEW)
- [ ] `/partners/status` - Status Hub
- [ ] `/partners/new` - New Partners
- [ ] `/partners/vip` - VIP Partners
- [ ] `/partners/exclusive` - Exclusive Partners

**Test**:
- Navigate through all partner sections
- Verify partner badges (New, VIP, Exclusive)
- Test region-specific content
- Check offer counts per region

---

## 🔗 Footer Links (NEW)

### About Us Section
- [ ] `/about` - About BoomCard
- [ ] `/subscriptions` - Subscription Plans
- [ ] `/contacts` - Contact Us

### Support Section
- [ ] `/support` - Support Center
- [ ] `/faq` - FAQ

### Legal Section
- [ ] `/terms` - Terms & Conditions
- [ ] `/privacy` - Privacy Policy

**Test**:
- Click all footer links
- Verify contact information displays
- Check subscription pricing cards
- Test FAQ accordion (if implemented)

---

## 🎨 Visual & UX Testing

### Layout & Design
- [ ] Hero sections render properly on all pages
- [ ] Offer cards have consistent styling
- [ ] Images load from Unsplash CDN
- [ ] Empty states show appropriate messages
- [ ] Loading states work correctly

### Responsive Design
- [ ] Test on Desktop (1920px, 1440px, 1280px)
- [ ] Test on Tablet (768px, 1024px)
- [ ] Test on Mobile (375px, 414px)
- [ ] Navigation collapses to hamburger menu on mobile
- [ ] Cards stack properly on small screens

### Bilingual Support
- [ ] Switch to Bulgarian (BG) - verify all content translates
- [ ] Switch to English (EN) - verify all content translates
- [ ] Check navigation labels in both languages
- [ ] Verify offer titles and descriptions translate
- [ ] Test empty state messages in both languages

---

## 🐛 Bug Testing

### Navigation
- [ ] No 404 errors on any menu link
- [ ] Breadcrumbs work correctly (if implemented)
- [ ] Back button works as expected
- [ ] Active page highlights in navigation
- [ ] Dropdown menus close after selection

### Performance
- [ ] Pages load within 2 seconds
- [ ] Images lazy-load properly
- [ ] No console errors in browser
- [ ] Smooth transitions between pages
- [ ] No memory leaks (check DevTools)

### Data
- [ ] Mock offers display correctly
- [ ] Ratings show proper stars
- [ ] Discounts calculate accurately
- [ ] Prices format correctly (BGN currency)
- [ ] Dates display in correct format

---

## ✅ Completion Checklist

- [ ] All 55+ new pages tested
- [ ] All dropdowns navigate correctly
- [ ] Bilingual content verified (EN/BG)
- [ ] Responsive design tested (3 breakpoints)
- [ ] No console errors
- [ ] No 404 errors
- [ ] Images load properly
- [ ] Empty states work
- [ ] Offer cards display correctly
- [ ] Footer links functional

---

## 📝 Known Issues

### Pre-existing (Not from this update)
- TypeScript errors in POS adapter files
- Duplicate keys in locale files (doesn't affect runtime)
- Some prop type mismatches (non-blocking)

### New Issues Found
_(Document any new issues discovered during testing)_

---

## 🚀 Next Steps After Testing

1. **Replace Mock Data**
   - Connect to real backend API
   - Replace Unsplash images with actual venue photos
   - Add real partner data

2. **Enhance Features**
   - Add search/filter functionality to listing pages
   - Implement pagination for large result sets
   - Add sorting options (price, rating, distance)

3. **SEO & Metadata**
   - Add unique page titles for each route
   - Add meta descriptions
   - Implement Open Graph tags

4. **Analytics**
   - Track page views
   - Monitor navigation patterns
   - Analyze user engagement

---

## 🎯 Success Criteria

✅ **All navigation links working** (55+ pages)
✅ **Zero 404 errors**
✅ **Bilingual content complete**
✅ **Responsive on all devices**
✅ **Consistent design system**
✅ **Fast page loads (<2s)**

---

**Tested By:** _____________
**Date:** _____________
**Browser:** _____________
**Result:** ⬜ PASS / ⬜ FAIL

**Notes:**

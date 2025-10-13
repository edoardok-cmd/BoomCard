# Quick Start Guide - BoomCard Navigation

## 🚀 Getting Started

Your BoomCard application now has **55+ fully functional pages** with complete bilingual support!

### Start Testing Immediately

1. **Dev Server is Running** at `http://localhost:3001`
   - Already started and ready for testing
   - All routes are live and accessible

2. **Open Your Browser**
   ```
   http://localhost:3001
   ```

3. **Test Navigation**
   - Click through all dropdown menus
   - Every link should load a page (no 404s!)
   - Switch between EN ↔ BG languages

---

## 📋 What You'll See

### Every Page Includes:
✅ **Hero Section** - Beautiful gradient header with title/subtitle
✅ **Bilingual Content** - Automatic EN/BG translation
✅ **Offer Cards** - Sample offers with images, ratings, discounts
✅ **Responsive Design** - Works on desktop, tablet, mobile
✅ **Empty States** - Friendly messages when no content

---

## 🗺️ Quick Navigation Map

### Home Menu → Photos/Videos
- Media Gallery
- Photo Gallery & 360° Tours
- Photos by Type
- Videos by Type

### Promotions Menu → By Type
- Gastronomy (street food, wine & dine)
- Extreme (air, water, mountain, winter sports)
- Cultural (museums, romantic, family, education)

### Categories Menu
- Restaurant Types (fine dining, casual, fast casual)
- Hotel Types (boutique, business, resort, family)
- Spa & Wellness Centers
- Wineries & Tasting Halls
- Clubs & Night Venues
- Cafes & Pastry Shops

### Experiences Menu (6 main types)
- **Gastronomy**: Food tours, cooking classes
- **Extreme**: Paragliding, rafting, skiing
- **Cultural**: Museums, galleries, history
- **Romantic**: Dinners, spa, photoshoots
- **Family**: Zoos, theme parks
- **Educational**: Cooking, dance, art classes

### Locations Menu
- **By City**: Sofia, Plovdiv, Varna, Bansko
- **By Price**: Budget, Premium, Luxury
- **By Type**: Business, Boutique, Spa, Family

### Partners Menu
- **By Category**: Restaurant partners
- **By Region**: Sofia, Plovdiv, Varna, Bansko
- **By Status**: New, VIP, Exclusive

### Footer Links
- About Us
- Subscriptions (with pricing cards!)
- Contact Us
- Support Center
- FAQ
- Terms & Conditions
- Privacy Policy

---

## 🌐 Language Switching

1. Click the **language selector** in the header (EN/BG)
2. **All content updates instantly**:
   - Navigation labels
   - Page titles and descriptions
   - Offer card content
   - Button labels
   - Empty state messages

---

## 📱 Responsive Testing

### Quick Test
1. Open DevTools (F12)
2. Click "Toggle Device Toolbar" (Ctrl+Shift+M)
3. Select different devices:
   - iPhone 12 Pro (390px)
   - iPad (768px)
   - Desktop (1920px)

### What to Check
- Navigation collapses to hamburger menu on mobile
- Offer cards stack vertically
- Images resize properly
- Text remains readable
- Buttons stay accessible

---

## 🎨 Page Types You'll Encounter

### 1. Hub Pages
**Purpose**: Central navigation point to sub-sections
**Examples**:
- `/promotions/type` - Lists all promotion categories
- `/experiences` - Shows all experience types

**Features**:
- Overview of available options
- Links to detailed pages
- Icon-based navigation

### 2. Listing Pages
**Purpose**: Display multiple offers in a category
**Examples**:
- `/categories/restaurants/types` - Lists restaurant offers
- `/locations/sofia` - Shows Sofia location offers

**Features**:
- Offer cards grid
- Sample data with images
- Ratings and discounts
- "View Details" buttons

### 3. Information Pages
**Purpose**: Static content and policies
**Examples**:
- `/about` - About BoomCard
- `/faq` - Frequently asked questions
- `/terms` - Terms & Conditions

**Features**:
- Text-heavy content
- Formatted paragraphs
- Contact information
- Legal text

---

## 🔍 Testing Checklist (5 Minutes)

### Quick Navigation Test
- [ ] Click "Home" → "Photos/Videos" → Works?
- [ ] Click "Promotions" → "Gastronomy" → Shows offers?
- [ ] Click "Experiences" → "Romantic" → Loads page?
- [ ] Click "Locations" → "Sofia" → Displays content?
- [ ] Click "Partners" → "VIP" → Opens page?
- [ ] Scroll to footer → Click "About" → Works?

### Quick Language Test
- [ ] Switch to Bulgarian (BG)
- [ ] Navigate to any page
- [ ] Confirm text is in Bulgarian
- [ ] Switch back to English (EN)
- [ ] Confirm text updates

### Quick Mobile Test
- [ ] Open DevTools
- [ ] Switch to mobile view
- [ ] Open navigation menu
- [ ] Click any link
- [ ] Page loads properly?

**✅ If all checks pass, you're ready to go!**

---

## 🐛 Troubleshooting

### Issue: Page shows 404
**Solution**:
- Check the URL path matches route in `App.tsx`
- Ensure page file exists in `src/pages/`
- Restart dev server if needed

### Issue: Content not translating
**Solution**:
- Check language selector in header
- Verify `useLanguage()` hook is being used
- Check translation object in page component

### Issue: Images not loading
**Solution**:
- Check internet connection (images from Unsplash)
- Open DevTools → Network tab
- Look for failed image requests
- Replace with local images if needed

### Issue: Navigation dropdown not working
**Solution**:
- Check `MegaMenu` component is rendering
- Verify menu items in `navigationConfig`
- Check z-index if dropdown hidden

---

## 📖 Key Files Reference

### Where to Find Things

**All Pages**:
```
partner-dashboard/src/pages/
├── Media pages (MediaPage.tsx, etc.)
├── Promotions pages (PromotionsGastronomyPage.tsx, etc.)
├── Categories pages (CategoriesSpaPage.tsx, etc.)
├── Experiences pages (ExperiencesRomanticPage.tsx, etc.)
├── Locations pages (LocationsSofiaPage.tsx, etc.)
├── Partners pages (PartnersVIPPage.tsx, etc.)
└── Footer pages (AboutPage.tsx, FAQPage.tsx, etc.)
```

**Routes Configuration**:
```
partner-dashboard/src/App.tsx (lines 44-110: imports, 197-271: routes)
```

**Navigation Structure**:
```
partner-dashboard/src/types/navigation.ts
```

**Reusable Template**:
```
partner-dashboard/src/components/templates/GenericPage.tsx
```

---

## 🎯 What's Next?

### Immediate Actions
1. ✅ **Testing** - Use the checklist in NAVIGATION_TESTING_CHECKLIST.md
2. ⏳ **Backend** - Connect pages to your API
3. ⏳ **Images** - Replace Unsplash with real venue photos
4. ⏳ **Content** - Add real descriptions and data

### Future Enhancements
- Add search/filter functionality
- Implement pagination
- Add user reviews
- Enable booking features
- Add favorites system
- Implement social sharing

---

## 💡 Pro Tips

### Customizing Pages
Each page uses the `GenericPage` template. To customize:

```typescript
<GenericPage
  titleEn="Your English Title"
  titleBg="Вашето Българско Заглавие"
  subtitleEn="English subtitle"
  subtitleBg="Български подзаглавие"
  offers={yourOffersArray}  // Optional
>
  {/* Custom content here */}
</GenericPage>
```

### Adding New Offers
Add to the `mockOffers` array in any listing page:

```typescript
{
  id: 'unique-id',
  title: 'Offer Title',
  titleBg: 'Заглавие на Офертата',
  description: 'Description...',
  descriptionBg: 'Описание...',
  discount: 30,
  originalPrice: 100,
  discountedPrice: 70,
  category: 'Category',
  categoryBg: 'Категория',
  location: 'Sofia',
  imageUrl: 'https://images.unsplash.com/...',
  partnerName: 'Partner Name',
  path: '/offers/unique-id',
  rating: 4.8,
  reviewCount: 125,
}
```

---

## 📞 Need Help?

- **Testing Issues**: See NAVIGATION_TESTING_CHECKLIST.md
- **Implementation Details**: See IMPLEMENTATION_SUMMARY.md
- **Code Questions**: Check inline comments in page files
- **Design Changes**: Modify GenericPage.tsx template

---

## ✨ Success Indicators

You'll know everything is working when:

✅ **Zero 404 errors** - All menu links load pages
✅ **Bilingual works** - Language switch updates all content
✅ **Mobile friendly** - Navigation works on small screens
✅ **Fast loading** - Pages load in under 2 seconds
✅ **Consistent design** - All pages look cohesive
✅ **No console errors** - Clean browser console

---

**🎉 You're all set! Start exploring at http://localhost:3001**

**Questions?** Check the other documentation files:
- `IMPLEMENTATION_SUMMARY.md` - Full technical details
- `NAVIGATION_TESTING_CHECKLIST.md` - Complete testing guide

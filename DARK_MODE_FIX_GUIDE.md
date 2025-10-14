# Dark Mode Icon Visibility Fix Guide

## Problem
Icons in the header are invisible in dark mode because they use hardcoded dark colors (`#374151`, `#111827`) that don't contrast with the dark background.

## Solution
Add `[data-theme="dark"]` overrides with lighter colors, OR use CSS variables.

---

## Files to Fix

### `/partner-dashboard/src/components/layout/Header/Header.tsx`

#### 1. **FavoritesLink** (Lines 15-48)
Current problem: Icons are dark gray on dark background

**Add dark mode support:**
```typescript
const FavoritesLink = styled(Link)`
  // ... existing styles ...
  color: #374151;  // Line 22

  [data-theme="dark"] & {
    color: #d1d5db;  // Light gray for dark mode
  }

  &:hover {
    background: #f3f4f6;  // Line 30
    color: #111827;  // Line 31

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }
```

#### 2. **MobileFavoritesLink** (Lines 50-70)
**Add dark mode support:**
```typescript
const MobileFavoritesLink = styled(Link)`
  // ... existing styles ...
  background: #f9fafb;
  color: #111827;  // Line 58

  [data-theme="dark"] & {
    background: #374151;
    color: #f9fafb;
  }
```

#### 3. **ThemeButton** (Lines 295-327)
**Add dark mode support:**
```typescript
const ThemeButton = styled.button`
  // ... existing styles ...
  color: #374151;  // Line 322

  [data-theme="dark"] & {
    color: #d1d5db;
  }

  &:hover {
    background: #f3f4f6;
    color: #111827;  // Line 328

    [data-theme="dark"] & {
      background: #374151;
      color: #f9fafb;
    }
  }
```

#### 4. **ThemeOption** (Lines 350-377)
**Add dark mode support:**
```typescript
const ThemeOption = styled.button<{ active: boolean }>`
  // ... existing styles ...
  color: ${props => props.active ? '#111827' : '#374151'};  // Line 378

  [data-theme="dark"] & {
    color: ${props => props.active ? '#f9fafb' : '#d1d5db'};
  }
```

---

## Quick Fix Script

Alternatively, you can use CSS variables which automatically adapt:

```typescript
// Replace hardcoded colors with CSS variables
color: #374151  →  color: var(--color-text-secondary)
color: #111827  →  color: var(--color-text-primary)
background: #f3f4f6  →  background: var(--color-background-secondary)
background: #f9fafb  →  background: var(--color-background-secondary)
```

---

## Test Plan

1. Start the dev server: `npm run dev`
2. Visit any page (e.g., http://localhost:3003)
3. Click the theme switcher (moon/sun icon)
4. Switch to "Dark" theme
5. Verify all icons in the header are visible:
   - Location icon (Nearby)
   - Heart icon (Favorites)
   - Bell icon (Notifications)
   - Moon/Sun icon (Theme switcher)

---

## Status

✅ UserMenuItem - FIXED (lines 237-271)
✅ UserMenuName - FIXED (lines 223-231)
✅ UserMenuEmail - FIXED (lines 210-221)
✅ UserMenuDropdown - FIXED (lines 180-197)
✅ UserMenuHeader - FIXED (lines 199-208)
✅ UserMenuDivider - FIXED (lines 273-281)

❌ FavoritesLink - NEEDS FIX (lines 15-48)
❌ MobileFavoritesLink - NEEDS FIX (lines 50-70)
❌ ThemeButton - NEEDS FIX (lines 295-327)
❌ ThemeOption - NEEDS FIX (lines 350-377)

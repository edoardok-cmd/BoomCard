# 🔐 BoomCard Login Guide

## How to Login to the Platform

The BoomCard platform has three types of user roles, each with different access levels and capabilities. This guide will show you how to log in as each type.

---

## 📍 Login Page

Navigate to: **`http://localhost:5173/login`** (or your deployed URL + `/login`)

---

## 👥 Available User Accounts

### 1️⃣ **Regular User** (Consumer)

**Email:** `demo@boomcard.bg`
**Password:** `demo123`

**Access Level:**
- View available offers and venues
- Search and filter venues
- Save favorite venues
- View transaction history
- Manage personal profile
- Use QR codes for discounts
- Write reviews
- View analytics dashboard

**Use Case:** Regular consumers who use discount cards at partner venues.

---

### 2️⃣ **Partner** (Business Owner)

**Email:** `partner@boomcard.bg`
**Password:** `partner123`

**Access Level:**
- All User permissions, plus:
- Create and manage venues
- Create and manage offers
- View venue analytics
- Manage POS integrations
- Export transaction data
- Manage billing and subscriptions
- View partner dashboard
- Access integration settings

**Use Case:** Business owners who create offers and manage venues on the platform.

---

### 3️⃣ **Admin** (Platform Administrator)

**Email:** `admin@boomcard.bg`
**Password:** `admin123`

**Access Level:**
- All Partner permissions, plus:
- View all users and partners
- Manage all venues and offers
- Access platform-wide analytics
- Manage system settings
- View fraud detection reports
- Access webhook configurations
- Manage billing for all partners
- Full system administration

**Use Case:** Platform administrators who manage the entire BoomCard ecosystem.

---

## 🚀 How to Login

### Method 1: Manual Login

1. Go to the login page: `/login`
2. Enter the email and password for the desired role (see above)
3. Optional: Check "Remember Me" to stay logged in
4. Click **"Sign In"**

### Method 2: Quick Login (Auto-fill)

On the login page, there's a demo credentials box at the bottom:

1. Click the **"Fill Automatically"** button
2. This will auto-fill the demo user credentials (`demo@boomcard.bg` / `demo123`)
3. Click **"Sign In"**

To quickly test other roles, simply change the email:
- Change `demo@` to `partner@` for Partner access
- Change `demo@` to `admin@` for Admin access

---

## 🔄 Switching Between Roles

To switch between different user roles:

1. **Logout:** Click your profile icon → "Logout"
2. **Login Again:** Use different credentials for the desired role

---

## 🎯 Testing Different Features by Role

### As a **User** (`demo@boomcard.bg`):
- ✅ Browse `/search` to find venues
- ✅ Visit `/favorites` to manage saved venues
- ✅ Check `/profile` to view your information
- ✅ View `/analytics` to see your savings

### As a **Partner** (`partner@boomcard.bg`):
- ✅ Access `/dashboard` for partner analytics
- ✅ Visit `/my-offers` to create and manage offers
- ✅ Check `/integrations` to configure POS systems
- ✅ View `/settings` for billing and subscription management

### As an **Admin** (`admin@boomcard.bg`):
- ✅ Access all pages and features
- ✅ View `/partners` to manage all partners
- ✅ Check system-wide analytics
- ✅ Manage fraud detection settings
- ✅ Configure webhooks and integrations

---

## 🛡️ Role Hierarchy

The platform uses a role-based access control (RBAC) system with the following hierarchy:

```
Admin (Level 3)
  ↓
  Has all Partner permissions, plus admin-only features

Partner (Level 2)
  ↓
  Has all User permissions, plus business management features

User (Level 1)
  ↓
  Basic consumer features
```

**Important:** Higher-level roles inherit all permissions from lower-level roles.

---

## 📱 Authentication Features

### Implemented Features ✅
- [x] Email/password login
- [x] Session management with JWT tokens
- [x] "Remember Me" functionality
- [x] Automatic token refresh
- [x] Secure cookie storage
- [x] Role-based access control
- [x] Password validation
- [x] Protected routes
- [x] Automatic logout on session expiry

### Social Login (UI Ready) 🟡
- [ ] Google OAuth (button implemented, backend needed)
- [ ] Facebook OAuth (button implemented, backend needed)

---

## 🔒 Security Features

### Current Implementation:
1. **JWT Tokens**: HMAC-SHA256 signed tokens
2. **Access Tokens**: 15-minute expiry (short-lived)
3. **Refresh Tokens**: 7-day expiry (long-lived)
4. **Secure Cookies**: SameSite=Strict policy
5. **Role Validation**: Server-side role checking
6. **Password Requirements**: Minimum 6 characters

### Session Storage:
- **Cookies**: Store access and refresh tokens
- **LocalStorage**: Store user data for quick access
- **Auto-refresh**: Tokens refresh automatically before expiry

---

## 🧪 Testing Authentication

### Test Login Flow:
```javascript
// 1. Open browser console on login page
// 2. Enter credentials
// 3. After login, check localStorage:
localStorage.getItem('boomcard_auth')  // User data
localStorage.getItem('boomcard_token') // JWT token

// 4. Check cookies:
document.cookie // Should show boomcard_session and boomcard_refresh
```

### Test Role Access:
```javascript
// After logging in, check user role in console:
const auth = JSON.parse(localStorage.getItem('boomcard_auth'));
console.log('Current role:', auth.role);

// Test role hierarchy:
import { hasRole } from './lib/auth/session';
console.log('Is user?', hasRole('user'));     // true for all
console.log('Is partner?', hasRole('partner')); // true for partner & admin
console.log('Is admin?', hasRole('admin'));    // true only for admin
```

---

## 🔧 Development Notes

### Mock Authentication
The current implementation uses **mock authentication** for development:
- Users are stored in [AuthContext.tsx](partner-dashboard/src/contexts/AuthContext.tsx:51-85)
- No backend API calls (simulated with setTimeout)
- Perfect for frontend development and testing

### Production Migration
To migrate to production authentication:

1. **Replace mock users** with actual API calls
2. **Update login function** in `AuthContext.tsx`:
   ```typescript
   const response = await fetch('/api/auth/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(credentials),
   });
   const { user, token } = await response.json();
   ```
3. **Configure backend** (auth-service is ready)
4. **Set environment variables** for JWT secrets

---

## 📚 Related Files

### Authentication Files:
- [AuthContext.tsx](partner-dashboard/src/contexts/AuthContext.tsx) - Main authentication logic
- [LoginPage.tsx](partner-dashboard/src/pages/LoginPage.tsx) - Login UI
- [jwt.ts](partner-dashboard/src/lib/auth/jwt.ts) - JWT token utilities
- [session.ts](partner-dashboard/src/lib/auth/session.ts) - Session management
- [ProtectedRoute.tsx](partner-dashboard/src/components/auth/ProtectedRoute.tsx) - Route protection

### Backend Services (Ready):
- `auth-service/` - Authentication microservice
- `user-service/` - User management
- `api-gateway/` - API routing

---

## 🆘 Troubleshooting

### Issue: "Invalid email or password"
**Solution:** Make sure you're using the exact credentials listed above (case-sensitive).

### Issue: Can't access certain pages after login
**Solution:** Check your role. Some pages require Partner or Admin access.

### Issue: Session expires too quickly
**Solution:** Check "Remember Me" when logging in, or adjust token expiry in `jwt.ts`.

### Issue: Not redirected after login
**Solution:** Clear browser cache and localStorage, then try again:
```javascript
localStorage.clear();
location.reload();
```

---

## ✅ Quick Test Checklist

- [ ] Login as User (demo@boomcard.bg)
- [ ] Login as Partner (partner@boomcard.bg)
- [ ] Login as Admin (admin@boomcard.bg)
- [ ] Test "Remember Me" functionality
- [ ] Test logout functionality
- [ ] Verify role-based page access
- [ ] Check token refresh on expiry
- [ ] Test protected routes

---

## 📞 Support

For authentication issues or questions:
1. Check the [TROUBLESHOOTING.md](TROUBLESHOOTING.md) guide
2. Review authentication logs in browser console
3. Verify JWT token structure using [jwt.io](https://jwt.io)
4. Check [SESSION_SUMMARY.md](SESSION_SUMMARY.md) for implementation details

---

**Status:** ✅ **Fully Implemented**
**Version:** 3.0.0
**Last Updated:** 2025-10-13

---

*Made with ❤️ by the BoomCard Team*

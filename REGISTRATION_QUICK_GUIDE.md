# 🚀 BoomCard Registration - Quick Guide

## Two Registration Types Now Available!

---

## 👤 User Registration (Consumers)

**URL:** `http://localhost:5173/register`

**Who is this for?**
- Consumers who want to use discount cards
- People looking to save money at venues

**Simple Form:**
```
First Name: [John_______]
Last Name:  [Smith______]
Email:      [john@example.com]
Phone:      [+359 88 123 4567] (optional)
Password:   [••••••••]
☑ Accept Terms
```

**Result:** → Role = `user`

---

## 🏢 Partner Registration (Businesses)

**URL:** `http://localhost:5173/register/partner`

**Who is this for?**
- Restaurant owners
- Hotel managers
- Spa/wellness centers
- Any business wanting to offer discounts

**Extended Form:**
```
👤 Personal Information
├─ First Name:      [John_______]
├─ Last Name:       [Smith______]
├─ Email:           [john@business.com]
└─ Phone:           [+359 88 123 4567] (required)

🏢 Business Information
├─ Business Name:   [Smith Restaurant]
├─ Name (BG):       [Ресторант Смит] (optional)
├─ Category:        [Restaurant ▼]
├─ Tax ID:          [BG123456789] (optional)
└─ Website:         [www.smith.com] (optional)

🔒 Security
├─ Password:        [••••••••]
└─ Confirm:         [••••••••]

☑ Accept Terms
☑ Confirm legitimate business
```

**Result:** → Role = `partner` (pending verification)

---

## 🔄 Switching Between Forms

### From User Registration:
```
Looking for a business account?
[Sign up as a partner] ← Click here
```

### From Partner Registration:
```
Looking for a personal account?
[Sign up as a customer] ← Click here
```

---

## 📊 Quick Comparison

| Feature | User | Partner |
|---------|------|---------|
| **URL** | `/register` | `/register/partner` |
| **Fields** | 6 | 11 |
| **Phone** | Optional | Required |
| **Business Info** | No | Yes |
| **Approval** | Instant | Pending* |
| **Badge** | None | 🏢 Business Account |

---

## ✅ Test Credentials

### Test User Account:
```
Email:    test-user@boomcard.bg
Password: test123
→ Will be assigned role: "user"
```

### Test Partner Account:
```
Email:         test-partner@boomcard.bg
Phone:         +359 88 123 4567
Business:      Test Restaurant
Category:      Restaurant
Password:      test123
→ Will be assigned role: "partner"
```

---

## 🎯 What Happens After Registration

### For Users:
1. ✅ Account created instantly
2. ✅ Auto-logged in
3. ✅ Can browse venues
4. ✅ Can search for offers
5. ✅ Can save favorites

### For Partners:
1. ✅ Account created
2. ⏳ **Pending verification** (24-48 hours)
3. 📧 Will receive email when approved
4. ✅ Can access partner dashboard
5. ⏳ Full features after verification

---

## 🔐 Security Notes

- All passwords minimum 6 characters
- Email must be unique
- Phone validation for Bulgarian format
- Terms acceptance required
- Partners must confirm legitimate business

---

## 📱 Access After Registration

### Users Can Access:
- `/` - Home page
- `/search` - Search venues
- `/favorites` - Saved venues
- `/profile` - Personal profile
- `/analytics` - Personal savings

### Partners Can Access (After Verification):
- All User pages, PLUS:
- `/dashboard` - Partner dashboard
- `/my-offers` - Manage offers
- `/integrations` - POS systems
- `/settings` - Business settings
- `/venues` - Manage venues

---

## 🚀 Quick Start

### 1. Start the Dev Server
```bash
cd partner-dashboard
npm run dev
```

### 2. Navigate to Registration
- User: http://localhost:5173/register
- Partner: http://localhost:5173/register/partner

### 3. Fill Out Form
- Enter valid information
- Accept terms
- Click "Create Account"

### 4. Done!
- Auto-logged in
- Role assigned
- Ready to use

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| [RegisterPage.tsx](partner-dashboard/src/pages/RegisterPage.tsx) | User registration |
| [RegisterPartnerPage.tsx](partner-dashboard/src/pages/RegisterPartnerPage.tsx) | Partner registration |
| [AuthContext.tsx](partner-dashboard/src/contexts/AuthContext.tsx) | Handles both |
| [App.tsx](partner-dashboard/src/App.tsx) | Routes config |

---

## 🎉 Summary

✅ **Two registration types**
- `/register` for users (consumers)
- `/register/partner` for partners (businesses)

✅ **Automatic role assignment**
- Users get `user` role
- Partners get `partner` role

✅ **Easy switching**
- Links between both pages
- Clear differentiation

✅ **Professional UX**
- Sectioned layouts
- Proper validation
- Helpful messages

---

**Last Updated:** 2025-10-13
**Status:** ✅ Fully Implemented & Working

---

*Happy Registering! 🎉*

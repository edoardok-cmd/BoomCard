# 🔍 Registration System Analysis - User Type Selection

## Current Status: ❌ No Role Selection

### The Problem

**Currently, the registration does NOT allow users to choose their account type.**

All new registrations are **automatically assigned the "user" role**:

```typescript
// From AuthContext.tsx line 187
const newUser: User = {
  id: String(Date.now()),
  email: data.email,
  firstName: data.firstName,
  lastName: data.lastName,
  phone: data.phone,
  role: 'user',  // ← HARDCODED - Everyone becomes a regular user
  createdAt: Date.now(),
  emailVerified: false,
};
```

---

## 🚨 Current Behavior

### What Happens Now

```
User registers → Always assigned "user" role → Must contact admin to upgrade
```

**Registration Flow:**
1. User fills out registration form
2. System creates account with role = "user"
3. User can only access consumer features
4. To become Partner/Admin: Must be manually changed by admin

---

## 🎯 What Should Happen

### Ideal Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│  STEP 1: Choose Account Type                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ○ I'm a Customer (User)                                    │
│     → Browse venues, use discount cards                      │
│                                                              │
│  ○ I'm a Business Owner (Partner)                           │
│     → Create venues, manage offers                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 2: Fill Registration Form                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [Fields differ based on account type]                      │
│                                                              │
│  For Users:                                                  │
│  - First Name, Last Name                                     │
│  - Email, Phone (optional)                                   │
│  - Password                                                  │
│                                                              │
│  For Partners (additional fields):                          │
│  - Business Name                                             │
│  - Business Tax ID                                           │
│  - Business Category                                         │
│  - Website (optional)                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│  STEP 3: Create Account                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  System assigns appropriate role                             │
│  → User: Basic access                                        │
│  → Partner: Business access (pending verification)          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 💡 Recommended Implementation

### Option 1: Two Separate Registration Pages (Recommended)

**Pros:**
- ✅ Clear separation of concerns
- ✅ Different forms for different needs
- ✅ Better UX - no confusion
- ✅ Can collect role-specific information

**Routes:**
```typescript
/register          → User registration (consumers)
/register/partner  → Partner registration (businesses)
```

**User Registration:**
```typescript
// Simple form for consumers
interface UserRegistrationData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  acceptTerms: boolean;
}

// Role assigned automatically
role: 'user'
```

**Partner Registration:**
```typescript
// Extended form for businesses
interface PartnerRegistrationData {
  // Personal info
  firstName: string;
  lastName: string;
  email: string;
  phone: string;  // Required for partners
  password: string;

  // Business info
  businessName: string;
  businessNameBg?: string;
  taxId?: string;
  registrationNum?: string;
  businessCategory: VenueCategory;
  website?: string;

  acceptTerms: boolean;
}

// Role assigned automatically
role: 'partner'
status: 'pending_verification'  // Requires admin approval
```

### Option 2: Single Page with Role Selector

**Pros:**
- ✅ One registration endpoint
- ✅ Simpler routing
- ⚠️ More complex form logic

**Implementation:**
```typescript
const RegisterPage = () => {
  const [accountType, setAccountType] = useState<'user' | 'partner'>('user');

  return (
    <Form>
      {/* Step 1: Choose account type */}
      <AccountTypeSelector>
        <RadioButton
          checked={accountType === 'user'}
          onChange={() => setAccountType('user')}
          label="Personal Account"
          description="Browse and use discount cards"
        />
        <RadioButton
          checked={accountType === 'partner'}
          onChange={() => setAccountType('partner')}
          label="Business Account"
          description="Create venues and manage offers"
        />
      </AccountTypeSelector>

      {/* Step 2: Common fields */}
      <Input name="firstName" />
      <Input name="lastName" />
      <Input name="email" />

      {/* Step 3: Conditional fields based on account type */}
      {accountType === 'partner' && (
        <>
          <Input name="businessName" required />
          <Select name="businessCategory" required />
          <Input name="taxId" />
        </>
      )}

      <Input name="password" type="password" />
      <Button type="submit">Create {accountType === 'partner' ? 'Business' : 'Personal'} Account</Button>
    </Form>
  );
};
```

### Option 3: Admin Assignment Only

**For high-security scenarios:**
- Everyone registers as "user"
- Partners apply separately
- Admin reviews and approves
- Admin manually assigns "partner" role

**Pros:**
- ✅ Maximum security
- ✅ Prevents fake partner accounts
- ❌ Slower onboarding
- ❌ Manual process

---

## 🔒 Security Considerations

### Partner Verification Flow

```
1. Partner registers → Status: "pending"
2. Admin reviews application
3. Admin verifies business documents
4. Admin approves → Status: "active"
5. Partner can create venues/offers
```

**Database Schema:**
```typescript
model Partner {
  id               String   @id @default(cuid())
  userId           String   @unique  // Links to User
  businessName     String
  taxId            String?
  isVerified       Boolean  @default(false)  // ← Admin approval
  verifiedAt       DateTime?
  verifiedBy       String?  // Admin who approved
  status           PartnerStatus @default(PENDING)

  user             User     @relation(fields: [userId], references: [id])
}

enum PartnerStatus {
  PENDING       // Awaiting verification
  ACTIVE        // Approved and active
  SUSPENDED     // Temporarily disabled
  REJECTED      // Application rejected
}
```

### Preventing Abuse

**Rate Limiting:**
```typescript
// Limit partner registrations per IP
const registrationsFromIP = await getRegistrationCount(ipAddress, '24h');
if (registrationsFromIP > 3) {
  throw new Error('Too many registration attempts');
}
```

**Email Verification:**
```typescript
// Require email verification before partner approval
if (accountType === 'partner' && !user.emailVerified) {
  throw new Error('Please verify your email first');
}
```

**Document Upload:**
```typescript
// Require business documents for partners
interface PartnerApplication {
  businessLicense?: File;
  taxCertificate?: File;
  identityDocument?: File;
}
```

---

## 📊 Comparison Matrix

| Approach | UX | Security | Development | Maintenance |
|----------|----|-|-------------|-------------|
| **Two Pages** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Role Selector** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Admin Only** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

**Recommendation:** **Two Separate Pages** for best UX and maintainability.

---

## 🚀 Implementation Steps

### Phase 1: Add Role Selection

**1. Update AuthContext:**
```typescript
interface RegisterData {
  // ... existing fields
  accountType?: 'user' | 'partner';  // Add this
  businessInfo?: {
    businessName: string;
    taxId?: string;
    category: string;
  };
}

const register = async (data: RegisterData) => {
  const newUser: User = {
    // ... existing fields
    role: data.accountType || 'user',  // Use selected type
  };

  // If partner, create partner record
  if (data.accountType === 'partner' && data.businessInfo) {
    await createPartnerRecord(newUser.id, data.businessInfo);
  }
};
```

**2. Update Registration Form:**
```typescript
// Add account type selector
const [accountType, setAccountType] = useState<'user' | 'partner'>('user');

// Conditionally render business fields
{accountType === 'partner' && (
  <BusinessInfoSection>
    <Input name="businessName" required />
    <Select name="businessCategory" required />
    <Input name="taxId" />
  </BusinessInfoSection>
)}
```

**3. Create Partner Registration Page:**
```typescript
// /partner-dashboard/src/pages/RegisterPartnerPage.tsx
const RegisterPartnerPage = () => {
  return (
    <RegisterForm
      accountType="partner"
      extraFields={['businessName', 'taxId', 'category']}
      onSubmit={handlePartnerRegistration}
    />
  );
};
```

### Phase 2: Add Verification System

**1. Create Partner Model:**
```sql
CREATE TABLE partners (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id),
  business_name VARCHAR(255) NOT NULL,
  tax_id VARCHAR(50),
  is_verified BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'pending',
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES users(id)
);
```

**2. Create Admin Approval Interface:**
```typescript
// Admin dashboard to approve partners
const PendingPartnersPage = () => {
  const pendingPartners = usePendingPartners();

  return (
    <Table>
      {pendingPartners.map(partner => (
        <Row>
          <Cell>{partner.businessName}</Cell>
          <Cell>{partner.email}</Cell>
          <Cell>
            <Button onClick={() => approvePartner(partner.id)}>
              Approve
            </Button>
            <Button onClick={() => rejectPartner(partner.id)}>
              Reject
            </Button>
          </Cell>
        </Row>
      ))}
    </Table>
  );
};
```

### Phase 3: Add Email Notifications

```typescript
// Notify partner when approved
await sendEmail({
  to: partner.email,
  subject: 'Your BoomCard Partner Account has been Approved!',
  template: 'partner-approved',
  data: {
    firstName: partner.firstName,
    businessName: partner.businessName,
    dashboardUrl: 'https://partner.boomcard.bg/dashboard',
  }
});
```

---

## 🎨 UI Mockup

### Registration Landing Page

```
┌────────────────────────────────────────────────────────┐
│                     Join BoomCard                      │
│                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │                      │  │                      │  │
│  │    👤 Personal       │  │    🏢 Business       │  │
│  │                      │  │                      │  │
│  │ I want to save      │  │ I want to offer     │  │
│  │ money at venues     │  │ discounts           │  │
│  │                      │  │                      │  │
│  │ [Sign Up as User]   │  │ [Sign Up as Partner]│  │
│  │                      │  │                      │  │
│  └──────────────────────┘  └──────────────────────┘  │
│                                                        │
│            Already have an account? [Sign In]         │
└────────────────────────────────────────────────────────┘
```

### Partner Registration Form

```
┌────────────────────────────────────────────────────────┐
│            Create Your Business Account                │
│                                                        │
│  Personal Information                                  │
│  ├─ First Name       [John____________]               │
│  ├─ Last Name        [Smith___________]               │
│  ├─ Email            [john@business.com]              │
│  └─ Phone            [+359 88 123 4567]               │
│                                                        │
│  Business Information                                  │
│  ├─ Business Name    [Smith Restaurant]               │
│  ├─ Category         [Restaurant ▼]                   │
│  ├─ Tax ID           [BG123456789____]                │
│  └─ Website          [www.smith.com___]               │
│                                                        │
│  Security                                              │
│  ├─ Password         [••••••••••]                     │
│  └─ Confirm Password [••••••••••]                     │
│                                                        │
│  ☑ I agree to the Terms & Conditions                  │
│  ☑ I confirm this is a legitimate business            │
│                                                        │
│  [Create Business Account]                             │
│                                                        │
│  Note: Your account will be reviewed by our team       │
│  before activation (usually within 24 hours).          │
└────────────────────────────────────────────────────────┘
```

---

## ✅ Summary

### Current State
- ❌ **No role selection** - Everyone becomes "user"
- ❌ **No partner registration** - Must be manually upgraded
- ❌ **No business information** collected

### Recommended Changes
- ✅ **Add role selection** - Users choose account type
- ✅ **Separate partner form** - Collect business info
- ✅ **Verification system** - Admin approves partners
- ✅ **Email notifications** - Inform users of status

### Implementation Priority
1. **High**: Add role selection to registration
2. **High**: Create partner registration form
3. **Medium**: Implement verification workflow
4. **Medium**: Add admin approval interface
5. **Low**: Email notifications and automation

---

**Next Step:** Would you like me to implement the role selection feature in the registration system?

---

**Last Updated:** 2025-10-13
**Status:** 📋 Analysis Complete, Implementation Needed

---

*Made with ❤️ by the BoomCard Team*

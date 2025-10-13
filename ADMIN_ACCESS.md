# Admin Access to BoomCard Platform

## Admin Credentials

After running the seed script, an admin user is automatically created:

```
Email:    admin@boomcard.bg
Password: admin123
Role:     SUPER_ADMIN
```

⚠️ **IMPORTANT:** Change this password in production!

---

## How to Create Admin Access

### Option 1: Run the Seed Script (Easiest)

```bash
cd backend-api
npm run db:seed
```

This automatically creates:
- 1 admin user (SUPER_ADMIN)
- 6 partner users
- 6 partners
- 8 offers

### Option 2: Create Admin Manually

If you already have data and just want to add an admin:

```bash
cd backend-api
npm run db:studio
```

Then in Prisma Studio (http://localhost:5555):
1. Go to the **User** table
2. Click **Add record**
3. Fill in:
   - `email`: your-admin@email.com
   - `passwordHash`: (generate using bcrypt - see below)
   - `firstName`: Your Name
   - `lastName`: Admin
   - `role`: SUPER_ADMIN
   - `status`: ACTIVE
   - `emailVerified`: true
4. Click **Save**

### Option 3: Use a Script

Create a file `create-admin.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  const passwordHash = await bcrypt.hash('your-strong-password', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'your-email@example.com',
      passwordHash,
      firstName: 'Your',
      lastName: 'Name',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  console.log('Admin created:', admin.email);
}

createAdmin()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

Run it:
```bash
ts-node create-admin.ts
```

---

## User Roles

The system has 4 role levels:

1. **USER** - Regular BoomCard holders
   - Can view offers
   - Can redeem offers
   - Can view their transaction history

2. **PARTNER** - Business owners
   - All USER permissions
   - Can create/manage offers
   - Can view their analytics
   - Can manage their venues

3. **ADMIN** - Platform administrators
   - All PARTNER permissions
   - Can view all partners
   - Can view all offers
   - Can manage users
   - Can view platform analytics

4. **SUPER_ADMIN** - Super administrators
   - All ADMIN permissions
   - Can manage other admins
   - Can access system settings
   - Full database access
   - Can change any data

---

## Admin Login

### Via API (for testing)

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@boomcard.bg",
    "password": "admin123"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "...",
      "email": "admin@boomcard.bg",
      "role": "SUPER_ADMIN",
      "firstName": "Admin",
      "lastName": "User"
    },
    "token": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

### Via Frontend

1. Open http://localhost:5173
2. Click **Login** or **Sign In**
3. Enter:
   - Email: `admin@boomcard.bg`
   - Password: `admin123`
4. Click **Login**

You'll be logged in with full admin access!

---

## Admin Features

Once logged in as admin, you should have access to:

### Dashboard
- View all partner statistics
- View platform-wide analytics
- Monitor system health

### Partner Management
- View all partners
- Approve/suspend partners
- Edit partner details
- View partner analytics

### Offer Management
- View all offers
- Approve/reject offers
- Edit/delete any offer
- Feature/unfeature offers

### User Management
- View all users
- Change user roles
- Suspend/activate users
- Reset passwords

### Analytics
- Platform-wide metrics
- Revenue tracking
- User growth
- Partner performance

### Settings
- System configuration
- Feature flags
- Email templates
- Payment settings

---

## Changing Admin Password

### Via API

```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "your-new-strong-password"
  }'
```

### Via Prisma Studio

```bash
cd backend-api
npm run db:studio
```

1. Open http://localhost:5555
2. Go to **User** table
3. Find admin@boomcard.bg
4. Generate new hash:
   ```bash
   node -e "console.log(require('bcryptjs').hashSync('new-password', 10))"
   ```
5. Update `passwordHash` field
6. Save

### Via Script

```bash
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const hash = await bcrypt.hash('new-password', 10);
  await prisma.user.update({
    where: { email: 'admin@boomcard.bg' },
    data: { passwordHash: hash }
  });
  console.log('Password updated!');
})();
"
```

---

## Creating Additional Admins

You can create multiple admin users:

```typescript
// In seed.ts or a custom script
const admin2 = await prisma.user.create({
  data: {
    email: 'admin2@boomcard.bg',
    passwordHash: await bcrypt.hash('secure-password', 10),
    firstName: 'Second',
    lastName: 'Admin',
    role: 'ADMIN', // or SUPER_ADMIN
    status: 'ACTIVE',
    emailVerified: true,
  },
});
```

---

## Security Best Practices

1. **Change Default Password Immediately**
   ```bash
   # In production, never use "admin123"
   ```

2. **Use Strong Passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Example: `Adm!n$tr0ng#P@ssw0rd2024`

3. **Enable 2FA** (if implemented)
   ```typescript
   // TODO: Implement 2FA for admin accounts
   ```

4. **Limit Admin Access**
   - Only create admin accounts when necessary
   - Use ADMIN role for most staff (not SUPER_ADMIN)
   - Review admin list regularly

5. **Monitor Admin Activity**
   ```typescript
   // Log all admin actions
   // Alert on suspicious activity
   ```

6. **Use Environment Variables**
   ```env
   ADMIN_DEFAULT_PASSWORD=your-secure-password
   ADMIN_EMAIL=your-admin@company.com
   ```

---

## Troubleshooting

### Cannot Login with Admin Credentials

**Check 1: Does the user exist?**
```bash
cd backend-api
npm run db:studio
# Check User table for admin@boomcard.bg
```

**Check 2: Is the password correct?**
The seed script uses `admin123`. Verify you haven't changed it.

**Check 3: Is the API server running?**
```bash
curl http://localhost:3000/api/health
```

**Check 4: Check the logs**
```bash
cd backend-api
npm run dev
# Watch for authentication errors
```

### "Forbidden" or "Unauthorized" Errors

**Check role:**
```bash
# User must have role: ADMIN or SUPER_ADMIN
npm run db:studio
# Verify role in User table
```

**Check status:**
```bash
# User status must be: ACTIVE
npm run db:studio
# Verify status in User table
```

### Password Not Working

**Reset password:**
```bash
node -e "console.log(require('bcryptjs').hashSync('admin123', 10))"
# Copy the hash
# Update in Prisma Studio
```

---

## Summary

✅ **Default Admin:**
- Email: `admin@boomcard.bg`
- Password: `admin123`
- Role: `SUPER_ADMIN`

✅ **Created By:**
```bash
cd backend-api
npm run db:seed
```

✅ **Change Password:**
Use API, Prisma Studio, or script (see above)

✅ **Security:**
Always change default password in production!

---

## Quick Commands

```bash
# Seed database (creates admin)
cd backend-api && npm run db:seed

# View database (check admin user)
cd backend-api && npm run db:studio

# Start API server
cd backend-api && npm run dev

# Test admin login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@boomcard.bg","password":"admin123"}'
```

---

**Remember:** The default password (`admin123`) is for **DEVELOPMENT ONLY**. Always use strong, unique passwords in production!

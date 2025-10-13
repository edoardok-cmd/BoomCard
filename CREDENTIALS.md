# BoomCard Platform Credentials

## Admin Access

### Super Admin Account
```
Email:    admin@boomcard.bg
Password: admin123
Role:     SUPER_ADMIN
```

⚠️ **FOR DEVELOPMENT ONLY - Change in production!**

---

## Test Partner Accounts

These are created by the seed script for testing:

### 1. Grand Hotel Sofia
```
Email:    grandhotel@boomcard.bg
Role:     PARTNER
Category: Hotels
City:     Sofia
```

### 2. Wine & Dine Restaurant
```
Email:    winedine@boomcard.bg
Role:     PARTNER
Category: Restaurants
City:     Sofia
```

### 3. Spa Retreat Bansko
```
Email:    sparetreat@boomcard.bg
Role:     PARTNER
Category: Spa
City:     Bansko
```

### 4. Sky Adventures
```
Email:    skyadventures@boomcard.bg
Role:     PARTNER
Category: Experiences
City:     Rila
```

### 5. Beachfront Hotel Varna
```
Email:    beachfront@boomcard.bg
Role:     PARTNER
Category: Hotels
City:     Varna
```

### 6. Villa Melnik Winery
```
Email:    villamelnik@boomcard.bg
Role:     PARTNER
Category: Wineries
City:     Melnik
```

**Note:** All test partner accounts use dummy password hashes (not real passwords). They're for database seeding only.

---

## How to Create These Accounts

```bash
cd backend-api
npm run db:seed
```

This creates:
- 1 admin user (login enabled)
- 6 partner users (database only - update passwords to enable login)

---

## Login URLs

### Frontend
```
http://localhost:5173/login
```

### API
```
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@boomcard.bg",
  "password": "admin123"
}
```

---

## Change Admin Password

### Via CLI
```bash
cd backend-api
node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const hash = await bcrypt.hash('your-new-password', 10);
  await prisma.user.update({
    where: { email: 'admin@boomcard.bg' },
    data: { passwordHash: hash }
  });
  console.log('✅ Admin password updated!');
  await prisma.\$disconnect();
})();
"
```

### Via Prisma Studio
```bash
cd backend-api
npm run db:studio
```

1. Open http://localhost:5555
2. Navigate to User table
3. Find admin@boomcard.bg
4. Update passwordHash field
5. Save

---

## Security Checklist

- [ ] Changed default admin password
- [ ] Using strong passwords (12+ characters)
- [ ] Enabled HTTPS in production
- [ ] Environment variables secured
- [ ] Database backups configured
- [ ] Admin access logged
- [ ] Rate limiting enabled
- [ ] JWT secrets changed from defaults

---

## Documentation

- **Full Admin Guide:** See `ADMIN_ACCESS.md`
- **Database Setup:** See `backend-api/DATABASE_README.md`
- **Quick Start:** See `SIMPLE_FIX.md`

---

## Quick Start

```bash
# 1. Seed database (creates admin)
cd backend-api && npm run db:seed

# 2. Start API
npm run dev

# 3. Start frontend
cd ../partner-dashboard && npm run dev

# 4. Login
Open: http://localhost:5173/login
Email: admin@boomcard.bg
Password: admin123
```

---

**Remember:** These are development credentials. Always use secure, unique passwords in production!

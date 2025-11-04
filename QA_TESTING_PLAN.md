# BoomCard - Comprehensive QA Testing Plan

## 📋 Testing Strategy Overview

### Testing Pyramid
```
       /\
      /E2E\          ← 10% (Critical user journeys)
     /------\
    /  API  \        ← 30% (Backend integration)
   /----------\
  /   Unit    \      ← 60% (Functions, components)
 /--------------\
```

---

## 1. Unit Testing

### 1.1 Backend Unit Tests

**Location:** `backend-api/src/__tests__/`

#### Services Testing
```typescript
// File: src/services/__tests__/auth.service.test.ts
describe('AuthService', () => {
  test('should hash password correctly', async () => {
    const password = 'Test123!';
    const hash = await AuthService.hashPassword(password);
    expect(hash).not.toBe(password);
    expect(await AuthService.verifyPassword(password, hash)).toBe(true);
  });

  test('should generate valid JWT tokens', () => {
    const user = { id: '123', email: 'test@test.com' };
    const token = AuthService.generateAccessToken(user);
    expect(token).toBeTruthy();
  });
});

// File: src/services/__tests__/sticker.service.test.ts
describe('StickerService', () => {
  test('should validate GPS coordinates within radius', () => {
    const result = StickerService.validateGPSProximity(
      42.6977, 23.3219,  // User location
      42.6978, 23.3220,  // Venue location
      100  // 100m radius
    );
    expect(result.isValid).toBe(true);
    expect(result.distance).toBeLessThan(100);
  });

  test('should reject GPS coordinates outside radius', () => {
    const result = StickerService.validateGPSProximity(
      42.6977, 23.3219,  // User location
      42.7977, 23.4219,  // Far venue location
      100  // 100m radius
    );
    expect(result.isValid).toBe(false);
    expect(result.distance).toBeGreaterThan(100);
  });
});
```

#### Utilities Testing
```typescript
// File: src/utils/__tests__/validation.test.ts
describe('Validation Utilities', () => {
  test('should validate email format', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('invalid')).toBe(false);
  });

  test('should validate Bulgarian phone numbers', () => {
    expect(isValidBulgarianPhone('+359888123456')).toBe(true);
    expect(isValidBulgarianPhone('0888123456')).toBe(true);
    expect(isValidBulgarianPhone('123')).toBe(false);
  });
});
```

### 1.2 Frontend Unit Tests

**Location:** `partner-dashboard/src/__tests__/`

#### Component Testing
```typescript
// File: src/components/__tests__/ReceiptCard.test.tsx
import { render, screen } from '@testing-library/react';
import { ReceiptCard } from '../ReceiptCard';

describe('ReceiptCard', () => {
  test('renders receipt data correctly', () => {
    const receipt = {
      merchantName: 'Test Store',
      totalAmount: 50.00,
      status: 'APPROVED',
    };

    render(<ReceiptCard receipt={receipt} />);

    expect(screen.getByText('Test Store')).toBeInTheDocument();
    expect(screen.getByText('50.00 лв')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  test('displays correct status color', () => {
    const { container } = render(
      <ReceiptCard receipt={{ status: 'APPROVED' }} />
    );

    const statusBadge = container.querySelector('.status-badge');
    expect(statusBadge).toHaveClass('status-approved');
  });
});
```

#### Hook Testing
```typescript
// File: src/hooks/__tests__/useReceipts.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useReceipts } from '../useReceipts';

describe('useReceipts', () => {
  test('fetches receipts on mount', async () => {
    const { result } = renderHook(() => useReceipts());

    await waitFor(() => {
      expect(result.current.receipts).toBeDefined();
      expect(result.current.isLoading).toBe(false);
    });
  });

  test('filters receipts by status', async () => {
    const { result } = renderHook(() => useReceipts({ status: 'APPROVED' }));

    await waitFor(() => {
      const allApproved = result.current.receipts.every(
        r => r.status === 'APPROVED'
      );
      expect(allApproved).toBe(true);
    });
  });
});
```

### 1.3 Mobile App Unit Tests

**Location:** `boomcard-mobile/src/__tests__/`

#### GPS Utility Testing
```typescript
// File: src/utils/__tests__/distance.test.ts
import { calculateDistance, isWithinRadius } from '../distance';

describe('GPS Distance Utilities', () => {
  test('calculates distance correctly', () => {
    // Sofia coordinates ~ 1km apart
    const distance = calculateDistance(
      42.6977, 23.3219,
      42.7066, 23.3219
    );

    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1100);
  });

  test('validates 60m radius correctly', () => {
    // Within 60m
    expect(isWithinRadius(
      42.6977, 23.3219,
      42.6978, 23.3220,
      60
    )).toBe(true);

    // Outside 60m
    expect(isWithinRadius(
      42.6977, 23.3219,
      42.7077, 23.3319,
      60
    )).toBe(false);
  });
});
```

---

## 2. Integration Testing

### 2.1 API Integration Tests

**Location:** `backend-api/src/__tests__/integration/`

#### Authentication Flow
```typescript
// File: src/__tests__/integration/auth.test.ts
describe('Authentication API Integration', () => {
  let testUser;

  beforeAll(async () => {
    // Setup test database
    await setupTestDB();
  });

  test('Complete registration and login flow', async () => {
    // 1. Register
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Test123!',
        firstName: 'Test',
        lastName: 'User',
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toHaveProperty('accessToken');

    // 2. Login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');

    // 3. Access protected route
    const profileRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.email).toBe('test@example.com');
  });

  test('Token refresh flow', async () => {
    const { accessToken, refreshToken } = await loginTestUser();

    // Wait for access token to expire (in test mode, short TTL)
    await sleep(1000);

    // Refresh token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body.accessToken).not.toBe(accessToken);
  });
});
```

#### Receipt Submission Flow
```typescript
// File: src/__tests__/integration/receipts.test.ts
describe('Receipt Submission Integration', () => {
  test('Complete receipt submission with GPS validation', async () => {
    const token = await getTestUserToken();

    // 1. Upload image
    const uploadRes = await request(app)
      .post('/api/receipts/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('receipt', './test-fixtures/receipt.jpg');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body).toHaveProperty('imageKey');

    // 2. Submit receipt with GPS
    const submitRes = await request(app)
      .post('/api/receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        merchantName: 'Test Store',
        totalAmount: 50.00,
        receiptDate: '2024-01-01',
        latitude: 42.6977,
        longitude: 23.3219,
        imageKey: uploadRes.body.imageKey,
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.status).toBe('PENDING');

    // 3. Verify GPS was saved
    expect(submitRes.body.latitude).toBe(42.6977);
    expect(submitRes.body.longitude).toBe(23.3219);
  });

  test('Reject receipt outside GPS radius', async () => {
    const token = await getTestUserToken();

    const res = await request(app)
      .post('/api/receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        merchantName: 'Test Store',
        totalAmount: 50.00,
        venueId: 'venue-123',
        latitude: 42.7977,  // Far from venue
        longitude: 23.4219,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('GPS validation failed');
  });
});
```

### 2.2 Database Integration Tests

```typescript
// File: src/__tests__/integration/database.test.ts
describe('Database Operations', () => {
  test('Transaction rollback on error', async () => {
    const initialCount = await prisma.user.count();

    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { email: 'test@test.com' } });
        throw new Error('Forced error');
      });
    } catch (error) {
      // Expected
    }

    const finalCount = await prisma.user.count();
    expect(finalCount).toBe(initialCount);
  });

  test('Cascade delete behavior', async () => {
    const user = await createTestUser();
    await createTestReceipt({ userId: user.id });

    await prisma.user.delete({ where: { id: user.id } });

    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id }
    });

    expect(receipts.length).toBe(0);
  });
});
```

---

## 3. End-to-End (E2E) Testing

### 3.1 Playwright E2E Tests (Already Implemented ✅)

**Location:** `partner-dashboard/tests/e2e/`

**Current Status:** 326 tests implemented

**Test Coverage:**
- ✅ Authentication flows
- ✅ Receipt submission
- ✅ Receipt analytics
- ✅ Mobile responsiveness
- ✅ Theme switching
- ✅ Navigation
- ✅ Integrations page

### 3.2 Critical User Journeys

#### Journey 1: New User Registration → First Receipt
```typescript
test('New user complete journey', async ({ page }) => {
  // 1. Register
  await page.goto('/register');
  await page.fill('[name="email"]', 'newuser@test.com');
  await page.fill('[name="password"]', 'Test123!');
  await page.fill('[name="firstName"]', 'Test');
  await page.fill('[name="lastName"]', 'User');
  await page.click('button[type="submit"]');

  // 2. Should redirect to dashboard
  await expect(page).toHaveURL('/dashboard');

  // 3. Navigate to receipt scanner
  await page.click('text=Scan Receipt');

  // 4. Upload receipt
  await page.setInputFiles('input[type="file"]', './test-fixtures/receipt.jpg');

  // 5. Fill receipt details
  await page.fill('[name="merchantName"]', 'Test Store');
  await page.fill('[name="totalAmount"]', '50.00');

  // 6. Submit
  await page.click('button:has-text("Submit Receipt")');

  // 7. Verify success
  await expect(page.locator('text=Receipt submitted')).toBeVisible();
});
```

#### Journey 2: QR Sticker Scan → Cashback
```typescript
test('QR sticker scan complete flow', async ({ page, context }) => {
  // 1. Login
  await loginAsTestUser(page);

  // 2. Navigate to scanner
  await page.goto('/scan');

  // 3. Grant camera permission (mock)
  await context.grantPermissions(['camera', 'geolocation']);

  // 4. Scan QR code (simulated)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('qr-scanned', {
      detail: { code: 'VENUE-123-TABLE-5' }
    }));
  });

  // 5. Enter bill amount
  await page.fill('[name="billAmount"]', '100.00');

  // 6. Upload receipt
  await page.setInputFiles('input[type="file"]', './test-fixtures/receipt.jpg');

  // 7. Submit
  await page.click('button:has-text("Submit")');

  // 8. Verify cashback calculation
  await expect(page.locator('text=Cashback: 5.00 лв')).toBeVisible();
});
```

### 3.3 Mobile App E2E Tests

**Tool:** Detox (React Native)

```typescript
// File: boomcard-mobile/e2e/receipts.e2e.js
describe('Receipt Scanner E2E', () => {
  beforeAll(async () => {
    await device.launchApp();
    await loginAsTestUser();
  });

  it('should scan receipt with GPS validation', async () => {
    // 1. Navigate to scanner
    await element(by.id('receipts-tab')).tap();
    await element(by.id('scan-receipt-btn')).tap();

    // 2. Grant permissions
    await device.grantPermissions(['camera', 'location']);

    // 3. Take photo (simulated)
    await element(by.id('capture-btn')).tap();

    // 4. Wait for OCR
    await waitFor(element(by.id('ocr-results')))
      .toBeVisible()
      .withTimeout(5000);

    // 5. Verify GPS validation
    await expect(element(by.id('gps-status'))).toHaveText('Within 60m');

    // 6. Submit
    await element(by.id('submit-btn')).tap();

    // 7. Verify success
    await expect(element(by.text('Receipt submitted!'))).toBeVisible();
  });

  it('should reject receipt outside 60m radius', async () => {
    // Simulate GPS coordinates far from venue
    await device.setLocation(42.7977, 23.4219);

    await element(by.id('scan-receipt-btn')).tap();
    await element(by.id('capture-btn')).tap();

    // Should show error
    await expect(element(by.text('You must be within 60m'))).toBeVisible();
  });
});
```

---

## 4. Performance Testing

### 4.1 Load Testing

**Tool:** Artillery

```yaml
# File: load-tests/receipt-submission.yml
config:
  target: 'https://api.boomcard.bg'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 users per second
    - duration: 120
      arrivalRate: 50  # Ramp up to 50 users/sec
    - duration: 60
      arrivalRate: 100 # Peak load

scenarios:
  - name: 'Receipt submission flow'
    flow:
      - post:
          url: '/api/auth/login'
          json:
            email: '{{ $randomEmail }}'
            password: 'Test123!'
          capture:
            - json: '$.accessToken'
              as: 'token'
      - post:
          url: '/api/receipts'
          headers:
            Authorization: 'Bearer {{ token }}'
          json:
            merchantName: 'Test Store'
            totalAmount: 50.00
            latitude: 42.6977
            longitude: 23.3219
```

**Run:** `artillery run load-tests/receipt-submission.yml`

### 4.2 Stress Testing

```yaml
# File: load-tests/stress-test.yml
config:
  target: 'https://api.boomcard.bg'
  phases:
    - duration: 300
      arrivalRate: 200  # 200 users per second for 5 minutes

scenarios:
  - name: 'Mixed load'
    flow:
      - get:
          url: '/api/receipts'
        weight: 30
      - post:
          url: '/api/receipts'
        weight: 50
      - get:
          url: '/api/receipts/analytics'
        weight: 20
```

### 4.3 Frontend Performance

**Tool:** Lighthouse CI

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "https://app.boomcard.bg",
        "https://app.boomcard.bg/dashboard",
        "https://app.boomcard.bg/receipts"
      ],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.9}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}]
      }
    }
  }
}
```

---

## 5. Security Testing

### 5.1 Authentication Security

```typescript
// File: src/__tests__/security/auth.security.test.ts
describe('Authentication Security', () => {
  test('should prevent SQL injection in login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: "admin' OR '1'='1",
        password: "anything"
      });

    expect(res.status).toBe(401);
  });

  test('should rate limit login attempts', async () => {
    const attempts = [];

    for (let i = 0; i < 10; i++) {
      attempts.push(
        request(app)
          .post('/api/auth/login')
          .send({ email: 'test@test.com', password: 'wrong' })
      );
    }

    const results = await Promise.all(attempts);
    const rateLimited = results.filter(r => r.status === 429);

    expect(rateLimited.length).toBeGreaterThan(0);
  });

  test('should hash passwords securely', async () => {
    const user = await createTestUser({ password: 'Test123!' });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });

    expect(dbUser.passwordHash).not.toContain('Test123!');
    expect(dbUser.passwordHash).toMatch(/^\$2[ab]\$/); // bcrypt format
  });
});
```

### 5.2 GPS Validation Security

```typescript
describe('GPS Security', () => {
  test('should reject forged GPS coordinates', async () => {
    const token = await getTestUserToken();

    // Try to submit receipt with coordinates that don't match device
    const res = await request(app)
      .post('/api/receipts')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Device-Coords', '42.6977,23.3219')
      .send({
        latitude: 42.7977,  // Different coordinates
        longitude: 23.4219,
      });

    expect(res.status).toBe(400);
  });

  test('should validate GPS accuracy', async () => {
    const token = await getTestUserToken();

    const res = await request(app)
      .post('/api/receipts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        latitude: 42.6977,
        longitude: 23.3219,
        accuracy: 500,  // Low accuracy (500m)
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('GPS accuracy');
  });
});
```

### 5.3 OWASP Top 10 Checks

- [ ] SQL Injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Authentication flaws
- [ ] Sensitive data exposure
- [ ] XML External Entities (XXE)
- [ ] Broken access control
- [ ] Security misconfiguration
- [ ] Insecure deserialization
- [ ] Using components with known vulnerabilities

---

## 6. Accessibility Testing

### 6.1 Automated Accessibility

**Tool:** axe-core

```typescript
// File: tests/e2e/accessibility.spec.ts
import { injectAxe, checkA11y } from 'axe-playwright';

test('Homepage accessibility', async ({ page }) => {
  await page.goto('/');
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
});

test('Receipt scanner accessibility', async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto('/receipts/scanner');
  await injectAxe(page);
  await checkA11y(page);
});
```

### 6.2 Manual Accessibility Checklist

- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast meets WCAG 2.1 AA
- [ ] Form labels present
- [ ] Alt text for images
- [ ] ARIA attributes correct
- [ ] Focus indicators visible
- [ ] No keyboard traps

---

## 7. Cross-Browser Testing

### 7.1 Browser Matrix

| Browser | Versions | Platform |
|---------|----------|----------|
| Chrome | Latest, Latest-1 | Desktop |
| Firefox | Latest, Latest-1 | Desktop |
| Safari | Latest, Latest-1 | macOS |
| Edge | Latest | Desktop |
| Chrome Mobile | Latest | Android |
| Safari Mobile | Latest | iOS |

### 7.2 Playwright Cross-Browser

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 12'] } },
  ],
});
```

---

## 8. Test Data Management

### 8.1 Test Fixtures

```typescript
// File: tests/fixtures/users.ts
export const testUsers = {
  standard: {
    email: 'standard@test.com',
    password: 'Test123!',
    role: 'USER',
  },
  admin: {
    email: 'admin@test.com',
    password: 'Admin123!',
    role: 'ADMIN',
  },
};

// File: tests/fixtures/receipts.ts
export const testReceipts = {
  valid: {
    merchantName: 'Test Store',
    totalAmount: 50.00,
    receiptDate: '2024-01-01',
    latitude: 42.6977,
    longitude: 23.3219,
  },
  invalidGPS: {
    merchantName: 'Test Store',
    totalAmount: 50.00,
    latitude: 42.7977,  // Far away
    longitude: 23.4219,
  },
};
```

### 8.2 Database Seeding

```typescript
// File: tests/setup/seed.ts
export async function seedTestDatabase() {
  // Create test users
  const users = await Promise.all([
    prisma.user.create({ data: testUsers.standard }),
    prisma.user.create({ data: testUsers.admin }),
  ]);

  // Create test venues
  const venues = await Promise.all([
    prisma.venue.create({
      data: {
        name: 'Test Venue 1',
        latitude: 42.6977,
        longitude: 23.3219,
      },
    }),
  ]);

  return { users, venues };
}
```

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  mobile-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npx detox build -c ios.sim.release
      - run: npx detox test -c ios.sim.release
```

---

## 10. Test Coverage Goals

### 10.1 Coverage Targets

| Component | Target | Current |
|-----------|--------|---------|
| Backend Services | 80% | TBD |
| Backend Routes | 70% | TBD |
| Frontend Components | 75% | TBD |
| Frontend Hooks | 80% | TBD |
| Mobile Utils | 90% | TBD |
| E2E Critical Paths | 100% | 70% |

### 10.2 Coverage Tools

**Backend:**
```json
// package.json
{
  "scripts": {
    "test:coverage": "jest --coverage",
    "test:coverage:watch": "jest --coverage --watchAll"
  },
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

---

## 11. Testing Checklist

### Pre-Release Testing

**Backend:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] API endpoints tested
- [ ] Database migrations tested
- [ ] Authentication flows verified
- [ ] GPS validation working
- [ ] Rate limiting tested
- [ ] Error handling verified

**Frontend:**
- [ ] All E2E tests pass (326/326)
- [ ] Component tests pass
- [ ] Responsive design verified
- [ ] Cross-browser tested
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] SEO requirements met

**Mobile:**
- [ ] iOS build successful
- [ ] Android build successful
- [ ] GPS validation tested
- [ ] Camera integration works
- [ ] OCR processing verified
- [ ] All permissions working
- [ ] Offline mode tested

**Security:**
- [ ] Penetration testing complete
- [ ] Security headers configured
- [ ] SSL/TLS verified
- [ ] OWASP Top 10 checked
- [ ] Sensitive data encrypted
- [ ] Rate limiting active

---

## 12. Bug Tracking Template

```markdown
### Bug Report

**Title:** [Brief description]

**Priority:** Critical / High / Medium / Low

**Environment:**
- Browser/Device:
- OS:
- App Version:

**Steps to Reproduce:**
1.
2.
3.

**Expected Result:**


**Actual Result:**


**Screenshots:**


**Console Errors:**


**Additional Context:**

```

---

## Summary

**Total Test Coverage:**
- Unit Tests: ~200 tests (to be implemented)
- Integration Tests: ~50 tests (to be implemented)
- E2E Tests: 326 tests (✅ implemented)
- Performance Tests: To be implemented
- Security Tests: To be implemented

**Testing Tools:**
- ✅ Playwright (E2E)
- Jest (Unit/Integration)
- Artillery (Load testing)
- Lighthouse (Performance)
- axe-core (Accessibility)
- Detox (Mobile E2E)

**Next Steps:**
1. Implement unit tests for backend services
2. Add integration tests for API flows
3. Create load testing scenarios
4. Perform security audit
5. Complete accessibility testing
6. Set up CI/CD pipelines

---

**This comprehensive QA plan ensures BoomCard meets the highest quality standards before production deployment.**

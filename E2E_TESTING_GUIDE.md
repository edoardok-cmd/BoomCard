# E2E Testing Guide - BOOM Card Platform

## Overview

This guide covers the comprehensive End-to-End (E2E) testing suite for the BOOM Card platform. The E2E tests use Playwright to simulate real user interactions and verify critical user flows work correctly.

## Test Coverage

### 1. Authentication Flow Tests

**File:** `partner-dashboard/tests/e2e/auth-flow.spec.ts`

**Coverage:**
- ✅ Login with valid credentials
- ✅ Login error handling (invalid email, wrong password)
- ✅ Form validation (empty fields)
- ✅ Password visibility toggle
- ✅ Logout functionality
- ✅ Protected route access control
- ✅ Session persistence across page reloads
- ✅ Session persistence across navigation
- ✅ Token refresh handling
- ✅ Language preference persistence
- ✅ Network error handling
- ✅ Backend server error handling
- ✅ Security (password not exposed in DOM)
- ✅ No sensitive data in console logs

**Test Count:** 20+ tests

**Key Scenarios:**
```typescript
// Login success
test('should successfully login with valid credentials')

// Error handling
test('should show error for invalid email')
test('should show error for incorrect password')

// Session management
test('should maintain session after page reload')

// Security
test('should not expose password in DOM')
```

### 2. Receipt Scanning Flow Tests

**File:** `partner-dashboard/tests/e2e/receipt-scanning-flow.spec.ts`

**Coverage:**
- ✅ Receipt upload interface navigation
- ✅ File upload functionality
- ✅ File type validation
- ✅ File size validation
- ✅ OCR processing state indicators
- ✅ Data extraction display
- ✅ OCR confidence scores
- ✅ Manual data editing
- ✅ Validation error handling
- ✅ Minimum amount requirements
- ✅ Cashback calculation accuracy
- ✅ Premium bonus display
- ✅ Receipt submission success
- ✅ Receipt appears in receipts list
- ✅ Status tracking
- ✅ Status filtering
- ✅ Receipt detail view
- ✅ OCR data display on detail page
- ✅ Receipt image display
- ✅ PDF export functionality
- ✅ CSV bulk export
- ✅ Duplicate receipt detection

**Test Count:** 30+ tests

**Key Scenarios:**
```typescript
// Upload
test('should upload receipt image successfully')

// OCR
test('should extract receipt data from image')

// Validation
test('should allow manual editing of extracted data')

// Submission
test('should submit receipt successfully')
```

### 3. Analytics Page Tests

**File:** `partner-dashboard/tests/e2e/analytics-page.spec.ts`

**Coverage:**
- ✅ Navigation to analytics page
- ✅ Analytics widget on dashboard
- ✅ Total spent statistic
- ✅ Total cashback statistic
- ✅ Average receipt amount
- ✅ Success rate percentage
- ✅ Spending trend chart
- ✅ Receipts submitted chart
- ✅ Top merchants chart
- ✅ Status distribution chart
- ✅ Cashback earned chart
- ✅ All 5 charts render without errors
- ✅ Date range filtering
- ✅ Merchant filtering
- ✅ Status filtering
- ✅ Amount range filtering
- ✅ Clear all filters
- ✅ Next month spending prediction
- ✅ Cashback forecast
- ✅ Growth trend indicator
- ✅ CSV export
- ✅ Export filtered data
- ✅ Mobile responsiveness
- ✅ Tablet responsiveness
- ✅ Data accuracy verification
- ✅ Performance (load < 3 seconds)
- ✅ Empty state handling
- ✅ Language support

**Test Count:** 35+ tests

**Key Scenarios:**
```typescript
// Charts
test('should display spending trend chart')
test('should render all charts without errors')

// Filters
test('should filter by date range')
test('should filter by merchant')

// Predictions
test('should display next month spending prediction')

// Performance
test('should load analytics page within 3 seconds')
```

### 4. Mobile Responsiveness Tests

**File:** `partner-dashboard/tests/e2e/mobile-responsive.spec.ts`

**Coverage:**
- ✅ iPhone SE (375px) layout
- ✅ iPhone XR/11 (414px) layout
- ✅ iPad (768px) layout
- ✅ iPad Pro (1024px) layout
- ✅ Full HD desktop (1920px) layout
- ✅ 2K desktop (2560px) layout
- ✅ 4K desktop (3840px) layout
- ✅ Hamburger menu visibility on mobile
- ✅ Mobile menu opening/closing
- ✅ Vertical card stacking on mobile
- ✅ Receipt list on mobile
- ✅ CTA button accessibility on mobile
- ✅ Tablet navigation
- ✅ Grid layout on tablet
- ✅ Charts on tablet
- ✅ Full navigation on desktop
- ✅ Multi-column layout on desktop
- ✅ Hero logo on 4K
- ✅ Navigation max-width on 4K
- ✅ Mega menu on 4K
- ✅ Portrait/landscape rotation
- ✅ Touch events
- ✅ Smooth scrolling
- ✅ Swipe gestures
- ✅ Readable font sizes
- ✅ Line height for readability
- ✅ Tap target size (44x44px minimum)
- ✅ Element spacing
- ✅ Image optimization

**Test Count:** 30+ tests

**Key Scenarios:**
```typescript
// Mobile
test('should show hamburger menu on mobile')
test('should display dashboard cards stacked vertically on mobile')

// Tablet
test('should display dashboard in grid layout on tablet')

// 4K
test('should display hero logo properly on 4K')

// Touch
test('should handle touch events on buttons')
```

## Running Tests

### Prerequisites

```bash
cd partner-dashboard
npm install
```

### Run All E2E Tests

```bash
# Run all tests headless
npx playwright test

# Run all tests with browser visible
npx playwright test --headed

# Run all tests with UI mode (interactive)
npx playwright test --ui
```

### Run Specific Test Suites

```bash
# Auth tests only
npx playwright test auth-flow.spec.ts

# Receipt scanning tests only
npx playwright test receipt-scanning-flow.spec.ts

# Analytics tests only
npx playwright test analytics-page.spec.ts

# Mobile responsive tests only
npx playwright test mobile-responsive.spec.ts
```

### Run Tests on Specific Browsers

```bash
# Chrome only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Safari only
npx playwright test --project=webkit

# All browsers
npx playwright test --project=chromium --project=firefox --project=webkit
```

### Debug Tests

```bash
# Debug mode (step through tests)
npx playwright test --debug

# Debug specific test
npx playwright test auth-flow.spec.ts --debug

# Generate trace for debugging
npx playwright test --trace on
```

### Generate Test Reports

```bash
# Run tests and generate HTML report
npx playwright test --reporter=html

# Open report
npx playwright show-report

# Generate JSON report
npx playwright test --reporter=json
```

## Test Configuration

### Playwright Config

**File:** `partner-dashboard/playwright.config.ts`

Key settings:
```typescript
{
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: 'http://localhost:5175',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'Mobile Chrome', use: devices['Pixel 5'] },
    { name: 'Mobile Safari', use: devices['iPhone 12'] },
  ],
}
```

## Test Environment Setup

### 1. Backend Server

Before running tests, ensure the backend is running:

```bash
cd backend-api
npm run dev
```

**Expected:** Backend running on http://localhost:3001

### 2. Frontend Server

```bash
cd partner-dashboard
npm run dev
```

**Expected:** Frontend running on http://localhost:5175

### 3. Database

Ensure database has test data:

```bash
cd backend-api
npx prisma db seed
```

Or use the enhanced test data script from previous session.

### 4. Test User

Tests use this user (ensure it exists in database):
```
Email: demo@boomcard.bg
Password: demo123
```

## Test Data Requirements

### Required Database Data

For complete test coverage, your database should have:

**Users:**
- At least 1 test user with credentials above
- User must have receipts, loyalty points, cards

**Receipts:**
- Minimum 3 receipts (various statuses: PENDING, APPROVED, REJECTED)
- Receipts with different merchants
- Receipts with different dates (for trending)

**Transactions:**
- At least 2 transactions linked to receipts

**Cards:**
- At least 1 card (STANDARD or PREMIUM)

### Seed Data Script

Create file: `backend-api/prisma/seed-test-data.ts`

```typescript
// Use the enhanced seed script from previous session
// Or run: npm run db:seed
```

## Test Fixtures

### Required Fixtures

Create these files in `partner-dashboard/tests/fixtures/`:

**1. test-receipt.png**
- Sample receipt image (800x1200px recommended)
- Contains merchant name, amount, date, items
- Used for OCR testing

**2. test-document.txt**
- Plain text file
- Used for file type validation testing

### Creating Test Receipt Image

Option 1: Use a real receipt photo
```bash
# Take photo of receipt
# Resize to reasonable size
# Save as test-receipt.png
```

Option 2: Generate programmatically
```bash
# Use ImageMagick or similar
convert -size 800x1200 xc:white \
  -pointsize 40 -draw "text 50,100 'MERCHANT NAME'" \
  -pointsize 30 -draw "text 50,200 'Total: 45.50 BGN'" \
  -pointsize 20 -draw "text 50,250 'Date: 2024-01-04'" \
  test-receipt.png
```

## CI/CD Integration

### GitHub Actions

Create `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies (backend)
        working-directory: ./backend-api
        run: npm ci

      - name: Install dependencies (frontend)
        working-directory: ./partner-dashboard
        run: npm ci

      - name: Install Playwright browsers
        working-directory: ./partner-dashboard
        run: npx playwright install --with-deps

      - name: Setup database
        working-directory: ./backend-api
        run: |
          npx prisma migrate deploy
          npx prisma db seed

      - name: Start backend
        working-directory: ./backend-api
        run: npm run dev &

      - name: Start frontend
        working-directory: ./partner-dashboard
        run: npm run dev &

      - name: Wait for servers
        run: |
          npx wait-on http://localhost:3001/health
          npx wait-on http://localhost:5175

      - name: Run E2E tests
        working-directory: ./partner-dashboard
        run: npx playwright test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: partner-dashboard/playwright-report/
```

## Best Practices

### 1. Test Independence

Each test should be independent:
```typescript
test.beforeEach(async ({ page }) => {
  // Clear state
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());

  // Login fresh
  await login(page);
});
```

### 2. Stable Selectors

Prefer:
- `getByRole()` - Accessibility based
- `getByLabel()` - Form labels
- `getByTestId()` - Explicit test IDs

Avoid:
- CSS class selectors (fragile)
- XPath (complex, hard to maintain)

### 3. Waits

Use explicit waits:
```typescript
// Good
await page.waitForURL('/dashboard', { timeout: 5000 });
await expect(element).toBeVisible({ timeout: 3000 });

// Avoid
await page.waitForTimeout(5000); // Arbitrary wait
```

### 4. Error Handling

Handle expected errors gracefully:
```typescript
const button = page.getByRole('button', { name: /submit/i });

if (await button.isVisible()) {
  await button.click();
} else {
  // Skip test or use alternative path
}
```

### 5. Screenshots and Videos

Enabled on failure automatically:
```typescript
// Playwright config
use: {
  screenshot: 'only-on-failure',
  video: 'retain-on-failure',
}
```

## Troubleshooting

### Tests Timing Out

**Cause:** Servers not running or slow responses

**Solution:**
```bash
# Check servers are running
curl http://localhost:3001/health
curl http://localhost:5175

# Increase timeout in playwright.config.ts
timeout: 60000
```

### Element Not Found

**Cause:** Selector is incorrect or element hasn't loaded

**Solution:**
```typescript
// Add explicit wait
await page.waitForSelector('[data-testid="element"]');

// Or use more flexible selector
const element = page.getByText(/text/i);
```

### Flaky Tests

**Cause:** Race conditions, async operations

**Solution:**
```typescript
// Use waitForLoadState
await page.waitForLoadState('networkidle');

// Use retry logic
await expect(async () => {
  const text = await page.textContent('.element');
  expect(text).toBe('Expected');
}).toPass({ timeout: 5000 });
```

### Database State Issues

**Cause:** Tests affecting each other's data

**Solution:**
```bash
# Reset database before test run
cd backend-api
npx prisma migrate reset --force
npx prisma db seed
```

## Performance Optimization

### 1. Run Tests in Parallel

```bash
# Default: runs in parallel
npx playwright test

# Control workers
npx playwright test --workers=4
```

### 2. Skip Non-Critical Tests in Development

```typescript
test.skip('long running test', async ({ page }) => {
  // Skipped during development
});
```

### 3. Use Test Sharding for CI

```bash
# Shard 1 of 3
npx playwright test --shard=1/3

# Shard 2 of 3
npx playwright test --shard=2/3

# Shard 3 of 3
npx playwright test --shard=3/3
```

## Test Metrics

### Coverage Goals

- ✅ Authentication: 95% coverage
- ✅ Receipt scanning: 90% coverage
- ✅ Analytics: 85% coverage
- ✅ Mobile responsive: 80% coverage

### Performance Benchmarks

- Page load: < 3 seconds
- Test execution: < 5 minutes (all tests)
- Individual test: < 30 seconds

## Future Enhancements

### Planned Tests

- [ ] Payment flow E2E tests (Stripe integration)
- [ ] Loyalty points redemption flow
- [ ] Partner onboarding flow
- [ ] Admin panel tests
- [ ] API integration tests
- [ ] Performance/load tests
- [ ] Accessibility (a11y) tests
- [ ] Visual regression tests

### Tools to Consider

- **Percy** - Visual regression testing
- **Lighthouse CI** - Performance testing
- **axe-core** - Accessibility testing
- **k6** - Load testing

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Selectors Guide](https://playwright.dev/docs/selectors)
- [Debugging Guide](https://playwright.dev/docs/debug)

## Support

For issues with E2E tests:

1. Check test output and screenshots
2. Review Playwright trace
3. Verify servers are running
4. Check database state
5. Consult Playwright documentation

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
**Test Count:** 115+ tests across 4 test suites

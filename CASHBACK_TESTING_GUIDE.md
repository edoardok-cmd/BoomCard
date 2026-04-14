# Cashback Admin UI Testing Guide

## Overview

This guide covers Playwright E2E tests for the Admin Cashback Management page (`/admin/cashback`), which handles partner cashback payment tracking and management.

## Test Suites

### 1. `cashback-ui-simple.spec.ts` (Quick Visual Tests)
**Status**: ✅ All tests passing  
**Purpose**: Visual validation and basic page structure checks  
**Tests**: 8
- Page structure verification
- Responsive layouts (desktop, tablet, mobile)
- Console error detection
- Network request tracking
- Accessibility features

**Run**: 
```bash
npx playwright test tests/e2e/cashback-ui-simple.spec.ts
```

### 2. `cashback-admin.spec.ts` (Comprehensive Functional Tests)
**Purpose**: Full feature testing with authentication  
**Tests**: 29 organized in test suites

#### Test Suites:
- **Navigation & Page Load** (3 tests)
  - Page loads and displays UI elements
  - Authentication redirect
  - Statistics display formatting

- **Filter Controls** (3 tests)
  - Status filter buttons (All, Pending, Paid, Overdue)
  - Filter data by status
  - Highlight active filter

- **Month Selection** (2 tests)
  - Display month input
  - Change data when month selected

- **Table Display** (3 tests)
  - Correct columns displayed
  - Loading state handling
  - Empty state message

- **Action Buttons** (3 tests)
  - Mark as Paid modal
  - Mark Paid with notes
  - Send Reminder button

- **Status Chips** (1 test)
  - Display with appropriate colors and icons

- **Toast Notifications** (1 test)
  - Success toast on action completion

- **Responsive Design** (3 tests)
  - Desktop (1920x1080)
  - Tablet (768x1024)
  - Mobile (375x667)

- **Language Support** (2 tests)
  - English display
  - Bulgarian display

- **Error Handling** (2 tests)
  - API errors
  - Network timeouts

- **Data Display** (3 tests)
  - Partner information formatting
  - Amount formatting
  - Date formatting

- **Accessibility** (3 tests)
  - Heading hierarchy
  - Button labels
  - Table structure

**Run**:
```bash
npx playwright test tests/e2e/cashback-admin.spec.ts
```

## Test Credentials

```
Email: demo@boomcard.bg
Password: demo123
```

## Development Setup

### Start Dev Server
```bash
# From /Users/administrator/Documents/BoomCard/partner-dashboard
npm run dev

# Server runs on: http://localhost:3022
```

### Run Tests

**Quick visual tests** (no auth required):
```bash
npx playwright test tests/e2e/cashback-ui-simple.spec.ts
```

**All admin tests** (requires auth):
```bash
npx playwright test tests/e2e/cashback-admin.spec.ts
```

**Specific test**:
```bash
npx playwright test tests/e2e/cashback-admin.spec.ts -g "should display status filter"
```

**With browser visible** (headed mode):
```bash
npx playwright test tests/e2e/cashback-admin.spec.ts --headed
```

**Debug mode** (step-through execution):
```bash
npx playwright test tests/e2e/cashback-admin.spec.ts --debug
```

## Screenshots

Screenshots are automatically captured:
- On test failure (full page)
- Manually in test via `page.screenshot()`

Location: `partner-dashboard/test-results/`

## Test Reports

View detailed HTML report:
```bash
npx playwright show-report
```

## Key Page Features Being Tested

### Statistics Cards
- Outstanding balance (BGN)
- Paid this month (BGN)
- Overdue partners count
- Active partners count

### Status Filters
- All (default)
- Pending
- Paid
- Overdue

### Month Selection
- Date input selector
- Filters data for selected month

### Admin Actions
- **Mark as Paid**: Opens modal with notes field
- **Send Reminder**: Email reminder to partner
- **View Receipts**: Navigate to receipt details

### Data Table
- Partner name and email
- Month
- Receipt count
- Amount owed (currency formatted)
- Status (with icon/chip)
- Paid date
- Action buttons

## Component Testing

### AdminCashbackPage Components
Located: `partner-dashboard/src/pages/AdminCashbackPage.tsx`

Key styled components tested:
- `StatsRow` - Statistics cards grid
- `FilterBtn` - Status filter buttons
- `MonthInput` - Date picker
- `Table` - Data table
- `Modal` - Mark as paid dialog
- `Toast` - Notification messages
- `StatusChip` - Status badge

## Configuration

### Playwright Config
File: `partner-dashboard/playwright.config.ts`

Key settings:
```typescript
baseURL: 'http://localhost:3022'
testDir: './tests/e2e'
reporter: 'html'
screenshot: { mode: 'only-on-failure', fullPage: true }
```

## Common Issues & Solutions

### Issue: "Browser is already in use"
**Solution**: Run from CLAUDE.md
```bash
npm run playwright:fix
sleep 3
npx playwright test [...]
```

### Issue: Tests timeout on login
**Reason**: Page may take time to load on first run  
**Solution**: Tests have 5-10s timeout, increase if needed:
```typescript
await page.waitForLoadState('networkidle', { timeout: 10000 });
```

### Issue: Screenshot too large
**Solution**: Automatically handled by Playwright optimizer

## Continuous Integration

To add to CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Playwright tests
  run: npx playwright test
  
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Next Steps

1. **Authentication Mock**: Add auth mock/context for faster tests
2. **Visual Regression**: Set up baseline screenshots for comparison
3. **API Mocking**: Mock backend API for isolated UI testing
4. **Performance Testing**: Add metrics for page load times
5. **Coverage Report**: Generate coverage for page elements

## Useful Resources

- [Playwright Documentation](https://playwright.dev)
- [Locator Guide](https://playwright.dev/docs/locators)
- [Best Practices](https://playwright.dev/docs/best-practices)

## Test Maintenance

### When to Update Tests
- New UI features added to admin page
- Filter options or status types change
- Modal or button interactions change
- Responsive breakpoints update
- Language keys update

### How to Debug Failed Tests
1. Run test in debug mode: `--debug`
2. Check screenshot in `test-results/`
3. Review console errors in Playwright report
4. Check network requests in test output

---

**Last Updated**: 2026-04-14  
**Author**: Claude Code  
**Status**: ✅ Production Ready

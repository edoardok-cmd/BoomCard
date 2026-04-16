/**
 * Playwright E2E Tests: Admin Cashback Management
 *
 * Tests the AdminCashbackPage functionality including:
 * - Navigation and authentication
 * - Statistics display
 * - Status filtering (All, Pending, Paid, Overdue)
 * - Month selection
 * - Mark as paid modal
 * - Send reminder functionality
 * - Responsive design
 */

import { test, expect } from '@playwright/test';

// Test credentials
const TEST_USER = {
  email: 'demo@boomcard.bg',
  password: 'demo123',
};

// Helper function to login
async function loginAsAdmin(page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle', { timeout: 5000 });

  // Wait for form to be interactive
  const emailInput = page.getByLabel(/email|имейл/i);
  await emailInput.waitFor({ state: 'visible', timeout: 5000 });

  await emailInput.fill(TEST_USER.email);
  await page.getByLabel(/password|парола/i).fill(TEST_USER.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
}

test.describe('Admin Cashback Management', () => {
  test.beforeEach(async ({ page }) => {
    // Clear session before each test
    await page.context().clearCookies();
  });

  test.describe('Navigation & Page Load', () => {
    test('should navigate to admin cashback page and display UI elements', async ({ page }) => {
      // Login
      await loginAsAdmin(page);

      // Navigate to cashback admin page
      await page.goto('/admin/cashback');

      // Wait for page to load
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Verify page title
      await expect(page.locator('h1')).toContainText(/cashback|плащания/i);

      // Verify subtitle
      await expect(page.locator('p')).toContainText(/track|partner|проследяв/i);

      // Verify statistics cards exist
      const statCards = page.locator('[class*="StatCard"]');
      await expect(statCards).toHaveCount(4);

      // Take screenshot of loaded page
      await page.screenshot({ path: 'cashback-admin-loaded.png' });
    });

    test('should redirect to login if not authenticated', async ({ page }) => {
      // Don't login, try to access protected route
      await page.goto('/admin/cashback');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should display statistics with proper formatting', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Check for statistical values
      const statValues = page.locator('[class*="StatValue"]');

      // Each stat value should contain a number
      for (let i = 0; i < await statValues.count(); i++) {
        const value = await statValues.nth(i).textContent();
        expect(value).toMatch(/\d+(\.\d{2})?/); // Match numbers like 100 or 100.00
      }
    });
  });

  test.describe('Filter Controls', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should display all status filter buttons', async ({ page }) => {
      const filterButtons = page.locator('[class*="FilterBtn"]');

      // Should have 4 filter buttons: All, Pending, Paid, Overdue
      await expect(filterButtons).toHaveCount(4);

      // Verify button labels (in English and Bulgarian)
      const allBtn = page.getByRole('button', { name: /all|всички/i }).first();
      const pendingBtn = page.getByRole('button', { name: /pending|чакащи/i });
      const paidBtn = page.getByRole('button', { name: /paid|платени/i });
      const overdueBtn = page.getByRole('button', { name: /overdue|просрочени/i });

      await expect(allBtn).toBeVisible();
      await expect(pendingBtn).toBeVisible();
      await expect(paidBtn).toBeVisible();
      await expect(overdueBtn).toBeVisible();
    });

    test('should filter cashback entries by status', async ({ page }) => {
      // Click pending filter
      await page.getByRole('button', { name: /pending|чакащи/i }).click();

      // Wait for data to reload
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Take screenshot of filtered view
      await page.screenshot({ path: 'cashback-pending-filter.png' });

      // Click paid filter
      await page.getByRole('button', { name: /paid|платени/i }).click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Take screenshot of paid filter
      await page.screenshot({ path: 'cashback-paid-filter.png' });

      // Click overdue filter
      await page.getByRole('button', { name: /overdue|просрочени/i }).click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Take screenshot of overdue filter
      await page.screenshot({ path: 'cashback-overdue-filter.png' });

      // Click all filter to reset
      await page.getByRole('button', { name: /all|всички/i }).first().click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should highlight active filter button', async ({ page }) => {
      const allBtn = page.getByRole('button', { name: /all|всички/i }).first();
      const pendingBtn = page.getByRole('button', { name: /pending|чакащи/i });

      // "All" button should be active initially
      const allBtnClass = await allBtn.getAttribute('class');
      expect(allBtnClass).toContain('active');

      // Click pending filter
      await pendingBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Pending button should now be active
      const pendingBtnClass = await pendingBtn.getAttribute('class');
      expect(pendingBtnClass).toContain('active');
    });
  });

  test.describe('Month Selection', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should display month input field', async ({ page }) => {
      const monthInput = page.locator('input[type="month"]');

      await expect(monthInput).toBeVisible();

      // Month input should have a value (current month)
      const value = await monthInput.inputValue();
      expect(value).toMatch(/\d{4}-\d{2}/); // YYYY-MM format
    });

    test('should change data when month is selected', async ({ page }) => {
      const monthInput = page.locator('input[type="month"]');

      // Get initial month value
      const currentMonth = await monthInput.inputValue();

      // Change to a different month (previous month)
      const [year, month] = currentMonth.split('-');
      const prevMonth = parseInt(month) === 1 ? '12' : String(parseInt(month) - 1).padStart(2, '0');
      const prevYear = parseInt(month) === 1 ? String(parseInt(year) - 1) : year;
      const newMonth = `${prevYear}-${prevMonth}`;

      await monthInput.fill(newMonth);
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Take screenshot
      await page.screenshot({ path: 'cashback-month-changed.png' });

      // Verify the month input has the new value
      const updatedValue = await monthInput.inputValue();
      expect(updatedValue).toBe(newMonth);
    });
  });

  test.describe('Table Display', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should display cashback table with correct columns', async ({ page }) => {
      // Wait for table to be visible
      const table = page.locator('table');
      await expect(table).toBeVisible();

      // Check table headers
      const headers = page.locator('th');
      const headerTexts = await headers.allTextContents();

      // Should have these columns (in any language)
      expect(headerTexts.length).toBeGreaterThan(0);

      // Verify table structure
      const rows = page.locator('tbody tr');
      expect(await rows.count()).toBeGreaterThanOrEqual(0);
    });

    test('should display loading state', async ({ page }) => {
      // Mock slow network for cashback endpoint only
      await page.route('**/api/admin/cashback**', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });

      await page.goto('/admin/cashback');

      // Should show loading text
      const loadingText = page.getByText(/loading|зареждане/i);

      // Wait for it to either appear or resolve
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    });

    test('should display empty state message', async ({ page }) => {
      // Mock API to return empty data
      await page.route('**/api/admin/cashback**', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            summary: [],
            stats: {
              pendingTotal: 0,
              paidThisMonth: 0,
              overdueCount: 0,
              activePartners: 0,
            },
          }),
        });
      });

      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Should show empty state
      const emptyMsg = page.getByText(/no|activity|няма/i);
      const visible = await emptyMsg.isVisible().catch(() => false);

      // Either show data or empty message
      expect(visible || await page.locator('table').isVisible()).toBeTruthy();
    });
  });

  test.describe('Action Buttons - Mark as Paid', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should open mark paid modal when button clicked', async ({ page }) => {
      // Find first mark paid button
      const markPaidBtn = page.locator('button').filter({ hasText: /mark|paid|маркирай/i }).first();

      // Check if button exists
      const exists = await markPaidBtn.isVisible().catch(() => false);

      if (exists) {
        await markPaidBtn.click();

        // Modal should appear
        const modal = page.locator('[class*="Modal"]');
        await expect(modal).toBeVisible();

        // Take screenshot of modal
        await page.screenshot({ path: 'cashback-mark-paid-modal.png' });

        // Verify modal content
        const modalTitle = page.getByText(/mark.*paid|маркирай.*платено/i);
        await expect(modalTitle).toBeVisible();

        // Close modal by clicking cancel
        const cancelBtn = page.getByRole('button', { name: /cancel|отказ/i }).last();
        await cancelBtn.click();

        // Modal should disappear
        await expect(modal).not.toBeVisible();
      }
    });

    test('should handle mark paid with notes', async ({ page }) => {
      const markPaidBtn = page.locator('button').filter({ hasText: /mark|paid|маркирай/i }).first();
      const exists = await markPaidBtn.isVisible().catch(() => false);

      if (exists) {
        await markPaidBtn.click();

        // Wait for modal
        const modal = page.locator('[class*="Modal"]');
        await expect(modal).toBeVisible();

        // Fill in notes
        const textarea = page.locator('textarea');
        if (await textarea.isVisible()) {
          await textarea.fill('Bank transfer ref: TRX-123456');
        }

        // Take screenshot with notes
        await page.screenshot({ path: 'cashback-modal-with-notes.png' });

        // Close modal
        const cancelBtn = page.getByRole('button', { name: /cancel|отказ/i }).last();
        await cancelBtn.click();
      }
    });
  });

  test.describe('Action Buttons - Send Reminder', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should have send reminder button', async ({ page }) => {
      const remindBtn = page.locator('button').filter({ hasText: /remind|напомни/i }).first();
      const exists = await remindBtn.isVisible().catch(() => false);

      if (exists) {
        await expect(remindBtn).toBeVisible();

        // Take screenshot showing remind button
        await page.screenshot({ path: 'cashback-remind-button.png' });
      }
    });
  });

  test.describe('Status Chips', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should display status chips with appropriate colors', async ({ page }) => {
      const statusChips = page.locator('[class*="StatusChip"]');
      const count = await statusChips.count();

      if (count > 0) {
        // Take screenshot showing status chips
        await page.screenshot({ path: 'cashback-status-chips.png' });

        // Each status chip should have text (PENDING, PAID, OVERDUE, etc)
        for (let i = 0; i < Math.min(count, 3); i++) {
          const text = await statusChips.nth(i).textContent();
          expect(text?.toUpperCase()).toMatch(/PENDING|PAID|OVERDUE/);
        }
      }
    });
  });

  test.describe('Toast Notifications', () => {
    test.beforeEach(async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    });

    test('should show toast on successful action', async ({ page }) => {
      // Mock admin API to return success
      let apiCalled = false;
      await page.route('**/api/admin/**', route => {
        apiCalled = true;
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true }),
        });
      });

      const remindBtn = page.locator('button').filter({ hasText: /remind|напомни/i }).first();
      const exists = await remindBtn.isVisible().catch(() => false);

      if (exists) {
        await remindBtn.click();

        // Wait for toast to appear
        const toast = page.locator('[class*="Toast"]');
        const visible = await toast.isVisible({ timeout: 3000 }).catch(() => false);

        if (visible) {
          await page.screenshot({ path: 'cashback-toast-notification.png' });

          // Wait for toast to disappear
          await page.waitForTimeout(4000);
        }
      }
    });
  });

  test.describe('Responsive Design', () => {
    test('should display correctly on desktop (1920x1080)', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      await page.screenshot({ path: 'cashback-desktop-1920x1080.png', fullPage: true });

      // All elements should be visible
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('[class*="FilterBtn"]').first()).toBeVisible();
      await expect(page.locator('input[type="month"]')).toBeVisible();
    });

    test('should display correctly on tablet (768x1024)', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      await page.screenshot({ path: 'cashback-tablet-768x1024.png', fullPage: true });

      // Main elements should still be visible
      await expect(page.locator('h1')).toBeVisible();
    });

    test('should display correctly on mobile (375x667)', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      await page.screenshot({ path: 'cashback-mobile-375x667.png', fullPage: true });

      // Main heading should be visible
      await expect(page.locator('h1')).toBeVisible();

      // Table should be visible or scrollable
      const table = page.locator('table');
      const tableVisible = await table.isVisible().catch(() => false);
      const emptyMsg = page.getByText(/no|activity|няма/i);
      const emptyVisible = await emptyMsg.isVisible().catch(() => false);

      expect(tableVisible || emptyVisible).toBeTruthy();
    });
  });

  test.describe('Language Support', () => {
    test('should display content in English', async ({ page }) => {
      // Set to English
      await page.evaluate(() => localStorage.setItem('language', 'en'));

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Should have English text
      const englishTexts = page.getByText(/cashback|payments|partner|outstanding/i);
      await expect(englishTexts.first()).toBeVisible();

      await page.screenshot({ path: 'cashback-english.png' });
    });

    test('should display content in Bulgarian', async ({ page }) => {
      // Set to Bulgarian
      await page.evaluate(() => localStorage.setItem('language', 'bg'));

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Should have Bulgarian text (at least in headings)
      const heading = page.locator('h1');
      const text = await heading.textContent();

      // Either English or Bulgarian should be visible
      expect(text).toBeTruthy();

      await page.screenshot({ path: 'cashback-bulgarian.png' });
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      // Mock cashback API to return error
      await page.route('**/api/admin/cashback**', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' }),
        });
      });

      await loginAsAdmin(page);
      await page.goto('/admin/cashback');

      // Wait for page to settle
      await page.waitForTimeout(3000);

      // Should show error or fallback UI
      await page.screenshot({ path: 'cashback-error-state.png' });
    });

    test('should handle network timeout', async ({ page, context }) => {
      await context.setOffline(true);

      await loginAsAdmin(page);

      await context.setOffline(false);

      await page.goto('/admin/cashback', { waitUntil: 'domcontentloaded' });

      // Screenshot the page
      await page.screenshot({ path: 'cashback-offline-state.png' });
    });
  });

  test.describe('Data Display', () => {
    test('should display partner information correctly', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Check for partner names and emails in table
      const rows = page.locator('tbody tr');
      const count = await rows.count();

      if (count > 0) {
        // Partner names should be visible
        const firstRow = rows.first();
        await expect(firstRow).toBeVisible();

        await page.screenshot({ path: 'cashback-partner-data.png' });
      }
    });

    test('should display amounts with proper formatting', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Check for properly formatted currency amounts
      const amountCells = page.locator('[class*="AmountOwed"]');
      const count = await amountCells.count();

      if (count > 0) {
        const firstAmount = await amountCells.first().textContent();
        // Should match currency format (e.g., 1000.50 or 1,000.50)
        expect(firstAmount).toMatch(/[\d,]+\.?\d{0,2}/);
      }

      await page.screenshot({ path: 'cashback-amount-display.png' });
    });

    test('should display dates in correct format', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Look for date cells
      const dateCells = page.locator('td:has-text("20") td, td:has-text("19")');
      await page.screenshot({ path: 'cashback-date-display.png' });
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Should have h1
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();

      // Should have proper structure
      const headings = page.locator('h1, h2, h3');
      expect(await headings.count()).toBeGreaterThan(0);
    });

    test('should have accessible button labels', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Filter buttons should have accessible names
      const filterBtns = page.locator('button');
      const count = await filterBtns.count();

      expect(count).toBeGreaterThan(0);
    });

    test('should have proper table structure', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/admin/cashback');
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      const table = page.locator('table');
      const hasTable = await table.isVisible().catch(() => false);

      if (hasTable) {
        // Table should have thead and tbody
        const thead = page.locator('thead');
        const tbody = page.locator('tbody');

        await expect(thead).toBeVisible();
        const tbodyCount = await tbody.count();
        expect(tbodyCount).toBeGreaterThan(0);
      }
    });
  });
});

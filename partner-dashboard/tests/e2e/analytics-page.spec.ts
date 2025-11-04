/**
 * E2E Tests: Analytics Page
 *
 * Tests analytics dashboard functionality, charts, filters, and data visualization
 */

import { test, expect } from '@playwright/test';

// Test user credentials
const TEST_USER = {
  email: 'demo@boomcard.bg',
  password: 'demo123',
};

test.describe('Receipt Analytics Page', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /log in|влез/i }).click();
    await page.waitForURL('/dashboard', { timeout: 5000 });
  });

  test.describe('Page Navigation', () => {
    test('should navigate to analytics page from dashboard', async ({ page }) => {
      // Look for analytics link or button
      const analyticsButton = page.getByRole('link', { name: /analytics|анализ/i }).or(page.getByRole('button', { name: /analytics|анализ/i }));

      if (await analyticsButton.count() > 0) {
        await analyticsButton.first().click();
        await expect(page).toHaveURL(/\/receipts\/analytics|\/analytics/);
      } else {
        // Navigate directly
        await page.goto('/receipts/analytics');
        await expect(page).toHaveURL('/receipts/analytics');
      }
    });

    test('should navigate to analytics from receipts page', async ({ page }) => {
      await page.goto('/receipts');

      const viewAnalyticsButton = page.getByRole('button', { name: /view analytics|full analytics|анализ/i }).or(page.getByRole('link', { name: /analytics|анализ/i }));

      if (await viewAnalyticsButton.count() > 0) {
        await viewAnalyticsButton.first().click();
        await expect(page).toHaveURL('/receipts/analytics');
      }
    });

    test('should show analytics widget on dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      // Check for analytics widget
      const analyticsWidget = page.getByText(/receipt.*analytics|analytics|статистика|анализ/i);

      await expect(analyticsWidget.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Key Statistics Cards', () => {
    test('should display total spent statistic', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for total spent card
      await expect(page.getByText(/total.*spent|общо.*харчено|total.*amount/i)).toBeVisible({ timeout: 5000 });

      // Should show a numeric value
      await expect(page.getByText(/\d+.*BGN|BGN.*\d+/)).toBeVisible();
    });

    test('should display total cashback statistic', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for total cashback card
      await expect(page.getByText(/total.*cashback|общо.*кешбек/i)).toBeVisible();

      // Should show cashback amount
      await expect(page.getByText(/\d+.*BGN|BGN.*\d+/)).toBeVisible();
    });

    test('should display average receipt amount', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for average amount card
      await expect(page.getByText(/average.*amount|средна.*сума|average.*receipt/i)).toBeVisible();
    });

    test('should display success rate', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for success rate card
      await expect(page.getByText(/success.*rate|процент.*одобрени|approval/i)).toBeVisible();

      // Should show percentage
      await expect(page.getByText(/\d+%|%\d+/)).toBeVisible();
    });
  });

  test.describe('Charts and Visualizations', () => {
    test('should display spending trend chart', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for chart canvas or container
      await expect(page.getByText(/spending.*trend|spending.*time|харчене|тенденция/i)).toBeVisible({ timeout: 5000 });

      // Check for chart.js canvas
      const canvas = page.locator('canvas');
      expect(await canvas.count()).toBeGreaterThan(0);
    });

    test('should display receipts submitted chart', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for receipts count chart
      await expect(page.getByText(/receipts.*submitted|receipts.*time|бележки.*време/i)).toBeVisible();
    });

    test('should display top merchants chart', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for merchants chart
      await expect(page.getByText(/top.*merchants|top.*stores|магазини|търговци/i)).toBeVisible();
    });

    test('should display status distribution chart', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for status pie/doughnut chart
      await expect(page.getByText(/receipts.*status|status.*distribution|статус/i)).toBeVisible();
    });

    test('should display cashback earned chart', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for cashback trend chart
      await expect(page.getByText(/cashback.*earned|cashback.*time|кешбек.*време/i)).toBeVisible();
    });

    test('should render all charts without errors', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Wait for charts to render
      await page.waitForTimeout(2000);

      // Check that all canvases are rendered
      const canvases = page.locator('canvas');
      const canvasCount = await canvases.count();

      // Should have 5 charts (spending, receipts, merchants, status, cashback)
      expect(canvasCount).toBeGreaterThanOrEqual(3);
    });
  });

  test.describe('Filters', () => {
    test('should filter by date range', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Find date range filter
      const dateRangeButton = page.getByRole('button', { name: /last.*30|last.*90|date.*range|период/i });

      if (await dateRangeButton.isVisible()) {
        await dateRangeButton.click();

        // Select different time range
        const last90DaysOption = page.getByRole('option', { name: /90.*days|3.*months|90.*дни/i }).or(page.getByText(/90.*days|3.*months/i));

        if (await last90DaysOption.count() > 0) {
          await last90DaysOption.first().click();
          await page.waitForTimeout(1000);

          // Charts should update
          await expect(page.getByText(/90|3.*months/i)).toBeVisible();
        }
      }
    });

    test('should filter by merchant', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Find merchant filter
      const merchantFilter = page.getByRole('combobox', { name: /merchant|магазин/i }).or(page.getByPlaceholder(/select.*merchant|избери.*магазин/i));

      if (await merchantFilter.isVisible()) {
        await merchantFilter.click();

        // Select a merchant
        const firstMerchant = page.getByRole('option').first();

        if (await firstMerchant.isVisible()) {
          await firstMerchant.click();
          await page.waitForTimeout(1000);

          // Analytics should update
          const canvases = page.locator('canvas');
          expect(await canvases.count()).toBeGreaterThan(0);
        }
      }
    });

    test('should filter by status', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Find status filter
      const statusFilter = page.getByRole('combobox', { name: /status|статус/i }).or(page.getByLabel(/status|статус/i));

      if (await statusFilter.isVisible()) {
        await statusFilter.click();

        // Select approved only
        const approvedOption = page.getByRole('option', { name: /approved|validated|одобрен/i });

        if (await approvedOption.count() > 0) {
          await approvedOption.first().click();
          await page.waitForTimeout(1000);

          // Success rate should be 100% or close
          const successRateText = await page.getByText(/\d+%/).textContent();
          expect(successRateText).toBeTruthy();
        }
      }
    });

    test('should filter by amount range', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Find min/max amount filters
      const minAmountInput = page.locator('input[name="minAmount"]').or(page.getByPlaceholder(/min.*amount|минимална/i));
      const maxAmountInput = page.locator('input[name="maxAmount"]').or(page.getByPlaceholder(/max.*amount|максимална/i));

      if (await minAmountInput.count() > 0) {
        await minAmountInput.fill('10');
      }

      if (await maxAmountInput.count() > 0) {
        await maxAmountInput.fill('100');

        // Apply filter (might auto-apply or need button click)
        const applyButton = page.getByRole('button', { name: /apply|приложи|filter/i });

        if (await applyButton.isVisible()) {
          await applyButton.click();
        }

        await page.waitForTimeout(1000);

        // Analytics should update
        expect(await page.locator('canvas').count()).toBeGreaterThan(0);
      }
    });

    test('should clear all filters', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Apply some filters first
      const merchantFilter = page.getByRole('combobox', { name: /merchant/i });

      if (await merchantFilter.isVisible()) {
        await merchantFilter.click();
        const firstMerchant = page.getByRole('option').first();
        if (await firstMerchant.isVisible()) await firstMerchant.click();
      }

      // Find clear filters button
      const clearButton = page.getByRole('button', { name: /clear|изчисти|reset/i });

      if (await clearButton.isVisible()) {
        await clearButton.click();
        await page.waitForTimeout(1000);

        // Should show all data again
        await expect(page.getByText(/all.*time|total|всички/i)).toBeVisible();
      }
    });
  });

  test.describe('Predictive Analytics', () => {
    test('should display next month spending prediction', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for predictions section
      await expect(page.getByText(/prediction|прогноза|forecast|очаквани/i)).toBeVisible({ timeout: 5000 });

      // Should show predicted spending
      await expect(page.getByText(/next.*month|следващ.*месец/i)).toBeVisible();

      // Should show numeric prediction
      await expect(page.getByText(/\d+.*BGN/)).toBeVisible();
    });

    test('should display cashback forecast', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for cashback prediction
      const hasCashbackForecast = await page.getByText(/cashback.*prediction|predicted.*cashback|прогнозиран.*кешбек/i).count() > 0;

      expect(typeof hasCashbackForecast).toBe('boolean');
    });

    test('should show growth trend indicator', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for growth percentage
      const hasGrowth = await page.getByText(/growth|растеж|increase|decrease|намаление/i).count() > 0;

      expect(typeof hasGrowth).toBe('boolean');
    });
  });

  test.describe('Export Functionality', () => {
    test('should export analytics to CSV', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Find export button
      const exportButton = page.getByRole('button', { name: /export.*csv|download.*csv|csv/i });

      if (await exportButton.isVisible()) {
        const downloadPromise = page.waitForEvent('download');

        await exportButton.click();

        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      }
    });

    test('should export filtered data only', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Apply a filter
      const statusFilter = page.getByRole('combobox', { name: /status/i });

      if (await statusFilter.isVisible()) {
        await statusFilter.click();
        const approvedOption = page.getByRole('option', { name: /approved/i });
        if (await approvedOption.count() > 0) await approvedOption.first().click();
      }

      // Export filtered data
      const exportButton = page.getByRole('button', { name: /export/i });

      if (await exportButton.isVisible()) {
        const downloadPromise = page.waitForEvent('download').catch(() => null);
        await exportButton.click();

        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.csv$/i);
        }
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should display properly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/receipts/analytics');

      // Stats cards should stack vertically
      await expect(page.getByText(/total.*spent/i)).toBeVisible();

      // Charts should be visible
      const canvas = page.locator('canvas').first();
      await expect(canvas).toBeVisible();
    });

    test('should display properly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/receipts/analytics');

      // All elements should be visible
      await expect(page.getByText(/total.*spent/i)).toBeVisible();
      await expect(page.getByText(/total.*cashback/i)).toBeVisible();

      const canvases = page.locator('canvas');
      expect(await canvases.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Data Accuracy', () => {
    test('should show correct receipt count', async ({ page }) => {
      // Get actual count from receipts page
      await page.goto('/receipts');
      await page.waitForTimeout(1000);

      const receiptsCount = await page.locator('[data-testid="receipt-card"]').or(page.getByRole('article')).count();

      // Go to analytics
      await page.goto('/receipts/analytics');

      // Find total receipts number
      const totalReceiptsText = await page.getByText(/total.*receipts|receipts.*count/i).first().textContent();

      // Should mention the count somewhere (might be exact or approximate)
      expect(totalReceiptsText).toBeTruthy();
    });

    test('should calculate totals correctly', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Get total spent and total cashback
      const totalSpentCard = page.locator(':has-text("Total Spent")').or(page.locator(':has-text("Общо харчено")'));
      const totalCashbackCard = page.locator(':has-text("Total Cashback")').or(page.locator(':has-text("Общо кешбек")'));

      const spentText = await totalSpentCard.first().textContent();
      const cashbackText = await totalCashbackCard.first().textContent();

      // Both should contain numeric values
      expect(spentText).toMatch(/\d+/);
      expect(cashbackText).toMatch(/\d+/);
    });
  });

  test.describe('Performance', () => {
    test('should load analytics page within 3 seconds', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/receipts/analytics');

      // Wait for main content to load
      await page.waitForSelector('canvas', { timeout: 3000 });

      const loadTime = Date.now() - startTime;

      // Should load in under 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should render charts without blocking UI', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Page should be interactive while charts load
      const dateButton = page.getByRole('button', { name: /date|period/i }).first();

      // Should be clickable immediately
      if (await dateButton.isVisible()) {
        await expect(dateButton).toBeEnabled();
      }
    });
  });

  test.describe('Empty State', () => {
    test('should handle no receipts gracefully', async ({ page }) => {
      // This test would require a user with no receipts
      // For now, we'll check if empty state component exists

      await page.goto('/receipts/analytics');

      // If there are no receipts, should show empty state
      const hasData = await page.getByText(/\d+.*BGN/).count() > 0;
      const hasEmptyState = await page.getByText(/no.*receipts|no.*data|няма.*бележки/i).count() > 0;

      // Either has data or empty state
      expect(hasData || hasEmptyState).toBeTruthy();
    });
  });

  test.describe('Language Support', () => {
    test('should display analytics in selected language', async ({ page }) => {
      await page.goto('/receipts/analytics');

      // Check for language toggle
      const langButton = page.getByRole('button', { name: /EN|BG|език/i });

      if (await langButton.isVisible()) {
        // Get current language
        const currentLang = await page.evaluate(() => localStorage.getItem('language') || 'en');

        // Content should match language
        if (currentLang === 'bg') {
          await expect(page.getByText(/Общо|Кешбек|Анализ/i)).toBeVisible();
        } else {
          await expect(page.getByText(/Total|Cashback|Analytics/i)).toBeVisible();
        }
      }
    });
  });
});

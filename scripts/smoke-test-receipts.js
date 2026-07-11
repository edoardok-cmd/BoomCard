require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

// Refuses to reuse a pre-existing symlink at the target path (a local attacker
// on a shared /tmp could pre-plant one) instead of blindly mkdir/chmod'ing through it.
function ensurePrivateDir(dir) {
  if (fs.existsSync(dir)) {
    const st = fs.lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw new Error(`Refusing to use ${dir}: exists and is not a plain directory (possible symlink attack)`);
    }
  } else {
    fs.mkdirSync(dir, { mode: 0o700 });
  }
  fs.chmodSync(dir, 0o700);
  return dir;
}

const DIR = ensurePrivateDir('/tmp/audit_screenshots_v2');

if (!process.env.BOOMCARD_TEST_EMAIL || !process.env.BOOMCARD_TEST_PASSWORD) {
  console.error('Set BOOMCARD_TEST_EMAIL and BOOMCARD_TEST_PASSWORD (see .env.example) before running this script.');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'bg-BG' });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('https://boomcard.bg/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"], input[name="email"], #email', process.env.BOOMCARD_TEST_EMAIL);
    await page.fill('input[type="password"], input[name="password"], #password', process.env.BOOMCARD_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

    // Navigate to receipts
    await page.goto('https://boomcard.bg/receipts', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${DIR}/01_receipts_full.png`, fullPage: true });

    // Check page content
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${DIR}/receipts_text.txt`, bodyText);

    // Check for key spec elements
    const checks = {
      hasCashbackTitle: bodyText.includes('Кешбек и транзакции'),
      hasAvailableCashback: bodyText.includes('Наличен кешбек'),
      hasPendingCashback: bodyText.includes('Чакащ кешбек'),
      hasPeriod7: bodyText.includes('Последни 7 дни'),
      hasPeriod30: bodyText.includes('Последни 30 дни'),
      hasPeriodAll: bodyText.includes('Всички'),
      hasFiltersButton: bodyText.includes('Филтри'),
      hasUploadButton: bodyText.includes('Качи бележка'),
      noAnalyticsButton: !bodyText.includes('Виж анализ'),
      noExportButton: !bodyText.includes('Експорт CSV'),
    };
    console.log('Spec checks:', JSON.stringify(checks, null, 2));

    // Open filters panel
    await page.click('button:has-text("Филтри")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/02_filters_open.png`, fullPage: true });

    // Check status dropdown options
    const statusOptions = await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (!sel) return [];
      return Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
    });
    console.log('Status filter options:', JSON.stringify(statusOptions, null, 2));

    // Check upload button navigates to /upload-receipt not /receipt-scanner
    const uploadHref = await page.evaluate(() => {
      const btn = document.querySelector('button');
      // find the Качи бележка button - look at all buttons
      const btns = Array.from(document.querySelectorAll('button'));
      const uploadBtn = btns.find(b => b.textContent?.includes('Качи бележка'));
      return uploadBtn ? uploadBtn.getAttribute('onclick') || 'button found' : 'not found';
    });
    console.log('Upload button check:', uploadHref);

    // Click upload button and check URL
    const uploadBtn = await page.$('button:has-text("Качи бележка")');
    if (uploadBtn) {
      await uploadBtn.click();
      await page.waitForTimeout(1000);
      const url = page.url();
      console.log('After clicking upload button, URL:', url);
      await page.screenshot({ path: `${DIR}/03_after_upload_click.png`, fullPage: true });

      // Go back to receipts
      await page.goto('https://boomcard.bg/receipts', { waitUntil: 'networkidle', timeout: 30000 });
    }

    // Click period chip "Останки 7 дни"
    const chip7 = await page.$('button:has-text("Последни 7 дни")');
    if (chip7) {
      await chip7.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/04_period_7days.png`, fullPage: false });
      console.log('Period 7 chip clicked');
    }

    console.log('\nDone. Screenshots at', DIR);
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: `${DIR}/error.png`, fullPage: true }).catch(() => {});
    console.log('URL at error:', page.url());
  } finally {
    await browser.close();
  }
})();

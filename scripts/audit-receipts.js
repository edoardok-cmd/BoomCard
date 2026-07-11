require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
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

const SCREENSHOTS_DIR = ensurePrivateDir('/tmp/audit_screenshots');

// Redact long token-like substrings so an accidental console.log of a session/auth
// token on the page under test doesn't get echoed verbatim to this script's stdout.
const redact = s => s.replace(/[A-Za-z0-9_-]{24,}/g, '[REDACTED]');

if (!process.env.BOOMCARD_TEST_EMAIL || !process.env.BOOMCARD_TEST_PASSWORD) {
  console.error('Set BOOMCARD_TEST_EMAIL and BOOMCARD_TEST_PASSWORD (see .env.example) before running this script.');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'bg-BG',
  });
  const page = await context.newPage();

  const log = [];
  page.on('console', msg => log.push(redact(`[${msg.type()}] ${msg.text()}`)));

  try {
    // 1. Navigate to login
    console.log('Navigating to login page...');
    await page.goto('https://boomcard.bg/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/01_login.png`, fullPage: true });
    console.log('Screenshot: 01_login.png');

    // 2. Fill in credentials
    await page.fill('input[type="email"], input[name="email"], #email', process.env.BOOMCARD_TEST_EMAIL);
    await page.fill('input[type="password"], input[name="password"], #password', process.env.BOOMCARD_TEST_PASSWORD);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/02_login_filled.png`, fullPage: true });

    // 3. Submit login
    await page.click('button[type="submit"], button:has-text("Влез"), button:has-text("Login"), button:has-text("Sign in")');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/03_after_login.png`, fullPage: true });
    console.log('Screenshot: 03_after_login.png — URL:', redact(page.url()));

    // 4. Navigate to receipts page
    console.log('Navigating to receipts page...');
    await page.goto('https://boomcard.bg/receipts', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/04_receipts_full.png`, fullPage: true });
    console.log('Screenshot: 04_receipts_full.png — URL:', redact(page.url()));

    // 5. Capture DOM text for analysis
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${SCREENSHOTS_DIR}/receipts_text.txt`, bodyText);

    // 6. Capture all visible headings and labels
    const headings = await page.evaluate(() => {
      const els = document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,button,[class*="title"],[class*="header"]');
      return Array.from(els).map(el => ({ tag: el.tagName, text: el.innerText?.trim()?.substring(0, 200) }));
    });
    fs.writeFileSync(`${SCREENSHOTS_DIR}/receipts_headings.json`, JSON.stringify(headings, null, 2));

    // 7. Check filter elements
    const filters = await page.evaluate(() => {
      const selects = document.querySelectorAll('select, [role="combobox"], [class*="filter"], [class*="Filter"]');
      return Array.from(selects).map(el => ({ tag: el.tagName, text: el.innerText?.trim()?.substring(0, 200), value: el.value }));
    });
    fs.writeFileSync(`${SCREENSHOTS_DIR}/receipts_filters.json`, JSON.stringify(filters, null, 2));

    // 8. Check for transaction items
    const transactions = await page.evaluate(() => {
      const items = document.querySelectorAll('[class*="transaction"], [class*="receipt"], [class*="row"], tr');
      return Array.from(items).slice(0, 20).map(el => ({ text: el.innerText?.trim()?.substring(0, 300) }));
    });
    fs.writeFileSync(`${SCREENSHOTS_DIR}/receipts_transactions.json`, JSON.stringify(transactions, null, 2));

    // 9. Scroll to see full page
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/05_receipts_scrolled.png`, fullPage: false });

    // 10. Try clicking a filter if present
    const filterButtons = await page.$$('button:has-text("7"), button:has-text("30"), [data-value="7"], [data-value="30"]');
    console.log('Filter buttons found:', filterButtons.length);

    console.log('\nConsole logs:', log.slice(0, 20).join('\n'));
    console.log('\nDone. Screenshots saved to', SCREENSHOTS_DIR);

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/error.png`, fullPage: true }).catch(() => {});
    console.log('URL at error:', redact(page.url()));
  } finally {
    await browser.close();
  }
})();

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

const DIR = '/tmp/audit_screenshots_prod';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { mode: 0o700 });
fs.chmodSync(DIR, 0o700);

if (!process.env.BOOMCARD_TEST_EMAIL || !process.env.BOOMCARD_TEST_PASSWORD) {
  console.error('Set BOOMCARD_TEST_EMAIL and BOOMCARD_TEST_PASSWORD (see .env.example) before running this script.');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'bg-BG' });
  const page = await context.newPage();

  try {
    await page.goto('https://boomcard.bg/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"], input[name="email"], #email', process.env.BOOMCARD_TEST_EMAIL);
    await page.fill('input[type="password"], input[name="password"], #password', process.env.BOOMCARD_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

    await page.goto('https://boomcard.bg/receipts', { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `${DIR}/01_receipts.png`, fullPage: true });

    const body = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(`${DIR}/text.txt`, body);

    const results = {
      '✅ title Кешбек и транзакции': body.includes('Кешбек и транзакции'),
      '✅ Наличен кешбек label (uppercase)': body.toUpperCase().includes('НАЛИЧЕН КЕШБЕК'),
      '✅ Чакащ кешбек label (uppercase)': body.toUpperCase().includes('ЧАКАЩ КЕШБЕК'),
      '✅ Period chip 7 days': body.includes('Последни 7 дни'),
      '✅ Period chip 30 days': body.includes('Последни 30 дни'),
      '✅ Period chip all': body.includes('Всички'),
      '✅ Filters button': body.includes('Филтри'),
      '✅ Upload button': body.includes('Качи бележка'),
      '✅ No analytics button': !body.includes('Виж анализ'),
      '✅ No CSV export': !body.includes('Експорт CSV'),
      '✅ No search bar': !body.includes('Търси по търговец'),
    };
    console.log('\nFinal spec audit:\n');
    Object.entries(results).forEach(([k, v]) => console.log(`  ${v ? '✅' : '❌'} ${k.slice(3)} → ${v}`));

    // Open filters and check dropdown
    await page.click('button:has-text("Филтри")');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/02_filters.png`, fullPage: false });

    const opts = await page.evaluate(() => {
      const sel = document.querySelector('select');
      return sel ? Array.from(sel.options).map(o => `${o.value}=${o.text}`) : [];
    });
    console.log('\n  Status dropdown options:', opts.join(' | '));

    // Check upload button goes to /upload-receipt
    await page.goto('https://boomcard.bg/receipts', { waitUntil: 'networkidle', timeout: 30000 });
    await page.click('button:has-text("Качи бележка")');
    await page.waitForTimeout(800);
    const urlAfter = page.url();
    console.log(`\n  Upload button → ${urlAfter}`);
    console.log(`  ${urlAfter.includes('/upload-receipt') ? '✅' : '❌'} Routes to /upload-receipt`);
    await page.screenshot({ path: `${DIR}/03_upload_page.png`, fullPage: false });

    console.log('\nScreenshots saved to', DIR);
  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: `${DIR}/error.png`, fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
})();

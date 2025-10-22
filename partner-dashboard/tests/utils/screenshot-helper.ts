/**
 * Screenshot Helper Utilities
 * Provides consistent full-page screenshot capture with guaranteed content loading
 */

import { Page } from '@playwright/test';

interface ScreenshotOptions {
  debug?: boolean;
  scrollWait?: number;
  stabilizationWait?: number;
}

interface PageDimensions {
  scrollHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}

/**
 * Captures a full-page screenshot with guaranteed scrolling and content loading
 */
export async function captureFullPageScreenshot(
  page: Page,
  filename: string,
  options: ScreenshotOptions = {} as ScreenshotOptions
): Promise<void> {
  const {
    debug = false,
    scrollWait = 1000,
    stabilizationWait = 500
  } = options;

  try {
    if (debug) {
      console.log(`\n📸 Capturing full-page screenshot: ${filename}`);
    }

    const dimensions = await getPageDimensions(page);
    if (debug) {
      console.log(`   📐 Page height: ${dimensions.scrollHeight}px`);
      console.log(`   📐 Viewport height: ${dimensions.viewportHeight}px`);
      console.log(`   📐 Scrollable content: ${dimensions.scrollHeight > dimensions.viewportHeight ? 'YES' : 'NO'}`);
    }

    await page.waitForLoadState('networkidle').catch(() => {
      if (debug) console.log('   ⚠️  Network idle timeout, continuing...');
    });

    await waitForImages(page, debug);
    await waitForCharts(page, debug);

    const scrollableInfo = await page.evaluate(() => {
      const scrollables: { tag: string; scrollHeight: number; clientHeight: number }[] = [];
      document.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        const overflowY = style.overflowY;

        if ((overflowY === 'auto' || overflowY === 'scroll') &&
            htmlEl.scrollHeight > htmlEl.clientHeight) {
          htmlEl.scrollTop = htmlEl.scrollHeight;
          scrollables.push({
            tag: htmlEl.tagName,
            scrollHeight: htmlEl.scrollHeight,
            clientHeight: htmlEl.clientHeight
          });
        }
      });
      return scrollables;
    });

    if (debug && scrollableInfo.length > 0) {
      console.log(`   📜 Found ${scrollableInfo.length} scrollable containers`);
      scrollableInfo.forEach((info, i) => {
        console.log(`      ${i + 1}. ${info.tag}: ${info.scrollHeight}px (visible: ${info.clientHeight}px)`);
      });
    }

    if (debug) console.log('   ⬇️  Scrolling to bottom...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(scrollWait);

    await waitForImages(page, debug);

    if (debug) console.log('   📏 Expanding scrollable containers...');
    const originalStyles = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        const overflowY = style.overflowY;

        if ((overflowY === 'auto' || overflowY === 'scroll') &&
            htmlEl.scrollHeight > htmlEl.clientHeight) {
          htmlEl.style.height = htmlEl.scrollHeight + 'px';
          htmlEl.style.overflow = 'visible';
          htmlEl.style.overflowY = 'visible';
          count++;
        }
      });
      return count;
    });

    if (debug && originalStyles > 0) {
      console.log(`   ✅ Expanded ${originalStyles} containers to full height`);
    }

    if (debug) console.log('   ⬆️  Scrolling to top...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach(el => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.scrollTop) {
          htmlEl.scrollTop = 0;
        }
      });
    });
    await page.waitForTimeout(stabilizationWait);

    if (debug) console.log('   📷 Taking screenshot...');
    await page.screenshot({
      path: filename,
      fullPage: true,
      animations: 'disabled' as const
    });

    if (debug) {
      console.log(`   ✅ Screenshot saved: ${filename}`);
    }
  } catch (error) {
    console.error(`   ❌ Error capturing screenshot ${filename}:`, (error as Error).message);
    throw error;
  }
}

export async function getPageDimensions(page: Page): Promise<PageDimensions> {
  return await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth
  }));
}

async function waitForImages(page: Page, debug = false): Promise<void> {
  const imageCount = await page.evaluate(() => {
    const images = Array.from(document.images);
    return images.length;
  });

  if (imageCount === 0) {
    if (debug) console.log('   🖼️  No images found');
    return;
  }

  if (debug) console.log(`   🖼️  Waiting for ${imageCount} images to load...`);

  await page.evaluate(() => {
    return Promise.all(
      Array.from(document.images)
        .filter(img => !img.complete)
        .map(img => new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve());
          img.addEventListener('error', () => resolve());
          setTimeout(() => resolve(), 5000);
        }))
    );
  });

  if (debug) console.log('   ✅ Images loaded');
}

async function waitForCharts(page: Page, debug = false): Promise<void> {
  const chartCount = await page.locator('canvas, svg[class*="recharts"]').count();

  if (chartCount === 0) {
    if (debug) console.log('   📊 No charts/canvas found');
    return;
  }

  if (debug) console.log(`   📊 Waiting for ${chartCount} charts to render...`);
  await page.waitForTimeout(1000);
  if (debug) console.log('   ✅ Charts rendered');
}

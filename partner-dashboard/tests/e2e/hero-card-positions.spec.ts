import { test, expect } from '@playwright/test';

test.describe('Hero Section Card Positions', () => {
  test('should verify final card positions after all animations complete', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('http://localhost:5178/');

    // Wait for the hero section to be visible
    await page.waitForSelector('video', { state: 'visible', timeout: 10000 });

    console.log('Waiting for video to end and animations to complete...');

    // Wait for the CTA to appear which indicates video has ended
    await page.waitForSelector('text=/Live More|Живейте/', {
      state: 'visible',
      timeout: 60000 // Increase timeout to allow video to finish
    });

    console.log('CTA appeared, waiting for card animations to complete...');

    // Wait additional time for all card animations to complete
    // Black card appears -> Photos cycle (8s + 8s = 16s) -> Silver card appears (3s after returning starts = at 11s mark)
    await page.waitForTimeout(20000); // Wait for full animation sequence

    // Get the viewport dimensions
    const viewport = page.viewportSize();
    const centerX = viewport!.width / 2;

    // Find all cards (black card and silver card should be visible at this point)
    const cards = await page.locator('[style*="perspective"]').all();

    console.log(`Found ${cards.length} card elements`);

    // Check if we have at least 2 cards (black and silver)
    expect(cards.length).toBeGreaterThanOrEqual(2);

    // Get bounding boxes for the cards
    const cardPositions = await Promise.all(
      cards.map(async (card) => {
        const box = await card.boundingBox();
        return box;
      })
    );

    // Filter out null boxes
    const validPositions = cardPositions.filter(box => box !== null);

    console.log('Card positions:', validPositions);

    // Check that we have at least 2 cards with valid positions
    expect(validPositions.length).toBeGreaterThanOrEqual(2);

    // Find the leftmost and rightmost cards
    const sortedByX = validPositions.sort((a, b) => a!.x - b!.x);
    const leftCard = sortedByX[0];
    const rightCard = sortedByX[sortedByX.length - 1];

    console.log('Left card position:', leftCard);
    console.log('Right card position:', rightCard);
    console.log('Center X:', centerX);

    // Calculate the center of each card
    const leftCardCenter = leftCard!.x + leftCard!.width / 2;
    const rightCardCenter = rightCard!.x + rightCard!.width / 2;

    console.log('Left card center X:', leftCardCenter);
    console.log('Right card center X:', rightCardCenter);

    // Verify that the left card is on the left side of the viewport center
    expect(leftCardCenter).toBeLessThan(centerX);

    // Verify that the right card is on the right side of the viewport center
    expect(rightCardCenter).toBeGreaterThan(centerX);

    // Calculate the distance from center for each card
    const leftDistance = Math.abs(centerX - leftCardCenter);
    const rightDistance = Math.abs(centerX - rightCardCenter);

    console.log('Left card distance from center:', leftDistance);
    console.log('Right card distance from center:', rightDistance);

    // Verify that the cards are roughly symmetrical (within 50px tolerance)
    // This ensures they're positioned symmetrically on opposite sides
    expect(Math.abs(leftDistance - rightDistance)).toBeLessThan(50);

    // Verify that both cards have similar vertical positions (within 20px)
    expect(Math.abs(leftCard!.y - rightCard!.y)).toBeLessThan(20);

    console.log('✓ Cards are positioned symmetrically on opposite sides of the screen');
  });

  test('should verify animation sequence: logo -> black card -> silver card', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('http://localhost:5178/');

    // Wait for the hero section
    await page.waitForSelector('video', { state: 'visible', timeout: 10000 });

    console.log('Waiting for video to play...');

    // Check for logo explode image first
    const logoImage = page.locator('img[alt="Boom Logo Explode"]');

    // Wait for logo to appear (at 60% of video duration)
    await logoImage.waitFor({ state: 'visible', timeout: 60000 });
    console.log('✓ Logo explode appeared');

    // Wait for the video to end and CTA to appear
    await page.waitForSelector('text=/Live More|Живейте/', {
      state: 'visible',
      timeout: 60000
    });
    console.log('✓ CTA appeared (video ended)');

    // At this point, the black card should be visible and logo should fade
    // Wait a bit for the transition
    await page.waitForTimeout(2000);

    // Verify black card is present (check for BOOM logo text on cards)
    const boomCards = page.getByText('BOOM', { exact: true });
    const cardCount = await boomCards.count();

    console.log(`Found ${cardCount} visible BOOM card(s)`);
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Wait for silver card to appear (should be 3 seconds after photos start returning)
    // This happens after the photo cycling, so we need to wait for the full sequence
    await page.waitForTimeout(18000); // Wait for photos to cycle and silver card to appear

    // Now we should have 2 cards visible (black and silver)
    const finalCardCount = await boomCards.count();
    console.log(`Found ${finalCardCount} visible BOOM card(s) at the end`);
    expect(finalCardCount).toBeGreaterThanOrEqual(2);

    console.log('✓ Animation sequence completed: logo -> black card -> silver card');
  });
});

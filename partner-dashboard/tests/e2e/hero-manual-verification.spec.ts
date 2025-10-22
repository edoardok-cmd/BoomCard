import { test } from '@playwright/test';

/**
 * Manual verification test for hero section card positions
 *
 * This test opens the browser and waits long enough for you to manually verify:
 * 1. Bulgarian text "Живейте повече" and "Плащайте по-малко" are on 2 separate lines
 * 2. Logo explode image appears first (instead of black card)
 * 3. Black card appears after the video ends
 * 4. Silver card appears 3 seconds after the photos start returning
 * 5. Black and silver cards are positioned symmetrically on opposite sides
 */
test('Manual verification: hero section animations and card positions', async ({ page }) => {
  // Launch browser in headed mode to watch the animations
  await page.goto('http://localhost:5178/');

  console.log('\n=================================');
  console.log('MANUAL VERIFICATION CHECKLIST:');
  console.log('=================================\n');
  console.log('1. Wait for the video to play (blast animation)');
  console.log('2. ✓ Logo explode image should appear at ~60% of video in CENTER');
  console.log('3. ✓ After video ends, logo should stay in center and CTA appears below');
  console.log('4. ✓ Logo should SHAKE/TILT');
  console.log('5. ✓ Photos should eject from the LOGO (not from cards)');
  console.log('6. ✓ Photos should return to the logo after ~8 seconds');
  console.log('7. ✓ When photos start returning, BLACK card appears on the LEFT');
  console.log('8. ✓ 3 seconds later, SILVER card appears on the RIGHT');
  console.log('9. ✓ Logo stays in CENTER, black card on LEFT, silver card on RIGHT');
  console.log('10. ✓ All three elements (logo center, black left, silver right) are visible');
  console.log('11. ✓ Bulgarian text should show "Живейте повече" on line 1, "Плащайте по-малко" on line 2');
  console.log('12. ✓ Bulgarian text should be smaller than English version\n');
  console.log('=================================\n');

  // Wait long enough to see the full animation sequence
  // Video (~8-10s) + Black card + Photos (16s) + Silver card (3s) = ~30s total
  console.log('Waiting 40 seconds for full animation sequence...\n');
  await page.waitForTimeout(40000);

  // Take a screenshot of the final state
  await page.screenshot({
    path: 'test-results/hero-final-state.png',
    fullPage: false
  });

  console.log('✓ Screenshot saved to test-results/hero-final-state.png');
  console.log('\nYou can manually verify the final card positions in the screenshot.\n');
});

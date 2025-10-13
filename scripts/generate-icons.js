#!/usr/bin/env node

/**
 * PWA Icon Generator
 *
 * Generates all required PWA icons from a source image:
 * - 8 icon sizes (72px to 512px)
 * - Optimized for each platform
 * - Maskable variants for Android
 *
 * Usage:
 *   node scripts/generate-icons.js <source-image> <output-dir>
 *   node scripts/generate-icons.js ./logo.svg ./public
 */

const fs = require('fs').promises;
const path = require('path');

// Check if Sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('❌ Sharp is not installed. Run: npm install sharp --save-dev');
  process.exit(1);
}

// Icon sizes for PWA
const ICON_SIZES = [
  { size: 72, name: 'icon-72x72.png', purpose: 'any' },
  { size: 96, name: 'icon-96x96.png', purpose: 'any' },
  { size: 128, name: 'icon-128x128.png', purpose: 'any' },
  { size: 144, name: 'icon-144x144.png', purpose: 'any' },
  { size: 152, name: 'icon-152x152.png', purpose: 'any' },
  { size: 192, name: 'icon-192x192.png', purpose: 'any maskable' },
  { size: 384, name: 'icon-384x384.png', purpose: 'any' },
  { size: 512, name: 'icon-512x512.png', purpose: 'any maskable' }
];

/**
 * Generate icon with padding for maskable
 */
async function generateIcon(inputPath, outputPath, size, isMaskable = false) {
  const padding = isMaskable ? Math.floor(size * 0.1) : 0; // 10% padding for maskable
  const iconSize = size - (padding * 2);

  let image = sharp(inputPath);

  // Get metadata to check if it's SVG
  const metadata = await image.metadata();
  const isSVG = metadata.format === 'svg';

  if (isSVG) {
    // For SVG, we can resize directly
    image = image.resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    });
  } else {
    // For raster images, resize with best quality
    image = image.resize(iconSize, iconSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    });
  }

  // Add padding if maskable
  if (padding > 0) {
    image = image.extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    });
  }

  // Optimize PNG output
  await image
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(outputPath);

  const stats = await fs.stat(outputPath);
  return stats.size;
}

/**
 * Generate favicon.ico
 */
async function generateFavicon(inputPath, outputPath) {
  // Generate 32x32 PNG first
  const pngPath = outputPath.replace('.ico', '.png');
  await sharp(inputPath)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(pngPath);

  console.log('   ℹ️  Generated favicon.png (32x32)');
  console.log('   ℹ️  For favicon.ico, use an online converter or ico-tools');

  // Clean up temp file
  await fs.unlink(pngPath).catch(() => {});
}

/**
 * Generate Apple Touch Icon
 */
async function generateAppleTouchIcon(inputPath, outputPath) {
  // Apple recommends 180x180
  await sharp(inputPath)
    .resize(180, 180, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for Apple
    })
    .png({ quality: 90 })
    .toFile(outputPath);

  const stats = await fs.stat(outputPath);
  return stats.size;
}

/**
 * Format bytes
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
🎨 PWA Icon Generator

Usage:
  node scripts/generate-icons.js <source-image> <output-dir>

Example:
  node scripts/generate-icons.js ./logo.svg ./public
  node scripts/generate-icons.js ./logo.png ./partner-dashboard/public

Features:
  ✓ 8 icon sizes (72px to 512px)
  ✓ Maskable variants for Android
  ✓ Apple Touch Icon (180x180)
  ✓ Optimized PNG compression

Source image requirements:
  - SVG (recommended) or high-res PNG (1024x1024+)
  - Square aspect ratio
  - Transparent background
  - Simple, recognizable design
    `);
    process.exit(0);
  }

  const inputPath = path.resolve(args[0]);
  const outputDir = path.resolve(args[1]);

  console.log('\n🎨 Starting icon generation...\n');
  console.log(`📁 Source: ${inputPath}`);
  console.log(`📁 Output: ${outputDir}\n`);

  // Check if source exists
  try {
    await fs.access(inputPath);
  } catch (err) {
    console.error(`❌ Source image not found: ${inputPath}`);
    process.exit(1);
  }

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate all PWA icons
  console.log('📱 Generating PWA icons...\n');
  const results = [];

  for (const icon of ICON_SIZES) {
    const outputPath = path.join(outputDir, icon.name);
    const isMaskable = icon.purpose.includes('maskable');

    try {
      const size = await generateIcon(inputPath, outputPath, icon.size, isMaskable);
      results.push({ ...icon, size });
      console.log(`   ✓ ${icon.name.padEnd(20)} ${formatBytes(size).padStart(8)} ${isMaskable ? '(maskable)' : ''}`);
    } catch (err) {
      console.error(`   ❌ Failed to generate ${icon.name}: ${err.message}`);
    }
  }

  // Generate Apple Touch Icon
  console.log('\n🍎 Generating Apple Touch Icon...\n');
  try {
    const applePath = path.join(outputDir, 'apple-touch-icon.png');
    const appleSize = await generateAppleTouchIcon(inputPath, applePath);
    console.log(`   ✓ apple-touch-icon.png ${formatBytes(appleSize).padStart(8)} (180x180)`);
  } catch (err) {
    console.error(`   ❌ Failed to generate Apple icon: ${err.message}`);
  }

  // Summary
  const totalSize = results.reduce((sum, r) => sum + r.size, 0);
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Icons generated: ${results.length}`);
  console.log(`   Total size: ${formatBytes(totalSize)}`);
  console.log(`   Average size: ${formatBytes(totalSize / results.length)}`);

  // Check manifest
  const manifestPath = path.join(outputDir, 'manifest.json');
  try {
    await fs.access(manifestPath);
    console.log(`\n✅ manifest.json found at ${manifestPath}`);
    console.log('   Make sure icons are correctly referenced!');
  } catch (err) {
    console.log(`\n⚠️  manifest.json not found at ${manifestPath}`);
    console.log('   Remember to create/update your PWA manifest!');
  }

  // Verification checklist
  console.log('\n📋 Verification Checklist:\n');
  console.log('  [ ] All icon files generated successfully');
  console.log('  [ ] Icons are correctly referenced in manifest.json');
  console.log('  [ ] Apple touch icon linked in index.html');
  console.log('  [ ] Test PWA installation on different devices');
  console.log('  [ ] Verify maskable icons appear correctly on Android\n');

  // Example manifest update
  console.log('📝 Update your manifest.json icons array:\n');
  console.log('```json');
  console.log('"icons": [');
  ICON_SIZES.forEach((icon, i) => {
    const comma = i < ICON_SIZES.length - 1 ? ',' : '';
    console.log(`  { "src": "/${icon.name}", "sizes": "${icon.size}x${icon.size}", "type": "image/png", "purpose": "${icon.purpose}" }${comma}`);
  });
  console.log(']');
  console.log('```\n');

  console.log('✅ Icon generation complete!\n');
}

// Run
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Image Optimization Script
 *
 * Automatically optimizes images for web delivery:
 * - Generates multiple resolutions (400px, 800px, 1200px, 1600px)
 * - Converts to modern formats (WebP, AVIF)
 * - Creates low-quality placeholders
 * - Compresses all formats optimally
 *
 * Usage:
 *   node scripts/optimize-images.js <input-dir> <output-dir>
 *   node scripts/optimize-images.js ./images ./public/optimized
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

// Check if Sharp is installed
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('❌ Sharp is not installed. Run: npm install sharp --save-dev');
  process.exit(1);
}

// Configuration
const CONFIG = {
  sizes: [400, 800, 1200, 1600],
  formats: {
    jpeg: { quality: 85, progressive: true },
    webp: { quality: 80 },
    avif: { quality: 60 }
  },
  placeholder: {
    width: 40,
    blur: 10,
    quality: 70
  },
  supportedFormats: ['.jpg', '.jpeg', '.png', '.webp']
};

/**
 * Get all image files from directory
 */
async function getImageFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return getImageFiles(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (CONFIG.supportedFormats.includes(ext)) {
          return fullPath;
        }
      }
      return [];
    })
  );
  return files.flat().filter(Boolean);
}

/**
 * Optimize single image
 */
async function optimizeImage(inputPath, outputDir) {
  const startTime = performance.now();
  const filename = path.basename(inputPath, path.extname(inputPath));
  const stats = await fs.stat(inputPath);
  const originalSize = stats.size;

  console.log(`\n📸 Processing: ${path.basename(inputPath)}`);
  console.log(`   Original size: ${formatBytes(originalSize)}`);

  const results = {
    original: originalSize,
    generated: [],
    totalSaved: 0
  };

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate different sizes and formats
  for (const width of CONFIG.sizes) {
    const prefix = `${filename}-${width}`;

    try {
      // JPEG
      const jpegPath = path.join(outputDir, `${prefix}.jpg`);
      await sharp(inputPath)
        .resize(width, null, { withoutEnlargement: true })
        .jpeg(CONFIG.formats.jpeg)
        .toFile(jpegPath);
      const jpegSize = (await fs.stat(jpegPath)).size;
      results.generated.push({ format: 'JPEG', width, size: jpegSize, path: jpegPath });

      // WebP
      const webpPath = path.join(outputDir, `${prefix}.webp`);
      await sharp(inputPath)
        .resize(width, null, { withoutEnlargement: true })
        .webp(CONFIG.formats.webp)
        .toFile(webpPath);
      const webpSize = (await fs.stat(webpPath)).size;
      results.generated.push({ format: 'WebP', width, size: webpSize, path: webpPath });

      // AVIF
      const avifPath = path.join(outputDir, `${prefix}.avif`);
      await sharp(inputPath)
        .resize(width, null, { withoutEnlargement: true })
        .avif(CONFIG.formats.avif)
        .toFile(avifPath);
      const avifSize = (await fs.stat(avifPath)).size;
      results.generated.push({ format: 'AVIF', width, size: avifSize, path: avifPath });

      console.log(`   ✓ ${width}px: JPEG ${formatBytes(jpegSize)}, WebP ${formatBytes(webpSize)}, AVIF ${formatBytes(avifSize)}`);
    } catch (err) {
      console.error(`   ❌ Error generating ${width}px: ${err.message}`);
    }
  }

  // Generate placeholder
  try {
    const placeholderBuffer = await sharp(inputPath)
      .resize(CONFIG.placeholder.width, null, { withoutEnlargement: true })
      .blur(CONFIG.placeholder.blur)
      .jpeg({ quality: CONFIG.placeholder.quality })
      .toBuffer();

    const placeholderPath = path.join(outputDir, `${filename}-placeholder.jpg`);
    await fs.writeFile(placeholderPath, placeholderBuffer);

    const base64 = placeholderBuffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64}`;

    results.placeholder = {
      size: placeholderBuffer.length,
      path: placeholderPath,
      dataUri: dataUri
    };

    console.log(`   ✓ Placeholder: ${formatBytes(placeholderBuffer.length)} (base64: ${dataUri.length} chars)`);
  } catch (err) {
    console.error(`   ❌ Error generating placeholder: ${err.message}`);
  }

  // Calculate savings
  const totalGenerated = results.generated.reduce((sum, r) => sum + r.size, 0);
  const avgPerSize = totalGenerated / CONFIG.sizes.length;
  results.totalSaved = originalSize - avgPerSize;
  const savingsPercent = ((results.totalSaved / originalSize) * 100).toFixed(1);

  const duration = performance.now() - startTime;
  console.log(`   💾 Average savings: ${formatBytes(results.totalSaved)} (${savingsPercent}%)`);
  console.log(`   ⏱️  Completed in ${duration.toFixed(0)}ms`);

  return results;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
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
📸 Image Optimization Script

Usage:
  node scripts/optimize-images.js <input-dir> <output-dir>

Example:
  node scripts/optimize-images.js ./images ./public/optimized

Features:
  ✓ Multiple resolutions (400px, 800px, 1200px, 1600px)
  ✓ Modern formats (JPEG, WebP, AVIF)
  ✓ Low-quality placeholders with base64
  ✓ Optimal compression settings
    `);
    process.exit(0);
  }

  const inputDir = path.resolve(args[0]);
  const outputDir = path.resolve(args[1]);

  console.log('🚀 Starting image optimization...\n');
  console.log(`📁 Input:  ${inputDir}`);
  console.log(`📁 Output: ${outputDir}\n`);

  const startTime = performance.now();

  // Get all image files
  const imageFiles = await getImageFiles(inputDir);

  if (imageFiles.length === 0) {
    console.log('❌ No images found in input directory');
    process.exit(1);
  }

  console.log(`Found ${imageFiles.length} image(s) to optimize\n`);
  console.log('='.repeat(60));

  // Process all images
  const allResults = [];
  for (const imagePath of imageFiles) {
    const results = await optimizeImage(imagePath, outputDir);
    allResults.push(results);
  }

  // Summary
  const totalDuration = performance.now() - startTime;
  const totalOriginal = allResults.reduce((sum, r) => sum + r.original, 0);
  const totalGenerated = allResults.reduce((sum, r) =>
    sum + r.generated.reduce((s, g) => s + g.size, 0), 0
  );
  const avgPerImage = totalGenerated / allResults.length / CONFIG.sizes.length;
  const totalSaved = totalOriginal - avgPerImage;
  const savingsPercent = ((totalSaved / totalOriginal) * 100).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Images processed: ${allResults.length}`);
  console.log(`   Files generated: ${allResults.reduce((sum, r) => sum + r.generated.length, 0)}`);
  console.log(`   Original total: ${formatBytes(totalOriginal)}`);
  console.log(`   Optimized avg: ${formatBytes(avgPerImage)}`);
  console.log(`   Total saved: ${formatBytes(totalSaved)} (${savingsPercent}%)`);
  console.log(`   Time taken: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log('\n✅ Optimization complete!\n');

  // Generate usage example
  const firstResult = allResults[0];
  if (firstResult.placeholder) {
    const exampleFilename = path.basename(imageFiles[0], path.extname(imageFiles[0]));
    console.log('📝 Example usage in React:\n');
    console.log('```tsx');
    console.log('import ResponsiveImage from "@/components/common/ResponsiveImage/ResponsiveImage";\n');
    console.log('<ResponsiveImage');
    console.log(`  src="/optimized/${exampleFilename}-1200.jpg"`);
    console.log(`  webpSrc="/optimized/${exampleFilename}-1200.webp"`);
    console.log(`  avifSrc="/optimized/${exampleFilename}-1200.avif"`);
    console.log('  sources={[');
    console.log(`    { src: '/optimized/${exampleFilename}-400.jpg', width: 400 },`);
    console.log(`    { src: '/optimized/${exampleFilename}-800.jpg', width: 800 },`);
    console.log(`    { src: '/optimized/${exampleFilename}-1200.jpg', width: 1200 },`);
    console.log(`    { src: '/optimized/${exampleFilename}-1600.jpg', width: 1600 },`);
    console.log('  ]}');
    console.log('  sizes="(max-width: 768px) 100vw, 50vw"');
    console.log('  alt="Description"');
    console.log(`  placeholder="${firstResult.placeholder.dataUri.substring(0, 100)}..."`);
    console.log('/>');
    console.log('```\n');
  }
}

// Run
main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});

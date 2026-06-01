/**
 * Icon Generator for Nexus Chrome Extension
 *
 * Generates PNG icons at 16, 32, 48, 128 sizes from an SVG template.
 * Uses the `canvas` npm package (optional) or creates minimal placeholder PNGs.
 *
 * Usage:
 *   node scripts/generate-icons.mjs
 *
 * The SVG source is at public/icon/icon.svg.
 * To convert SVG to PNG, you can use:
 *   1. `npx sharp-cli` - npm install -g sharp-cli
 *   2. Any online SVG-to-PNG converter with the icon.svg file
 *   3. Inkscape CLI: inkscape icon.svg -w 128 -h 128 -o 128.png
 *
 * This script generates minimal colored PNG placeholders if `sharp` is not available.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconDir = join(__dirname, '..', 'public', 'icon');

const sizes = [16, 32, 48, 128];

// Minimal PNG generator for a solid-color rounded square with "N" letter
// This creates recognizable but simple icons. For production, use the SVG.
function createMinimalPNG(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // Create a simple image data (RGBA)
  const width = size;
  const height = size;
  const pixelData = Buffer.alloc(width * height * 4);

  // Colors (blue-purple gradient approximation)
  const bgColor = { r: 0, g: 122, b: 255 };   // #007AFF
  const bgEnd   = { r: 88, g: 86, b: 214 };     // #5856D6
  const fgColor = { r: 255, g: 255, b: 255 };   // white

  const cornerRadius = Math.max(2, Math.round(size * 0.22));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      // Rounded rectangle check
      const dx = Math.min(x, width - 1 - x);
      const dy = Math.min(y, height - 1 - y);
      const isInside = dx >= cornerRadius || dy >= cornerRadius ||
                       ((dx - cornerRadius) ** 2 + (dy - cornerRadius) ** 2) <= cornerRadius ** 2;

      if (!isInside) {
        pixelData[idx] = 0;
        pixelData[idx + 1] = 0;
        pixelData[idx + 2] = 0;
        pixelData[idx + 3] = 0;
        continue;
      }

      // Gradient from top-left to bottom-right
      const t = (x + y) / (width + height - 2);
      const bgR = Math.round(bgColor.r + (bgEnd.r - bgColor.r) * t);
      const bgG = Math.round(bgColor.g + (bgEnd.g - bgColor.g) * t);
      const bgB = Math.round(bgColor.b + (bgEnd.b - bgColor.b) * t);

      // Simple "N" letter check
      const cx = x / (width - 1);
      const cy = y / (height - 1);
      const nLeft = cx >= 0.22 && cx <= 0.30 && cy >= 0.18 && cy <= 0.82;
      const nRight = cx >= 0.70 && cx <= 0.78 && cy >= 0.18 && cy <= 0.82;
      const nDiag = cx >= 0.26 && cx <= 0.74 && cy >= 0.18 && cy <= 0.82 &&
                    Math.abs(cx - 0.28 - (cy - 0.18) * (0.46 / 0.64)) < 0.06;

      if (nLeft || nRight || nDiag) {
        pixelData[idx] = fgColor.r;
        pixelData[idx + 1] = fgColor.g;
        pixelData[idx + 2] = fgColor.b;
        pixelData[idx + 3] = 255;
      } else {
        pixelData[idx] = bgR;
        pixelData[idx + 1] = bgG;
        pixelData[idx + 2] = bgB;
        pixelData[idx + 3] = 255;
      }
    }
  }

  // Build PNG chunks
  function crc32(buf) {
    let c = 0xffffffff;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let cc = i;
      for (let j = 0; j < 8; j++) {
        cc = (cc & 1) ? (0xedb88320 ^ (cc >>> 1)) : (cc >>> 1);
      }
      table[i] = cc;
    }
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crcVal = Buffer.alloc(4);
    crcVal.writeUInt32BE(crc32(crcInput));
    return Buffer.concat([len, typeBytes, data, crcVal]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT - raw scanlines with filter byte
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: none
    pixelData.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  // Deflate (use Node.js zlib)
  const compressed = deflateSync(rawData);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend),
  ]);
}

// Generate icons
if (!existsSync(iconDir)) {
  mkdirSync(iconDir, { recursive: true });
}

for (const size of sizes) {
  const png = createMinimalPNG(size);
  const outPath = join(iconDir, `${size}.png`);
  writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}

console.log('\nDone! Icons generated in public/icon/');
console.log('For higher quality, convert public/icon/icon.svg to PNG using a vector tool.');

// Row-profile analysis: find horizontal UI bands in a PNG.
// Usage: node rowprofile.js <png> <x0> <x1> <y0> <y1> [step]
// Prints per-row-band mean brightness & dark-pixel fraction; bands with
// brightness dips = button bars / chrome lines. Location aid for C-4.
const pnglib = require('./pnglib.js');
const fs = require('fs');

const file = process.argv[2];
const x0 = parseInt(process.argv[3], 10);
const x1 = parseInt(process.argv[4], 10);
const y0 = parseInt(process.argv[5], 10);
const y1 = parseInt(process.argv[6], 10);
const step = parseInt(process.argv[7] || '10', 10);

const img = pnglib.decode(file);
const W = img.w, H = img.h;
const px = img.px;

function rowStats(y) {
  let sum = 0, dark = 0, n = 0;
  for (let x = x0; x < x1; x += 2) {
    const i = (y * W + x) * 4;
    const br = (px[i] + px[i + 1] + px[i + 2]) / 3;
    sum += br; n++;
    if (br < 40) dark++;
  }
  return { mean: sum / n, darkFrac: dark / n };
}

for (let y = y0; y < y1; y += step) {
  let mSum = 0, dSum = 0, rows = 0;
  for (let yy = y; yy < Math.min(y + step, y1); yy++) {
    const s = rowStats(yy);
    mSum += s.mean; dSum += s.darkFrac; rows++;
  }
  const mean = mSum / rows, dark = dSum / rows;
  const bar = '#'.repeat(Math.round(mean / 6));
  console.log(`y=${String(y).padStart(5)} mean=${mean.toFixed(1).padStart(5)} dark=${(dark * 100).toFixed(0).padStart(3)}% ${bar}`);
}

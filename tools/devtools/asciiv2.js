// asciiv2.js <png> <cellW> <cellH> <x0> <y0> <w> <h> [thresh]
// ASCII render with CORRECT decoder. Brightness = max(r,g,b) >= thresh (default 90).
// Chars: '#' near-white(700+), '+' bright(450+), '-' mid(200+), '.' dim(>=thresh), ' ' below.
const L = require('./pnglib');
const [png, cw, chh, x0, y0, w, h] = process.argv.slice(2);
const img = L.decode(png);
const X = +x0, Y = +y0, W = +w, H = +h, CW = +cw, CH = +chh;
const cols = Math.floor(W / CW), rows = Math.floor(H / CH);
console.log('region x=' + X + '..' + (X + cols * CW) + ' y=' + Y + '..' + (Y + rows * CH) + ' cell=' + CW + 'x' + CH + ' (each char=' + CW + 'x' + CH + ' px)');
for (let r = 0; r < rows; r++) {
  let line = '';
  const yc = Y + r * CH + (CH >> 1);
  for (let c = 0; c < cols; c++) {
    const xc = X + c * CW + (CW >> 1);
    const o = (yc * img.w + xc) * 4;
    const br = Math.max(img.px[o], img.px[o + 1], img.px[o + 2]);
    line += br >= 700 ? '#' : br >= 450 ? '+' : br >= 200 ? '-' : br >= 90 ? '.' : ' ';
  }
  console.log(String(Y + r * CH).padStart(4) + ' ' + line);
}

// locate.js — precise feature location in game frame
// usage: node locate.js <png>
const fs = require('fs');
const zlib = require('zlib');
const file = process.argv[2] || 'gldump_pre.png';
const buf = fs.readFileSync(file);
let pos = 8, width, height, colorType;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.slice(pos + 8, pos + 8 + len);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}
const ch = colorType === 6 ? 4 : 3;
const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * ch;
const px = Buffer.alloc(width * height * ch);
for (let y = 0; y < height; y++) {
  const f = raw[y * (stride + 1)];
  const rs = y * (stride + 1) + 1, cs = y * stride;
  for (let x = 0; x < stride; x++) {
    const v = raw[rs + x];
    const l = x >= ch ? px[cs + x - ch] : 0;
    const u = y > 0 ? px[cs - stride + x] : 0;
    const ul = (y > 0 && x >= ch) ? px[cs - stride + x - ch] : 0;
    let o = v;
    if (f === 1) o = (v + l) & 255; else if (f === 2) o = (v + u) & 255;
    else if (f === 3) o = (v + ((l + u) >> 1)) & 255;
    else if (f === 4) { const p = l + u - ul, pa = Math.abs(p - l), pb = Math.abs(p - u), pc = Math.abs(p - ul); const pr = (pa <= pb && pa <= pc) ? l : (pb <= pc ? u : ul); o = (v + pr) & 255; }
    px[cs + x] = o;
  }
}
function rgb(x, y) { const i = (y * width + x) * ch; return [px[i], px[i + 1], px[i + 2]]; }
// warrior tunic color 151,49,13 (exact) and skin 196,112,58 / 190,127,89
let wx0 = 1e9, wx1 = -1, wy0 = 1e9, wy1 = -1, wcount = 0;
const tunicCounts = {};
for (let y = 350; y < 480; y++) for (let x = 150; x < 260; x++) {
  const [R, G, B] = rgb(x, y);
  if (R === 151 && G === 49 && B === 13) {
    wcount++;
    if (x < wx0) wx0 = x; if (x > wx1) wx1 = x;
    if (y < wy0) wy0 = y; if (y > wy1) wy1 = y;
  }
}
console.log(`warrior tunic (151,49,13): count=${wcount} bbox x=[${wx0},${wx1}] y=[${wy0},${wy1}]`);
// vertical profile of columns: for x in 150..290, count green (G>R+10&&G>B+15&&G>=45) pixels in y=250..620
console.log('column green-count x=150..290 (y 250..620):');
let line = '';
for (let x = 150; x <= 290; x += 2) {
  let g = 0;
  for (let y = 250; y < 620; y++) { const [R, G, B] = rgb(x, y); if (G > R + 10 && G > B + 15 && G >= 45) g++; }
  line += `${x}:${g} `;
}
console.log(line);
// find tall-grass green (89,153,74) exact count in whole frame
let tgc = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const [R, G, B] = rgb(x, y); if (R === 89 && G === 153 && B === 74) tgc++; }
console.log(`exact tall-grass green (89,153,74) count: ${tgc}`);
// bright wall-face columns: count near-white pixels per column in y=250..620
console.log('column bright-count x=150..290 (y 250..620):');
line = '';
for (let x = 150; x <= 290; x += 2) {
  let b = 0;
  for (let y = 250; y < 620; y++) { const [R, G, B] = rgb(x, y); if (R > 180 && G > 180 && B > 180) b++; }
  line += `${x}:${b} `;
}
console.log(line);

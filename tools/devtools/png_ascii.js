// png_ascii.js — minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) + ASCII classifier render
// usage: node png_ascii.js <file.png> [cellW] [cellH] [x0] [y0] [w] [h]
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2] || 'gldump3.png';
const cellW = parseInt(process.argv[3] || '4', 10);
const cellH = parseInt(process.argv[4] || '8', 10);
const X0 = parseInt(process.argv[5] || '0', 10);
const Y0 = parseInt(process.argv[6] || '0', 10);
let W = parseInt(process.argv[7] || '-1', 10);
let H = parseInt(process.argv[8] || '-1', 10);

const buf = fs.readFileSync(file);
// parse chunks
let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.slice(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  pos += 12 + len;
}
if (bitDepth !== 8) { console.error('unsupported bitDepth ' + bitDepth); process.exit(1); }
const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
if (!channels) { console.error('unsupported colorType ' + colorType); process.exit(1); }

const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
// unfilter
const pixels = Buffer.alloc(width * height * channels); // R,G,B(,A) per pixel
for (let y = 0; y < height; y++) {
  const fRaw = raw[y * (stride + 1)];
  const filter = fRaw;
  const rowStart = y * (stride + 1) + 1;
  const curStart = y * stride;
  for (let x = 0; x < stride; x++) {
    const v = raw[rowStart + x];
    const left = x >= channels ? pixels[curStart + x - channels] : 0;
    const up = y > 0 ? pixels[curStart - stride + x] : 0;
    const upLeft = (y > 0 && x >= channels) ? pixels[curStart - stride + x - channels] : 0;
    let out;
    switch (filter) {
      case 0: out = v; break;
      case 1: out = (v + left) & 0xFF; break;
      case 2: out = (v + up) & 0xFF; break;
      case 3: out = (v + ((left + up) >> 1)) & 0xFF; break;
      case 4: {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        const pr = (pa <= pb && pa <= pc) ? left : (pb <= pc ? up : upLeft);
        out = (v + pr) & 0xFF; break;
      }
      default: out = v;
    }
    pixels[curStart + x] = out;
  }
}
function px(x, y) {
  const i = (y * width + x) * channels;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}
if (W < 0) W = width - X0;
if (H < 0) H = height - Y0;
const cols = Math.floor(W / cellW), rows = Math.floor(H / cellH);
console.log(`image: ${width}x${height} colorType=${colorType} region: x=${X0}..${X0 + W} y=${Y0}..${Y0 + H} cell: ${cellW}x${cellH} -> ${cols}x${rows}`);

function classify(R, G, B) {
  const V = (R + G + B) / 3;
  if (V < 35) return '#';
  if (R >= 120 && R <= 215 && G >= 25 && G <= 130 && B <= 95 && (R - G) >= 55) return 'W';
  if (R >= 100 && R <= 190 && G >= 70 && G <= 150 && B >= 40 && B <= 120 && (R - B) >= 40 && (G - B) >= 15) return 'T';
  if (G > R + 10 && G > B + 15 && G >= 45) return 'g';
  if (R > 180 && G > 180 && B > 180) return '@';
  if (Math.abs(R - G) <= 22 && Math.abs(G - B) <= 25 && V >= 60 && V <= 150) return '-';
  if (R > G + 20 && R > 90 && V < 160) return 'o';
  return '.';
}
// headers
let h1 = '      ', h2 = '      ';
for (let c = 0; c < cols; c++) { const x = X0 + c * cellW + (cellW >> 1); h1 += String(Math.floor((x % 100) / 10)); h2 += String(x % 10); }
console.log(h1); console.log(h2);
for (let r = 0; r < rows; r++) {
  const y = Y0 + r * cellH + (cellH >> 1);
  if (y >= height) break;
  let line = String(y).padStart(5) + ' ';
  for (let c = 0; c < cols; c++) {
    const x = X0 + c * cellW + (cellW >> 1);
    if (x >= width) { line += ' '; continue; }
    const [R, G, B] = px(x, y);
    line += classify(R, G, B);
  }
  console.log(line);
}

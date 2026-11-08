// scanline.js — print RGB runs along horizontal lines
// usage: node scanline.js <png> <y> [x0] [x1] [runLen]
const fs = require('fs');
const zlib = require('zlib');
const file = process.argv[2];
const axis = process.argv[3] || 'h'; // 'h' horizontal, 'v' vertical
const targetY = parseInt(process.argv[4], 10);
const x0 = parseInt(process.argv[5] || '0', 10);
const x1 = parseInt(process.argv[6] || '388', 10);
const runLen = parseInt(process.argv[7] || '1', 10);
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
// compress into runs of identical colors (min length runLen)
let runs = [];
let cur = null, n = 0;
function sample(i) {
  return axis === 'v' ? rgb(targetY, i) : rgb(i, targetY);
}
const iMax = axis === 'v' ? height : width;
for (let i = 0; i < iMax; i++) {
  const c = sample(i);
  const key = `${c[0]},${c[1]},${c[2]}`;
  if (cur === key) n++;
  else {
    if (cur !== null && n >= runLen) runs.push([cur, n, i - n]);
    cur = key; n = 1;
  }
}
if (cur !== null && n >= runLen) runs.push([cur, n, iMax - n]);
const label = axis === 'v' ? 'y' : 'x';
for (const [k, len, start] of runs) console.log(`${label}=${start}..${start + len - 1} (${len}px) rgb(${k})`);

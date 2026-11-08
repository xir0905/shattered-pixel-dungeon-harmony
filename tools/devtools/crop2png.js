// crop2png.js <src.png> <x> <y> <w> <h> <scale> <out.png> [maxW]
// Crop a region and upscale (nearest). Writes a valid PNG (verified CRC impl).
const fs = require('fs'), zlib = require('zlib');

function crc32(buf, ci) {
  let c = (ci === undefined) ? 0xffffffff : ci;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return c >>> 0; // returns UNFINALIZED state
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  let c = crc32(t, 0xffffffff);      // continue state through type
  c = crc32(data, c);                // continue through data
  const crcb = Buffer.alloc(4); crcb.writeUInt32BE((c ^ 0xffffffff) >>> 0); // finalize
  return Buffer.concat([len, t, data, crcb]);
}
function loadPNG(p) {
  const b = fs.readFileSync(p);
  let pos = 8; const idat = []; let w = 0, h = 0, ct = 0;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos); const type = b.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = b.readUInt32BE(pos + 8); h = b.readUInt32BE(pos + 12); ct = b[pos + 17]; }
    else if (type === 'IDAT') idat.push(b.slice(pos + 8, pos + 8 + len));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const d = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3; const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const off = y * (stride + 1) + 1; const filt = d[off - 1];
    for (let x = 0; x < w; x++) {
      const i = off + x * bpp;
      const a = (filt === 1 || filt === 3 || filt === 4) && x ? px[(y * w + (x - 1)) * 4] : 0;
      const b2 = (filt === 2 || filt === 3 || filt === 4) && y ? px[((y - 1) * w + x) * 4] : 0;
      const c = (filt === 4 || (filt === 3 && x && y)) ? (y && x ? px[((y - 1) * w + (x - 1)) * 4] : 0) : 0;
      // note: for filt 3, c only used when x&&y, handled above
      let r = d[i], g = d[i + 1], bl = d[i + 2], al = bpp === 4 ? d[i + 3] : 255;
      if (filt === 1) { r += a; g += a; bl += a; al += a; }
      else if (filt === 2) { r += b2; g += b2; bl += b2; al += b2; }
      else if (filt === 3) { const q = (a + b2) >> 1; r += q; g += q; bl += q; al += q; }
      else if (filt === 4) {
        const pa = Math.abs(b2 - c), pb = Math.abs(a - c), pc = Math.abs(a + b2 - 2 * c);
        const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b2 : c);
        r += pr; g += pr; bl += pr; al += pr;
      }
      const o = (y * w + x) * 4;
      px[o] = r & 255; px[o + 1] = g & 255; px[o + 2] = bl & 255; px[o + 3] = al & 255;
    }
  }
  return { w, h, px };
}
function savePNG(path, w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(path, png);
}

const [src, x0, y0, rw, rh, scale, out] = process.argv.slice(2);
const X = +x0, Y = +y0, RW = +rw, RH = +rh, S = +scale;
const img = loadPNG(src);
if (X + RW > img.w || Y + RH > img.h) { console.error('region out of bounds', img.w, img.h); process.exit(1); }
const W = RW * S, H = RH * S;
const outpx = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const s = ((Y + Math.floor(y / S)) * img.w + (X + Math.floor(x / S))) * 4;
    const d = (y * W + x) * 4;
    outpx[d] = img.px[s]; outpx[d + 1] = img.px[s + 1]; outpx[d + 2] = img.px[s + 2]; outpx[d + 3] = img.px[s + 3];
  }
}
savePNG(out, W, H, outpx);
console.log('saved', out, W + 'x' + H);

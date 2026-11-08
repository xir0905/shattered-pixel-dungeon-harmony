// Carve a file out of a ZIP stream embedded in a raw image (by local file header)
const fs = require('fs');
const zlib = require('zlib');
const IMG = process.argv[2];          // raw image
const NAME = process.argv[3];         // entry filename, e.g. libs/x86_64/libarkweb_render.so
const OUT = process.argv[4];          // output file

const fd = fs.openSync(IMG, 'r');
const size = fs.fstatSync(fd).size;
const CHUNK = 64 * 1024 * 1024;
const pat = Buffer.from(NAME, 'utf8');

// find local header whose filename == NAME
let pos = 0, found = -1;
const buf = Buffer.alloc(CHUNK + pat.length + 64);
outer:
while (pos < size) {
  const n = fs.readSync(fd, buf, 0, buf.length, pos);
  if (n <= 0) break;
  let idx = 0;
  while (true) {
    const f = buf.indexOf(pat, idx);
    if (f < 0 || f >= n) break;
    // local header start candidate: f - 30
    const hdr = f - 30;
    if (hdr >= 0 && buf[hdr] === 0x50 && buf[hdr + 1] === 0x4b && buf[hdr + 2] === 0x03 && buf[hdr + 3] === 0x04) {
      const fnLen = buf.readUInt16LE(hdr + 26);
      if (fnLen === NAME.length && buf.slice(hdr + 30, hdr + 30 + fnLen).equals(pat)) {
        found = pos + hdr;
        break outer;
      }
    }
    idx = f + 1;
  }
  pos += CHUNK;
}
if (found < 0) { console.log('local header not found for', NAME); process.exit(1); }
console.log('local header @ 0x' + found.toString(16));

// parse header (read fresh 128 bytes at found)
const hb = Buffer.alloc(128);
fs.readSync(fd, hb, 0, 128, found);
const method = hb.readUInt16LE(found >= 0 ? 8 : 8); // method at hdr+8
const compMethod = hb.readUInt16LE(8);
let compSize = hb.readUInt32LE(18);
let uncompSize = hb.readUInt32LE(22);
const fnLen = hb.readUInt16LE(26);
const extraLen = hb.readUInt16LE(28);
let dataOff = found + 30 + fnLen + extraLen;
if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF) {
  // zip64 extra: parse extra field
  const extra = Buffer.alloc(extraLen);
  fs.readSync(fd, extra, 0, extraLen, found + 30 + fnLen);
  let e = 0;
  while (e + 4 <= extraLen) {
    const id = extra.readUInt16LE(e);
    const sz = extra.readUInt16LE(e + 2);
    if (id === 0x0001) {
      let off = e + 4;
      if (uncompSize === 0xFFFFFFFF) { uncompSize = Number(extra.readBigUInt64LE(off)); off += 8; }
      if (compSize === 0xFFFFFFFF) { compSize = Number(extra.readBigUInt64LE(off)); }
      break;
    }
    e += 4 + sz;
  }
}
console.log('method:', compMethod, 'compSize:', compSize, 'uncompSize:', uncompSize, 'dataOff: 0x' + dataOff.toString(16));
const comp = Buffer.alloc(compSize);
fs.readSync(fd, comp, 0, compSize, dataOff);
let out;
if (compMethod === 0) out = comp;
else out = zlib.inflateRawSync(comp);
fs.writeFileSync(OUT, out);
console.log('extracted', out.length, 'bytes to', OUT);
fs.closeSync(fd);

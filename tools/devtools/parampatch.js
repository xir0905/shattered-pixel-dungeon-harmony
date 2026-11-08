// In-place binary patch: replace param values in a raw image (byte-length preserving)
const fs = require('fs');
const FILE = process.argv[2];
// replacements: [fullPattern, oldValue, newValue] - replaces oldValue inside fullPattern occurrences
const jobs = process.argv.slice(3).map(j => j.split('='));

const fd = fs.openSync(FILE, 'r+');
const size = fs.fstatSync(fd).size;
const CHUNK = 64 * 1024 * 1024;
let patched = 0;
for (const [pattern, oldV, newV] of jobs) {
  if (oldV.length !== newV.length) { console.error('length mismatch:', pattern); process.exit(1); }
  const pat = Buffer.from(pattern + '=' + oldV, 'utf8');
  const buf = Buffer.alloc(CHUNK + pat.length);
  let pos = 0;
  while (pos < size) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    if (n <= 0) break;
    let idx = 0;
    while (true) {
      const f = buf.indexOf(pat, idx);
      if (f < 0 || f >= n) break;
      const valueOff = pos + f + pattern.length + 1;
      fs.writeSync(fd, Buffer.from(newV, 'utf8'), 0, newV.length, valueOff);
      patched++;
      console.log(`patched [${pattern}] at 0x${valueOff.toString(16)}: ${oldV} -> ${newV}`);
      idx = f + 1;
    }
    pos += CHUNK;
  }
}
fs.closeSync(fd);
console.log('total patched:', patched);

// Scan a binary file for a pattern; print offset and surrounding printable context
const fs = require('fs');
const FILE = process.argv[2];
const PAT = Buffer.from(process.argv[3], 'utf8');
const CTX = parseInt(process.argv[4] || '200', 10);
const CHUNK = 64 * 1024 * 1024;
const fd = fs.openSync(FILE, 'r');
const buf = Buffer.alloc(CHUNK + PAT.length);
let pos = 0, hits = 0;
const MAXHITS = 40;
function ctxString(buf, start, end) {
  let s = '';
  for (let i = start; i < end && i < buf.length; i++) {
    const c = buf[i];
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else s += (c === 0 ? '\0' : '.');
  }
  return s;
}
while (pos < fs.fstatSync(fd).size && hits < MAXHITS) {
  const n = fs.readSync(fd, buf, 0, buf.length, pos);
  if (n <= 0) break;
  let idx = 0;
  while (hits < MAXHITS) {
    const found = buf.slice(0, n).indexOf(PAT, idx);
    if (found < 0 || found >= n) break;
    hits++;
    const s = Math.max(0, found - CTX), e = Math.min(n, found + PAT.length + CTX);
    console.log(`--- hit @ 0x${(pos + found).toString(16)} ---`);
    console.log(ctxString(buf, s, e).replace(/\0+/g, ' | '));
    idx = found + 1;
  }
  pos += CHUNK;
}
console.log(`total hits: ${hits}`);
fs.closeSync(fd);

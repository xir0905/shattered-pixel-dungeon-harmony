// findall.js <file> <needle> [maxHits] [contextLen]
// Find ALL occurrences of a raw string with context.
const fs = require('fs');
const file = process.argv[2];
const needle = process.argv[3];
const maxHits = process.argv[4] ? +process.argv[4] : 20;
const ctx = process.argv[5] ? +process.argv[5] : 260;
const b = fs.readFileSync(file, 'latin1');
let i = b.indexOf(needle);
let n = 0;
while (i !== -1 && n < maxHits) {
  console.log('--- @' + i + ':');
  console.log(b.slice(Math.max(0, i - ctx / 2), i + ctx).replace(/\s+/g, ' '));
  console.log('');
  n++;
  i = b.indexOf(needle, i + 1);
}
console.log('hits shown:', n);

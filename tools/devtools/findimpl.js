// findimpl.js <cache.js> <name>
// Find method/impl occurrences of a (possibly $-prefixed) identifier in compiled JS.
const fs = require('fs');
const file = process.argv[2];
const name = process.argv[3];
const b = fs.readFileSync(file, 'latin1');
const pats = [
  '.' + name + '=function',
  name + '=function',
  'function ' + name + '(',
  '.' + name + '_0=function',
  name + ':function',
];
let found = 0;
for (const p of pats) {
  let i = b.indexOf(p);
  while (i !== -1 && found < 12) {
    console.log('--- "' + p + '" @' + i + ':');
    console.log(b.slice(Math.max(0, i - 40), i + 340).replace(/\s+/g, ' '));
    console.log('');
    found++;
    i = b.indexOf(p, i + 1);
  }
}
console.log('total shown:', found);

// count.js <file> <needle1> [needle2 ...] - count occurrences of each needle
const fs = require('fs');
const b = fs.readFileSync(process.argv[2], 'latin1');
for (const s of process.argv.slice(3)) {
  console.log(JSON.stringify(s) + ': ' + (b.split(s).length - 1));
}

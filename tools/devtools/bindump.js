// Dump a raw byte region of a file to another file
const fs = require('fs');
const [src, offHex, len, dst] = process.argv.slice(2);
const fd = fs.openSync(src, 'r');
const buf = Buffer.alloc(parseInt(len, 10));
fs.readSync(fd, buf, 0, buf.length, parseInt(offHex, 16));
fs.closeSync(fd);
fs.writeFileSync(dst, buf);
console.log('dumped', buf.length, 'bytes to', dst);

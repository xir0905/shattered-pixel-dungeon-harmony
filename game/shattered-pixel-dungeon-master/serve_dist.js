// Minimal static file server for the GWT draft output (html/build/dist).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'html', 'build', 'dist');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.properties': 'text/plain', '.txt': 'text/plain', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf',
  '.fnt': 'text/plain', '.atlas': 'text/plain', '.glsl': 'text/plain',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + p); return; }
    res.writeHead(200, {
      'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
    });
    fs.createReadStream(f).pipe(res);
  });
}).listen(8080, () => console.log('SPD draft: http://localhost:8080/  (root: ' + root + ')'));

// Dump GL framebuffer to PNG via 2D canvas copy
// Usage: node hap_cdp_dump.js <outfile.png>
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const fs = require('fs');
const OUT = process.argv[2] || (process.env.TEMP + '\\deveco\\gldump.png');

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout')); } }, 60000);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', {
    expression: `(function(){
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl');
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const c2 = document.createElement('canvas');
      c2.width = W; c2.height = H;
      const ctx = c2.getContext('2d');
      const img = ctx.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const src = ((H - 1 - y) * W + x) * 4;
          const dst = (y * W + x) * 4;
          img.data[dst] = px[src];
          img.data[dst+1] = px[src+1];
          img.data[dst+2] = px[src+2];
          img.data[dst+3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c2.toDataURL('image/png');
    })()`,
    returnByValue: true
  });
  if (r.exceptionDetails) { console.error('EVAL_ERR', r.exceptionDetails.exception?.description?.slice(0, 300)); process.exit(1); }
  const b64 = r.result.value.split(',')[1];
  fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
  console.log('saved: ' + OUT);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

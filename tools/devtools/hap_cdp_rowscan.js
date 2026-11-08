// Read GL region pixel-perfect to read text
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout')); } }, 30000);
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
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 150);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  // First: locate non-black rows/cols precisely
  console.log(await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // row profile
    let rowsOut = [];
    for (let y = H - 1; y >= 0; y--) {  // top to bottom
      let s = 0;
      for (let x = 0; x < W; x += 2) { const i = (y*W+x)*4; s += (px[i]+px[i+1]+px[i+2])/3; }
      const avg = s / (W/2);
      if (avg > 6) rowsOut.push('y=' + y + ' avg=' + Math.round(avg));
    }
    return 'bright rows (top->bottom):\\n' + (rowsOut.length > 60 ? rowsOut.slice(0, 30).join('\\n') + '\\n...(' + rowsOut.length + ' rows total)\\n...' + rowsOut.slice(-30).join('\\n') : rowsOut.join('\\n'));
  })()`));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

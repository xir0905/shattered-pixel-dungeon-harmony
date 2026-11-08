// Scan-tap: try candidate button positions, capture frame after each
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); } }, 30000);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log('[EXCEPTION]', (d.exception && d.exception.description || d.text || '').slice(0, 200));
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 150);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  async function tap(x, y) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(120);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  // signature: row-profile of brightness (20 rows)
  const frameSig = async () => await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const GY = 20;
    let prof = [];
    for (let gy = 0; gy < GY; gy++) {
      let s = 0, n = 0;
      const y0 = Math.floor(gy*H/GY), y1 = Math.floor((gy+1)*H/GY);
      for (let y = y0; y < y1; y += 3) for (let x = 0; x < W; x += 6) {
        const i = ((H-1-y)*W + x)*4;
        s += (px[i]+px[i+1]+px[i+2])/3; n++;
      }
      prof.push(Math.round(s/n));
    }
    return prof.join(',');
  })()`);

  const sig0 = await frameSig();
  console.log('baseline sig:', sig0);

  // candidates: big block center (194,425); others
  const candidates = [
    [194, 425],  // big block
    [194, 480],
    [194, 350],
  ];
  for (const [x, y] of candidates) {
    await tap(x, y);
    await sleep(2500);
    const s = await frameSig();
    const changed = s !== sig0 ? ' <<< CHANGED' : ' (same)';
    console.log('tap(' + x + ',' + y + ') sig: ' + s + changed);
    if (s !== sig0) break;
  }

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

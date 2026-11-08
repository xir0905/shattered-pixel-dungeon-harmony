// Console listener + tap sequence
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const taps = process.argv.slice(2).map(s => s.split(',').map(Number)); // e.g. 194,760 194,400

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const logs = [];
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
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const line = '[c.' + msg.params.type + '] ' + (msg.params.args || []).map(a => a.value ?? a.description ?? JSON.stringify(a.preview?.properties?.map(p=>p.value) ?? '')).join(' ').slice(0, 400);
      logs.push(line); console.log(line);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const line = '[EXC] ' + (d.exception && d.exception.description || d.text || '').slice(0, 300);
      logs.push(line); console.log(line);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  for (const [x, y] of taps) {
    console.log('--- tapping (' + x + ',' + y + ') ---');
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(130);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(2500);
    // quick sig
    const sig = await evalIn(`(function(){
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl');
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W*H*4);
      gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px);
      let s=0,n=0;
      for (let i=0;i<px.length;i+=128){s+=(px[i]+px[i+1]+px[i+2])/3;n++}
      return Math.round(s/n);
    })()`);
    console.log('avgBrightness=' + sig);
  }
  console.log('=== total log lines captured: ' + logs.length + ' ===');
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

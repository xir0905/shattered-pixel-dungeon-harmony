// Touch-driven game flow test: tap canvas, capture GL frames between steps
// Usage: node hap_cdp_touchflow.js <step: start|hero|enter|check>
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const STEP = process.argv[2] || 'start';
const fs = require('fs');

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
  await send('Page.enable');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  // canvas geometry
  const geo = await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height });
  })()`);
  console.log('canvas rect:', geo);
  const g = JSON.parse(geo);

  async function tap(px, py) {
    const x = g.x + px, y = g.y + py;
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(120);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    console.log('tapped at canvas-local (' + px + ',' + py + ') -> viewport (' + Math.round(x) + ',' + Math.round(y) + ')');
  }

  async function frameGrid(label) {
    const out = await evalIn(`(function(){
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl');
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const GX = 16, GY = 20;
      let rows = [];
      for (let gy = 0; gy < GY; gy++) {
        let row = '';
        for (let gx = 0; gx < GX; gx++) {
          let r = 0, gg = 0, b = 0, n = 0;
          const x0 = Math.floor(gx*W/GX), x1 = Math.floor((gx+1)*W/GX);
          const y0 = Math.floor(gy*H/GY), y1 = Math.floor((gy+1)*H/GY);
          for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
            const i = ((H-1-y)*W + x)*4;
            r += px[i]; gg += px[i+1]; b += px[i+2]; n++;
          }
          r/=n; gg/=n; b/=n;
          const br = (r+gg+b)/3;
          let ch = ' ';
          if (br > 15) ch = '.';
          if (br > 45) ch = ':';
          if (br > 90) ch = '*';
          if (br > 150) ch = '#';
          if (r-b > 40 && br > 45) ch = 'R';
          if (gg > r+30 && gg > b+30 && br > 45) ch = 'G';
          row += ch;
        }
        rows.push(row);
      }
      let sum=0,n=0;
      for (let i=0;i<px.length;i+=64){sum+=(px[i]+px[i+1]+px[i+2])/3;n++}
      return 'avgBright=' + Math.round(sum/n) + '\\n' + rows.join('\\n');
    })()`);
    console.log('--- frame after ' + label + ' ---');
    console.log(out);
    return out;
  }

  const steps = {
    // Title screen: tap "Start"-ish button ~ lower middle
    start: async () => {
      await frameGrid('title');
      await tap(g.w * 0.5, g.h * 0.75);
      await sleep(3000);
      await frameGrid('tap@75%');
    },
    // If title -> hero select visible, tap warrior card (center-left upper area)
    hero: async () => {
      await tap(g.w * 0.5, g.h * 0.42);
      await sleep(2500);
      await frameGrid('tap hero');
    },
    // tap "start game" confirm button (bottom)
    enter: async () => {
      await tap(g.w * 0.5, g.h * 0.88);
      await sleep(5000);
      await frameGrid('tap enter');
    },
    check: async () => {
      await frameGrid('current');
    }
  };

  if (steps[STEP]) await steps[STEP]();
  else console.log('unknown step:', STEP);

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

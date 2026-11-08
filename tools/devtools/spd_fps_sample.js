// SPD fps sampler — collect rAF frame deltas via CDP, print stats + raw deltas.
// Usage: node spd_fps_sample.js [durationMs] [label]
//   durationMs : sampling window in ms (default 10000)
//   label      : free-text label echoed in output (default 'sample')
// WS URL from %TEMP%\deveco\real_ws.txt (or ws://... as argv[2], then shift).
// Future-work C-4 tool. Stats computed in-page; raw delta list printed for offline analysis.

const args = process.argv.slice(2);
let WS_URL;
if (args[0] && args[0].startsWith('ws://')) { WS_URL = args.shift(); }
else { WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim(); }
const DURATION = parseInt(args[0] || '10000', 10);
const LABEL = args[1] || 'sample';

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); } }, DURATION + 20000);
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

  const expr = `(function(){
    const dur = ${DURATION};
    return new Promise(resolve => {
      const ts = [];
      let start = null;
      function tick(t){
        if (start === null) start = t;
        ts.push(t);
        if (t - start < dur) requestAnimationFrame(tick); else finish();
      }
      function finish(){
        const raw = [];
        for (let i = 1; i < ts.length; i++) raw.push(+(ts[i] - ts[i-1]).toFixed(1));
        const sorted = raw.slice().sort((a,b) => a - b);
        const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        const wall = ts[ts.length - 1] - ts[0];
        resolve(JSON.stringify({
          frames: ts.length,
          wallMs: +wall.toFixed(1),
          avgFps: +((ts.length - 1) / (wall / 1000)).toFixed(1),
          dMin: sorted[0], dP50: q(0.5), dP90: q(0.9), dP95: q(0.95), dP99: q(0.99), dMax: sorted[sorted.length - 1],
          refreshEstMs: q(0.05),
          estHz: +(1000 / q(0.05)).toFixed(1),
          over20: raw.filter(d => d > 20).length,
          over25: raw.filter(d => d > 25).length,
          over34: raw.filter(d => d > 34).length,
          deltas: raw
        }));
      }
      requestAnimationFrame(tick);
    });
  })()`;

  console.log('=== fps sample: ' + LABEL + ' (' + DURATION + 'ms) ===');
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    console.error('PAGE EXCEPTION:', JSON.stringify(r.exceptionDetails.exception));
    process.exit(1);
  }
  const data = JSON.parse(r.result.value);
  console.log('frames=' + data.frames + ' wall=' + data.wallMs + 'ms avgFps=' + data.avgFps +
    ' | delta ms min/p50/p90/p95/p99/max = ' + data.dMin + '/' + data.dP50 + '/' + data.dP90 + '/' + data.dP95 + '/' + data.dP99 + '/' + data.dMax +
    ' | refresh~' + data.estHz + 'Hz (' + data.refreshEstMs + 'ms)' +
    ' | over20/25/34ms = ' + data.over20 + '/' + data.over25 + '/' + data.over34);
  console.log('deltas=' + JSON.stringify(data.deltas));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

// SPD console watcher — stream console messages + exceptions for N seconds (D-group tool).
// Usage: node spd_console_watch.js [durationSec]
const DURATION = parseInt(process.argv[2] || '30', 10);
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
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[console.' + msg.params.type + '] ' + (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log('[EXCEPTION] ' + (d.exception && d.exception.description || d.text || '').slice(0, 400));
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < DURATION) await new Promise(r => setTimeout(r, 500));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

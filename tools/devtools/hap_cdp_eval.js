// Evaluate a JS expression in the SPD page via CDP, print result
// usage: node hap_cdp_eval.js "<expr>"
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const expr = process.argv[2];
if (!expr) { console.error('usage: node hap_cdp_eval.js "<expr>"'); process.exit(1); }

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
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    console.log('[EXC] ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  } else {
    const v = r.result?.value;
    console.log(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(r.result?.value ?? r.result?.description ?? 'undefined'));
  }
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

const PAGE_WS = process.argv[2];
let msgId = 0; const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  }
};
async function evalJs(expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'THROW: ' + r.exceptionDetails.text;
  return r.result.value;
}
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  console.log('--- resource timings (iframe) ---');
  console.log(await evalJs(`(()=>{try{const w=document.getElementById('shattered').contentWindow; return w.performance.getEntriesByType('resource').map(e=>e.name.split('/').pop().slice(0,50)+' dur='+Math.round(e.duration)+'ms size='+(e.transferSize||0)).join('\\n')}catch(e){return 'ERR '+e.message}})()`));
  console.log('--- timing ---');
  console.log(await evalJs(`(()=>{const w=document.getElementById('shattered').contentWindow; const nav=w.performance.getEntriesByType('navigation')[0]; return nav? 'domInteractive='+Math.round(nav.domInteractive)+' loadEventEnd='+Math.round(nav.loadEventEnd) : 'no nav'})()`));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

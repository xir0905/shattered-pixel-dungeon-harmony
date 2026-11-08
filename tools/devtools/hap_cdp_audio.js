const PAGE_WS = process.argv[2];
let msgId = 0; const pending = new Map();
function send(ws, method, params) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, {res, rej}); ws.send(JSON.stringify({ id, method, params })); }); }
const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
async function evalJs(expr) { const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'THROW: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''); return r.result.value; }
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  const w1 = await evalJs(`document.querySelector('.gdx-meter span').style.width`);
  console.log('meter now:', w1);
  await new Promise(r => setTimeout(r, 4000));
  const w2 = await evalJs(`document.querySelector('.gdx-meter span').style.width`);
  console.log('meter +4s:', w2);
  console.log('--- audio canplaythrough test ---');
  console.log(await evalJs(`new Promise(resolve => { const a = new Audio(); a.preload='auto'; a.src='http://spd.local/assets/sounds/click-b1096fe2f7e9ac091ce18641de6e8d8f.mp3'; let done=false; const t=setTimeout(()=>{ if(!done){done=true; resolve('TIMEOUT 10s, readyState='+a.readyState+' networkState='+a.networkState+' error='+(a.error? a.error.code : 'none'))} }, 10000); a.oncanplaythrough=()=>{ if(!done){done=true; clearTimeout(t); resolve('CANPLAYTHROUGH ok, dur='+a.duration)} }; a.onerror=()=>{ if(!done){done=true; clearTimeout(t); resolve('ERROR code='+(a.error?a.error.code:'?'))} }; a.load(); })`));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

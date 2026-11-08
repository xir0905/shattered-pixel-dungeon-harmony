const PAGE_WS = process.argv[2];
let msgId = 0; const pending = new Map();
function send(ws, method, params) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, {res, rej}); ws.send(JSON.stringify({ id, method, params })); }); }
const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
async function evalJs(expr) { const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'THROW: ' + r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''); return r.result.value; }
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  console.log('--- embed div content ---');
  console.log(await evalJs(`document.getElementById('embed-shattered').innerHTML.slice(0, 600)`));
  console.log('--- child tag ---');
  console.log(await evalJs(`(()=>{const c=document.getElementById('embed-shattered').firstElementChild; return c? c.tagName+' class='+c.className+' children='+c.children.length+' html='+c.innerHTML.slice(0,300) : 'none'})()`));
  console.log('--- iframe window keys (gwt entry) ---');
  console.log(await evalJs(`(()=>{const w=document.getElementById('shattered').contentWindow; const ks=[]; for(const k in w){ if(k.indexOf('shattered')>=0||k.indexOf('gwt')>=0||k.indexOf('watabou')>=0) ks.push(k)} return ks.slice(0,20).join(', ')})()`));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

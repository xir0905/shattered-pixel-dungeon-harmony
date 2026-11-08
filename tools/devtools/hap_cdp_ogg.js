const PAGE_WS = process.argv[2];
let msgId = 0; const pending = new Map();
function send(ws, method, params) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, {res, rej}); ws.send(JSON.stringify({ id, method, params })); }); }
const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
async function evalJs(expr) { const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'THROW: ' + r.exceptionDetails.text; return r.result.value; }
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  console.log('--- ogg canplaythrough test ---');
  console.log(await evalJs(`new Promise(resolve => { const a = new Audio(); a.preload='auto'; a.src='http://spd.local/assets/music/theme_1-44a7055bcd59c50fea6554d9c690b295.ogg'; let done=false; const t=setTimeout(()=>{ if(!done){done=true; resolve('TIMEOUT 12s rs='+a.readyState+' ns='+a.networkState+' err='+(a.error?a.error.code:'none'))} }, 12000); a.oncanplaythrough=()=>{ if(!done){done=true; clearTimeout(t); resolve('CANPLAYTHROUGH dur='+a.duration)} }; a.onerror=()=>{ if(!done){done=true; clearTimeout(t); resolve('ERROR code='+(a.error?a.error.code:'?'))} }; a.load(); })`));
  console.log('--- codec support ---');
  console.log(await evalJs(`(()=>{const a=document.createElement('audio'); const r={ogg:'',mp3:'',wav:''}; r.ogg=a.canPlayType('audio/ogg'); r.mp3=a.canPlayType('audio/mpeg'); r.wav=a.canPlayType('audio/wav'); return JSON.stringify(r)})()`));
  console.log('--- meter now ---');
  console.log(await evalJs(`(()=>{const s=document.querySelector('.gdx-meter span'); return s? s.style.width : 'no meter (preloader gone?)'})()`));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

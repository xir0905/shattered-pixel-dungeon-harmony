// Query browser-level SystemInfo (GPU) via CDP
const WS = process.argv[2];
let msgId = 0; const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const ws = new WebSocket(WS);
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  }
};
(async () => {
  await new Promise(r => ws.onopen = r);
  try {
    const info = await send(ws, 'SystemInfo.getInfo', {});
    console.log(JSON.stringify(info, null, 1));
  } catch (e) { console.log('SystemInfo.getInfo ERR:', e.message); }
  try {
    const proc = await send(ws, 'SystemInfo.getProcessInfo', {});
    console.log('processInfo:', JSON.stringify(proc));
  } catch (e) { console.log('getProcessInfo ERR:', e.message); }
  try {
    const bt = await send(ws, 'Browser.getVersion', {});
    console.log('browser:', JSON.stringify(bt));
  } catch (e) { console.log('getVersion ERR:', e.message); }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

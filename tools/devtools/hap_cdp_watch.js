// Reload SPD page and watch all console/exception/network events for N seconds
const PAGE_WS = process.argv[2];
const SECONDS = parseInt(process.argv[3] || '120', 10);
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
    return;
  }
  const ts = new Date().toISOString().substring(11, 19);
  if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map(a => a.value !== undefined ? JSON.stringify(a.value).slice(0, 300) : (a.description || a.type).slice(0, 300)).join(' ');
    console.log(`[${ts}][console.${m.params.type}] ${args}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log(`[${ts}][EXCEPTION] ${d.text} ${d.exception ? String(d.exception.description || d.exception.value).slice(0, 800) : ''} url=${d.url || ''} line=${d.lineNumber}`);
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    console.log(`[${ts}][log.${e.level}] ${e.source}: ${e.text.slice(0, 400)} ${e.url || ''}`);
  } else if (m.method === 'Network.loadingFailed') {
    console.log(`[${ts}][netfail] ${m.params.requestId} ${m.params.errorText} ${m.params.type}`);
  } else if (m.method === 'Network.requestWillBeSent') {
    const u = m.params.request.url;
    if (!u.includes('favicon')) console.log(`[${ts}][req] ${u.slice(0, 120)}`);
  }
};
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Network.enable');
  console.log('--- reloading page ---');
  await send(ws, 'Page.reload', { ignoreCache: true });
  const until = Date.now() + SECONDS * 1000;
  while (Date.now() < until) await new Promise(r => setTimeout(r, 2000));
  console.log('--- done ---');
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

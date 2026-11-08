// Track all network requests through reload; report ones that never finish
const PAGE_WS = process.argv[2];
const SECONDS = parseInt(process.argv[3] || '90', 10);
let msgId = 0; const pending = new Map();
function send(ws, method, params) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, {res, rej}); ws.send(JSON.stringify({ id, method, params })); }); }
const ws = new WebSocket(PAGE_WS);
const reqs = new Map(); // id -> {url, state}
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Network.requestWillBeSent') {
    reqs.set(m.params.requestId, { url: m.params.request.url, state: 'sent' });
  } else if (m.method === 'Network.responseReceived') {
    const r = reqs.get(m.params.requestId); if (r) { r.state = 'resp'; r.status = m.params.response.status; r.mime = m.params.response.mimeType; }
  } else if (m.method === 'Network.loadingFinished') {
    const r = reqs.get(m.params.requestId); if (r) r.state = 'done';
  } else if (m.method === 'Network.loadingFailed') {
    const r = reqs.get(m.params.requestId); if (r) { r.state = 'FAILED'; r.err = m.params.errorText; }
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text} ${d.exception ? String(d.exception.description || '').slice(0, 500) : ''}`);
  }
};
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Network.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Page.reload', { ignoreCache: true });
  console.log('reloaded, tracking...');
  const until = Date.now() + SECONDS * 1000;
  while (Date.now() < until) await new Promise(r => setTimeout(r, 3000));
  let done = 0, pend = 0, failed = 0;
  const pendingList = [];
  for (const [id, r] of reqs) {
    if (r.state === 'done') done++;
    else if (r.state === 'FAILED') { failed++; console.log(`FAILED: ${r.url} ${r.err}`); }
    else { pend++; pendingList.push(r); }
  }
  console.log(`total=${reqs.size} done=${done} pending=${pend} failed=${failed}`);
  for (const r of pendingList.slice(0, 20)) {
    console.log(`PENDING(${r.state}${r.status ? ',' + r.status : ''}${r.mime ? ',' + r.mime : ''}): ${r.url}`);
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

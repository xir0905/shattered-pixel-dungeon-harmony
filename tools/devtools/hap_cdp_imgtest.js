// Test whether Image load/error events fire in ArkWeb for preloaded assets
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
    return;
  }
  if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    console.log(`[log.${e.level}] ${e.source}: ${e.text.slice(0, 200)} ${e.url || ''}`);
  }
};
async function evalJs(expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return `THROW: ${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`;
  return r.result.value;
}

const IMG_TEST = (url) => `new Promise((resolve) => {
  const res = { url: '${url}', events: [] };
  const img = new Image();
  const t0 = Date.now();
  img.addEventListener('load', () => res.events.push('load@' + (Date.now()-t0) + 'ms nw=' + img.naturalWidth + 'x' + img.naturalHeight));
  img.addEventListener('error', (e) => res.events.push('error@' + (Date.now()-t0) + 'ms'));
  img.src = '${url}';
  setTimeout(() => { res.complete = img.complete; res.nw = img.naturalWidth; resolve(JSON.stringify(res)); }, 4000);
})`;

const XHR_TEST = (url) => `new Promise((resolve) => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '${url}');
  xhr.responseType = 'arraybuffer';
  xhr.onload = () => resolve('xhr status=' + xhr.status + ' bytes=' + (xhr.response ? xhr.response.byteLength : -1));
  xhr.onerror = () => resolve('xhr ONERROR');
  xhr.send();
})`;

const FETCH_BITMAP_TEST = (url) => `fetch('${url}').then(r => r.blob()).then(b => createImageBitmap(b).then(bm => 'fetch+bitmap OK ' + bm.width + 'x' + bm.height + ' blobtype=' + b.type + ' blobsize=' + b.size)).catch(e => 'fetch+bitmap FAIL: ' + e.message)`;

const DECODE_TEST = (url) => `new Promise((resolve) => {
  const img = new Image();
  img.src = '${url}';
  const done = (v) => resolve(v);
  const timer = setTimeout(() => done('decode() TIMEOUT after 8s (promise never settled)'), 8000);
  img.decode().then(() => { clearTimeout(timer); done('decode() OK nw=' + img.naturalWidth); }).catch(e => { clearTimeout(timer); done('decode() REJECT: ' + e.message); });
})`;

(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');

  console.log('=== location:', await evalJs('location.href'));
  const bigPng = 'http://spd.local/assets/effects/fireball-tall-ab629e63433fb005abc29be4bbe5c654.png';
  const tinyPng = 'http://spd.local/assets/effects/effects-849fd75d9a2314bc40bdabdf7de5dc61.png';

  console.log('--- XHR big PNG:', await evalJs(XHR_TEST(bigPng)));
  console.log('--- XHR tiny PNG:', await evalJs(XHR_TEST(tinyPng)));
  console.log('--- Image events big PNG:', await evalJs(IMG_TEST(bigPng)));
  console.log('--- Image events tiny PNG:', await evalJs(IMG_TEST(tinyPng)));
  console.log('--- fetch+createImageBitmap big:', await evalJs(FETCH_BITMAP_TEST(bigPng)));
  console.log('--- img.decode() big:', await evalJs(DECODE_TEST(bigPng)));
  console.log('--- data: URL image control:', await evalJs(IMG_TEST('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

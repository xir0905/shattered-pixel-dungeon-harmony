// Probe renderer state relevant to image loading suspension
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
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    console.log(`[log.${e.level}] ${e.source}: ${e.text.slice(0, 200)} ${e.url || ''}`);
  }
};
async function evalJs(expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return `THROW: ${r.exceptionDetails.text}`;
  return r.result.value;
}
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  const checks = {
    'location': 'location.href',
    'readyState': 'document.readyState',
    'visibilityState': 'document.visibilityState + " hidden=" + document.hidden',
    'hasFocus': 'document.hasFocus()',
    'onload fired': 'window.__loadFired === undefined ? "no listener was set (unknown)" : String(window.__loadFired)',
    'prerendering': 'String(document.prerendering)',
    'frames length': 'window.frames.length',
    'requestAnimationFrame': `new Promise(r => { let n = 0; const t0 = Date.now(); const step = () => { n++; if (n >= 3) r('rAF fired ' + n + 'x, dt=' + (Date.now()-t0) + 'ms'); else requestAnimationFrame(step); }; requestAnimationFrame(step); setTimeout(() => r('rAF NEVER FIRED'), 3000); })`,
    'setTimeout accuracy': `new Promise(r => { const t0 = Date.now(); setTimeout(() => r('timer fired after ' + (Date.now()-t0) + 'ms'), 500); })`,
    'img attached to DOM': `new Promise(r => { const img = document.createElement('img'); img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; document.body.appendChild(img); setTimeout(() => { r('complete=' + img.complete + ' nw=' + img.naturalWidth + ' rendered=' + (img.getBoundingClientRect().width) + 'x' + (img.getBoundingClientRect().height)); img.remove(); }, 3000); })`,
    'iframe visibility': `(() => { try { const f = document.getElementById('shattered'); const d = f.contentDocument; return 'iframe hidden=' + d.hidden + ' vis=' + d.visibilityState + ' ready=' + d.readyState; } catch (e) { return 'ERR ' + e.message; } })()`,
    'img in iframe': `new Promise(r => { try { const f = document.getElementById('shattered'); const d = f.contentDocument; const img = d.createElement('img'); img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; d.body.appendChild(img); setTimeout(() => { r('iframe img complete=' + img.complete + ' nw=' + img.naturalWidth); img.remove(); }, 3000); } catch (e) { r('ERR ' + e.message); } })`,
    'canvas2d drawImage bitmap': `new Promise(r => { fetch('http://spd.local/assets/effects/effects-849fd75d9a2314bc40bdabdf7de5dc61.png').then(res => res.blob()).then(b => createImageBitmap(b)).then(bm => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const ctx = c.getContext('2d'); ctx.drawImage(bm, 0, 0); const px = ctx.getImageData(0, 0, 1, 1).data; r('drawImage OK, pixel rgba=' + px.join(',')); }).catch(e => r('FAIL ' + e.message)); })`,
  };
  for (const [name, expr] of Object.entries(checks)) {
    try { console.log(`${name}: ${await evalJs(expr)}`); } catch (e) { console.log(`${name}: EVAL-ERR ${e.message}`); }
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

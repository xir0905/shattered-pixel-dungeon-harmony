// Diagnose WebGL availability in ArkWeb
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
  const probe = (ctxName, extra) => `(() => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const gl = c.getContext('${ctxName}', ${extra || 'undefined'});
    if (!gl) return '${ctxName}: NULL';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return '${ctxName}: OK version=' + gl.getParameter(gl.VERSION) + ' vendor=' + (dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)) + ' renderer=' + (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  })()`;
  console.log(await evalJs(probe('webgl')));
  console.log(await evalJs(probe('experimental-webgl')));
  console.log(await evalJs(probe('webgl2')));
  console.log(await evalJs(probe('webgl2', '{failIfMajorPerformanceCaveat: false}')));
  console.log('canvas 2d:', await evalJs(`(() => { const c = document.createElement('canvas'); return c.getContext('2d') ? '2d OK' : '2d NULL'; })()`));
  console.log('in iframe:', await evalJs(`(() => { try { const f = document.getElementById('shattered'); const d = f.contentDocument; const c = d.createElement('canvas'); return 'webgl=' + (c.getContext('webgl') ? 'OK' : 'NULL') + ' webgl2=' + (c.getContext('webgl2') ? 'OK' : 'NULL'); } catch (e) { return 'ERR ' + e.message; } })()`));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });

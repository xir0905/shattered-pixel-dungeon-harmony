// Quick check: is shield-mode-style API blocking active (WebAssembly, ServiceWorker, etc.)
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
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  const expr = `(() => {
    const r = {};
    r.wasm = typeof WebAssembly;
    try { r.wasmCompile = WebAssembly ? (WebAssembly.compile ? 'compile fn present' : 'no compile') : 'n/a'; } catch (e) { r.wasmCompile = 'ERR ' + e.message; }
    r.serviceWorker = ('serviceWorker' in navigator);
    r.getUserMedia = navigator.mediaDevices ? typeof navigator.mediaDevices.getUserMedia : 'no mediaDevices';
    r.speechSynthesis = typeof speechSynthesis;
    r.mathml = typeof MathMLElement;
    r.jitHint = (function(){ try { return String((new Function('return 1+1'))() === 2); } catch(e){ return 'ERR ' + e.message; } })();
    return JSON.stringify(r);
  })()`;
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(r.result.value);
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

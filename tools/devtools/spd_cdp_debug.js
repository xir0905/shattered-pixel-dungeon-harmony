// Deeper headless debug: rAF liveness, canvas internals, localStorage keys,
// a real CDP mouse click, then a fresh screenshot.
// Usage: node spd_cdp_debug.js <screenshot-out.png>
const fs = require('fs');
const DEBUG_PORT = 9222;
const GAME_URL = 'http://localhost:8080/';

async function main() {
  const shotPath = process.argv[2] || 'spd_debug.png';

  const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new`, { method: 'PUT' });
  const tab = await r.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const msgs = [];

  const send = (method, params) => new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
  });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      msgs.push(`[console.${m.params.type}] ${text}`);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      msgs.push(`[EXCEPTION] ${d.text} ${d.exception ? (d.exception.description || d.exception.value || '') : ''}`);
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      msgs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
    }
  };

  await new Promise(res => { ws.onopen = res; });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');

  // count rAF ticks from document creation
  await send('Page.addScriptToEvaluateOnNewDocument', { source:
    'window.__raf = 0; requestAnimationFrame(function loop(){ window.__raf++; requestAnimationFrame(loop); });' });

  await send('Page.navigate', { url: GAME_URL });
  await new Promise(r2 => setTimeout(r2, 30000));

  const ev1 = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({
    raf: window.__raf,
    canvas: (() => { const c = document.querySelector('canvas'); return c ? c.width + 'x' + c.height : 'none'; })(),
    visible: (() => { const c = document.querySelector('canvas'); return c ? c.offsetWidth + 'x' + c.offsetHeight : 'none'; })(),
    glCtx: (() => { const c = document.querySelector('canvas'); if (!c) return 'no-canvas'; const g = c.getContext('webgl'); if (!g) return 'null'; return g.drawingBufferWidth + 'x' + g.drawingBufferHeight + ' ver' + g.getParameter(g.VERSION) + ' rend:' + (g.getParameter(g.RENDERER) || '?'); })(),
    lsKeys: Object.keys(localStorage).join('|') || '(empty)',
    lsCounts: Object.keys(localStorage).length,
    title: document.title,
    bodyChildren: document.body ? document.body.children.length : -1,
    bodyDetail: document.body ? Array.from(document.body.children).map(e => e.tagName + (e.id ? '#'+e.id : '') + ' ' + e.offsetWidth + 'x' + e.offsetHeight + '@' + e.offsetTop).join(' | ') : '',
    scrollY: window.scrollY || window.pageYOffset || 0,
    inner: window.innerWidth + 'x' + window.innerHeight,
    docH: document.documentElement.scrollHeight
  })` });
  console.log('STATE1:', ev1.result.value);

  await new Promise(r2 => setTimeout(r2, 4000));
  const ev2 = await send('Runtime.evaluate', { returnByValue: true, expression: 'window.__raf' });
  console.log('raf after +4s:', ev2.result.value);

  // read drawing buffer pixels directly (preserveDrawingBuffer=true now)
  const px = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const c = document.querySelector('canvas');
    const g = c.getContext('webgl');
    if (!g) return 'no-gl';
    const pts = [[0.5,0.5],[0.25,0.25],[0.75,0.5],[0.5,0.2],[0.5,0.8],[0.1,0.9]];
    const out = [];
    for (const [fx,fy] of pts) {
      const p = new Uint8Array(4);
      g.readPixels(Math.floor(g.drawingBufferWidth*fx), Math.floor(g.drawingBufferHeight*fy), 1, 1, g.RGBA, g.UNSIGNED_BYTE, p);
      out.push(p.join(','));
    }
    return JSON.stringify({ lost: g.isContextLost(), samples: out,
      clearColor: g.getParameter(g.COLOR_CLEAR_VALUE).join(',') });
  })()` });
  console.log('PIXELS:', px.result.value);

  // real mouse click at given position (default canvas center)
  const cx = parseInt(process.argv[3] || '377', 10);
  const cy = parseInt(process.argv[4] || '243', 10);

  // input diagnostics: canvas rect + mousedown probe
  const rect = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    document.addEventListener('mousedown', e => { window.__lastMD = [e.clientX, e.clientY, e.target.tagName]; }, true);
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return JSON.stringify({ left: r.left, top: r.top, w: r.width, h: r.height });
  })()` });
  console.log('canvas rect:', rect.result.value);

  console.log(`clicking (${cx},${cy})...`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });
  await new Promise(r2 => setTimeout(r2, 2000));
  const mdProbe = await send('Runtime.evaluate', { returnByValue: true, expression: 'JSON.stringify(window.__lastMD || "no-mousedown-seen")' });
  console.log('mousedown probe:', mdProbe.result.value);
  await new Promise(r2 => setTimeout(r2, 4000));

  const ev3 = await send('Runtime.evaluate', { returnByValue: true, expression: 'window.__raf' });
  console.log('raf after click +6s:', ev3.result.value);

  const shotEval = await send('Runtime.evaluate', { returnByValue: true, expression:
    `(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/png') : ''; })()` });
  if (shotEval.result.value && shotEval.result.value.length > 100) {
    fs.writeFileSync(shotPath, Buffer.from(shotEval.result.value.split(',')[1], 'base64'));
    console.log('screenshot (toDataURL) written:', shotPath);
  } else {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('screenshot (captureScreenshot) written:', shotPath);
  }

  console.log('--- browser console (' + msgs.length + ' entries) ---');
  msgs.forEach(m => console.log(m));
  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('CDP error:', e.message); process.exit(1); });

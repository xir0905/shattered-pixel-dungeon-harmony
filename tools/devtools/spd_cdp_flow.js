// Headless multi-click flow driver: navigate, wait for boot, then run a
// click sequence with per-step delays, screenshot at the end.
// Usage: node spd_cdp_flow.js <out.png> <bootWaitMs> <x1,y1,waitMs1> <x2,y2,waitMs2> ...
const fs = require('fs');
const DEBUG_PORT = 9222;
const GAME_URL = 'http://localhost:8080/';

async function main() {
  const shotPath = process.argv[2] || 'spd_flow.png';
  const bootMs = parseInt(process.argv[3] || '25000', 10);
  const steps = [];
  for (let i = 4; i < process.argv.length; i++) {
    const parts = process.argv[i].split(',');
    steps.push({ x: parseInt(parts[0], 10), y: parseInt(parts[1], 10), ms: parseInt(parts[2] || '3000', 10) });
  }

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
  await send('Page.navigate', { url: GAME_URL });

  await new Promise(r2 => setTimeout(r2, bootMs));

  for (const s of steps) {
    console.log(`click (${s.x},${s.y}) ...`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: s.x, y: s.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: s.x, y: s.y, button: 'left', clickCount: 1 });
    await new Promise(r2 => setTimeout(r2, s.ms));
  }

  const state = await send('Runtime.evaluate', { returnByValue: true, expression: `JSON.stringify({
    lsKeys: Object.keys(localStorage).join('|') || '(empty)',
    lsValues: Object.keys(localStorage).map(k => k + '=' + String(localStorage.getItem(k)).slice(0, 60)).join(' ; '),
  })` });
  console.log('LS:', state.result.value);

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

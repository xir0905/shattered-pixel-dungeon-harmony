// Headless verification of the GWT draft build via CDP.
// Usage: node spd_cdp_check.js <screenshot-out.png> <wait-ms>
const fs = require('fs');
const DEBUG_PORT = 9222;
const GAME_URL = 'http://localhost:8080/';

async function main() {
  const shotPath = process.argv[2] || 'spd_cdp.png';
  const waitMs = parseInt(process.argv[3] || '30000', 10);

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

  await new Promise(r => setTimeout(r, waitMs));

  const probe = await send('Runtime.evaluate', {
    expression: `(() => {
      const embed = document.querySelector('#embed-html');
      const canvases = document.querySelectorAll('canvas');
      return JSON.stringify({
        embedChildren: embed ? embed.children.length : -1,
        canvasCount: canvases.length,
        canvasSize: canvases.length ? canvases[0].width + 'x' + canvases[0].height : 'none',
        visible: canvases.length ? (canvases[0].offsetWidth + 'x' + canvases[0].offsetHeight) : 'none',
      });
    })()`,
    returnByValue: true,
  });
  console.log('DOM:', probe.result.value);

  // capture via toDataURL: headless --disable-gpu composites WebGL canvases
  // as black in Page.captureScreenshot; toDataURL reads the preserved buffer
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

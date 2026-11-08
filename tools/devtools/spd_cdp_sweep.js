// Click-sweep: boot, reach hero select with warrior chosen, then try a list of
// candidate points one at a time; report the first click that changes the canvas.
// Usage: node spd_cdp_sweep.js <out.png> <bootMs> "x,y" "x,y" ...
const fs = require('fs');
const DEBUG_PORT = 9222;
const GAME_URL = 'http://localhost:8080/';

async function main() {
  const shotPath = process.argv[2] || 'spd_sweep.png';
  const bootMs = parseInt(process.argv[3] || '25000', 10);
  const cands = [];
  for (let i = 4; i < process.argv.length; i++) {
    const p = process.argv[i].split(',');
    cands.push({ x: parseInt(p[0], 10), y: parseInt(p[1], 10) });
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
    }
  };

  await new Promise(res => { ws.onopen = res; });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: GAME_URL });
  await new Promise(r2 => setTimeout(r2, bootMs));

  const snap = async () => {
    const e = await send('Runtime.evaluate', { returnByValue: true, expression:
      `(() => { const c = document.querySelector('canvas'); return c ? c.toDataURL('image/png') : ''; })()` });
    return e.result.value || '';
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  // navigate: intro -> hero select -> warrior
  await click(231, 360); await new Promise(r2 => setTimeout(r2, 3000));
  await click(56, 149); await new Promise(r2 => setTimeout(r2, 3000));

  const baseline = await snap();
  const crypto = require('crypto');
  const h = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
  console.log('baseline:', h(baseline));

  let winner = null;
  for (const c of cands) {
    await click(c.x, c.y);
    await new Promise(r2 => setTimeout(r2, 2500));
    const cur = await snap();
    const same = h(cur) === h(baseline);
    console.log(`click (${c.x},${c.y}) -> ${same ? 'no change' : 'CHANGED!'}`);
    if (!same) { winner = c; fs.writeFileSync(shotPath, Buffer.from(cur.split(',')[1], 'base64')); break; }
  }

  if (!winner) {
    const cur = await snap();
    fs.writeFileSync(shotPath, Buffer.from(cur.split(',')[1], 'base64'));
  } else {
    console.log('WINNER:', JSON.stringify(winner));
  }
  console.log('screenshot written:', shotPath);
  console.log('--- console (' + msgs.length + ') ---');
  msgs.forEach(m => console.log(m));
  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('CDP error:', e.message); process.exit(1); });

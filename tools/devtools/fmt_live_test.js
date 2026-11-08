// Directly test the GWT-emulated String.format in the live page
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const m = ++id; pending.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params }));
    setTimeout(() => { if (pending.has(m)) { pending.delete(m); rej(new Error('timeout')); } }, 15000);
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const evalIn = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300);
    return r.result?.value;
  };

  // Discover String static methods injected by the GWT emul
  console.log('String statics:', await evalIn(`(function(){
    const names = [];
    for (const k of Object.getOwnPropertyNames(String)) {
      if (!['length','name','prototype','arguments','caller','fromCharCode','fromCodePoint','raw'].includes(k)) names.push(k);
    }
    return names.join(',');
  })()`));

  // Call String.format if present (exact name or with GWT suffix)
  console.log('format probe:', await evalIn(`(function(){
    const fns = Object.getOwnPropertyNames(String).filter(k => k.indexOf('format') >= 0);
    if (!fns.length) return 'no format fn';
    const out = [];
    for (const k of fns) {
      try {
        const f = String[k];
        const r1 = f('%1$d级%2$s', 1, '女猎手');
        const r2 = f('Level %1$d %2$s', 3, 'Warrior');
        const r3 = f('_%1$.0f%%_', 59.6);
        const r4 = f('%2$s killed %1$s', 'Gnoll', 'Rat');
        const r5 = f('%s / %d', 'HP', 20);
        const r6 = f('%.2f', 1.5);
        out.push(k + ' => [' + r1 + '] [' + r2 + '] [' + r3 + '] [' + r4 + '] [' + r5 + '] [' + r6 + ']');
      } catch (e) { out.push(k + ' EXC: ' + e); }
    }
    return out.join(' || ');
  })()`));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

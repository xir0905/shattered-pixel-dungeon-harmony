// Check IndexedDB (GWT local storage for game files) + render cells
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout')); } }, 30000);
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 150);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  console.log('=== IndexedDB databases ===');
  console.log(await evalIn(`(async function(){
    if (!indexedDB.databases) return 'no databases() API';
    const dbs = await indexedDB.databases();
    return dbs.map(d => d.name + ' v' + (d.version || '?')).join('\\n') || '(none)';
  })()`));

  console.log('=== gdx local files in localStorage ===');
  console.log(await evalIn(`(function(){
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys.filter(k => !k.startsWith('settings.xml')).join('\\n') || '(only settings)';
  })()`));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

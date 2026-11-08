// SPD key injector — dispatch synthetic KeyboardEvent into the page (D-2 test tool).
// Usage: node spd_key_inject.js <keyName> [keyCode]
// e.g.  node spd_key_inject.js Escape 27
const keyName = process.argv[2] || 'Escape';
const keyCode = parseInt(process.argv[3] || '27', 10);
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
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(function(){
      // DefaultGwtInput listens for keydown/keyup on document (capture=false),
      // so we must dispatch there — window-dispatched events never reach it.
      const cnt = { down: 0, up: 0 };
      const h = function(e){ if (e.key === '${keyName}') { if (e.type === 'keydown') cnt.down++; else cnt.up++; } };
      document.addEventListener('keydown', h);
      document.addEventListener('keyup', h);
      const evd = { key: '${keyName}', code: 'Escape', keyCode: ${keyCode}, which: ${keyCode}, bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent('keydown', evd));
      document.dispatchEvent(new KeyboardEvent('keyup', evd));
      document.removeEventListener('keydown', h);
      document.removeEventListener('keyup', h);
      return 'dispatched ${keyName}(${keyCode}) on document; seen down=' + cnt.down + ' up=' + cnt.up;
    })()`
  });
  console.log(r.exceptionDetails ? 'EVAL_ERR: ' + r.exceptionDetails.exception?.description : r.result.value);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

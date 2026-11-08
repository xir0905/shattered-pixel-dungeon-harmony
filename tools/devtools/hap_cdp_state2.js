// Inspect localStorage + DOM structure for state clues
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 150);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  console.log('=== localStorage keys ===');
  console.log(await evalIn(`(function(){
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = localStorage.getItem(k);
      out.push(k + ' = ' + (v.length > 120 ? v.slice(0, 120) + '...(' + v.length + 'b)' : v));
    }
    return out.join('\\n') || '(empty)';
  })()`));

  console.log('=== DOM structure ===');
  console.log(await evalIn(`(function(){
    const f = document.querySelector('iframe');
    const d = f ? f.contentDocument : null;
    let s = 'iframe: ' + (f ? 'yes' : 'no') + '\\n';
    s += 'body children: ' + document.body.children.length + '\\n';
    for (const el of document.body.children) {
      s += '  <' + el.tagName.toLowerCase() + (el.id ? ' id=' + el.id : '') + (el.className ? ' class=' + el.className : '') + '> children=' + el.children.length + '\\n';
    }
    if (d) {
      s += 'iframe body children: ' + d.body.children.length + '\\n';
      for (const el of d.body.children) {
        s += '  <' + el.tagName.toLowerCase() + (el.id ? ' id=' + el.id : '') + '> children=' + el.children.length + '\\n';
      }
    }
    return s;
  })()`));

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

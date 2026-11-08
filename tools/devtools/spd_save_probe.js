// SPD save probe — snapshot gdxfile:/gdxmtime: localStorage entries (C-6 tool).
// Usage: node spd_save_probe.js [label]
// Prints per-file mtime/size/djb2-hash so two snapshots can be diffed to
// prove saveAll() ran (mtime bump) and content changed (hash change).
const LABEL = process.argv[2] || 'probe';
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
      const files = [];
      const mtimes = {};
      let other = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (k.indexOf('gdxmtime:') === 0) { mtimes[k.slice(9)] = v; continue; }
        if (k.indexOf('gdxfile:') === 0) {
          let h = 5381;
          for (let c = 0; c < v.length; c++) { h = ((h << 5) + h + v.charCodeAt(c)) & 0x7fffffff; }
          files.push({ p: k.slice(8), len: v.length, h: h.toString(16) });
          continue;
        }
        other++;
      }
      for (const f of files) { f.m = mtimes[f.p] || '-'; }
      files.sort(function(a, b){ return a.p < b.p ? -1 : 1; });
      return JSON.stringify({ visibility: document.visibilityState, n: files.length, other: other, files: files });
    })()`
  });
  if (r.exceptionDetails) { console.error('EVAL_ERR', r.exceptionDetails.exception?.description); process.exit(1); }
  const d = JSON.parse(r.result.value);
  console.log('=== save probe: ' + LABEL + ' === visibility=' + d.visibility + ' files=' + d.n + ' otherKeys=' + d.other);
  let total = 0;
  for (const f of d.files) {
    total += f.len;
    console.log('  ' + f.p.padEnd(28) + ' len=' + String(f.len).padStart(7) + ' mtime=' + f.m + ' hash=' + f.h);
  }
  console.log('TOTAL_CHARS=' + total);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

// Reload-hypothesis test: set marker, disconnect, reconnect, check marker
const fs = require('fs');
const WS_URL = fs.readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
    ws.addEventListener('open', () => resolve({
      eval: async (expr) => {
        const r = await new Promise((res2, rej2) => {
          const mid = ++id;
          pending.set(mid, { resolve: res2, reject: rej2 });
          ws.send(JSON.stringify({ id: mid, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
          setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej2(new Error('timeout')); } }, 20000);
        });
        return r.result ? (r.result.value ?? r.result.description) : null;
      },
      close: () => ws.close()
    }));
    ws.addEventListener('error', (e) => reject(new Error('ws error')));
  });
}

async function main() {
  console.log('--- session 1 ---');
  let s1 = await connect();
  console.log('marker set:', await s1.eval('window.__mk = Date.now(), "set=" + window.__mk'));
  console.log('loader:', await s1.eval('typeof window.__gwt_activeModules + " | " + (window.__gwt_activeModules ? Object.keys(window.__gwt_activeModules).join(",") : "-")'));
  s1.close();
  await new Promise(r => setTimeout(r, 3000));
  console.log('--- session 2 (3s later) ---');
  let s2 = await connect();
  console.log('marker check:', await s2.eval('window.__mk ? "SURVIVED=" + window.__mk : "GONE (page reloaded)"'));
  console.log('loader:', await s2.eval('typeof window.__gwt_activeModules + " | " + (window.__gwt_activeModules ? Object.keys(window.__gwt_activeModules).join(",") : "-")'));
  s2.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

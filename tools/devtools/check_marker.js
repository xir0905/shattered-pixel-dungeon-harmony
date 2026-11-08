const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const ws = new WebSocket(WS_URL);
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
  ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: 'window.__mk ? "marker=" + window.__mk : "GONE-RELOADED"', returnByValue: true } }));
});
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id === 2) { console.log(m.result && m.result.result ? m.result.result.value : JSON.stringify(m).slice(0, 200)); ws.close(); process.exit(0); }
});
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);

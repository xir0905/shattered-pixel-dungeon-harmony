// CPU profile the SPD page for N seconds
const PAGE_WS = process.argv[2];
const SECONDS = parseInt(process.argv[3] || '5', 10);
let msgId = 0; const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Profiler.enable');
  await send(ws, 'Profiler.setSamplingInterval', { interval: 10 });
  await send(ws, 'Profiler.start');
  console.log(`profiling for ${SECONDS}s...`);
  await sleep(SECONDS * 1000);
  const { profile } = await send(ws, 'Profiler.stop');

  // aggregate self time per function
  const nodes = new Map();
  for (const n of profile.nodes) nodes.set(n.id, n);
  const selfTime = new Map();
  const dt = (profile.samples.length > 1) ? (profile.timeDeltas.reduce((a, b) => a + b, 0) / profile.samples.length / 1000) : 1; // ms per sample approx
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const n = nodes.get(id);
    if (!n) continue;
    const cf = n.callFrame;
    const key = `${cf.functionName || '(anonymous)'} @ ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`;
    selfTime.set(key, (selfTime.get(key) || 0) + ((profile.timeDeltas[i] || dt) / 1000));
  }
  const total = [...selfTime.values()].reduce((a, b) => a + b, 0);
  console.log(`total sampled: ${total.toFixed(1)}ms`);
  const sorted = [...selfTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  for (const [k, v] of sorted) {
    console.log(`${(v / total * 100).toFixed(1).padStart(5)}% ${v.toFixed(0).padStart(6)}ms  ${k}`);
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

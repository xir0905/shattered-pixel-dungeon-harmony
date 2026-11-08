// SPD memory/GC sampler — periodic JS heap usage via CDP, optional forced GC.
// Usage: node spd_mem_sample.js [durationSec] [intervalMs] [label] [--gc]
//   durationSec : sampling window in seconds (default 60)
//   intervalMs  : sample interval (default 1000)
//   label       : free-text label echoed in output
//   --gc        : force HeapProfiler.collectGarbage at start and end, report live set
// Future-work C-5 tool. Prints per-sample used/total heap (MB) + summary stats
// (growth MB/min, sawtooth GC count via >2MB drops, min/max/avg) + raw samples.
const args = process.argv.slice(2);
const gcFlag = args.includes('--gc');
const clean = args.filter(a => a !== '--gc');
let WS_URL;
if (clean[0] && clean[0].startsWith('ws://')) { WS_URL = clean.shift(); }
else { WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim(); }
const DURATION_S = parseInt(clean[0] || '60', 10);
const INTERVAL = parseInt(clean[1] || '1000', 10);
const LABEL = clean[2] || 'sample';

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
    setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); reject(new Error('timeout ' + method)); } }, 30000);
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
  if (gcFlag) await send('HeapProfiler.enable');

  const MB = 1024 * 1024;
  async function heapNow() {
    const r = await send('Runtime.getHeapUsage');
    return { used: r.usedSize / MB, total: r.totalSize / MB };
  }
  async function forceGC() {
    await send('HeapProfiler.collectGarbage');
    await new Promise(r => setTimeout(r, 500));
    return heapNow();
  }

  console.log('=== mem sample: ' + LABEL + ' (' + DURATION_S + 's @' + INTERVAL + 'ms' + (gcFlag ? ' +gc' : '') + ') ===');
  let liveStart = null;
  if (gcFlag) {
    const live = await forceGC();
    liveStart = live.used;
    console.log('liveSet_start = ' + live.used.toFixed(1) + ' MB (after forced GC)');
  }

  const t0 = Date.now();
  const samples = [];
  while ((Date.now() - t0) / 1000 < DURATION_S) {
    const h = await heapNow();
    samples.push({ t: (Date.now() - t0) / 1000, used: h.used, total: h.total });
    console.log('t=' + samples[samples.length - 1].t.toFixed(0) + 's used=' + h.used.toFixed(1) + 'MB total=' + h.total.toFixed(1) + 'MB');
    await new Promise(r => setTimeout(r, INTERVAL));
  }

  let liveEnd = null;
  if (gcFlag) {
    liveEnd = await forceGC();
    console.log('liveSet_end = ' + liveEnd.used.toFixed(1) + ' MB (after forced GC)');
  }

  // summary
  const used = samples.map(s => s.used);
  const min = Math.min(...used), max = Math.max(...used);
  const avg = used.reduce((a, b) => a + b, 0) / used.length;
  const first = used[0], last = used[used.length - 1];
  let gcDrops = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1].used - samples[i].used > 2) gcDrops++;
  }
  const minutes = DURATION_S / 60;
  console.log('SUMMARY ' + LABEL + ': n=' + samples.length +
    ' first=' + first.toFixed(1) + ' last=' + last.toFixed(1) + ' min=' + min.toFixed(1) + ' max=' + max.toFixed(1) + ' avg=' + avg.toFixed(1) + ' MB' +
    ' | netGrowth=' + ((last - first) / minutes).toFixed(1) + ' MB/min' +
    ' | >2MB drops (GC events) = ' + gcDrops + ' (~' + (gcDrops / minutes).toFixed(1) + '/min)' +
    (liveEnd ? ' | liveSet_start=' + (liveStart !== null ? liveStart.toFixed(1) : '?') + ' liveSet_end=' + liveEnd.used.toFixed(1) + ' liveDelta=' + (liveEnd.used - (liveStart !== null ? liveStart : liveEnd.used)).toFixed(1) + ' MB' : ''));
  console.log('samples=' + JSON.stringify(samples.map(s => [Math.round(s.t), +s.used.toFixed(1), +s.total.toFixed(1)])));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

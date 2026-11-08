// SPD audio probe — music (HTMLAudioElement) playback state via CDP (D-1/D-3 tool).
// Usage: node spd_audio_probe.js [label]
// Samples <audio> elements (main doc + same-origin iframe) twice 1.5s apart:
// paused / currentTime advancing tells whether music actually plays.
// Also reports navigator.userActivation (autoplay-gesture state) and visibility.
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
  const expr = `(function(){
    const docs = [document];
    const ifr = document.querySelector('iframe');
    if (ifr) { try { if (ifr.contentDocument) docs.push(ifr.contentDocument); } catch (e) {} }
    const out = { vis: document.visibilityState, ua: navigator.userActivation ? navigator.userActivation.hasBeenActive : null, frames: [], hook: null, last: null };
    for (const d of docs) {
      const auds = d.querySelectorAll('audio');
      if (d !== document && auds.length === 0) continue;
      const f = { main: d === document, n: auds.length, items: [] };
      auds.forEach(function(a) {
        f.items.push({ src: (a.currentSrc || a.src || '').split('/').pop().slice(0, 44), paused: a.paused, t: +a.currentTime.toFixed(2), dur: +a.duration.toFixed(1), vol: a.volume });
      });
      out.frames.push(f);
    }
    if (window.__spdAudioHooked) {
      out.hook = window.__spdPlayLog.slice(-6);
      if (window.__spdLastMedia) {
        const m = window.__spdLastMedia;
        out.last = { src: (m.currentSrc || m.src || '').split('/').pop().slice(0, 44), paused: m.paused, t: +m.currentTime.toFixed(2), dur: +m.duration.toFixed(1), vol: m.volume };
      }
    }
    return JSON.stringify(out);
  })()`;
  const snap = async () => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return { err: r.exceptionDetails.exception?.description };
    return JSON.parse(r.result.value);
  };
  const a = await snap();
  await new Promise(r => setTimeout(r, 1500));
  const b = await snap();
  console.log('=== audio probe: ' + LABEL + ' === visibility=' + b.vis + ' userActivation=' + b.ua);
  if (b.hook || a.hook) {
    const log = b.hook || [];
    console.log(' play() log (last ' + log.length + '): ' + (log.length ? '' : '(empty)'));
    for (const rec of log) {
      console.log('   play ' + rec.src + ' -> ' + (rec.ok === true ? 'OK' : (rec.err || 'pending')) + ' @' + new Date(rec.t).toISOString().slice(11, 19));
    }
  } else {
    console.log(' (no play() hook installed - run spd_audio_hook.js)');
  }
  if (a.last || b.last) {
    const la = a.last, lb = b.last;
    const advancing = la && lb && lb.t > la.t;
    console.log(' last-played media: ' + (lb || la).src + ' paused=' + ((lb || la).paused) + ' t=' + (la ? la.t : '-') + '->' + (lb ? lb.t : '-') + (advancing ? ' [ADVANCING=playing]' : ' [not advancing]') + ' dur=' + ((lb || la).dur) + ' vol=' + ((lb || la).vol));
  }
  for (let i = 0; i < Math.max(a.frames.length, b.frames.length); i++) {
    const fa = a.frames[i] || { items: [] }, fb = b.frames[i] || { items: [] };
    console.log(' frame(main=' + (fb.main !== undefined ? fb.main : fa.main) + ') audio elements: ' + fb.n);
    for (let j = 0; j < Math.max(fa.items.length, fb.items.length); j++) {
      const ia = fa.items[j], ib = fb.items[j];
      const src = (ib || ia).src;
      const advancing = ia && ib && ib.t > ia.t;
      console.log('   <audio> ' + (src || '(no src)') + ' paused=' + ((ib || ia).paused) + ' t=' + (ia ? ia.t : '-') + '->' + (ib ? ib.t : '-') + (advancing ? ' [ADVANCING=playing]' : ' [not advancing]') + ' dur=' + ((ib || ia).dur) + ' vol=' + ((ib || ia).vol));
    }
  }
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

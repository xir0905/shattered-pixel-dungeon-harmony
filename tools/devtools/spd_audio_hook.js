// SPD audio hook — patch HTMLMediaElement.prototype.play to track GWT detached Audio (D-1/D-3 tool).
// Usage: node spd_audio_hook.js   (run once after CDP connect; survives until page reload)
// Records every play() call to window.__spdPlayLog (src/ok/err) and keeps the last
// media instance in window.__spdLastMedia for state probing by spd_audio_probe.js.
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
      if (window.__spdAudioHooked) return 'already hooked';
      window.__spdAudioHooked = true;
      window.__spdPlayLog = [];
      window.__spdLastMedia = null;
      const orig = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function(){
        const self = this;
        window.__spdLastMedia = self;
        const rec = { t: Date.now(), src: (self.currentSrc || self.src || '').split('/').pop().slice(0, 44), ok: null, err: null };
        window.__spdPlayLog.push(rec);
        let p;
        try { p = orig.call(self); } catch (e) { rec.err = 'throw:' + (e && e.name); return Promise.reject(e); }
        if (p && p.then) p.then(function(){ rec.ok = true; }, function(e){ rec.err = (e && e.name) || 'reject'; });
        return p;
      };
      return 'hooked';
    })()`
  });
  console.log(r.exceptionDetails ? 'HOOK_ERR: ' + r.exceptionDetails.exception?.description : 'play() hook installed: ' + r.result.value);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

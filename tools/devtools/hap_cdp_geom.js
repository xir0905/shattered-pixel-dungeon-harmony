// Measure page geometry: viewport vs canvas
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
    expression: `JSON.stringify({
      innerW: window.innerWidth, innerH: window.innerHeight,
      clientW: document.documentElement.clientWidth, clientH: document.documentElement.clientHeight,
      dpr: window.devicePixelRatio,
      screenW: screen.width, screenH: screen.height,
      vvH: window.visualViewport ? Math.round(window.visualViewport.height) : -1,
      vvScale: window.visualViewport ? window.visualViewport.scale : -1,
      bodyClientH: document.body.clientHeight, bodyScrollH: document.body.scrollHeight,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor
    })`,
    returnByValue: true
  });
  console.log('page geometry:', r.result.value);
  const r2 = await send('Runtime.evaluate', {
    expression: `(function(){
      const cv = document.querySelector('canvas');
      if (!cv) return 'no canvas';
      const rect = cv.getBoundingClientRect();
      return JSON.stringify({
        rectX: Math.round(rect.x), rectY: Math.round(rect.y),
        rectW: Math.round(rect.width), rectH: Math.round(rect.height),
        bufW: cv.width, bufH: cv.height,
        styleW: cv.style.width, styleH: cv.style.height,
        cssPos: getComputedStyle(cv).position,
        parent: cv.parentElement.id || cv.parentElement.tagName
      });
    })()`,
    returnByValue: true
  });
  console.log('canvas:', r2.result.value);
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

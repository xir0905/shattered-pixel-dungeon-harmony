// Diagnose whether CDP-dispatched touch events reach the page
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

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
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  // install listeners
  console.log(await evalIn(`(function(){
    window.__tl = [];
    for (const t of ['touchstart','touchend','touchmove','mousedown','mouseup','click','pointerdown','pointerup']) {
      document.addEventListener(t, function(e){ window.__tl.push(t + '@' + (e.touches && e.touches[0] ? Math.round(e.touches[0].clientX)+','+Math.round(e.touches[0].clientY) : (e.clientX!==undefined ? Math.round(e.clientX)+','+Math.round(e.clientY) : '-'))); }, true);
    }
    return 'listeners installed';
  })()`));

  // dispatch CDP touch
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 194, y: 579, id: 1 }] });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);

  console.log('touch log:', await evalIn(`JSON.stringify(window.__tl)`));

  // dispatch CDP mouse as alternative
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 194, y: 579, button: 'left', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 194, y: 579, button: 'left', clickCount: 1 });
  await sleep(800);

  console.log('after mouse:', await evalIn(`JSON.stringify(window.__tl)`));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

// Verify CDP input events reach the page and hit the canvas
const WS_URL = require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

async function main() {
  const ws = new WebSocket(WS_URL);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const m = ++id; pending.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params }));
    setTimeout(() => { if (pending.has(m)) { pending.delete(m); rej(new Error('timeout')); } }, 15000);
  });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const evalIn = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) return 'EVAL_ERR: ' + (r.exceptionDetails.exception?.description || '').slice(0, 200);
    return r.result?.value;
  };

  console.log('install:', await evalIn(`(function(){
    window.__ev = {t:0, m:0, p:0};
    addEventListener('touchstart', () => window.__ev.t++);
    addEventListener('mousedown', () => window.__ev.m++);
    addEventListener('pointerdown', () => window.__ev.p++);
    return 'ok';
  })()`));

  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 168, y: 262, id: 1 }] });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  console.log('after touch:', await evalIn('JSON.stringify(window.__ev)'));

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 168, y: 262, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 168, y: 262, button: 'left', clickCount: 1 });
  await sleep(300);
  console.log('after mouse:', await evalIn('JSON.stringify(window.__ev)'));

  console.log('elementAt(168,262):', await evalIn(`(function(){
    const el = document.elementFromPoint(168, 262);
    if (!el) return 'none';
    return el.tagName + ' id=' + el.id + ' cls=' + el.className + ' isCanvas=' + (el === document.querySelector('canvas'));
  })()`));
  console.log('viewport:', await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    return 'inner=' + innerWidth + 'x' + innerHeight + ' css=' + cv.clientWidth + 'x' + cv.clientHeight + ' backing=' + cv.width + 'x' + cv.height + ' dpr=' + devicePixelRatio;
  })()`));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

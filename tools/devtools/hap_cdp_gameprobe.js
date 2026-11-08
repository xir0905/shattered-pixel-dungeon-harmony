// Deep game-state probe via CDP
const WS_URL = process.argv[2] || require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();
const fs = require('fs');
const outDir = process.env.TEMP + '\\deveco';

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
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[console.' + msg.params.type + ']', (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      console.log('[EXCEPTION]', JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');

  const evalIn = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  console.log('=== iframe game state ===');
  console.log(await evalIn(`(function(){
    const f = document.querySelector('iframe');
    const d = f && f.contentDocument;
    if (!d) return 'no iframe doc';
    const cv = d.querySelector('canvas');
    let glInfo = 'no canvas in iframe';
    if (cv) {
      try { const gl = cv.getContext('webgl') || cv.getContext('webgl2');
        glInfo = gl ? ('WEBGL OK: ' + gl.getParameter(gl.VERSION) + ' | ' + gl.getParameter(gl.RENDERER)) : 'ctx NULL';
      } catch(e) { glInfo = 'err: ' + e.message; }
    }
    const outer = document.querySelector('canvas');
    let outerInfo = 'none';
    if (outer) {
      outerInfo = outer.width + 'x' + outer.height + ' css=' + (outer.clientWidth + 'x' + outer.clientHeight);
      try { const gl = outer.getContext('webgl') || outer.getContext('webgl2');
        outerInfo += gl ? (' GL=' + gl.getParameter(gl.VERSION) + ' R=' + gl.getParameter(gl.RENDERER)) : ' GL=null';
        outerInfo += ' 2d=' + (!!outer.getContext && 'maybe');
      } catch(e) { outerInfo += ' err:' + e.message; }
    }
    return 'iframe canvas: ' + glInfo + '\\nouter canvas: ' + outerInfo +
      '\\niframe body children: ' + (d.body ? d.body.children.length : '?') +
      '\\nSPD: ' + (typeof d.defaultView.SPD) + ' GDX: ' + (typeof d.defaultView.gdx);
  })()`));

  console.log('=== canvas pixel sample (outer) ===');
  console.log(await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    if (!cv) return 'no canvas';
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    if (gl) {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(4 * 100);
      gl.readPixels(Math.floor(w/2)-5, Math.floor(h/2)-5, 10, 10, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0; for (let i=0;i<px.length;i+=4) sum += px[i]+px[i+1]+px[i+2];
      return 'GL drawingBuffer ' + w + 'x' + h + ' center sample avg RGB sum=' + (sum/100);
    }
    return 'no gl ctx (canvas may be 2d)';
  })()`));

  // capture page screenshot via CDP
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(outDir + '\\real_cdp_page.png', Buffer.from(shot.data, 'base64'));
  console.log('=== page screenshot saved: ' + outDir + '\\real_cdp_page.png ===');

  // capture full-page with iframe content
  const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(outDir + '\\real_cdp_full.png', Buffer.from(shot2.data, 'base64'));
  console.log('=== full screenshot saved ===');

  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

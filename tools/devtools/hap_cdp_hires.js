// High-res ASCII frame render (readable layout)
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
  const evalIn = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result ? (r.result.value ?? r.result.description) : null;
  };

  console.log(await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const GX = 44, GY = 56;
    let rows = [];
    for (let gy = 0; gy < GY; gy++) {
      let row = '';
      for (let gx = 0; gx < GX; gx++) {
        let r = 0, g = 0, b = 0, n = 0;
        const x0 = Math.floor(gx*W/GX), x1 = Math.floor((gx+1)*W/GX);
        const y0 = Math.floor(gy*H/GY), y1 = Math.floor((gy+1)*H/GY);
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = ((H-1-y)*W + x)*4;
          r += px[i]; g += px[i+1]; b += px[i+2]; n++;
        }
        r/=n; g/=n; b/=n;
        const br = (r+g+b)/3;
        let ch = ' ';
        if (br > 14) ch = '.';
        if (br > 32) ch = ':';
        if (br > 60) ch = '*';
        if (br > 105) ch = '#';
        if (br > 165) ch = '@';
        row += ch;
      }
      rows.push(row);
    }
    return 'W=' + W + ' H=' + H + '\\n' + rows.join('\\n');
  })()`));
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

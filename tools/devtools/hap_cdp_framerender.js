// Analyze GL frame colors + check SPD title-screen traits
const WS_URL = process.argv[2] || require('fs').readFileSync(process.env.TEMP + '\\deveco\\real_ws.txt', 'utf8').trim();

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

  // Downsample GL framebuffer to 24x48 color grid via readPixels
  console.log('=== GL frame color grid (R,G,B avg per cell) ===');
  console.log(await evalIn(`(function(){
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl');
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    // read full frame (bottom-up)
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const GX = 16, GY = 24;
    let out = [];
    for (let gy = 0; gy < GY; gy++) {
      let row = '';
      for (let gx = 0; gx < GX; gx++) {
        let r = 0, g = 0, b = 0, n = 0;
        const x0 = Math.floor(gx * W / GX), x1 = Math.floor((gx + 1) * W / GX);
        const y0 = Math.floor(gy * H / GY), y1 = Math.floor((gy + 1) * H / GY);
        for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
          const i = ((H - 1 - y) * W + x) * 4; // flip vertical
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
        r /= n; g /= n; b /= n;
        const br = (r + g + b) / 3;
        const warm = (r - b);
        let ch = ' ';
        if (br > 15) ch = '.';
        if (br > 45) ch = ':';
        if (br > 90) ch = '*';
        if (br > 150) ch = '#';
        if (warm > 40 && br > 45) ch = 'R';  // reddish
        if (warm < -40 && br > 45) ch = 'B'; // bluish
        if (g > r + 30 && g > b + 30 && br > 45) ch = 'G'; // greenish
        row += ch;
      }
      out.push(row);
    }
    // color histogram summary
    let dark = 0, warmPx = 0, total = 0, rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < px.length; i += 64) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      total++; rSum += r; gSum += g; bSum += b;
      if ((r + g + b) / 3 < 20) dark++;
      if (r - b > 25) warmPx++;
    }
    return 'avgRGB=' + Math.round(rSum/total) + ',' + Math.round(gSum/total) + ',' + Math.round(bSum/total) +
      ' dark=' + Math.round(100*dark/total) + '% warm=' + Math.round(100*warmPx/total) + '%\\n' + out.join('\\n');
  })()`));

  // Check for SPD game JS state: GDX module, interface, etc.
  console.log('=== JS game globals ===');
  console.log(await evalIn(`(function(){
    const keys = [];
    for (const k of Object.keys(window)) {
      if (/gdx|spd|shattered|GWT|game/i.test(k)) keys.push(k + '=' + typeof window[k]);
    }
    return keys.slice(0, 20).join(', ') || 'none';
  })()`));

  // Touch test: tap on the canvas center (title screen menu area?) — first, no touch; just check document listeners count via getEventListeners is devtools-only. Skip.
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });

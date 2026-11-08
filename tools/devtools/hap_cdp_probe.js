// Probe SPD page inside HarmonyOS ArkWeb via CDP
const PAGE_WS = process.argv[2];
let msgId = 0;
const pending = new Map();

function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const ws = new WebSocket(PAGE_WS);
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    const args = (m.params.args || []).map(a => a.value !== undefined ? JSON.stringify(a.value) : (a.description || a.type)).join(' ');
    console.log(`[console.${m.params.type}] ${args}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log(`[EXCEPTION] ${d.text} ${d.exception ? d.exception.description : ''}`);
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry;
    console.log(`[log.${e.level}] ${e.source}: ${e.text} ${e.url || ''}`);
  }
};

async function evalJs(expr) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return `THROW: ${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`;
  return r.result.value;
}

(async () => {
  await new Promise(r => ws.onopen = r);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');

  console.log('=== location:', await evalJs('location.href'));
  console.log('=== embed div:', await evalJs(`(()=>{const e=document.getElementById('embed-shattered'); return e? 'found, children='+e.children.length : 'MISSING'})()`));
  console.log('=== iframe shattered:', await evalJs(`(()=>{const f=document.getElementById('shattered'); return f? 'iframe found' : 'iframe MISSING'})()`));
  console.log('=== iframes:', await evalJs(`document.querySelectorAll('iframe').length + ' / body children: ' + document.body.children.length + ' / body classes: ' + document.body.className`));
  console.log('=== canvases (outer doc):', await evalJs(`Array.from(document.querySelectorAll('canvas')).map(c=>c.width+'x'+c.height+',display='+getComputedStyle(c).display+',vis='+getComputedStyle(c).visibility).join(' | ') || 'none'`));

  // probe inside the GWT iframe
  console.log('=== iframe canvases:', await evalJs(`(()=>{try{const f=document.getElementById('shattered'); const d=f.contentDocument; return Array.from(d.querySelectorAll('canvas')).map(c=>c.width+'x'+c.height+',client='+c.clientWidth+'x'+c.clientHeight).join(' | ') || 'no canvas in iframe, body='+d.body.innerHTML.slice(0,200)}catch(e){return 'ERR '+e.message}})()`));
  console.log('=== GWT module loaded:', await evalJs(`(()=>{try{const f=document.getElementById('shattered'); const w=f.contentWindow; return 'gwtOnLoad='+typeof w.gwtOnLoad+', SPD='+typeof w.com_shatteredpixel_shatteredpixeldungeon_client_SPD+' chrome='+(typeof w.$gwt && typeof w.$gwt.modules)}catch(e){return 'ERR '+e.message}})()`));
  console.log('=== WebGL ctx test in iframe:', await evalJs(`(()=>{try{const f=document.getElementById('shattered'); const d=f.contentDocument; const c=d.querySelector('canvas'); if(!c) return 'no canvas'; const gl=c.getContext('webgl')||c.getContext('experimental-webgl'); return gl? 'WEBGL OK, version='+gl.getParameter(gl.VERSION)+' renderer='+gl.getParameter(gl.RENDERER) : 'NULL'}catch(e){return 'ERR '+e.message}})()`));
  console.log('=== localStorage:', await evalJs(`(()=>{try{const f=document.getElementById('shattered'); const ls=f.contentWindow.localStorage; const keys=[]; for(let i=0;i<ls.length;i++){keys.push(ls.key(i))} return keys.slice(0,10).join(',') || 'empty'}catch(e){return 'ERR '+e.message}})()`));

  // screenshot via toDataURL in iframe
  console.log('=== canvas toDataURL:', await evalJs(`(()=>{try{const f=document.getElementById('shattered'); const d=f.contentDocument; const c=d.querySelector('canvas'); if(!c) return 'no canvas'; return 'len='+c.toDataURL('image/png').length}catch(e){return 'ERR '+e.message}})()`));

  // evaluate document ready state + any error indicators
  console.log('=== readyState:', await evalJs(`document.readyState + ' / iframe: ' + document.getElementById('shattered').contentDocument.readyState`));

  await send(ws, 'Runtime.disable');
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });

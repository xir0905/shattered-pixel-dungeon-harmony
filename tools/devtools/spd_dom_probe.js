// one-off DOM probe: where does the canvas live?
const run = async () => {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await r.json();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  };
  await new Promise(r2 => ws.onopen = r2);
  const send = (method, params) => new Promise(res => {
    const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Runtime.enable');
  const expr = `(() => {
    const c = document.querySelector('canvas');
    const chain = [];
    let n = c;
    while (n && n !== document.documentElement) {
      chain.push(n.tagName + (n.id ? '#' + n.id : '') + ((n.className && typeof n.className === 'string') ? '.' + n.className : ''));
      n = n.parentElement;
    }
    const tbl = document.querySelector('table');
    const ifr = document.querySelector('iframe');
    return JSON.stringify({
      chain: chain.join(' < '),
      tblChildren: tbl ? Array.from(tbl.querySelectorAll('*')).map(e => e.tagName).join(',') : 'none',
      tblHTML: tbl ? tbl.outerHTML.slice(0, 300) : 'none',
      iframeDocs: ifr && ifr.contentDocument ? ifr.contentDocument.querySelectorAll('*').length : -1,
    });
  })()`;
  const e = await send('Runtime.evaluate', { returnByValue: true, expression: expr });
  console.log(e.result.value);
  ws.close();
  process.exit(0);
};
run().catch(err => { console.error(err.message); process.exit(1); });

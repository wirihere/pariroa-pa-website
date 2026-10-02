const tabs = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const tab = tabs.find(t => t.type === "page");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
function send(method, params = {}) { return new Promise((res, rej) => { const m = ++id; const t = setTimeout(() => rej(new Error("timeout")), 20000); pend.set(m, { res: v => { clearTimeout(t); res(v); }, rej }); ws.send(JSON.stringify({ id: m, method, params })); }); }
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); } };
await new Promise(r => ws.onopen = r);
const r = await send("Runtime.evaluate", { expression: `JSON.stringify({ url: location.href, text: (document.body.innerText||'').replace(/\\s+/g,' ').slice(0,400) })`, returnByValue: true });
console.log(r.result.value);
process.exit(0);

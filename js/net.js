// Tầng mạng: MQTT qua WebSocket (máy chủ trung gian công cộng, không cần tài khoản).
// Máy giáo viên và điện thoại đều kết nối ra ngoài tới broker nên không bị chặn như WebRTC.
// ?local=1 → BroadcastChannel (thử trên 1 máy, không cần mạng)
// ?broker=wss://... → dùng broker riêng (ưu tiên trước danh sách mặc định)
const qs = new URLSearchParams(location.search);
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
if (qs.get('broker')) BROKERS.unshift(qs.get('broker'));
const ROOT = 'lophocvui/v2/';
export const IS_LOCAL = qs.has('local');
const rid = () => Math.random().toString(36).slice(2, 10);
const J = (o) => JSON.stringify(o);
const P = (b) => { try { const s = typeof b === 'string' ? b : new TextDecoder().decode(b); return s ? JSON.parse(s) : null; } catch (e) { return null; } };

function connectOnce(url, opts, ms = 7000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const c = mqtt.connect(url, { connectTimeout: ms, reconnectPeriod: 2000, keepalive: 20, clean: true, ...opts });
    const fail = (e) => { if (done) return; done = true; try { c.end(true); } catch (x) {} reject(e || new Error('connect')); };
    const t = setTimeout(() => fail(new Error('timeout')), ms + 500);
    c.once('connect', () => { if (done) return; done = true; clearTimeout(t); resolve(c); });
    c.on('error', (e) => fail(e));
  });
}

/* ================= HOST ================= */
export async function createHost(pin, h, brokerStart = 0) {
  if (IS_LOCAL) return hostLocal(pin, h);
  let lastErr;
  for (let i = brokerStart; i < BROKERS.length; i++) {
    try { return await hostMqtt(i, pin, h); } catch (e) { lastErr = e; if (e && e.type === 'unavailable-id') throw e; }
  }
  throw lastErr || new Error('no broker');
}

async function hostMqtt(bi, pin, h) {
  const T = ROOT + pin + '/';
  const c = await connectOnce(BROKERS[bi], {
    clientId: 'lhv-h-' + rid(),
    will: { topic: T + 'host', payload: '', retain: true, qos: 1 },
  });
  // PIN đã có người dùng chưa?
  const taken = await new Promise((res) => {
    let seen = false;
    const onMsg = (topic, buf) => { if (topic === T + 'host' && buf && buf.length) seen = true; };
    c.on('message', onMsg);
    c.subscribe(T + 'host', { qos: 1 });
    setTimeout(() => { c.removeListener('message', onMsg); c.unsubscribe(T + 'host'); res(seen); }, 900);
  });
  if (taken) { c.end(true); const e = new Error('pin taken'); e.type = 'unavailable-id'; throw e; }

  const announce = () => {
    c.subscribe(T + 'h', { qos: 1 });
    c.publish(T + 'host', J({ on: 1, t: Date.now() }), { retain: true, qos: 1 });
  };
  announce();
  c.on('connect', announce); // sau khi tự nối lại
  c.on('message', (topic, buf) => {
    if (topic !== T + 'h') return;
    const d = P(buf); if (!d || !d.from) return;
    if (d.bye) h.onClose(d.from); else h.onMessage(d.from, d.msg);
  });
  c.on('offline', () => h.onNet && h.onNet(false));
  c.on('connect', () => h.onNet && h.onNet(true));
  addEventListener('pagehide', () => { try { c.publish(T + 'host', '', { retain: true, qos: 0 }); } catch (e) {} });
  return {
    broker: bi,
    send(key, msg) { c.publish(T + 'p/' + key, J(msg), { qos: 1 }); },
    broadcast(msg) { c.publish(T + 'all', J(msg), { qos: 1 }); },
    drop() {},
    destroy() { c.publish(T + 'host', '', { retain: true, qos: 1 }, () => c.end()); },
  };
}

function hostLocal(pin, h) {
  const ch = new BroadcastChannel(ROOT + pin);
  ch.onmessage = (e) => {
    const { from, to, msg, bye } = e.data || {};
    if (to !== 'host') return;
    if (bye) h.onClose(from); else h.onMessage(from, msg);
  };
  return Promise.resolve({
    broker: 0,
    send(key, msg) { ch.postMessage({ from: 'host', to: key, msg }); },
    broadcast(msg) { ch.postMessage({ from: 'host', to: '*', msg }); },
    drop() {},
    destroy() { ch.close(); },
  });
}

/* ================= PLAYER ================= */
// h: onOpen (lớp đã sẵn sàng → gửi join), onClose (mất kết nối), onError(code), onMessage(msg)
export function joinRoom(pin, h, brokerStart = 0) {
  return IS_LOCAL ? joinLocal(pin, h) : joinMqtt(pin, h, brokerStart);
}

function joinMqtt(pin, h, brokerStart) {
  const T = ROOT + pin + '/';
  const key = 'p' + rid();
  let c = null, stopped = false, found = false, hostOn = false;
  const order = [...BROKERS.keys()];
  if (brokerStart > 0 && brokerStart < BROKERS.length) { order.splice(brokerStart, 1); order.unshift(brokerStart); }
  let failedConn = 0;

  async function tryAt(k) {
    if (stopped) return;
    if (k >= order.length) { h.onError(failedConn === order.length ? 'blocked' : 'nopin'); return; }
    let cli;
    try {
      cli = await connectOnce(BROKERS[order[k]], {
        clientId: 'lhv-p-' + rid(),
        will: { topic: T + 'h', payload: J({ from: key, bye: 1 }), qos: 1 },
      }, 6000);
    } catch (e) { failedConn++; return tryAt(k + 1); }
    if (stopped) { cli.end(true); return; }
    const sub = () => cli.subscribe([T + 'host', T + 'all', T + 'p/' + key], { qos: 1 });
    sub();
    const notFound = setTimeout(() => { if (!found) { cli.end(true); tryAt(k + 1); } }, 4500);
    cli.on('message', (topic, buf) => {
      if (topic === T + 'host') {
        const on = !!(buf && buf.length);
        if (on) { if (!found) { found = true; c = cli; clearTimeout(notFound); } if (!hostOn) { hostOn = true; h.onOpen(); } }
        else if (found && hostOn) { hostOn = false; h.onClose(); }
        return;
      }
      if (!found) return;
      const d = P(buf); if (d) h.onMessage(d);
    });
    cli.on('connect', () => { if (found) { hostOn = false; sub(); } }); // nối lại → chờ tin "host" rồi join lại
    cli.on('offline', () => { if (found) { hostOn = false; h.onClose(); } });
  }
  tryAt(0);
  return {
    send(msg) { if (c) c.publish(T + 'h', J({ from: key, msg }), { qos: 1 }); },
    stop() { stopped = true; if (c) c.end(true); },
  };
}

function joinLocal(pin, h) {
  const ch = new BroadcastChannel(ROOT + pin);
  const key = 'L' + rid();
  ch.onmessage = (e) => { const { to, msg } = e.data || {}; if (to === key || to === '*') h.onMessage(msg); };
  addEventListener('pagehide', () => ch.postMessage({ from: key, to: 'host', bye: true }));
  setTimeout(() => h.onOpen(), 50);
  return {
    send(msg) { ch.postMessage({ from: key, to: 'host', msg }); },
    stop() { ch.close(); },
  };
}

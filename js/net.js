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
const ROOT = 'lophocvui/v3/';
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
  const sid = rid();   // mã phiên của máy giáo viên: đổi khi tải lại trang → học sinh tự vào lại
  const c = await connectOnce(BROKERS[bi], {
    clientId: 'lhv-h-' + rid(),
    will: { topic: T + 'host', payload: J({ on: 0, sid }), qos: 1 },
  });
  // PIN đã có người dùng chưa? (hỏi thử, phòng đang mở sẽ trả lời)
  const taken = await new Promise((res) => {
    let seen = false;
    const onMsg = (topic, buf) => { const d = topic === T + 'host' ? P(buf) : null; if (d && d.on && d.sid !== sid) seen = true; };
    c.on('message', onMsg);
    c.subscribe(T + 'host', { qos: 1 }, () => c.publish(T + 'h', J({ from: 'probe-' + sid, ping: 1 }), { qos: 1 }));
    setTimeout(() => { c.removeListener('message', onMsg); c.unsubscribe(T + 'host'); res(seen); }, 1300);
  });
  if (taken) { c.end(true); const e = new Error('pin taken'); e.type = 'unavailable-id'; throw e; }

  // Không dùng tin "retained" (nhiều máy chủ công cộng không hỗ trợ): báo định kỳ + trả lời khi được hỏi
  const beat = () => { if (c.connected) c.publish(T + 'host', J({ on: 1, sid }), { qos: 0 }); };
  const announce = () => { c.subscribe(T + 'h', { qos: 1 }, beat); };
  announce();
  c.on('connect', announce); // sau khi tự nối lại
  const beatT = setInterval(beat, 4000);
  c.on('message', (topic, buf) => {
    if (topic !== T + 'h') return;
    const d = P(buf); if (!d || !d.from) return;
    if (d.ping) return beat();
    if (d.bye) h.onClose(d.from); else h.onMessage(d.from, d.msg);
  });
  c.on('offline', () => h.onNet && h.onNet(false));
  c.on('connect', () => h.onNet && h.onNet(true));
  addEventListener('pagehide', () => { try { c.publish(T + 'host', J({ on: 0, sid }), { qos: 0 }); } catch (e) {} });
  return {
    broker: bi,
    send(key, msg) { c.publish(T + 'p/' + key, J(msg), { qos: 1 }); },
    broadcast(msg) { c.publish(T + 'all', J(msg), { qos: 1 }); },
    drop() {},
    destroy() { clearInterval(beatT); c.publish(T + 'host', J({ on: 0, sid }), { qos: 1 }, () => c.end()); },
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
  let c = null, stopped = false, found = false, hostOn = false, hostSid = null, lastBeat = 0;
  const timers = [];
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
    const ping = () => { if (!hostOn && cli.connected) cli.publish(T + 'h', J({ from: key, ping: 1 }), { qos: 0 }); };
    const sub = () => cli.subscribe([T + 'host', T + 'all', T + 'p/' + key], { qos: 1 }, ping);
    sub();
    const pingT = setInterval(ping, 1200); timers.push(pingT);       // hỏi "phòng có mở không?" cho tới khi máy cô trả lời
    const notFound = setTimeout(() => { if (!found) { clearInterval(pingT); cli.end(true); tryAt(k + 1); } }, 5000);
    const watch = setInterval(() => { if (found && hostOn && Date.now() - lastBeat > 14000) { hostOn = false; h.onClose(); } }, 3000); timers.push(watch);
    cli.on('message', (topic, buf) => {
      if (topic === T + 'host') {
        const d = P(buf); if (!d) return;
        if (d.on) {
          lastBeat = Date.now();
          if (!found) { found = true; c = cli; clearTimeout(notFound); }
          if (!hostOn || d.sid !== hostSid) { hostOn = true; hostSid = d.sid; h.onOpen(); }   // sid đổi = máy cô vừa tải lại trang
        } else if (found && hostOn && d.sid === hostSid) { hostOn = false; h.onClose(); }
        return;
      }
      if (!found) return;
      const d = P(buf); if (d) h.onMessage(d);
    });
    cli.on('connect', () => { if (found) { hostOn = false; sub(); } }); // nối lại → hỏi lại rồi join lại
    cli.on('offline', () => { if (found) { hostOn = false; h.onClose(); } });
  }
  tryAt(0);
  return {
    send(msg) { if (c) c.publish(T + 'h', J({ from: key, msg }), { qos: 1 }); },
    stop() { stopped = true; timers.forEach(clearInterval); if (c) c.end(true); },
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

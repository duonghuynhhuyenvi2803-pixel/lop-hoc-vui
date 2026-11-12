// Lớp tầng mạng: PeerJS (WebRTC, không cần server riêng) hoặc BroadcastChannel (?local=1, để thử trên 1 máy)
const PREFIX = 'lophocvui-v1-';
const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  },
};

export const IS_LOCAL = new URLSearchParams(location.search).has('local');

/* ================= HOST ================= */
export function createHost(pin, h) {
  return IS_LOCAL ? hostLocal(pin, h) : hostPeer(pin, h);
}

function hostPeer(pin, h) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + pin, PEER_OPTS);
    const conns = new Map();
    let n = 0, opened = false;
    const api = {
      send(key, msg) { const c = conns.get(key); if (c && c.open) { try { c.send(msg); } catch (e) {} } },
      drop(key) { const c = conns.get(key); if (c) { conns.delete(key); try { c.close(); } catch (e) {} } },
      destroy() { peer.destroy(); },
    };
    peer.on('open', () => { opened = true; resolve(api); });
    peer.on('error', (e) => {
      if (!opened) reject(e);
      else h.onError && h.onError(e);
    });
    peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500));
    peer.on('connection', (conn) => {
      const key = 'c' + (++n);
      conns.set(key, conn);
      conn.on('data', (d) => h.onMessage(key, d));
      conn.on('close', () => { if (conns.get(key) === conn) conns.delete(key); h.onClose(key); });
      conn.on('error', () => {});
    });
  });
}

function hostLocal(pin, h) {
  const ch = new BroadcastChannel(PREFIX + pin);
  ch.onmessage = (e) => {
    const { from, to, msg, bye } = e.data || {};
    if (to !== 'host') return;
    if (bye) h.onClose(from); else h.onMessage(from, msg);
  };
  return Promise.resolve({
    send(key, msg) { ch.postMessage({ from: 'host', to: key, msg }); },
    drop() {},
    destroy() { ch.close(); },
  });
}

/* ================= PLAYER ================= */
export function joinRoom(pin, h) {
  return IS_LOCAL ? joinLocal(pin, h) : joinPeer(pin, h);
}

function joinPeer(pin, h) {
  let conn = null, everOpen = false, stopped = false, retryT = null, openT = null;
  const peer = new Peer(PEER_OPTS);
  function connect() {
    if (stopped || peer.destroyed) return;
    clearTimeout(openT);
    conn = peer.connect(PREFIX + pin, { reliable: true });
    const my = conn;
    openT = setTimeout(() => { if (!my.open) { h.onError('timeout'); try { my.close(); } catch (e) {} retry(); } }, 12000);
    my.on('open', () => { clearTimeout(openT); everOpen = true; h.onOpen(); });
    my.on('data', (d) => h.onMessage(d));
    my.on('close', () => { if (conn === my) { h.onClose(); retry(); } });
    my.on('error', () => {});
  }
  function retry() { clearTimeout(retryT); if (!stopped) retryT = setTimeout(connect, 2500); }
  peer.on('open', connect);
  peer.on('disconnected', () => setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500));
  peer.on('error', (e) => {
    if (e.type === 'peer-unavailable') {
      if (!everOpen) { h.onError('nopin'); }
      else { h.onClose(); retry(); }
    } else h.onError(e.type || 'error');
  });
  return {
    send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) {} } },
    stop() { stopped = true; peer.destroy(); },
  };
}

function joinLocal(pin, h) {
  const ch = new BroadcastChannel(PREFIX + pin);
  const key = 'L' + Math.random().toString(36).slice(2, 9);
  ch.onmessage = (e) => { const { to, msg } = e.data || {}; if (to === key) h.onMessage(msg); };
  addEventListener('pagehide', () => ch.postMessage({ from: key, to: 'host', bye: true }));
  setTimeout(() => h.onOpen(), 50);
  return {
    send(msg) { ch.postMessage({ from: key, to: 'host', msg }); },
    stop() { ch.close(); },
  };
}

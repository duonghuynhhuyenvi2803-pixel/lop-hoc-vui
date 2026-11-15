// ✍️ PHÒNG LUYỆN VIẾT – máy giáo viên
import { createHost, IS_LOCAL } from './net.js';
import * as S from './sound.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS_SET = 'lophocvui-viet-setup', LS_SES = 'lophocvui-viet-sessions', LS_CUR = 'lophocvui-viet-current';
const MAX_STU = 60, MAX_CHARS = 30000, KEEP = 30;
export const countWords = (t) => { const m = String(t || '').trim().match(/\S+/g); return m ? m.length : 0; };
const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtDate = (t) => new Date(t).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const st = {
  net: null, pin: '', readonly: false, room: null,
  phase: 'wait',            // wait | run | end
  elapsedBase: 0, runFrom: 0, limitMs: 0, endedAt: 0,
  students: new Map(), keys: new Map(), joinCount: 0, openCid: null, dirty: false,
};
const elapsed = () => st.elapsedBase + (st.phase === 'run' ? Date.now() - st.runFrom : 0);

/* ================= LƯU TRỮ ================= */
const readSessions = () => { try { return JSON.parse(localStorage.getItem(LS_SES) || '[]'); } catch (e) { return []; } };
function writeSessions(list) {
  list = list.slice(0, KEEP);
  for (;;) {
    try { localStorage.setItem(LS_SES, JSON.stringify(list)); return true; }
    catch (e) { if (list.length <= 1) return false; list.pop(); }   // đầy bộ nhớ → bỏ buổi cũ nhất
  }
}
function snapshot() {
  return {
    ...st.room, pin: st.pin, phase: st.phase, elapsed: elapsed(), limitMs: st.limitMs, savedAt: Date.now(),
    students: [...st.students.values()].sort((a, b) => a.joinNo - b.joinNo).map((s) => ({
      cid: s.cid, name: s.name, text: s.text, words: s.words, p: s.p, b: s.b, submitted: s.submitted, submittedAt: s.submittedAt, subElapsed: s.subElapsed, joinNo: s.joinNo })),
  };
}
function saveSession(manual) {
  if (st.readonly || !st.room) return;
  const list = readSessions().filter((x) => x.id !== st.room.id);
  list.unshift(snapshot());
  const ok = writeSessions(list);
  st.dirty = false;
  if (manual) toast(ok ? '💾 Đã lưu trên máy này' : '⚠️ Bộ nhớ trình duyệt đầy – hãy tải PDF về');
}
setInterval(() => { if (st.dirty) saveSession(false); }, 4000);
addEventListener('pagehide', () => saveSession(false));

function renderSaved() {
  const list = readSessions();
  $('#saved').innerHTML = list.length ? list.map((x) => `<div class="srow" data-id="${esc(x.id)}">
      <div><b>${esc(x.title || 'Buổi viết')}</b><small>${fmtDate(x.date)} · ${x.students.length} bài · ${x.students.filter((s) => s.submitted).length} đã nộp</small></div>
      <button class="btn sm ghost" data-a="view">Xem</button><button class="btn sm" data-a="pdf">PDF</button><button class="btn sm ghost" data-a="del">Xoá</button></div>`).join('')
    : '<p class="none">Chưa có buổi nào. Mỗi buổi viết sẽ tự lưu ở đây để bạn xem lại hoặc tải PDF.</p>';
  const cur = currentResumable();
  $('#resume').hidden = !cur;
  if (cur) $('#resume').textContent = `↩ Mở lại phòng đang dở: ${cur.title || 'Buổi viết'} (PIN ${cur.pin})`;
}
function currentResumable() {
  const id = localStorage.getItem(LS_CUR); if (!id) return null;
  const x = readSessions().find((s) => s.id === id);
  return x && Date.now() - (x.savedAt || x.date) < 12 * 3600e3 ? x : null;
}
$('#saved').onclick = (e) => {
  const a = e.target.dataset.a, row = e.target.closest('.srow'); if (!a || !row) return;
  const x = readSessions().find((s) => s.id === row.dataset.id); if (!x) return;
  if (a === 'del') { if (confirm(`Xoá buổi "${x.title || 'Buổi viết'}" và ${x.students.length} bài viết?`)) { writeSessions(readSessions().filter((s) => s.id !== x.id)); renderSaved(); } }
  if (a === 'pdf') exportPDF(x.students, x);
  if (a === 'view') enterRoom(x, true);
};

/* ================= CÀI ĐẶT ================= */
function loadSetup() {
  let s = {}; try { s = JSON.parse(localStorage.getItem(LS_SET) || '{}'); } catch (e) {}
  $('#title').value = s.title || ''; $('#prompt').value = s.prompt || '';
  if (s.limitMin != null) $('#limit').value = s.limitMin;
  if (s.minWords != null) $('#minWords').value = s.minWords;
  $('#lockOnEnd').checked = s.lockOnEnd !== false; $('#noSpell').checked = s.noSpell !== false; $('#blockPaste').checked = !!s.blockPaste;
  renderSaved();
}
function readSetup() {
  const num = (id, max) => Math.max(0, Math.min(max, Math.floor(+$(id).value || 0)));
  const s = { title: $('#title').value.trim(), prompt: $('#prompt').value.trim(), limitMin: num('#limit', 240), minWords: num('#minWords', 5000),
    lockOnEnd: $('#lockOnEnd').checked, noSpell: $('#noSpell').checked, blockPaste: $('#blockPaste').checked };
  try { localStorage.setItem(LS_SET, JSON.stringify(s)); } catch (e) {}
  return s;
}
$('#openRoom').onclick = async () => {
  const s = readSetup();
  if (!s.prompt && !confirm('Bạn chưa nhập đề bài. Vẫn mở phòng?')) return;
  await startRoom({ ...s, id: 'w' + Date.now().toString(36), date: Date.now(), students: [], phase: 'wait', elapsed: 0, limitMs: s.limitMin * 60000 }, null, $('#openRoom'));
};
$('#resume').onclick = async () => { const x = currentResumable(); if (x) await startRoom(x, x.pin, $('#resume')); };

async function startRoom(ses, wantPin, btn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = 'Đang mở phòng…';
  const h = { onMessage, onClose, onNet: (on) => toast(on ? '✅ Đã kết nối lại' : '⚠️ Mất mạng – đang kết nối lại…', on ? 2000 : 0) };
  let net = null, pin = '';
  try {
    for (let i = 0; i < 6 && !net; i++) {
      pin = i === 0 && wantPin ? wantPin : String(Math.floor(100000 + Math.random() * 900000));
      try { net = await createHost('w' + pin, h); } catch (e) { if (!e || e.type !== 'unavailable-id') throw e; }
    }
    if (!net) throw new Error('no-pin');
  } catch (e) {
    alert('Không mở được phòng (lỗi mạng: ' + (e.type || e.message || e) + '). Kiểm tra internet rồi thử lại.');
    btn.disabled = false; btn.textContent = label; return;
  }
  btn.disabled = false; btn.textContent = label;
  st.net = net; st.pin = pin;
  if (wantPin && pin !== wantPin) toast('Mã PIN cũ không dùng lại được – phòng có mã PIN mới, học sinh cần vào lại.', 6000);
  try { localStorage.setItem(LS_CUR, ses.id); } catch (e) {}
  enterRoom(ses, false);
}

/* ================= VÀO PHÒNG ================= */
function enterRoom(ses, readonly) {
  st.readonly = readonly;
  st.room = { id: ses.id, title: ses.title, prompt: ses.prompt, limitMin: ses.limitMin, minWords: ses.minWords, lockOnEnd: ses.lockOnEnd, noSpell: ses.noSpell, blockPaste: ses.blockPaste, date: ses.date };
  st.limitMs = ses.limitMs || 0; st.elapsedBase = ses.elapsed || 0; st.runFrom = 0;
  st.phase = readonly ? 'end' : ses.phase === 'wait' ? 'wait' : 'end';   // mở lại phòng dở → tạm dừng, cô bấm "Mở lại" để chạy tiếp
  st.students.clear(); st.keys.clear(); st.joinCount = 0; $('#grid').innerHTML = '';
  (ses.students || []).forEach((x) => {
    const s = { ...x, key: null, online: false, lastEdit: 0, joinNo: ++st.joinCount };
    s.words = countWords(s.text); st.students.set(s.cid, s); makeCard(s);
  });
  if (readonly) st.pin = '';
  $('#setup').hidden = true; $('#room').hidden = false; document.body.classList.toggle('readonly', readonly);
  $('#rTitle').textContent = st.room.title || 'Phòng Luyện Viết';
  $('#rSub').textContent = readonly ? `Buổi đã lưu · ${fmtDate(st.room.date)} · chỉ xem` : '';
  if (!readonly) renderJoin();
  renderCtl(); applySort(); tick(); st.dirty = !readonly;
}
function joinURL() {
  const q = new URLSearchParams(location.search);
  const base = location.href.split(/[?#]/)[0].replace(/[^/]*$/, '');
  const extra = IS_LOCAL ? '&local=1' : q.get('broker') ? '&broker=' + encodeURIComponent(q.get('broker')) : st.net.broker ? '&b=' + st.net.broker : '';
  return { url: `${base}v.html?pin=${st.pin}${extra}`, short: (base.replace(/^https?:\/\//, '') + 'v.html') };
}
function qrSvg(url) { try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); } catch (e) { return ''; } }
function renderJoin() {
  const j = joinURL();
  $('#jUrl').textContent = j.short; $('#jPin').textContent = st.pin.slice(0, 3) + ' ' + st.pin.slice(3);
  $('#jQr').innerHTML = qrSvg(j.url);
}
$('#joinBox').onclick = () => {
  const j = joinURL();
  $('#qrBigSvg').innerHTML = qrSvg(j.url); $('#qrBigUrl').textContent = j.short; $('#qrBigPin').textContent = 'PIN ' + st.pin.slice(0, 3) + ' ' + st.pin.slice(3);
  $('#qrBig').hidden = false;
};
$('#qrBig').onclick = () => ($('#qrBig').hidden = true);

/* ================= ĐỒNG HỒ ================= */
const stateMsg = () => ({ t: 'state', phase: st.phase, elapsed: elapsed() / 1000, limit: st.limitMs / 1000, lock: !!st.room.lockOnEnd });
function setPhase(p) {
  if (p === 'run') { st.runFrom = Date.now(); st.phase = 'run'; }
  else { st.elapsedBase = elapsed(); st.phase = p; if (p === 'end') st.endedAt = Date.now(); }
  st.net.broadcast(stateMsg()); st.dirty = true; renderCtl(); tick();
}
function renderCtl() {
  const c = $('#rCtl'); c.innerHTML = '';
  if (st.readonly) { const b = document.createElement('button'); b.className = 'btn sm ghost'; b.textContent = '← Quay lại'; b.onclick = leaveRoom; c.appendChild(b); return; }
  const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn sm ' + cls; b.textContent = txt; b.onclick = fn; c.appendChild(b); };
  if (st.phase === 'wait') btn('▶ Bắt đầu', 'go', () => setPhase('run'));
  if (st.phase === 'run') btn('⏸ Dừng & khoá bài', 'warn', () => setPhase('end'));
  if (st.phase === 'end') btn('▶ Mở lại', 'go', () => {
    if (st.limitMs && st.limitMs - elapsed() <= 0) st.limitMs = elapsed() + 5 * 60000;   // hết giờ rồi → cho thêm 5 phút
    setPhase('run');
  });
  if (st.limitMs && st.phase !== 'wait') {
    btn('+1 phút', 'ghost', () => addTime(1)); btn('+5 phút', 'ghost', () => addTime(5));
  }
}
function addTime(min) { st.limitMs = Math.max(st.limitMs, elapsed()) + min * 60000; st.net.broadcast(stateMsg()); st.dirty = true; tick(); }
function tick() {
  if (!st.room) return;
  const el = elapsed() / 1000, lim = st.limitMs / 1000, T = $('#rTimer');
  let num, lab, cls = '';
  if (lim) {
    const rem = lim - el;
    if (st.phase === 'run' && rem <= 0 && st.room.lockOnEnd && !st.readonly) { S.timeUp(); toast('⏰ Hết giờ – đã khoá bài', 4000); setPhase('end'); return; }
    num = rem >= 0 ? fmt(Math.ceil(rem)) : '+' + fmt(-rem);
    lab = rem < 0 ? 'quá giờ' : st.phase === 'wait' ? 'chưa bắt đầu' : st.phase === 'end' ? 'đã khoá bài' : 'còn lại';
    if (rem < 0 || (rem <= 60 && st.phase === 'run')) cls = 'urgent';
  } else { num = fmt(el); lab = st.phase === 'wait' ? 'chưa bắt đầu' : st.phase === 'end' ? 'đã khoá bài' : 'đã viết'; }
  if (st.readonly) { num = fmt(el); lab = 'thời gian đã viết'; cls = ''; }
  $('#tNum').textContent = num; $('#tLab').textContent = lab; T.className = 'rtimer ' + cls + ' ' + st.phase;
  refreshStatus();
}
setInterval(tick, 500);

/* ================= HỌC SINH ================= */
function onMessage(key, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join') return handleJoin(key, m);
  const s = st.students.get(st.keys.get(key)); if (!s) return;
  const canWrite = st.phase === 'run' || (st.phase === 'end' && Date.now() - st.endedAt < 5000);
  if (m.t === 'txt' || m.t === 'submit') {
    if (canWrite && !s.submitted && typeof m.v === 'string') {
      s.text = m.v.slice(0, MAX_CHARS); s.words = countWords(s.text); s.lastEdit = Date.now();
      s.p = Math.min(999, +m.p || 0); s.b = Math.min(999, +m.b || 0);
    }
    if (m.t === 'txt') st.net.send(key, { t: 'ok', n: m.n });
    else if (!s.submitted) { s.submitted = true; s.submittedAt = Date.now(); s.subElapsed = elapsed(); st.net.send(key, { t: 'sub', on: true }); }
    else st.net.send(key, { t: 'sub', on: true });
    st.dirty = true; updateCard(s);
  } else if (m.t === 'unsubmit') {
    if (st.phase === 'run') { s.submitted = false; st.dirty = true; updateCard(s); }
    st.net.send(key, { t: 'sub', on: s.submitted });
  }
}
function onClose(key) {
  const cid = st.keys.get(key); st.keys.delete(key);
  const s = st.students.get(cid);
  if (s && s.key === key) { s.key = null; s.online = false; updateCard(s); }
}
function handleJoin(key, m) {
  const cid = String(m.cid || '').slice(0, 40); if (!cid) return;
  let name = String(m.name || '').trim().slice(0, 30) || 'Bạn mới';
  let s = st.students.get(cid);
  if (!s) {
    if (st.students.size >= MAX_STU) { st.net.send(key, { t: 'full' }); return; }
    const base = name; let i = 2;
    while ([...st.students.values()].some((x) => x.name.toLowerCase() === name.toLowerCase())) name = `${base} ${i++}`;
    s = { cid, name, text: '', words: 0, p: 0, b: 0, submitted: false, submittedAt: 0, subElapsed: 0, lastEdit: 0, joinNo: ++st.joinCount };
    st.students.set(cid, s); makeCard(s); applySort();
  }
  if (s.key && s.key !== key) st.keys.delete(s.key);
  s.key = key; s.online = true; st.keys.set(key, cid);
  st.net.send(key, { t: 'welcome', name: s.name, text: s.text, submitted: s.submitted,
    room: { title: st.room.title, prompt: st.room.prompt, minWords: st.room.minWords, noSpell: st.room.noSpell, blockPaste: st.room.blockPaste }, state: stateMsg() });
  st.dirty = true; updateCard(s);
}

/* ---------- thẻ bài viết ---------- */
function makeCard(s) {
  const el = document.createElement('div'); el.className = 'wcard';
  el.innerHTML = `<div class="top"><i class="dot"></i><b class="nm"></b><span class="stt"></span></div>
    <div class="meta"><span class="wc"></span><span class="flags"></span></div><div class="bar"><i></i></div>
    <div class="prev"><div></div></div>`;
  el.onclick = () => openModal(s.cid);
  s.el = el; $('#grid').appendChild(el); updateCard(s);
}
function statusOf(s) {
  if (s.submitted) return ['sub', '✔ Đã nộp' + (s.subElapsed ? ' lúc ' + fmt(s.subElapsed / 1000) : '')];
  if (st.readonly) return ['idle', 'Chưa nộp'];
  if (!s.online) return ['off', 'Mất kết nối'];
  if (Date.now() - s.lastEdit < 5000) return ['typing', 'Đang gõ…'];
  if (!s.words) return ['idle', 'Chưa viết'];
  return ['idle', 'Tạm dừng ' + (s.lastEdit ? fmt((Date.now() - s.lastEdit) / 1000) : '')];
}
function updateCard(s) {
  const el = s.el, min = st.room.minWords;
  el.querySelector('.nm').textContent = s.name;
  el.querySelector('.wc').innerHTML = `<b>${s.words}</b>${min ? ' / ' + min : ''} từ`;
  el.querySelector('.bar i').style.width = (min ? Math.min(100, 100 * s.words / min) : s.words ? 100 : 0) + '%';
  el.querySelector('.bar').classList.toggle('full', !!min && s.words >= min);
  el.querySelector('.flags').innerHTML = (s.p ? `<span title="Số lần dán">📋 dán ${s.p}</span>` : '') + (s.b ? `<span title="Số lần rời khỏi trang">👀 rời trang ${s.b}</span>` : '');
  el.querySelector('.prev div').textContent = s.text || '';
  setStatus(s);
  if (st.openCid === s.cid) fillModal(s);
  if ($('#sort').value === 'few' || $('#sort').value === 'many') applySortSoon();
  $('#empty').hidden = st.students.size > 0;
}
function setStatus(s) {
  const [cls, txt] = statusOf(s);
  s.el.className = 'wcard ' + cls; s.el.querySelector('.stt').textContent = cls === 'sub' ? '✔ Đã nộp' : txt;
}
function refreshStatus() {
  const all = [...st.students.values()];
  all.forEach(setStatus);
  const typing = all.filter((s) => s.el.classList.contains('typing')).length, sub = all.filter((s) => s.submitted).length;
  const avg = all.length ? Math.round(all.reduce((a, s) => a + s.words, 0) / all.length) : 0;
  $('#stats').innerHTML = `<span>👥 <b>${all.length}</b> học sinh</span>${st.readonly ? '' : `<span>⌨️ <b>${typing}</b> đang gõ</span>`}<span>✔ <b>${sub}</b> đã nộp</span><span>Trung bình <b>${avg}</b> từ</span>`;
  $('#empty').hidden = all.length > 0;
}
let sortT = null;
function applySortSoon() { clearTimeout(sortT); sortT = setTimeout(applySort, 1500); }
function applySort() {
  const mode = $('#sort').value;
  const list = [...st.students.values()].sort((a, b) => mode === 'name' ? a.name.localeCompare(b.name, 'vi') : mode === 'few' ? a.words - b.words || a.joinNo - b.joinNo : mode === 'many' ? b.words - a.words || a.joinNo - b.joinNo : a.joinNo - b.joinNo);
  list.forEach((s, i) => (s.el.style.order = i));
}
$('#sort').onchange = applySort;

/* ---------- xem 1 bài ---------- */
function openModal(cid) { st.openCid = cid; fillModal(st.students.get(cid)); $('#modal').hidden = false; }
function fillModal(s) {
  $('#mName').textContent = s.name;
  $('#mMeta').textContent = ` · ${s.words} từ · ${s.text.length} ký tự · ${statusOf(s)[1]}` + (s.p ? ` · dán ${s.p} lần` : '') + (s.b ? ` · rời trang ${s.b} lần` : '');
  const box = $('#mText'), atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.textContent = s.text || '(chưa viết gì)';
  if (atEnd) box.scrollTop = box.scrollHeight;
  $('#mReopen').hidden = st.readonly || !s.submitted; $('#mKick').hidden = st.readonly;
}
const closeModal = () => { $('#modal').hidden = true; st.openCid = null; };
$('#mX').onclick = closeModal;
$('#modal').onclick = (e) => { if (e.target.id === 'modal') closeModal(); };
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#qrBig').hidden = true; } });
$('#mPdf').onclick = () => { const s = st.students.get(st.openCid); if (s) exportPDF([s], st.room); };
$('#mCopy').onclick = async () => { const s = st.students.get(st.openCid); try { await navigator.clipboard.writeText(s.text); toast('Đã chép bài viết'); } catch (e) { toast('Không chép được'); } };
$('#mReopen').onclick = () => { const s = st.students.get(st.openCid); if (!s) return; s.submitted = false; if (s.key) st.net.send(s.key, { t: 'sub', on: false }); st.dirty = true; updateCard(s); };
$('#mKick').onclick = () => {
  const s = st.students.get(st.openCid); if (!s || !confirm(`Mời "${s.name}" ra khỏi phòng và xoá bài của bạn này?`)) return;
  if (s.key) { st.net.send(s.key, { t: 'kick' }); st.keys.delete(s.key); }
  st.students.delete(s.cid); s.el.remove(); st.dirty = true; closeModal(); refreshStatus();
};

/* ---------- thanh công cụ ---------- */
$('#showPrompt').onclick = () => {
  st.openCid = null; $('#mName').textContent = '📄 Đề bài'; $('#mMeta').textContent = '';
  $('#mText').textContent = st.room.prompt || '(không có đề bài)'; $('#mReopen').hidden = $('#mKick').hidden = true; $('#modal').hidden = false;
};
$('#pdfAll').onclick = () => {
  const list = [...st.students.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  if (!list.length) return toast('Chưa có bài nào');
  exportPDF(list, st.room);
};
$('#saveNow').onclick = () => saveSession(true);
$('#closeRoom').onclick = () => {
  if (st.readonly) return leaveRoom();
  if (!confirm('Đóng phòng? Học sinh sẽ không gõ tiếp được. Các bài viết vẫn được lưu trong "Buổi đã lưu".')) return;
  if (st.phase === 'run') setPhase('end');
  saveSession(false); try { localStorage.removeItem(LS_CUR); } catch (e) {}
  st.net.broadcast({ t: 'closed' }); setTimeout(() => { try { st.net.destroy(); } catch (e) {} st.net = null; }, 300);
  leaveRoom();
};
function leaveRoom() {
  st.room = null; st.students.clear(); closeModal();
  $('#room').hidden = true; $('#setup').hidden = false; document.body.classList.remove('readonly'); renderSaved();
}
addEventListener('beforeunload', (e) => { if (st.room && !st.readonly && st.students.size) { saveSession(false); e.preventDefault(); e.returnValue = ''; } });

/* ================= PDF ================= */
let pdfReady = null;
function loadPdfLib() {
  if (!pdfReady) pdfReady = (async () => {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const b64 = async (u) => { const buf = new Uint8Array(await (await fetch(u)).arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); };
    return { reg: await b64('vendor/fonts/DejaVuSans.ttf'), bold: await b64('vendor/fonts/DejaVuSans-Bold.ttf') };
  })().catch((e) => { pdfReady = null; throw e; });
  return pdfReady;
}
const clean = (t) => String(t || '').normalize('NFC').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️‍]/gu, '').replace(/\t/g, '    ');
async function exportPDF(students, room) {
  toast('Đang tạo PDF…', 0);
  let fonts;
  try { fonts = await loadPdfLib(); } catch (e) { return toast('Không tải được công cụ tạo PDF – kiểm tra mạng rồi thử lại', 4000); }
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.reg); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  const M = 18, W = 210 - 2 * M, BOTTOM = 297 - 20;
  let y = M;
  const write = (text, size, style, color, gap = 0) => {
    doc.setFont('DejaVu', style); doc.setFontSize(size); doc.setTextColor(...color);
    const lh = size * 0.3528 * 1.5;
    clean(text).split('\n').forEach((para) => {
      const lines = para.trim() === '' ? [''] : doc.splitTextToSize(para, W);
      lines.forEach((ln) => { if (y + lh > BOTTOM) { doc.addPage(); y = M; } doc.text(ln, M, y + size * 0.3528); y += lh; });
    });
    y += gap;
  };
  const starts = [];
  students.forEach((s, i) => {
    if (i) doc.addPage();
    y = M; starts.push({ page: doc.getNumberOfPages(), name: clean(s.name) });
    write(`${room.title || 'Phòng Luyện Viết'} · ${fmtDate(room.date)}`, 9, 'normal', [120, 120, 120], 1);
    write(s.name, 17, 'bold', [30, 30, 30], 0.5);
    const words = countWords(s.text);
    write(`Số từ: ${words}${room.minWords ? ' / tối thiểu ' + room.minWords : ''}   ·   ${s.submitted ? 'Đã nộp' + (s.subElapsed ? ' sau ' + fmt(s.subElapsed / 1000) : '') : 'Chưa nộp'}${s.p ? '   ·   Dán: ' + s.p + ' lần' : ''}${s.b ? '   ·   Rời trang: ' + s.b + ' lần' : ''}`, 10, 'normal', [80, 80, 80], 2);
    if (room.prompt) { write('Đề bài', 10, 'bold', [80, 80, 80]); write(room.prompt, 10, 'normal', [80, 80, 80], 2); }
    doc.setDrawColor(190); doc.line(M, y, 210 - M, y); y += 5;
    write(s.text || '(chưa viết gì)', 12, 'normal', [20, 20, 20]);
  });
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    const owner = [...starts].reverse().find((x) => x.page <= p);
    doc.text(`${owner ? owner.name : ''}`, M, 297 - 10); doc.text(`Trang ${p}/${total}`, 210 - M, 297 - 10, { align: 'right' });
  }
  const safe = (t) => clean(t).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'bai-viet';
  doc.save(students.length === 1 ? `${safe(students[0].name)} - ${safe(room.title || 'bai viet')}.pdf` : `${safe(room.title || 'Phong luyen viet')} - ${students.length} bai.pdf`);
  toast('⬇ Đã tải PDF', 2500);
}

/* ================= TIỆN ÍCH ================= */
function toast(text, ms = 2500) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(t._t); if (ms) t._t = setTimeout(() => (t.hidden = true), ms);
}
loadSetup();
window.__viet = { st, exportPDF };

// ✍️ PHÒNG LUYỆN VIẾT – máy học sinh
import { joinRoom } from './net.js';

const $ = (s) => document.querySelector(s);
const LS = 'lophocvui-player';
const countWords = (t) => { const m = String(t || '').trim().match(/\S+/g); return m ? m.length : 0; };
const fmt = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

let me = {};
try { me = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) {}
if (!me.cid) me.cid = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const saveMe = () => { try { localStorage.setItem(LS, JSON.stringify(me)); } catch (e) {} };

const url = new URLSearchParams(location.search);
const ta = $('#text');
let net = null, pin = '', joined = false, online = false, room = null;
let state = { phase: 'wait', elapsed: 0, limit: 0, lock: true }, stateAt = 0;
let submitted = false, dirty = false, seq = 0, pastes = 0, blurs = 0, timeLocked = false, closed = false;

const draftKey = () => 'lhv-w-' + pin + '-' + me.cid;
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify({ text: ta.value, p: pastes, b: blurs, submitted, t: Date.now() })); } catch (e) {} }
function loadDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { return null; } }

function toast(text, ms = 2500) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), ms); }
function netMsg(t) { $('#net').hidden = !t; $('#net').textContent = t || ''; }

/* ---------- vào phòng ---------- */
$('#pin').value = (url.get('pin') || '').replace(/\D/g, '');
$('#name').value = me.fullName || me.name || '';
$('#pin').oninput = () => ($('#pin').value = $('#pin').value.replace(/\D/g, '').slice(0, 6));
['#pin', '#name'].forEach((s) => $(s).addEventListener('keydown', (e) => e.key === 'Enter' && $('#joinBtn').click()));
$('#joinBtn').onclick = () => {
  const p = $('#pin').value.replace(/\D/g, ''), n = $('#name').value.trim();
  if (p.length !== 6) return ($('#joinErr').textContent = 'Mã PIN gồm 6 chữ số');
  if (!n) return ($('#joinErr').textContent = 'Nhập họ tên của bạn nhé');
  me.fullName = n; saveMe(); pin = p; $('#joinErr').textContent = '';
  connect();
};
function connect() {
  $('#joinBtn').disabled = true; $('#joinBtn').textContent = 'Đang vào phòng…';
  if (net) net.stop();
  const b = url.get('pin') === pin ? +(url.get('b') || 0) : 0;
  net = joinRoom('w' + pin, {
    onOpen: () => { online = true; net.send({ t: 'join', cid: me.cid, name: me.fullName }); },
    onClose: () => { online = false; if (joined && !closed) netMsg('📶 Mất kết nối – bài vẫn được giữ trên máy bạn, đang nối lại…'); render(); },
    onError: (e) => {
      if (e === 'nopin') resetJoin('Không tìm thấy phòng với mã PIN này. Kiểm tra lại mã nhé.');
      else if (e === 'blocked') resetJoin('Mạng này đang chặn kết nối 😢 Thử chuyển sang 4G hoặc wifi khác.');
      else if (!joined) resetJoin('Lỗi kết nối (' + e + '). Thử lại nhé.');
    },
    onMessage,
  }, b);
}
function resetJoin(msg) {
  if (net) { net.stop(); net = null; }
  joined = false; online = false; netMsg('');
  $('#sWrite').hidden = true; $('#sJoin').hidden = false;
  $('#joinBtn').disabled = false; $('#joinBtn').textContent = 'Vào phòng';
  $('#joinErr').textContent = msg;
}

/* ---------- tin nhắn từ máy giáo viên ---------- */
function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (!joined && !['welcome', 'full', 'kick'].includes(m.t)) return;
  switch (m.t) {
    case 'welcome': {
      const first = !joined;
      joined = true; closed = false; netMsg(''); room = m.room;
      try { sessionStorage.setItem('lhv-w-in', pin); } catch (e) {}
      if (first) {
        const d = loadDraft();
        if (d && typeof d.text === 'string' && d.text.length) { ta.value = d.text; pastes = d.p || 0; blurs = d.b || 0; }
        else ta.value = m.text || '';
        submitted = !!m.submitted || !!(d && d.submitted);
        $('#sName').textContent = m.name; $('#sRoom').textContent = room.title ? '· ' + room.title : '';
        $('#sPrompt').textContent = room.prompt || '(Cô chưa nhập đề – nghe hướng dẫn trên lớp nhé)';
        $('#sMin').textContent = room.minWords ? ' / ' + room.minWords : '';
        if (room.noSpell) { ta.spellcheck = false; ta.setAttribute('autocorrect', 'off'); ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocomplete', 'off'); }
        $('#sJoin').hidden = true; $('#sWrite').hidden = false;
      }
      setState(m.state);
      if (submitted && !m.submitted) net.send({ t: 'submit', v: ta.value, p: pastes, b: blurs });   // đã bấm nộp lúc mất mạng
      dirty = !submitted && ta.value !== (m.text || '');   // máy cô chưa có bản mới nhất → gửi lại
      render();
      break;
    }
    case 'state': setState(m); render(); break;
    case 'ok': if (m.n === seq && !dirty) sync('saved'); break;
    case 'sub': submitted = !!m.on; saveDraft(); render(); if (!submitted) toast('Cô cho bạn viết tiếp ✍️'); break;
    case 'full': resetJoin('Phòng đã đủ người rồi 😢'); break;
    case 'kick': try { localStorage.removeItem(draftKey()); } catch (e) {} resetJoin('Bạn đã được mời ra khỏi phòng.'); break;
    case 'closed': closed = true; state.phase = 'end'; state.elapsed = nowElapsed(); stateAt = performance.now(); render(); break;
  }
}
function setState(s) {
  if (!s) return;
  const was = state.phase;
  state = { phase: s.phase, elapsed: +s.elapsed || 0, limit: +s.limit || 0, lock: !!s.lock }; stateAt = performance.now();
  timeLocked = false;
  if (was === 'run' && s.phase === 'end') flush();
  if (was !== 'run' && s.phase === 'run' && !submitted) setTimeout(() => ta.focus(), 50);
}
const nowElapsed = () => state.elapsed + (state.phase === 'run' ? (performance.now() - stateAt) / 1000 : 0);
const canType = () => joined && state.phase === 'run' && !submitted && !timeLocked && !closed;

/* ---------- hiển thị ---------- */
function sync(s) {
  const el = $('#sSync');
  el.className = 'ssync ' + s;
  el.textContent = s === 'saved' ? '✓ Cô đã nhận' : s === 'saving' ? '… đang gửi' : s === 'off' ? '⚠ chưa gửi được' : '';
}
function render() {
  if (!joined) return;
  const ok = canType();
  ta.disabled = !ok;
  $('#sWords').textContent = countWords(ta.value);
  $('#sWords').parentElement.classList.toggle('enough', !!room.minWords && countWords(ta.value) >= room.minWords);
  $('#submit').hidden = submitted || state.phase === 'wait' || closed;
  $('#submit').disabled = state.phase !== 'run' && !ta.value.trim();
  $('#unsubmit').hidden = !(submitted && state.phase === 'run' && !timeLocked && !closed);
  const n = $('#sNotice');
  n.className = 'snotice ' + (submitted ? 'done' : state.phase);
  n.textContent = closed ? '🔒 Cô đã đóng phòng. Bài của bạn đã được lưu.'
    : submitted ? '✔ Bạn đã nộp bài.' + (state.phase === 'run' ? ' Muốn sửa thì bấm "Viết tiếp".' : '')
    : state.phase === 'wait' ? '⏳ Đọc đề trước nhé. Khi cô bấm bắt đầu, bạn mới gõ được.'
    : state.phase === 'end' || timeLocked ? (timeLocked || (state.limit && state.limit - state.elapsed <= 0) ? '🔒 Hết giờ – bài đã khoá.' : '🔒 Cô đã khoá bài.') + (ta.value.trim() ? ' Bấm "Nộp bài" để xác nhận.' : '')
    : '';
  n.hidden = !n.textContent;
  drawTimer();
}
function drawTimer() {
  if (!joined) return;
  const el = nowElapsed(), T = $('#sTimer');
  let num, lab, urgent = false;
  if (state.limit) {
    const rem = state.limit - el;
    if (rem <= 0 && state.lock && state.phase === 'run' && !timeLocked) { timeLocked = true; flush(); render(); return; }
    num = rem >= 0 ? fmt(Math.ceil(rem)) : '+' + fmt(-rem);
    lab = rem < 0 ? 'quá giờ' : state.phase === 'wait' ? 'thời gian làm bài' : 'còn lại';
    urgent = rem < 0 || (rem <= 60 && state.phase === 'run');
  } else { num = fmt(el); lab = state.phase === 'wait' ? 'chưa bắt đầu' : 'đã viết'; }
  $('#sNum').textContent = num; $('#sLab').textContent = lab; T.classList.toggle('urgent', urgent);
}
setInterval(drawTimer, 500);

/* ---------- gõ & gửi bài ---------- */
ta.addEventListener('input', () => { dirty = true; sync('saving'); saveDraft(); $('#sWords').textContent = countWords(ta.value); $('#sWords').parentElement.classList.toggle('enough', !!room.minWords && countWords(ta.value) >= room.minWords); });
function flush() {
  if (!dirty || !joined || submitted) return;
  if (!online) return sync('off');
  dirty = false; net.send({ t: 'txt', v: ta.value, p: pastes, b: blurs, n: ++seq });
}
setInterval(() => { if (state.phase === 'run' || dirty) flush(); }, 1200);
ta.addEventListener('paste', (e) => {
  if (room && room.blockPaste) { e.preventDefault(); toast('Phòng này không cho dán – hãy tự gõ nhé ✍️'); }
  else { pastes++; dirty = true; saveDraft(); }
});
ta.addEventListener('drop', (e) => { if (room && room.blockPaste) e.preventDefault(); });
// rời trang quá 1 giây mới tính (tải lại trang thì không tính)
document.addEventListener('visibilitychange', () => { if (document.hidden && canType()) setTimeout(() => { if (document.hidden) { blurs++; dirty = true; saveDraft(); } }, 1000); });

$('#submit').onclick = () => {
  if (!ta.value.trim()) return toast('Bạn chưa viết gì cả');
  const w = countWords(ta.value);
  const warn = room.minWords && w < room.minWords ? `Bài mới có ${w}/${room.minWords} từ. ` : '';
  if (!confirm(warn + 'Nộp bài?')) return;
  submitted = true; dirty = false; saveDraft();
  if (online) net.send({ t: 'submit', v: ta.value, p: pastes, b: blurs }); else toast('Đang mất mạng – bài sẽ tự nộp khi có kết nối lại', 4000);
  render();
};
$('#unsubmit').onclick = () => { if (online) net.send({ t: 'unsubmit' }); };
addEventListener('beforeunload', (e) => { if (joined && dirty) { e.preventDefault(); e.returnValue = ''; } });

// tự vào lại khi lỡ tải lại trang
if (url.get('pin') && me.fullName && sessionStorage.getItem('lhv-w-in') === url.get('pin')) { pin = url.get('pin'); connect(); }
else if (url.get('pin')) setTimeout(() => $('#name').focus(), 200);

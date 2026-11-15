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
  if (p.length !== 6) return ($('#joinErr').textContent = 'The PIN has 6 digits');
  if (!n) return ($('#joinErr').textContent = 'Please enter your full name');
  me.fullName = n; saveMe(); pin = p; $('#joinErr').textContent = '';
  connect();
};
function connect() {
  $('#joinBtn').disabled = true; $('#joinBtn').textContent = 'Joining…';
  if (net) net.stop();
  const b = url.get('pin') === pin ? +(url.get('b') || 0) : 0;
  net = joinRoom('w' + pin, {
    onOpen: () => { online = true; net.send({ t: 'join', cid: me.cid, name: me.fullName }); },
    onClose: () => { online = false; if (joined && !closed) netMsg('📶 Connection lost – your text is safe on this device, reconnecting…'); render(); },
    onError: (e) => {
      if (e === 'nopin') resetJoin('No room found with this PIN. Please check the code.');
      else if (e === 'blocked') resetJoin('This network is blocking the connection 😢 Try mobile data or another Wi-Fi.');
      else if (!joined) resetJoin('Connection error (' + e + '). Please try again.');
    },
    onMessage,
  }, b);
}
function resetJoin(msg) {
  if (net) { net.stop(); net = null; }
  joined = false; online = false; netMsg('');
  $('#sWrite').hidden = true; $('#sJoin').hidden = false;
  $('#joinBtn').disabled = false; $('#joinBtn').textContent = 'Join room';
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
        $('#sPrompt').textContent = room.prompt || '(No written task – listen to your teacher\'s instructions)';
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
    case 'sub': submitted = !!m.on; saveDraft(); render(); if (!submitted) toast('Your teacher has reopened your text ✍️'); break;
    case 'full': resetJoin('The room is full 😢'); break;
    case 'kick': try { localStorage.removeItem(draftKey()); } catch (e) {} resetJoin('You have been removed from the room.'); break;
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
  el.textContent = s === 'saved' ? '✓ Saved' : s === 'saving' ? '… saving' : s === 'off' ? '⚠ not sent yet' : '';
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
  n.textContent = closed ? '🔒 The room is closed. Your text has been saved.'
    : submitted ? '✔ You have submitted.' + (state.phase === 'run' ? ' Tap "Keep writing" if you want to edit.' : '')
    : state.phase === 'wait' ? '⏳ Read the task first. You can start typing when your teacher starts the timer.'
    : state.phase === 'end' || timeLocked ? (timeLocked || (state.limit && state.limit - state.elapsed <= 0) ? '🔒 Time is up – writing is locked.' : '🔒 Your teacher has locked the writing.') + (ta.value.trim() ? ' Tap "Submit" to confirm.' : '')
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
    lab = rem < 0 ? 'overtime' : state.phase === 'wait' ? 'time allowed' : 'left';
    urgent = rem < 0 || (rem <= 60 && state.phase === 'run');
  } else { num = fmt(el); lab = state.phase === 'wait' ? 'not started' : 'elapsed'; }
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
  if (room && room.blockPaste) { e.preventDefault(); toast('Pasting is not allowed in this room – please type it yourself ✍️'); }
  else { pastes++; dirty = true; saveDraft(); }
});
ta.addEventListener('drop', (e) => { if (room && room.blockPaste) e.preventDefault(); });
// rời trang quá 1 giây mới tính (tải lại trang thì không tính)
document.addEventListener('visibilitychange', () => { if (document.hidden && canType()) setTimeout(() => { if (document.hidden) { blurs++; dirty = true; saveDraft(); } }, 1000); });

$('#submit').onclick = () => {
  if (!ta.value.trim()) return toast('You have not written anything yet');
  const w = countWords(ta.value);
  const warn = room.minWords && w < room.minWords ? `You have only written ${w}/${room.minWords} words. ` : '';
  if (!confirm(warn + 'Submit your text?')) return;
  submitted = true; dirty = false; saveDraft();
  if (online) net.send({ t: 'submit', v: ta.value, p: pastes, b: blurs }); else toast('You are offline – your text will be submitted automatically when you reconnect', 4000);
  render();
};
$('#unsubmit').onclick = () => { if (online) net.send({ t: 'unsubmit' }); };
addEventListener('beforeunload', (e) => { if (joined && dirty) { e.preventDefault(); e.returnValue = ''; } });

// tự vào lại khi lỡ tải lại trang
if (url.get('pin') && me.fullName && sessionStorage.getItem('lhv-w-in') === url.get('pin')) { pin = url.get('pin'); connect(); }
else if (url.get('pin')) setTimeout(() => $('#name').focus(), 200);

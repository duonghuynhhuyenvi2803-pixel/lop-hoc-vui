import { createHost, IS_LOCAL } from './net.js';
import { avatarSVG, teacherSVG, randomLook, sanitizeLook } from './avatar.js';
import { parseQuestions, SAMPLE, speakText } from './questions.js';
import * as S from './sound.js';

const MAX = 40, COLS = 8, ROWS = 5, QTIME = 20;
const ROW_Y0 = 318, ROW_H = 116, PAIR_W = 330, GAP = 52;
const X0 = (1600 - (4 * PAIR_W + 3 * GAP)) / 2;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LET = 'ABCD';

/* ---------- Ghế ngồi: thứ tự "ưu tiên" = bàn đầu, ở giữa trước ---------- */
function seatPos(i) {
  const r = Math.floor(i / COLS), c = i % COLS, pair = Math.floor(c / 2), side = c % 2;
  const x = X0 + pair * (PAIR_W + GAP) + (side ? PAIR_W * 0.74 : PAIR_W * 0.26);
  return { x, y: ROW_Y0 + r * ROW_H, r, c };
}
const PRESTIGE = [...Array(MAX).keys()].sort((a, b) => {
  const A = seatPos(a), B = seatPos(b);
  return A.r - B.r || Math.abs(A.c - 3.5) - Math.abs(B.c - 3.5) || A.c - B.c;
});

/* ---------- Trạng thái ---------- */
const st = {
  phase: 'setup', pin: '', net: null,
  players: new Map(),     // cid -> player
  keys: new Map(),        // connKey -> cid
  bank: [], bankPos: 0, session: [], qi: -1, sessionNo: 0,
  t0: 0, timerInt: null, autoT: null, settings: {}, voices: [], joinCount: 0,
};

/* ================= SETUP ================= */
const LS = 'lophocvui-host';
function loadSetup() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) {}
  $('#className').value = saved.className || '';
  $('#nq').value = saved.nq || 20;
  $('#shuffle').checked = !!saved.shuffle;
  $('#tts').checked = saved.tts !== false;
  $('#readOpts').checked = !!saved.readOpts;
  $('#waitRead').checked = saved.waitRead !== false;
  $('#autoNext').checked = !!saved.autoNext;
  $('#qtext').value = saved.qtext || SAMPLE;
  st.savedVoice = saved.voice || '';
  $('#nqLabel').textContent = $('#nq').value;
  validate();
}
function readSetup() {
  const s = {
    className: $('#className').value.trim(), nq: +$('#nq').value, shuffle: $('#shuffle').checked,
    tts: $('#tts').checked, readOpts: $('#readOpts').checked, waitRead: $('#waitRead').checked,
    autoNext: $('#autoNext').checked, voice: $('#voice').value, qtext: $('#qtext').value,
  };
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch (e) {}
  return s;
}
function validate() {
  const { questions, errors } = parseQuestions($('#qtext').value);
  $('#qCount').textContent = questions.length + ' câu';
  $('#qCount').style.background = questions.length ? '' : 'var(--red)';
  $('#qErrors').innerHTML = errors.slice(0, 8).map(esc).join('<br>') + (errors.length > 8 ? `<br>… và ${errors.length - 8} lỗi khác` : '');
  return questions;
}
function loadVoices() {
  if (!('speechSynthesis' in window)) { $('#voice').innerHTML = '<option>Trình duyệt không hỗ trợ đọc</option>'; return; }
  const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  st.voices = vs;
  const pref = (v) => (/(google|natural|online)/i.test(v.name) ? 0 : 1) + (/en-US/i.test(v.lang) ? 0 : 0.5);
  vs.sort((a, b) => pref(a) - pref(b));
  $('#voice').innerHTML = vs.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${v.lang})</option>`).join('') || '<option value="">Giọng mặc định</option>';
  if (st.savedVoice && vs.some((v) => v.name === st.savedVoice)) $('#voice').value = st.savedVoice;
}
$('#nq').oninput = () => ($('#nqLabel').textContent = $('#nq').value);
$('#qtext').oninput = validate;
$('#loadSample').onclick = () => { if (!$('#qtext').value.trim() || confirm('Thay nội dung hiện tại bằng bộ câu hỏi mẫu?')) { $('#qtext').value = SAMPLE; validate(); } };
$('#help').onclick = () => ($('#helpBox').hidden = !$('#helpBox').hidden);
$('#openFile').onclick = () => $('#file').click();
$('#file').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('#qtext').value = await f.text(); validate(); } };
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
loadSetup();

$('#openClass').onclick = async () => {
  const qs = validate();
  if (!qs.length) { alert('Chưa có câu hỏi hợp lệ nào.'); return; }
  st.settings = readSetup();
  st.bank = qs; st.bankPos = 0;
  S.unlock();
  $('#openClass').disabled = true; $('#openClass').textContent = 'Đang mở lớp…';
  try { await openRoom(); } catch (e) {
    alert('Không mở được phòng (lỗi mạng: ' + (e.type || e.message || e) + '). Kiểm tra internet rồi thử lại.');
    $('#openClass').disabled = false; $('#openClass').textContent = 'Mở lớp học →';
    return;
  }
  $('#setup').hidden = true; $('#game').hidden = false; document.body.classList.add('playing');
  buildRoom(); fit(); toLobby();
};

async function openRoom() {
  for (let tries = 0; tries < 5; tries++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    try {
      st.net = await createHost(pin, { onMessage, onClose, onError: (e) => console.warn('peer', e) });
      st.pin = pin; return;
    } catch (e) { if (e && e.type !== 'unavailable-id') throw e; }
  }
  throw new Error('no-pin');
}

/* ================= DỰNG LỚP ================= */
function fit() {
  const s = Math.min(innerWidth / 1600, innerHeight / 900);
  const el = $('#stage');
  el.style.transformOrigin = '50% 50%';
  el.style.transform = `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit);

function buildRoom() {
  $('#teacher').innerHTML = teacherSVG();
  let h = '';
  for (let r = 0; r < ROWS; r++) for (let p = 0; p < 4; p++) {
    const x = X0 + p * (PAIR_W + GAP), y = ROW_Y0 + r * ROW_H + 74;
    h += `<div class="desk" style="left:${x}px;top:${y}px;width:${PAIR_W}px;z-index:${11 + 2 * r}"></div>`;
  }
  for (let i = 0; i < MAX; i++) {
    const p = seatPos(i);
    h += `<div class="seatno" style="left:${p.x - 14}px;top:${p.y + 50}px;z-index:${10 + 2 * p.r}">${PRESTIGE.indexOf(i) + 1}</div>`;
  }
  $('#desks').innerHTML = h;
  $('#timerArc').style.strokeDashoffset = 0;
}

function placePlayer(p, animate) {
  const pos = seatPos(p.seat);
  if (!p.el) {
    p.el = document.createElement('div'); p.el.className = 'stu enter';
    p.el.innerHTML = `<div class="inner"></div><div class="mark"></div>`;
    p.el.onclick = () => kick(p);
    p.lb = document.createElement('div'); p.lb.className = 'lbl';
    p.lb.innerHTML = `<span class="rk"></span><span class="nm"></span><span class="sc"></span><span class="gain"></span><span class="mv"></span>`;
    $('#students').appendChild(p.el); $('#labels').appendChild(p.lb);
    setTimeout(() => p.el && p.el.classList.remove('enter'), 700);
    animate = false;
  }
  if (!animate) { p.el.style.transition = p.lb.style.transition = 'none'; }
  const sc = 0.86 + 0.035 * pos.r;
  p.el.style.left = pos.x - 55 + 'px'; p.el.style.top = pos.y - 10 + 'px';
  p.el.style.zIndex = 10 + 2 * pos.r;
  p.el.querySelector('.inner').style.transform = `scale(${sc})`;
  p.lb.style.left = pos.x - 75 + 'px'; p.lb.style.top = pos.y + 80 + 'px';
  p.lb.style.zIndex = 200;
  if (!animate) { void p.el.offsetWidth; p.el.style.transition = p.lb.style.transition = ''; }
  p.lb.querySelector('.nm').textContent = p.name;
  p.lb.querySelector('.sc').textContent = p.score;
  const rk = p.lb.querySelector('.rk');
  rk.textContent = p.rank; rk.className = 'rk' + (p.rank <= 3 && st.qi >= 0 && p.score > 0 ? ' r' + p.rank : '');
  rk.style.visibility = st.qi >= 0 ? 'visible' : 'hidden';
}
function setMood(p, mood) {
  if (p.mood === mood) return;
  p.mood = mood;
  p.el.querySelector('.inner').innerHTML = avatarSVG(p.look, mood);
}
function setMark(p, cls) {
  p.el.classList.remove('answered', 'ok', 'no');
  if (cls) p.el.classList.add(cls);
}

/* ================= KẾT NỐI HỌC SINH ================= */
function onMessage(key, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'join') return handleJoin(key, m);
  const cid = st.keys.get(key); const p = cid && st.players.get(cid);
  if (!p) return;
  if (m.t === 'ans') handleAnswer(p, m);
}
function onClose(key) {
  const cid = st.keys.get(key); st.keys.delete(key);
  const p = cid && st.players.get(cid);
  if (p && p.key === key) { p.key = null; p.el && p.el.classList.add('off'); updateStats(); }
}
function send(p, msg) { if (p.key && !p.bot) st.net.send(p.key, msg); }
function broadcast(msg) { st.players.forEach((p) => send(p, msg)); }

function uniqueName(name, cid) {
  let n = name, i = 2;
  const taken = (x) => [...st.players.values()].some((p) => p.cid !== cid && p.name.toLowerCase() === x.toLowerCase());
  while (taken(n)) n = `${name} ${i++}`;
  return n;
}

function handleJoin(key, m) {
  const cid = String(m.cid || '').slice(0, 40);
  const name = String(m.name || '').trim().slice(0, 18) || 'Bạn mới';
  if (!cid) return;
  let p = st.players.get(cid);
  if (p) {
    if (p.key && p.key !== key) { st.keys.delete(p.key); st.net.drop(p.key); }
    p.key = key; st.keys.set(key, cid);
    p.look = sanitizeLook(m.look); p.mood = null;
    setMood(p, p.answer ? 'done' : st.phase === 'question' || st.phase === 'reading' ? 'think' : 'normal');
    p.el.classList.remove('off');
  } else {
    if (st.players.size >= MAX) { st.net.send(key, { t: 'full' }); return; }
    const used = new Set([...st.players.values()].map((x) => x.seat));
    const seat = PRESTIGE.find((s) => !used.has(s));
    p = { cid, key, name: uniqueName(name, cid), look: sanitizeLook(m.look), score: 0, seat, rank: PRESTIGE.indexOf(seat) + 1, answer: null, joinNo: ++st.joinCount };
    st.players.set(cid, p); st.keys.set(key, cid);
    placePlayer(p, false); setMood(p, st.phase === 'lobby' ? 'happy' : 'normal');
    if (st.phase === 'lobby') setTimeout(() => p.mood === 'happy' && setMood(p, 'normal'), 1500);
    S.pop();
    say(`Chào <b>${esc(p.name)}</b>!`);
  }
  send(p, welcomeMsg(p));
  updateStats();
}
function welcomeMsg(p) {
  const q = st.session[st.qi];
  const base = { t: 'welcome', name: p.name, seat: PRESTIGE.indexOf(p.seat) + 1, score: p.score, rank: p.rank, n: st.players.size, phase: st.phase, cls: st.settings.className };
  if (q && (st.phase === 'reading' || st.phase === 'question')) {
    base.q = qMsg();
    if (st.phase === 'question') base.remaining = Math.max(0, QTIME - (performance.now() - st.t0) / 1000);
    base.answered = p.answer ? p.answer.choice : null;
  }
  return base;
}

function kick(p) {
  if (!confirm(`Mời "${p.name}" ra khỏi lớp?`)) return;
  send(p, { t: 'kick' });
  if (p.key) { st.keys.delete(p.key); st.net.drop(p.key); }
  st.players.delete(p.cid); p.el.remove(); p.lb.remove();
  updateStats();
}

/* ---------- Học sinh ảo để thử ---------- */
const BOT_NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hoa', 'Hùng', 'Huy', 'Khánh', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'My', 'Nam', 'Ngân', 'Ngọc', 'Nhi', 'Phong', 'Phúc', 'Quân', 'Quỳnh', 'Sơn', 'Tâm', 'Thảo', 'Thư', 'Trang', 'Trí', 'Trung', 'Tú', 'Tuấn', 'Uyên', 'Vy', 'Yến'];
function addBots(n) {
  for (let i = 0; i < n && st.players.size < MAX; i++) {
    const cid = 'bot-' + Math.random().toString(36).slice(2, 8);
    handleJoin('k' + cid, { t: 'join', cid, name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + ' 🤖', look: randomLook() });
    const p = st.players.get(cid); if (p) { p.bot = true; p.skill = 0.45 + Math.random() * 0.45; }
  }
}
function scheduleBots() {
  st.players.forEach((p) => {
    if (!p.bot) return;
    const ms = 1500 + Math.random() * 15000 * (1.3 - p.skill);
    p.botT = setTimeout(() => {
      const q = st.session[st.qi];
      const choice = Math.random() < p.skill ? q.correct : Math.floor(Math.random() * q.options.length);
      handleAnswer(p, { t: 'ans', i: st.qi, c: choice });
    }, ms);
  });
}

/* ================= PHA: SẢNH CHỜ ================= */
function joinURL() {
  const base = location.href.replace(/host(\.html)?[^/]*$/, '').split('?')[0].replace(/[^/]*$/, '');
  return `${base}play.html?pin=${st.pin}${IS_LOCAL ? '&local=1' : ''}`;
}
function toLobby() {
  st.phase = 'lobby';
  const url = joinURL();
  let qrSvg = '';
  try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true }); } catch (e) {}
  const shortUrl = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
  $('#board').className = 'board';
  $('#board').innerHTML = `<div class="lobby"><div class="info">
      <div class="cls">${esc(st.settings.className || 'Lớp Học Vui')}${st.sessionNo ? ` · Session ${st.sessionNo + 1}` : ''}</div>
      <div class="how">Quét mã QR hoặc vào</div>
      <div class="url">${esc(shortUrl)}</div>
      <div class="how">rồi nhập mã PIN</div>
      <div class="pin">${st.pin.slice(0, 3)} ${st.pin.slice(3)}</div>
    </div><div class="qr">${qrSvg}</div></div>`;
  timerIdle();
  say(st.players.size ? `Lớp đã có <b>${st.players.size}</b> bạn` : 'Chào cả lớp! Vào lớp nào 👋');
  renderControls();
  broadcast({ t: 'lobby' });
}
function updateStats() {
  const n = st.players.size, on = [...st.players.values()].filter((p) => p.key || p.bot).length;
  if (st.phase === 'lobby') { say(`Lớp đã có <b>${n}</b> bạn`); renderControls(); }
  if (st.phase === 'question') updateAnswered();
  const stat = $('#controls .stat'); if (stat && st.phase === 'lobby') stat.textContent = `${on}/${n} trực tuyến`;
}

function renderControls() {
  const c = $('#controls'); c.innerHTML = '';
  const btn = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = txt; b.onclick = fn; c.appendChild(b); return b; };
  if (st.phase === 'lobby') {
    const b = btn('▶ Bắt đầu', 'go', startSession); b.disabled = st.players.size === 0;
    btn('+5 học sinh ảo', 'tiny', () => addBots(5));
    if ([...st.players.values()].some((p) => p.bot)) btn('Xoá học sinh ảo', 'tiny', removeBots);
  } else if (st.phase === 'reading' || st.phase === 'question') {
    btn('🔊 Đọc lại', 'tiny', () => speak(speakText(st.session[st.qi], st.settings.readOpts)));
    btn('⏭ Chốt đáp án', 'tiny', closeQuestion);
  } else if (st.phase === 'reveal') {
    const last = st.qi >= st.session.length - 1;
    btn(last ? '🏆 Vinh danh' : 'Câu tiếp ▶', 'go', next);
  }
}
function removeBots() {
  st.players.forEach((p) => { if (p.bot) { clearTimeout(p.botT); st.players.delete(p.cid); p.el.remove(); p.lb.remove(); } });
  updateStats(); renderControls();
}

/* ================= PHA: CÂU HỎI ================= */
function startSession() {
  if (!st.players.size) return;
  S.unlock();
  const n = Math.min(st.settings.nq, st.bank.length);
  let pool = st.bank.slice();
  if (st.settings.shuffle) pool.sort(() => Math.random() - 0.5);
  else { pool = pool.slice(st.bankPos).concat(pool.slice(0, st.bankPos)); st.bankPos = (st.bankPos + n) % st.bank.length; }
  st.session = pool.slice(0, n);
  st.qi = -1;
  st.players.forEach((p) => { p.score = 0; });
  rearrange(false);
  next();
}
function next() {
  clearTimeout(st.autoT);
  if (st.qi >= st.session.length - 1) return showPodium();
  st.qi++;
  const q = st.session[st.qi];
  st.phase = 'reading';
  st.players.forEach((p) => { p.answer = null; p.gain = 0; setMark(p, null); setMood(p, 'think'); });
  renderBoard(false);
  timerSet(QTIME, QTIME); $('#timer').classList.remove('idle', 'urgent');
  say(st.settings.tts ? '🔊 Cô đọc câu hỏi nhé…' : 'Sẵn sàng…');
  renderControls();
  broadcast({ t: 'q', q: qMsg() });
  const text = speakText(q, st.settings.readOpts);
  if (st.settings.tts && st.settings.waitRead) speak(text).then(() => { if (st.phase === 'reading' && st.session[st.qi] === q) openQuestion(); });
  else { if (st.settings.tts) speak(text); setTimeout(openQuestion, 600); }
}
function qMsg() {
  const q = st.session[st.qi];
  return { i: st.qi, total: st.session.length, text: q.text, options: q.options };
}
function renderBoard(reveal, counts) {
  const q = st.session[st.qi];
  const fs = q.text.length < 60 ? 46 : q.text.length < 110 ? 36 : q.text.length < 170 ? 29 : 23;
  const ofs = (o) => (o.length < 22 ? 27 : o.length < 40 ? 22 : 17);
  $('#board').className = 'board' + (reveal ? ' reveal' : '');
  $('#board').innerHTML = `<div class="b-head"><span>Câu ${st.qi + 1}/${st.session.length}</span><span>${esc(st.settings.className || '')}</span></div>
    <div class="b-q" style="font-size:${fs}px">${esc(q.text)}</div>
    <div class="b-opts">${q.options.map((o, i) => `<div class="b-opt opt-${LET[i]} ${reveal ? (i === q.correct ? 'right' : 'wrong') : ''}">
      <span class="let">${LET[i]}</span><span class="txt" style="font-size:${ofs(o)}px">${esc(o)}</span><span class="cnt">${counts ? counts[i] : 0}</span></div>`).join('')}</div>`;
}
function openQuestion() {
  if (st.phase !== 'reading') return;
  st.phase = 'question'; st.t0 = performance.now();
  broadcast({ t: 'open', i: st.qi, remaining: QTIME });
  updateAnswered();
  scheduleBots();
  let lastSec = QTIME;
  clearInterval(st.timerInt);
  st.timerInt = setInterval(() => {
    const left = QTIME - (performance.now() - st.t0) / 1000;
    timerSet(Math.max(0, left), QTIME);
    const sec = Math.ceil(left);
    if (sec !== lastSec) { lastSec = sec; if (sec <= 5 && sec > 0) S.tick(true); }
    if (left <= 0) { S.timeUp(); closeQuestion(); }
  }, 100);
}
function updateAnswered() {
  const n = st.players.size, a = [...st.players.values()].filter((p) => p.answer).length;
  say(`<b>${a}</b>/${n} bạn đã trả lời`);
}
function handleAnswer(p, m) {
  if (st.phase !== 'question' || p.answer || m.i !== st.qi) return;
  const q = st.session[st.qi];
  const c = Number(m.c); if (!(c >= 0 && c < q.options.length)) return;
  p.answer = { choice: c, ms: performance.now() - st.t0 };
  setMood(p, 'done'); setMark(p, 'answered');
  send(p, { t: 'got', c });
  updateAnswered();
  const active = [...st.players.values()].filter((x) => x.key || x.bot);
  if (active.length && active.every((x) => x.answer)) setTimeout(closeQuestion, 500);
}
function closeQuestion() {
  if (st.phase !== 'question' && st.phase !== 'reading') return;
  clearInterval(st.timerInt);
  st.players.forEach((p) => clearTimeout(p.botT));
  try { speechSynthesis.cancel(); } catch (e) {}
  st.phase = 'reveal';
  const q = st.session[st.qi], N = st.players.size;
  const counts = q.options.map(() => 0);
  st.players.forEach((p) => {
    p.prevRank = p.rank;
    if (p.answer) counts[p.answer.choice]++;
    const ok = p.answer && p.answer.choice === q.correct;
    p.gain = ok ? Math.max(1, Math.round(N * (1 - 0.5 * Math.min(p.answer.ms, QTIME * 1000) / (QTIME * 1000)))) : 0;
    p.score += p.gain;
    setMood(p, ok ? 'happy' : 'sad'); setMark(p, ok ? 'ok' : p.answer ? 'no' : null);
    p.lb.querySelector('.sc').textContent = p.score;
    const g = p.lb.querySelector('.gain');
    g.classList.remove('show'); void g.offsetWidth;
    if (ok) { g.textContent = '+' + p.gain; g.classList.add('show'); }
  });
  broadcast({ t: 'closed', i: st.qi });
  renderBoard(true, counts);
  timerIdle();
  S.reveal();
  const right = [...st.players.values()].filter((p) => p.gain > 0).length;
  say(`Đáp án <b>${LET[q.correct]}</b> · ${right}/${N} bạn đúng`);
  renderControls();
  const qi = st.qi;
  setTimeout(() => {
    if (st.qi !== qi || st.phase !== 'reveal') return;
    rearrange(true);
    st.players.forEach((p) => send(p, { t: 'res', i: qi, correct: q.correct, choice: p.answer ? p.answer.choice : null, gain: p.gain, score: p.score, rank: p.rank, prev: p.prevRank, n: N }));
    if (st.settings.autoNext) st.autoT = setTimeout(() => { if (st.phase === 'reveal' && st.qi === qi) next(); }, 8000);
  }, 2200);
}

function rearrange(animate) {
  const list = [...st.players.values()].sort((a, b) => b.score - a.score || a.rank - b.rank || a.joinNo - b.joinNo);
  let moved = false;
  list.forEach((p, i) => {
    p.rank = i + 1;
    const seat = PRESTIGE[i];
    if (seat !== p.seat) moved = true;
    p.seat = seat;
    if (animate) {
      const mv = p.lb.querySelector('.mv'); mv.classList.remove('show', 'up', 'down'); void mv.offsetWidth;
      const d = (p.prevRank || p.rank) - p.rank;
      if (d) { mv.textContent = (d > 0 ? '▲' : '▼') + Math.abs(d); mv.classList.add(d > 0 ? 'up' : 'down', 'show'); }
      p.el.classList.add('walking');
      setTimeout(() => p.el && p.el.classList.remove('walking'), 1500);
    }
    placePlayer(p, animate);
  });
  if (animate && moved) S.shuffle();
}

/* ================= TIMER & LỜI THOẠI ================= */
function timerSet(left, total) {
  $('#timerNum').textContent = Math.ceil(left);
  $('#timerArc').style.strokeDashoffset = 326.7 * (1 - left / total);
  $('#timer').classList.toggle('urgent', left <= 5 && left > 0);
}
function timerIdle() { $('#timer').classList.add('idle'); $('#timer').classList.remove('urgent'); $('#timerNum').textContent = QTIME; $('#timerArc').style.strokeDashoffset = 0; }
function say(html) { $('#bubble').innerHTML = html; }

function speak(text) {
  return new Promise((res) => {
    if (!st.settings.tts || !('speechSynthesis' in window)) return res();
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = st.voices.find((v) => v.name === st.settings.voice);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = 0.92; u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    } catch (e) { fin(); }
    setTimeout(fin, 2500 + text.length * 95);
  });
}

/* ================= VINH DANH ================= */
function showPodium() {
  st.phase = 'podium'; st.sessionNo++;
  clearTimeout(st.autoT); renderControls();
  const list = [...st.players.values()].sort((a, b) => a.rank - b.rank);
  const top = list.slice(0, 3);
  const pd = $('#podium'); pd.hidden = false;
  const slot = (p, place) => p ? `<div class="pd pd${place}" id="pd${place}">
      <div class="who"><div class="crown">${place === 1 ? '👑' : place === 2 ? '🥈' : '🥉'}</div>${avatarSVG(p.look, place === 1 ? 'star' : 'happy')}
      <div class="nm">${esc(p.name)}</div><div class="pts">${p.score} điểm</div></div>
      <div class="blk">${place}</div></div>` : '';
  pd.innerHTML = `<div class="title">🏆 VINH DANH 🏆</div>
    <div class="sub">${esc(st.settings.className || 'Lớp Học Vui')} · ${st.session.length} câu hỏi · ${list.length} học sinh</div>
    <div class="light" style="left:${640 - 20}px" id="lt1"></div><div class="light" style="left:${300 - 20}px" id="lt2"></div><div class="light" style="left:${980 - 20}px" id="lt3"></div>
    ${slot(top[1], 2)}${slot(top[0], 1)}${slot(top[2], 3)}
    <div class="board-list" id="plist">${list.map((p) => `<div><span>${p.rank}. ${esc(p.name)}</span><b>${p.score}</b></div>`).join('')}</div>
    <div class="pbtns" id="pbtns">
      <button class="btn go" id="pNew">▶ Session mới</button>
      <button class="btn ghost" id="pCsv">⬇ Tải bảng điểm (CSV)</button>
    </div>`;
  list.forEach((p) => send(p, { t: 'end', rank: p.rank, score: p.score, n: list.length, top: top.map((t) => ({ name: t.name, score: t.score, look: t.look })) }));
  const on = (id) => { const el = $(id); if (el) el.classList.add('on'); };
  S.drumroll(1.5);
  setTimeout(() => { on('#pd3'); on('#lt3'); S.cymbal(); }, 1600);
  setTimeout(() => { S.drumroll(1.5); }, 2600);
  setTimeout(() => { on('#pd2'); on('#lt2'); S.cymbal(); }, 4200);
  setTimeout(() => { S.drumroll(2); }, 5200);
  setTimeout(() => { on('#pd1'); on('#lt1'); S.fanfare(); confetti(); say(`🎉 Chúc mừng <b>${esc(top[0] ? top[0].name : '')}</b>!`); }, 7300);
  setTimeout(() => { on('#pbtns'); on('#plist'); }, 8500);
  pd.onclick = ((e) => {
    if (e.target.id === 'pNew') { pd.hidden = true; st.qi = -1; st.players.forEach((p) => { p.score = 0; setMark(p, null); setMood(p, 'normal'); }); rearrange(false); toLobby(); }
    if (e.target.id === 'pCsv') downloadCSV(list);
    if (e.target.id === 'pBack') { pd.hidden = true; }
  });
}
function downloadCSV(list) {
  const rows = [['Hạng', 'Tên', 'Điểm']].concat(list.map((p) => [p.rank, p.name, p.score]));
  const csv = '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `bang-diem-${(st.settings.className || 'lop').replace(/\s+/g, '-')}-session${st.sessionNo}.csv`;
  a.click();
}

function confetti() {
  const cv = $('#confetti'), cx = cv.getContext('2d');
  const colors = ['#e5484d', '#3e7bfa', '#f5a524', '#2fb36d', '#ffd43b', '#e84393', '#fff'];
  const parts = Array.from({ length: 260 }, () => ({ x: 800 + (Math.random() - 0.5) * 300, y: 300, vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 22 - 6, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 8 + Math.random() * 10, h: 5 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)] }));
  let f = 0;
  (function loop() {
    cx.clearRect(0, 0, 1600, 900);
    parts.forEach((p) => { p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); cx.restore(); });
    if (++f < 260) requestAnimationFrame(loop); else cx.clearRect(0, 0, 1600, 900);
  })();
}

/* ================= PHÍM TẮT & NÚT GÓC ================= */
addEventListener('keydown', (e) => {
  if (st.phase === 'setup' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'Enter') {
    e.preventDefault();
    if (st.phase === 'lobby') startSession(); else if (st.phase === 'reveal') next();
  }
});
$('#muteBtn').onclick = () => { S.setMuted(!S.muted); $('#muteBtn').textContent = S.muted ? '🔇' : '🔊'; };
$('#fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
addEventListener('beforeunload', (e) => { if (st.phase !== 'setup') { e.preventDefault(); e.returnValue = ''; } });

// cho phép tự động hoá khi thử nghiệm
window.__lophoc = { st, addBots, next, closeQuestion };

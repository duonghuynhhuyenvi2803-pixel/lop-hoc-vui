import { joinRoom } from './net.js';
import { avatarSVG, randomLook, sanitizeLook, SKIN, HAIR, SHIRT, STYLES, ACCS } from './avatar.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LET = 'ABCD';
const LS = 'lophocvui-player';

let me = {};
try { me = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) {}
if (!me.cid) me.cid = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
me.look = me.look ? sanitizeLook(me.look) : randomLook();
const save = () => { try { localStorage.setItem(LS, JSON.stringify(me)); } catch (e) {} };

const url = new URLSearchParams(location.search);
let net = null, pin = '', score = 0, cur = null, timerT = null, joined = false;

/* ---------- màn hình ---------- */
function show(id) { document.querySelectorAll('.screen').forEach((s) => (s.hidden = s.id !== id)); window.scrollTo(0, 0); }
function netMsg(t) { $('#net').hidden = !t; $('#net').textContent = t || ''; }

/* ---------- tạo nhân vật ---------- */
const PICK = [
  ['skin', 'Da', SKIN.length, (i) => `<i class="sw" style="background:${SKIN[i]}"></i>`],
  ['hair', 'Màu tóc', HAIR.length, (i) => `<i class="sw" style="background:${HAIR[i]}"></i>`],
  ['style', '', STYLES.length, (i) => STYLES[i]],
  ['shirt', 'Áo', SHIRT.length, (i) => `<i class="sw" style="background:${SHIRT[i]}"></i>`],
  ['acc', '', ACCS.length, (i) => (i ? ACCS[i] : 'Phụ kiện: không')],
];
function renderMaker() {
  $('#preview').innerHTML = avatarSVG(me.look, 'happy');
  $('#pickers').innerHTML = PICK.map(([k, label, n, f], idx) =>
    `<div class="pk"><button data-k="${idx}" data-d="-1">‹</button><span>${label} ${f(me.look[k])}</span><button data-k="${idx}" data-d="1">›</button></div>`).join('');
}
$('#pickers').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const [k, , n] = PICK[+b.dataset.k];
  me.look[k] = (me.look[k] + +b.dataset.d + n) % n; renderMaker();
};
$('#rand').onclick = () => { me.look = randomLook(); renderMaker(); };
$('#pin').value = (url.get('pin') || me.lastPin || '').replace(/\D/g, '');
$('#name').value = me.name || '';
renderMaker();
$('#pin').oninput = () => ($('#pin').value = $('#pin').value.replace(/\D/g, '').slice(0, 6));
if (url.get('pin')) setTimeout(() => $('#name').focus(), 200);

$('#joinBtn').onclick = () => {
  const p = $('#pin').value.replace(/\D/g, ''), n = $('#name').value.trim();
  if (p.length !== 6) return ($('#joinErr').textContent = 'Mã PIN gồm 6 chữ số');
  if (!n) return ($('#joinErr').textContent = 'Nhập tên của bạn nhé');
  me.name = n; me.lastPin = p; save();
  pin = p; $('#joinErr').textContent = '';
  connect();
};
['#pin', '#name'].forEach((s) => $(s).addEventListener('keydown', (e) => e.key === 'Enter' && $('#joinBtn').click()));

function connect() {
  $('#joinBtn').disabled = true; $('#joinBtn').textContent = 'Đang vào lớp…';
  if (net) net.stop();
  net = joinRoom(pin, {
    onOpen: () => { netMsg(''); net.send({ t: 'join', cid: me.cid, name: me.name, look: me.look }); },
    onClose: () => { if (joined) netMsg('📶 Mất kết nối – đang nối lại…'); },
    onError: (e) => {
      if (e === 'nopin') { resetJoin('Không tìm thấy lớp với mã PIN này'); }
      else if (e === 'timeout') { if (!joined) netMsg('Kết nối chậm… thử lại'); }
      else if (!joined) resetJoin('Lỗi kết nối (' + e + '). Thử lại hoặc đổi mạng wifi/4G.');
    },
    onMessage,
  });
}
function resetJoin(msg) {
  if (net) { net.stop(); net = null; }
  joined = false; show('sJoin'); netMsg('');
  $('#joinBtn').disabled = false; $('#joinBtn').textContent = 'Vào lớp';
  $('#joinErr').textContent = msg;
}

/* ---------- tin nhắn từ máy giáo viên ---------- */
function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'welcome': {
      joined = true; netMsg(''); score = m.score; me.name = m.name; try { sessionStorage.setItem('lophoc-in', pin); } catch (e) {}
      if (m.q) { showQuestion(m.q); if (m.remaining != null) openQ(m.remaining); if (m.answered != null) markPicked(m.answered); }
      else waitScreen(m.phase === 'lobby' || m.phase === 'setup'
        ? `Bạn ngồi ghế số <b>${m.seat}</b>`
        : `Hạng hiện tại: <b>${m.rank}</b> · ${score} điểm`, m.phase === 'lobby' ? 'Chờ cô bắt đầu<span class="dots"></span>' : 'Chờ câu hỏi tiếp theo<span class="dots"></span>');
      break;
    }
    case 'full': resetJoin('Lớp đã đủ 40 bạn rồi 😢'); break;
    case 'kick': resetJoin('Bạn đã được mời ra khỏi lớp.'); break;
    case 'lobby': score = 0; waitScreen('Session mới sắp bắt đầu!', 'Chờ cô bắt đầu<span class="dots"></span>'); break;
    case 'q': showQuestion(m.q); break;
    case 'open': if (cur && cur.i === m.i) openQ(m.remaining); break;
    case 'got': markPicked(m.c); break;
    case 'closed': if (cur && cur.i === m.i) { lockQ(); $('#qHint').textContent = 'Hết giờ! Xem đáp án trên bảng 👀'; } break;
    case 'res': showResult(m); break;
    case 'end': showEnd(m); break;
  }
}

function waitScreen(info, msg) {
  $('#wAva').innerHTML = avatarSVG(me.look, 'happy');
  $('#wName').textContent = me.name;
  $('#wInfo').innerHTML = info;
  $('#wMsg').innerHTML = msg;
  show('sWait');
}

function showQuestion(q) {
  cur = { i: q.i, picked: null, open: false };
  clearInterval(timerT);
  $('#qNo').textContent = `Câu ${q.i + 1}/${q.total}`;
  $('#qScore').textContent = `⭐ ${score}`;
  $('#qText').textContent = q.text;
  $('#qHint').textContent = '🔊 Nghe cô đọc câu hỏi…';
  $('#tfill').style.width = '100%';
  const o = $('#opts');
  o.className = 'opts locked n' + q.options.length;
  o.innerHTML = q.options.map((t, i) => `<button class="opt-${LET[i]}" data-i="${i}" disabled><span class="l">${LET[i]}</span><span>${esc(t)}</span></button>`).join('');
  show('sQ');
}
function openQ(remaining) {
  if (!cur || cur.open) return;
  cur.open = true;
  const o = $('#opts');
  if (cur.picked == null) { o.classList.remove('locked'); o.querySelectorAll('button').forEach((b) => (b.disabled = false)); $('#qHint').textContent = 'Chọn đáp án! Càng nhanh càng nhiều điểm ⚡'; }
  const end = performance.now() + remaining * 1000;
  clearInterval(timerT);
  timerT = setInterval(() => {
    const left = Math.max(0, end - performance.now());
    $('#tfill').style.width = (left / 200) + '%';
    if (left <= 0) { clearInterval(timerT); lockQ(); }
  }, 100);
}
$('#opts').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || !cur || !cur.open || cur.picked != null) return;
  cur.picked = +b.dataset.i;
  net.send({ t: 'ans', i: cur.i, c: cur.picked });
  markPicked(cur.picked);
  if (navigator.vibrate) navigator.vibrate(30);
};
function markPicked(c) {
  if (!cur) return;
  cur.picked = c;
  const o = $('#opts'); o.classList.add('locked');
  o.querySelectorAll('button').forEach((b, i) => { b.disabled = i !== c; b.classList.toggle('picked', i === c); });
  $('#qHint').textContent = `Đã chốt ${LET[c]} ✔ Chờ các bạn khác…`;
}
function lockQ() {
  const o = $('#opts'); o.classList.add('locked');
  o.querySelectorAll('button').forEach((b) => { if (!b.classList.contains('picked')) b.disabled = true; });
  clearInterval(timerT); $('#tfill').style.width = '0%';
}

function showResult(m) {
  clearInterval(timerT);
  score = m.score;
  const s = $('#sRes');
  const kind = m.choice == null ? 'none' : m.gain > 0 ? 'ok' : 'no';
  s.className = 'screen center res ' + kind;
  $('#rIcon').textContent = kind === 'ok' ? '🎉' : kind === 'no' ? '😵' : '⏰';
  $('#rTitle').textContent = kind === 'ok' ? 'Chính xác!' : kind === 'no' ? 'Chưa đúng rồi' : 'Bạn chưa trả lời';
  $('#rGain').textContent = kind === 'ok' ? `+${m.gain} điểm` : `Đáp án: ${LET[m.correct]}`;
  const d = (m.prev || m.rank) - m.rank;
  const mv = d > 0 ? ` <b style="color:#b8ffcf">▲${d}</b>` : d < 0 ? ` <b style="color:#ffd0d0">▼${-d}</b>` : '';
  $('#rInfo').innerHTML = `Tổng: <b>${m.score}</b> điểm<br>Hạng <b>${m.rank}</b>/${m.n}${mv}<br><small>Nhìn lên bảng xem chỗ ngồi mới nhé!</small>`;
  show('sRes');
  if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? [40, 60, 40] : 120);
}

function showEnd(m) {
  clearInterval(timerT);
  const s = $('#sRes');
  s.className = 'screen center res ' + (m.rank <= 3 ? 'ok' : 'none');
  $('#rIcon').innerHTML = `<div class="medal">${m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : '🎓'}</div>`;
  $('#rTitle').textContent = m.rank <= 3 ? 'Bạn được vinh danh!' : 'Kết thúc session!';
  $('#rGain').textContent = `Hạng ${m.rank}/${m.n}`;
  $('#rInfo').innerHTML = `Tổng điểm: <b>${m.score}</b><br><br>🏆 Top 3:<br>${m.top.map((t, i) => `${i + 1}. ${esc(t.name)} – ${t.score}`).join('<br>')}`;
  show('sRes');
}

// tự vào lại khi lỡ tải lại trang trong lúc chơi
if (url.get('pin') && me.name && sessionStorage.getItem('lophoc-in') === url.get('pin')) { pin = url.get('pin'); connect(); }

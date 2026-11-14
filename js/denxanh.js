// 🚦 ĐÈN XANH – ĐÈN ĐỎ: chọn ngẫu nhiên một bạn lên trả bài, có đồ hoạ
import { avatarSVG, teacherSVG, SKIN, HAIR, SHIRT, STYLES, ACCS } from './avatar.js';
import * as S from './sound.js';

const LS = 'lophocvui-denxanh';
const $ = (s) => root.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let root = null, opts = {};
const st = { names: [], called: [], noRepeat: true, voice: true, reds: 2, kids: [], running: false, raf: 0, viVoices: [] };

/* ---------- nhân vật cố định theo tên ---------- */
function lookFor(name) {
  let h = 2166136261;
  for (const ch of name) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  return { skin: Math.floor(r() * SKIN.length), hair: Math.floor(r() * HAIR.length), style: Math.floor(r() * STYLES.length), shirt: Math.floor(r() * SHIRT.length), acc: r() < 0.55 ? 0 : 1 + Math.floor(r() * (ACCS.length - 1)) };
}
function teacherBackSVG() {
  return `<svg viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 170 L26 110 C30 96 44 90 60 90 C76 90 90 96 94 110 L98 170Z" fill="#4a6cc4"/>
    <rect x="54" y="78" width="12" height="14" rx="4" fill="#E9B48C"/>
    <circle cx="31" cy="60" r="6" fill="#F6CBA6"/><circle cx="89" cy="60" r="6" fill="#F6CBA6"/>
    <path d="M28 50 C26 22 94 22 92 50 L96 112 C80 118 40 118 24 112Z" fill="#3b2a20"/>
    <path d="M40 40 q20 -12 40 0" stroke="#5a4232" stroke-width="3" fill="none"/>
  </svg>`;
}

/* ---------- lưu / đọc ---------- */
function load() {
  try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) {}
  st.kids = []; st.running = false;
}
function save() {
  try { localStorage.setItem(LS, JSON.stringify({ names: st.names, called: st.called, noRepeat: st.noRepeat, voice: st.voice, reds: st.reds })); } catch (e) {}
}

/* ---------- giọng đọc tiếng Việt ---------- */
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  st.viVoices = speechSynthesis.getVoices().filter((v) => /^vi/i.test(v.lang))
    .sort((a, b) => (/(natural|online|google)/i.test(a.name) ? 0 : 1) - (/(natural|online|google)/i.test(b.name) ? 0 : 1));
}
function talk(text) {
  caption(text);
  if (!st.voice || !st.viVoices.length) return wait(600);
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = st.viVoices[0]; u.lang = u.voice.lang; u.rate = 1.05; u.onend = fin; u.onerror = fin;
      speechSynthesis.speak(u);
    } catch (e) { fin(); }
    setTimeout(fin, 1500 + text.length * 90);
  });
}
let capT;
function caption(text) {
  const c = $('#dxCap'); c.textContent = '🎙️ ' + text; c.hidden = false;
  clearTimeout(capT); capT = setTimeout(() => (c.hidden = true), 2400 + text.length * 60);
}

/* ---------- dựng giao diện ---------- */
function build() {
  root = document.createElement('div');
  root.className = 'dx'; root.hidden = true;
  root.innerHTML = `<div class="dx-stage" id="dxStage">
    <div class="dx-sky"><div class="sun"></div><div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div></div>
    <div class="dx-fence"></div>
    <div class="dx-ground"></div>
    <div class="dx-finish"><span>ĐÍCH</span></div>
    <div class="dx-startline"><span>XUẤT PHÁT</span></div>
    <div class="dx-tree t1">🌳</div><div class="dx-tree t2">🌳</div>
    <div class="dx-teacher" id="dxTeacher"></div>
    <div class="dx-light" id="dxLight"><div class="lamp red"></div><div class="lamp green"></div></div>
    <div class="dx-field" id="dxField"></div>
    <div class="dx-ret" id="dxRet" hidden></div>
    <div class="dx-banner" id="dxBanner"></div>
    <div class="dx-title">🚦 Đèn Xanh – Đèn Đỏ</div>
    <div class="dx-hud">
      <div class="dx-count" id="dxCount"></div>
      <button class="btn go" id="dxGo">▶ Bắt đầu</button>
      <button class="btn tiny" id="dxEdit">📝 Danh sách</button>
      <button class="btn tiny" id="dxReset">↺ Gọi lại từ đầu</button>
      <button class="btn tiny" id="dxClose">✕ Đóng</button>
    </div>
    <div class="dx-called" id="dxCalled"></div>
    <div class="dx-cap" id="dxCap" hidden></div>
    <div class="dx-card" id="dxCard" hidden></div>
    <div class="dx-setup" id="dxSetup" hidden>
      <h2>📝 Danh sách học sinh</h2>
      <p>Mỗi dòng 1 tên (dán từ Excel/Word cũng được). Tối đa 60 bạn.</p>
      <textarea id="dxNames" spellcheck="false" placeholder="Nguyễn Minh Anh&#10;Trần Bảo Châu&#10;Lê Gia Huy&#10;…"></textarea>
      <div class="dx-row"><span id="dxN">0 bạn</span><button class="btn tiny" id="dxFromClass" hidden>⬇ Lấy tên từ lớp đang chơi</button></div>
      <label><input type="checkbox" id="dxNoRep"> Không gọi lại bạn đã trả bài</label>
      <label><input type="checkbox" id="dxVoice"> 🎙️ Lồng tiếng (tiếng Việt)</label>
      <label>Số lần đèn đỏ mỗi lượt (lần cuối mới bắt người):
        <select id="dxReds"><option value="1">1 – bắt luôn</option><option value="2">2 – hồi hộp</option><option value="3">3 – rất hồi hộp</option></select></label>
      <div class="dx-row end"><button class="btn go" id="dxSave">Vào sân chơi →</button></div>
    </div>
  </div>`;
  document.body.appendChild(root);
  $('#dxGo').onclick = () => play();
  $('#dxEdit').onclick = () => showSetup(true);
  $('#dxReset').onclick = () => { if (confirm('Cho tất cả các bạn vào lại danh sách chờ gọi?')) { st.called = []; save(); layout(); } };
  $('#dxClose').onclick = close;
  $('#dxNames').oninput = () => ($('#dxN').textContent = parseNames($('#dxNames').value).length + ' bạn');
  $('#dxFromClass').onclick = () => {
    const n = opts.getClassNames ? opts.getClassNames() : [];
    if (n.length) { $('#dxNames').value = n.join('\n'); $('#dxNames').oninput(); }
  };
  $('#dxSave').onclick = () => {
    const names = parseNames($('#dxNames').value);
    if (!names.length) { alert('Nhập ít nhất 1 tên nhé.'); return; }
    st.names = names; st.called = st.called.filter((n) => names.includes(n));
    st.noRepeat = $('#dxNoRep').checked; st.voice = $('#dxVoice').checked; st.reds = +$('#dxReds').value;
    save(); showSetup(false); layout();
  };
  addEventListener('resize', () => { if (!root.hidden) fit(); });
  addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') { if (!$('#dxCard').hidden) $('#dxCard').hidden = true; else if (!$('#dxSetup').hidden && st.names.length) showSetup(false); else close(); }
    if ((e.code === 'Space' || e.key === 'Enter') && $('#dxSetup').hidden && $('#dxCard').hidden && !/TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); play(); }
  });
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();
}
function parseNames(t) {
  const seen = new Set();
  return t.split(/\r?\n|\t|;/).map((s) => s.replace(/^\s*\d+[\.\)]\s*/, '').trim()).filter((s) => s && !seen.has(s) && seen.add(s)).slice(0, 60);
}
function fit() {
  const s = Math.min(innerWidth / 1600, innerHeight / 900);
  $('#dxStage').style.transform = `translate(-50%, -50%) scale(${s})`;
}
function showSetup(on) {
  $('#dxSetup').hidden = !on;
  if (on) {
    $('#dxNames').value = st.names.join('\n'); $('#dxNames').oninput();
    $('#dxNoRep').checked = st.noRepeat; $('#dxVoice').checked = st.voice; $('#dxReds').value = String(st.reds);
    const cls = opts.getClassNames ? opts.getClassNames() : [];
    $('#dxFromClass').hidden = !cls.length;
    if (cls.length) $('#dxFromClass').textContent = `⬇ Lấy ${cls.length} tên từ lớp đang chơi`;
    setTimeout(() => $('#dxNames').focus(), 50);
  }
}

/* ---------- sân chơi ---------- */
const FIELD = { x0: 90, x1: 1300, y0: 470, y1: 820, finish: 300 };
function layout() {
  const n = st.names.length;
  const field = $('#dxField'); field.innerHTML = '';
  const perRow = Math.max(4, Math.min(12, Math.ceil(n / Math.ceil(n / 12))));
  const rows = Math.ceil(n / perRow);
  const dx = (FIELD.x1 - FIELD.x0) / perRow, dy = rows > 1 ? Math.min(90, (FIELD.y1 - FIELD.y0) / (rows - 1)) : 0;
  const ytop = FIELD.y1 - dy * (rows - 1);
  st.kids = st.names.map((name, i) => {
    const r = Math.floor(i / perRow), c = i % perRow;
    const inRow = r === rows - 1 ? n - r * perRow : perRow;
    const off = (perRow - inRow) * dx / 2;
    const x = FIELD.x0 + off + dx * (c + 0.5) + (Math.random() - 0.5) * dx * 0.25;
    const y = (rows > 1 ? ytop + dy * r : FIELD.y1) + (Math.random() - 0.5) * 18;
    const el = document.createElement('div');
    el.className = 'kid';
    el.style.left = x - 45 + 'px'; el.style.top = y - 100 + 'px'; el.style.zIndex = Math.round(y);
    el.innerHTML = `<div class="body">${avatarSVG(lookFor(name), 'normal')}<div class="legs"><i></i><i></i></div></div><div class="tag">${esc(name)}</div><div class="sweat">💦</div>`;
    field.appendChild(el);
    return { name, el, x, y, prog: 0, speed: 0 };
  });
  refresh();
}
function refresh() {
  st.kids.forEach((k) => k.el.classList.toggle('done', st.noRepeat && st.called.includes(k.name)));
  const left = st.kids.filter((k) => !(st.noRepeat && st.called.includes(k.name))).length;
  $('#dxCount').innerHTML = st.noRepeat ? `Còn <b>${left}</b>/${st.kids.length} bạn chưa trả bài` : `<b>${st.kids.length}</b> bạn`;
  $('#dxCalled').innerHTML = st.called.length ? `<b>✔ Đã trả bài (${st.called.length})</b>` + st.called.map((n, i) => `<div>${i + 1}. ${esc(n)}</div>`).join('') : '';
  $('#dxGo').disabled = st.running || !left;
}
function setLight(c) {
  $('#dxLight').className = 'dx-light ' + c;
  $('#dxTeacher').innerHTML = c === 'green' ? teacherBackSVG() : teacherSVG();
  $('#dxTeacher').classList.toggle('front', c !== 'green');
}
function banner(text, cls) {
  const b = $('#dxBanner'); b.className = 'dx-banner'; void b.offsetWidth;
  b.textContent = text; b.className = 'dx-banner show ' + cls;
}
function walk(ms) {
  const active = st.kids.filter((k) => !k.el.classList.contains('done'));
  active.forEach((k) => { k.speed = 14 + Math.random() * 34; k.el.classList.add('walking'); });
  return new Promise((res) => {
    let last = performance.now(); const end = last + ms;
    const step = (t) => {
      const dt = (t - last) / 1000; last = t;
      active.forEach((k) => {
        k.prog = Math.min(k.y - 100 - FIELD.finish + 40, k.prog + k.speed * dt);
        k.el.style.transform = `translateY(${-k.prog}px)`;
      });
      if (t < end) st.raf = requestAnimationFrame(step);
      else { active.forEach((k) => k.el.classList.remove('walking')); res(); }
    };
    st.raf = requestAnimationFrame(step);
  });
}
function backToStart() {
  st.kids.forEach((k) => { k.prog = 0; k.el.classList.add('back'); k.el.style.transform = ''; k.el.classList.remove('caught'); });
  setTimeout(() => st.kids.forEach((k) => k.el.classList.remove('back')), 900);
}

async function scan(target, hops) {
  const ret = $('#dxRet'); ret.hidden = false;
  const pool = st.kids.filter((k) => !k.el.classList.contains('done'));
  const place = (k) => { const r = k.el.getBoundingClientRect(), s = $('#dxStage').getBoundingClientRect(), sc = s.width / 1600; ret.style.left = (r.left - s.left) / sc + r.width / sc / 2 - 60 + 'px'; ret.style.top = (r.top - s.top) / sc + 20 + 'px'; };
  for (let i = 0; i < hops; i++) {
    place(i === hops - 1 && target ? target : pick(pool));
    S.blip();
    await wait(70 + Math.pow(i / hops, 2.2) * 420);
  }
  if (!target) { await wait(300); ret.hidden = true; }
}

async function play() {
  if (st.running) return;
  const pool = st.kids.filter((k) => !(st.noRepeat && st.called.includes(k.name)));
  if (!pool.length) { talk('Cả lớp đã trả bài hết rồi!'); return; }
  S.unlock();
  st.running = true; refresh();
  $('#dxCard').hidden = true;
  for (let round = 1; round <= st.reds; round++) {
    setLight('green'); S.turn();
    banner('ĐÈN XANH', 'green');
    talk(round === 1 ? 'Đèn xanh! Đi nào!' : 'Đèn xanh!');
    const d = S.melody();
    await walk(d * 1000 + 600 + Math.random() * 1600);
    if (root.hidden) return;
    setLight('red'); S.turn();
    banner('ĐÈN ĐỎ!', 'red');
    await talk('Đèn đỏ! Đứng im!');
    if (root.hidden) return;
    S.drumroll(round === st.reds ? 2.2 : 1.2);
    if (round < st.reds) {
      await scan(null, 9);
      await talk(pick(['Không ai cử động. Đi tiếp nào!', 'Giỏi lắm, cả lớp đứng im. Tiếp tục!']));
    }
  }
  const chosen = pick(pool);
  await scan(chosen, 18);
  if (root.hidden) return;
  chosen.el.classList.add('caught'); S.buzzer();
  banner('BẮT ĐƯỢC RỒI!', 'red');
  await talk(`Bắt được rồi! ${chosen.name} vừa cử động. Mời ${chosen.name} lên trả bài!`);
  showCard(chosen);
}
function showCard(k) {
  const c = $('#dxCard');
  c.innerHTML = `<div class="dx-card-in">
      <div class="lab">🚨 Bắt được bạn đang cử động!</div>
      ${avatarSVG(lookFor(k.name), 'think')}
      <div class="nm">${esc(k.name)}</div>
      <div class="sub">Mời bạn lên bảng trả bài 📖</div>
      <div class="btns">
        <button class="btn go" data-a="done">✔ Đã trả bài</button>
        <button class="btn warn" data-a="again">🎲 Chọn bạn khác</button>
        <button class="btn ghost" data-a="close">Để sau</button>
      </div></div>`;
  c.hidden = false;
  c.onclick = (e) => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    c.hidden = true; $('#dxRet').hidden = true;
    if (a === 'done') { if (!st.called.includes(k.name)) st.called.push(k.name); save(); S.ding(); }
    setLight('green'); $('#dxBanner').className = 'dx-banner';
    backToStart(); st.running = false; refresh();
    if (a === 'again') { st.running = false; setTimeout(play, 950); }
  };
}

/* ---------- mở / đóng ---------- */
export function openDenXanh(o = {}) {
  opts = o;
  if (!root) { build(); load(); }
  root.hidden = false; document.body.classList.add('dx-open');
  fit(); setLight('green'); $('#dxBanner').className = 'dx-banner';
  if (!st.names.length) { layout(); showSetup(true); }
  else { showSetup(false); layout(); }
}
function close() {
  cancelAnimationFrame(st.raf); try { speechSynthesis.cancel(); } catch (e) {}
  st.running = false; root.hidden = true; document.body.classList.remove('dx-open');
}
window.__denxanh = { st, play };

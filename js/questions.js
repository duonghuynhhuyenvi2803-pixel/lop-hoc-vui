// ==== CÁC DẠNG CÂU HỎI ====
// Mỗi câu cách nhau 1 dòng trống. Dòng đầu có thể bắt đầu bằng nhãn dạng bài:
//   (không nhãn)  Trắc nghiệm A/B/C/D, đánh dấu * trước đáp án đúng
//   [TF]          Đúng/Sai          → dòng "Answer: True" hoặc "Answer: False"
//   [FILL]        Điền từ (gõ)      → dòng "Answer: since | for"  (nhiều đáp án chấp nhận, ngăn bằng |)
//   [ORDER]       Sắp xếp từ        → viết câu ĐÚNG, máy tự xáo. Muốn ghép cụm thì ngăn bằng " / "
//   [ERROR]       Tìm lỗi sai       → đặt 2–4 phần trong [ngoặc vuông], phần sai có dấu *
//   [LISTEN]      Nghe và chép lại  → viết câu sẽ được đọc; học sinh gõ lại
// Thêm dòng "Time: 30" nếu muốn câu đó dài hơn 20 giây.

export const TYPES = {
  mc: { name: 'Trắc nghiệm', icon: '🔤' },
  tf: { name: 'Đúng / Sai', icon: '⚖️' },
  fill: { name: 'Điền từ', icon: '✍️' },
  order: { name: 'Sắp xếp câu', icon: '🧩' },
  error: { name: 'Tìm lỗi sai', icon: '🔍' },
  listen: { name: 'Nghe & chép', icon: '🎧' },
};
const TAGS = {
  tf: 'tf', 'true/false': 'tf', 'đúng sai': 'tf', 'đúng/sai': 'tf',
  fill: 'fill', 'điền': 'fill', 'điền từ': 'fill', gap: 'fill',
  order: 'order', 'sắp xếp': 'order', reorder: 'order',
  error: 'error', 'tìm lỗi': 'error', 'tìm lỗi sai': 'error', mistake: 'error',
  listen: 'listen', 'nghe': 'listen', dictation: 'listen', 'nghe chép': 'listen',
  mc: 'mc', 'trắc nghiệm': 'mc',
};

export const TEMPLATES = {
  mc: `She ___ to school every day.\nA. go\n*B. goes\nC. going\nD. gone`,
  tf: `[TF] The sun rises in the west.\nAnswer: False`,
  fill: `[FILL] He has lived here ___ 2015.\nAnswer: since`,
  order: `[ORDER] Where are you going this weekend?`,
  error: `[ERROR] She [*have] lived [in] Hanoi [since] she [was] a child.`,
  listen: `[LISTEN] I usually walk to school.`,
};

export const SAMPLE = `She ___ to school by bus every day.
A. go
*B. goes
C. going
D. gone

[TF] "Exhausted" means "very excited".
Answer: False

Look! The children ___ in the garden.
A. play
*B. are playing
C. played
D. have played

[FILL] He has lived in this city ___ 2015.
Answer: since

[ORDER] Where are you going this weekend?

If it rains tomorrow, we ___ at home.
A. stay
*B. will stay
C. would stay
D. stayed

[ERROR] She [*have] lived [in] Hanoi [since] she [was] a child.

[LISTEN] I usually walk to school.

This is the ___ film I have ever seen.
A. good
B. better
*C. best
D. most good

[TF] We use "since" with a point in time, e.g. since Monday.
Answer: True

While I ___ dinner, the phone rang.
A. cooked
*B. was cooking
C. am cooking
D. have cooked

[FILL] I'm looking forward to ___ (see) you soon.
Answer: seeing

[ORDER] My mother / has never been / to / Da Lat / before.

This letter ___ by my grandfather in 1990.
A. wrote
B. was writing
*C. was written
D. has written

[ERROR] Neither Tom nor his friends [*is] [coming] to the party [tonight].

"Break the ice" means ___.
*A. start a conversation
B. break something cold
C. feel very cold
D. stop talking

[LISTEN] She has been learning English for three years.
Time: 30

[TF] "Whose" is used to show possession.
Answer: True

[FILL] By the time we arrived, the train ___ (leave).
Answer: had left | had already left

I wish I ___ speak Chinese fluently.
A. can
*B. could
C. will
D. am able`;

const OPT = /^\s*(\*)?\s*([A-Da-d])\s*[\.\):]\s*(.+?)\s*(\*)?\s*$/;
const ANS = /^\s*(answer|đáp án|key|ans)\s*[:=]\s*(.+?)\s*$/i;
const TIME = /^\s*(time|thời gian)\s*[:=]\s*(\d+)\s*s?\s*$/i;
const TAG = /^\s*\[([^\]]+)\]\s*/;

export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFC')
    .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"')
    .replace(/[.,!?;:"()]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseQuestions(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const questions = [], errors = [];
  blocks.forEach((b, bi) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    let type = 'mc', time = 20, ans = null;
    const tm = lines[0].match(TAG);
    if (tm && TAGS[tm[1].trim().toLowerCase()]) { type = TAGS[tm[1].trim().toLowerCase()]; lines[0] = lines[0].replace(TAG, ''); }
    const qLines = [], options = [];
    let correct = -1;
    for (const line of lines) {
      const t = line.match(TIME); if (t) { time = Math.max(5, Math.min(120, +t[2])); continue; }
      const a = line.match(ANS); if (a) { ans = a[2]; continue; }
      const m = type === 'mc' ? line.match(OPT) : null;
      if (m && qLines.length > 0) { if (m[1] || m[4]) correct = options.length; options.push(m[3]); }
      else if (options.length === 0) qLines.push(line.replace(/^\s*(câu|question|q)?\s*\d+\s*[\.\):]\s*/i, ''));
    }
    const qtext = qLines.join(' ').trim();
    const err = (s) => errors.push(`Câu ${bi + 1} (${TYPES[type].name}): ${s}`);
    if (!qtext) return err('thiếu nội dung');
    const q = { type, text: qtext, time };
    if (type === 'mc') {
      if (ans && correct < 0) correct = 'abcd'.indexOf(ans.trim().toLowerCase()[0]);
      if (options.length < 2) return err('cần ít nhất 2 lựa chọn A/B/…');
      if (correct < 0 || correct >= options.length) return err('chưa đánh dấu đáp án đúng (thêm * trước đáp án)');
      q.options = options.slice(0, 4); q.correct = correct;
    } else if (type === 'tf') {
      const a = norm(ans);
      if (['true', 't', 'đúng', 'dung', 'yes'].includes(a)) q.correct = 0;
      else if (['false', 'f', 'sai', 'no'].includes(a)) q.correct = 1;
      else return err('thêm dòng "Answer: True" hoặc "Answer: False"');
      q.options = ['True', 'False'];
    } else if (type === 'fill') {
      if (!ans) return err('thêm dòng "Answer: ..."');
      q.answers = ans.split('|').map((s) => s.trim()).filter(Boolean);
    } else if (type === 'listen') {
      q.answers = [qtext].concat(ans ? ans.split('|').map((s) => s.trim()).filter(Boolean) : []);
    } else if (type === 'order') {
      const chunks = qtext.includes(' / ') ? qtext.split(' / ').map((s) => s.trim()).filter(Boolean) : qtext.split(/\s+/);
      if (chunks.length < 3) return err('câu cần ít nhất 3 từ/cụm');
      if (chunks.length > 14) return err('câu quá dài (tối đa 14 từ/cụm) – hãy ghép cụm bằng " / "');
      q.chunks = chunks; q.answers = [chunks.join(' ')];
      q.text = chunks.join(' ');
    } else if (type === 'error') {
      const segs = []; let last = 0, cIdx = -1;
      const re = /\[(\*)?([^\]]+?)\]/g; let mm;
      while ((mm = re.exec(qtext))) {
        if (mm.index > last) segs.push({ t: qtext.slice(last, mm.index) });
        if (mm[1]) cIdx = segs.filter((s) => s.p != null).length;
        segs.push({ t: mm[2].trim(), p: segs.filter((s) => s.p != null).length });
        last = re.lastIndex;
      }
      if (last < qtext.length) segs.push({ t: qtext.slice(last) });
      const parts = segs.filter((s) => s.p != null);
      if (parts.length < 2 || parts.length > 4) return err('cần 2–4 phần trong [ngoặc vuông]');
      if (cIdx < 0) return err('đánh dấu phần sai bằng * , ví dụ [*have]');
      q.segs = segs; q.options = parts.map((p) => p.t); q.correct = cIdx;
      q.text = segs.map((s) => s.t).join('');
    }
    questions.push(q);
  });
  return { questions, errors };
}

export function isChoice(q) { return q.type === 'mc' || q.type === 'tf' || q.type === 'error'; }

// Kiểm tra đáp án. v: số (lựa chọn) hoặc chuỗi (gõ / sắp xếp)
export function check(q, v) {
  if (isChoice(q)) return Number(v) === q.correct;
  const n = norm(v);
  return !!n && q.answers.some((a) => norm(a) === n);
}

export function answerLabel(q) {
  if (isChoice(q)) return `${'ABCD'[q.correct]}. ${q.options[q.correct]}`;
  return q.answers[0];
}

// Văn bản để máy đọc ('' = không đọc, ví dụ câu sắp xếp sẽ lộ đáp án)
export function speakText(q, withOptions) {
  const blank = (s) => s.replace(/_{2,}|…|\.{3,}/g, ' blank ').replace(/\(([^)]*)\)/g, ', $1,');
  switch (q.type) {
    case 'order': return '';
    case 'listen': return q.text;
    case 'tf': return 'True or false? ' + blank(q.text);
    case 'error': return 'Find the mistake. ' + q.text;
    case 'fill': return blank(q.text);
    default: {
      let t = blank(q.text);
      if (withOptions) t += '. ' + q.options.map((o, i) => `${'ABCD'[i]}: ${blank(o)}`).join('. ');
      return t;
    }
  }
}

export function shuffleChunks(chunks) {
  const idx = chunks.map((_, i) => i);
  for (let k = 0; k < 20; k++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (idx.some((v, i) => v !== i)) break;
  }
  return idx.map((i) => chunks[i]);
}

// ==== TỰ NHẬN DẠNG BẢN NHÁP ====
// Dán đề nháp (copy từ Word / PDF) → đoán dạng từng câu → chuyển sang cú pháp của ô câu hỏi.
// Nhận biết: câu đánh số (1. / 1) / Câu 1: / Question 1.), đáp án A–D (mỗi dòng hoặc chung một dòng),
// đề bài từng phần ("Choose the best answer", "True or False", "Rearrange…", "Find the mistake", "Read the passage…"),
// bài đọc (đoạn văn dài không đánh số), bảng đáp án ở cuối ("Đáp án / Answer key: 1.B 2.C …").

const NUM = /^\s*(?:câu|cau|question|q|bài|no\.?)?\s*(\d{1,3})\s*[.):\-–]\s*(.*)$/i;
const NUM_STRICT = /^\s*(?:(?:câu|cau|question|q)\s*(\d{1,3})\s*[.):\-–]?|(\d{1,3})\s*[.)])\s*(.*)$/i;
const OPT_LINE = /^\s*(\*)?\s*\(?([A-Da-d])\s*[.)]\s+(.+)$/;
const OPT_SPLIT = /(?:^|\s{1,})(\*?)\(?([A-D])[.)]\s+/g;
const KEY_HEAD = /^\s*(đáp án|dap an|answer key|answers?|key|keys|key to exercises?)\s*[:.\-–]?\s*(.*)$/i;
const INLINE_ANS = /^\s*(?:answer|ans|đáp án|key)\s*[:=]\s*(.+)$|^\s*(?:→|=>|->)\s*(.+)$/i;
const BLANK = /_{2,}|\.{4,}|…{2,}|…\s*…|\(\s*\d*\s*\)\s*_*$/;

const HINTS = [
  ['reading', /(read (the|this|following)|reading (passage|comprehension)|đọc (đoạn|bài|hiểu)|passage)/i],
  ['listen', /(listen|dictation|nghe)/i],
  ['tf', /(true|false|\bT\s*\/\s*F\b|đúng\s*(hay|hoặc|\/)?\s*sai)/i],
  ['order', /(rearrange|re-arrange|reorder|put .*(in|into) (the )?(correct )?order|word order|make (complete )?sentences? (from|using)|sắp xếp)/i],
  ['error', /(mistake|error|incorrect|needs? (correction|correcting)|lỗi sai|tìm lỗi|sửa lỗi)/i],
  ['fill', /(fill|complete|gap|blank|correct form|supply|điền|hoàn thành|dạng đúng)/i],
  ['mc', /(choose|circle|mark the letter|best (answer|option)|khoanh|chọn)/i],
];
const INSTR_START = /^\s*(?:(?:exercise|ex|part|section|task|bài tập|bài|phần|[ivx]{1,4}|[a-h])\s*[\d.:)\-–]*\s*)?(choose|circle|mark|read|write|fill|complete|rearrange|re-arrange|reorder|put|find|identify|listen|decide|give|supply|underline|answer the|use the|chọn|khoanh|đọc|điền|viết|sắp xếp|tìm|nghe|hoàn thành|cho dạng)\b/i;
const SECTION_HEAD = /^\s*(exercise|ex\.|part|section|task|bài tập|phần)\s*[\dIVX]+/i;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const clean = (s) => String(s).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim();

function isInstruction(line) {
  if (NUM_STRICT.test(line) || OPT_LINE.test(line)) return false;
  const w = words(line);
  if (w > 35) return false;
  if (SECTION_HEAD.test(line) || INSTR_START.test(line)) return true;
  if (/:\s*$/.test(line) && w <= 18) return true;
  if (/^\s*[IVX]{1,4}\s*[.)]\s+\S/.test(line) && w <= 12) return true;
  return false;
}
function hintOf(line) {
  for (const [t, re] of HINTS) if (re.test(line)) return t;
  return null;
}

// "1.B 2.C 3. since 4-A" / "1B 2C" / mỗi dòng "1. since" → Map(số → đáp án)
function parseKey(lines) {
  const key = new Map();
  for (let line of lines) {
    line = clean(line);
    if (!line) continue;
    if (/^(\s*\d+\s*[.\-:)]?\s*[A-Da-d]\b[\s,;|]*)+$/.test(line)) {
      for (const m of line.matchAll(/(\d+)\s*[.\-:)]?\s*([A-Da-d])\b/g)) key.set(+m[1], m[2].toUpperCase());
      continue;
    }
    const parts = line.split(/(?=(?:^|[\s,;|])(?:câu\s*)?\d{1,3}\s*[.):\-–]\s*\S)/i).map((x) => x.replace(/^[\s,;|]+/, ''));
    for (const p of parts) {
      const m = p.match(/^(?:câu\s*)?(\d{1,3})\s*[.):\-–]\s*(.+?)\s*[,;|]?\s*$/i);
      if (m) key.set(+m[1], m[2].trim());
    }
  }
  return key;
}

// Tách các lựa chọn nằm chung một dòng: "A. go   B. goes  C. going D. gone"
function splitInlineOptions(text) {
  if ((text.match(/\(\s*[A-D]\s*\)/g) || []).length >= 2 && !/^\s*\(?A[.)]/.test(text)) return null;   // câu tìm lỗi có (A) (B)…
  const hits = [...text.matchAll(OPT_SPLIT)];
  if (hits.length < 2) return null;
  const letters = hits.map((h) => h[2]);
  if (letters[0] !== 'A' || letters.some((l, i) => l !== 'ABCD'[i])) return null;
  const stem = text.slice(0, hits[0].index).trim();
  const opts = hits.map((h, i) => {
    const start = h.index + h[0].length, end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const t = text.slice(start, end).trim();
    return { text: t.replace(/^\*\s*|\s*\*$/g, ''), star: !!h[1] || /^\*|\*$/.test(t) };
  });
  if (opts.some((o) => !o.text)) return null;
  return { stem, opts };
}

export function autoFormat(raw) {
  let lines = String(raw || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ').replace(/\t/g, ' ').replace(/\s+$/, ''));

  // 1) Bảng đáp án cuối bài
  let key = new Map();
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(KEY_HEAD);
    if (m && !NUM_STRICT.test(lines[i]) && i > lines.length * 0.3) {
      key = parseKey([m[2], ...lines.slice(i + 1)]);
      if (key.size) { lines = lines.slice(0, i); break; }
    }
  }

  // 2) Gom thành: đề bài phần / bài đọc / câu hỏi
  const blocks = [];      // {kind:'instr'|'para'|'item', ...}
  let item = null, blankBefore = false;
  const anyNumbered = lines.some((l) => NUM_STRICT.test(l));
  const pushItem = () => { if (item) blocks.push(item); item = null; };
  for (const rawLine of lines) {
    const line = clean(rawLine);
    if (!line) { blankBefore = true; if (!anyNumbered) pushItem(); continue; }
    const nm = line.match(NUM_STRICT);
    if (nm && !(item && item.opts.length === 0 && OPT_LINE.test(line))) {
      pushItem();
      item = { kind: 'item', no: +(nm[1] || nm[2]), stem: [nm[3] || ''], opts: [], ans: null };
      const inl = splitInlineOptions(item.stem[0]);
      if (inl) { item.stem = [inl.stem]; item.opts = inl.opts; }
      blankBefore = false; continue;
    }
    if (isInstruction(line) && !(item && !blankBefore && item.opts.length === 0 && !hintOf(line))) {
      pushItem(); blocks.push({ kind: 'instr', text: line, hint: hintOf(line) });
      blankBefore = false; continue;
    }
    const ia = line.match(INLINE_ANS);
    if (ia && item) { item.ans = clean(ia[1] || ia[2]); blankBefore = false; continue; }
    const om = line.match(OPT_LINE);
    if (om && item && (item.opts.length || item.stem.join('').trim())) {
      const inl = splitInlineOptions(line);
      if (inl && !inl.stem) item.opts.push(...inl.opts);
      else item.opts.push({ text: om[3].replace(/^\*\s*|\s*\*\s*$/g, '').trim(), star: !!om[1] || /^\*|\*\s*$/.test(om[3]) });
      blankBefore = false; continue;
    }
    // dòng chữ không đánh số
    if (anyNumbered) {
      const long = words(line) >= 18;
      if (item && !blankBefore && item.opts.length === 0 && !long) { item.stem.push(line); continue; }
      if (item && !blankBefore && item.opts.length === 0 && long && words(item.stem.join(' ')) < 6) { item.stem.push(line); continue; }
      pushItem(); blocks.push({ kind: 'para', text: line, gap: blankBefore });
    } else {
      // không đánh số: mỗi khối cách dòng trống là một câu
      if (!item) item = { kind: 'item', no: null, stem: [], opts: [], ans: null };
      const inl = splitInlineOptions(line);
      if (inl) { if (inl.stem) item.stem.push(inl.stem); item.opts.push(...inl.opts); }
      else item.stem.push(line);
    }
    blankBefore = false;
  }
  pushItem();

  // 3) Ghép đoạn văn liền nhau thành bài đọc (đoạn ≥ 40 từ, hoặc ngay sau đề bài "Read…")
  const seq = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'para') { seq.push(b); continue; }
    const prev = seq[seq.length - 1];
    if (prev && prev.kind === 'passage' && !prev.closed) { prev.paras.push(b.text); continue; }
    seq.push({ kind: 'passage', paras: [b.text], title: '' });
  }
  for (let i = 0; i < seq.length; i++) {
    const b = seq[i];
    if (b.kind !== 'passage') continue;
    const total = words(b.paras.join(' '));
    const afterRead = seq.slice(0, i).reverse().find((x) => x.kind !== 'passage');
    const readHint = afterRead && afterRead.kind === 'instr' && afterRead.hint === 'reading';
    if (total < 40 && !readHint) { b.kind = 'note'; continue; }
    if (b.paras.length > 1 && words(b.paras[0]) <= 10 && !/[.!?]$/.test(b.paras[0])) b.title = b.paras.shift();
  }

  // 4) Chuyển từng câu
  const out = [], report = [];
  let hint = null, inPassage = null, n = 0;
  const closePassage = () => { if (inPassage) { out.push('[END READING]'); inPassage = null; } };
  for (const b of seq) {
    if (b.kind === 'instr') {
      if (b.hint !== 'reading' || inPassage) closePassage();
      hint = b.hint && b.hint !== 'reading' ? b.hint : (b.hint === 'reading' ? 'mc' : hint);
      report.push({ kind: 'instr', text: b.text });
      continue;
    }
    if (b.kind === 'note') { report.push({ kind: 'skip', text: b.paras.join(' ') }); continue; }
    if (b.kind === 'passage') {
      closePassage();
      const title = b.title || 'Reading ' + (out.filter((l) => l.startsWith('[READING]')).length + 1);
      out.push(`[READING] ${title}`, b.paras.join('\n\n'), '[QUESTIONS]');
      inPassage = { title };
      report.push({ kind: 'passage', title, words: words(b.paras.join(' ')) });
      continue;
    }
    n++;
    const r = convertItem(b, key, hint);
    r.no = b.no ?? n;
    r.passage = inPassage ? inPassage.title : null;
    out.push(r.text);
    report.push({ kind: 'q', ...r });
  }
  closePassage();

  // Mỗi câu cách 1 dòng trống; bài đọc giữ nguyên
  return { text: out.join('\n\n').replace(/\n\n\[QUESTIONS\]/g, '\n[QUESTIONS]').replace(/\n\n\[END READING\]/g, '\n[END READING]'), report, keySize: key.size };
}

function convertItem(b, key, hint) {
  let stem = clean(b.stem.join(' '));
  const opts = b.opts;
  let ans = b.ans || (b.no != null && key.get(b.no)) || null;
  const warn = [];
  // ghi chú cuối câu kiểu "(T/F)"
  if (/\(\s*T\s*\/\s*F\s*\)|\(\s*true\s*\/\s*false\s*\)/i.test(stem)) { hint = 'tf'; stem = stem.replace(/\(\s*(T\s*\/\s*F|true\s*\/\s*false)\s*\)/i, '').trim(); }
  const letterOf = (a) => {
    if (!a) return -1;
    const m = String(a).trim().match(/^\(?([A-Da-d])\)?(?:[.)]|\s|$)/);
    if (m) return 'ABCD'.indexOf(m[1].toUpperCase());
    const i = opts.findIndex((o) => o.text.toLowerCase() === String(a).trim().toLowerCase());
    return i;
  };

  // --- có lựa chọn ---
  if (opts.length >= 2) {
    let correct = opts.findIndex((o) => o.star);
    if (correct < 0) correct = letterOf(ans);
    const isTF = opts.length === 2 && /^(true|t|đúng)$/i.test(opts[0].text) && /^(false|f|sai)$/i.test(opts[1].text);
    if (isTF) {
      if (correct < 0) warn.push('no answer – add "Answer: True/False"');
      return { type: 'tf', text: `[TF] ${stem}\nAnswer: ${correct === 1 ? 'False' : correct === 0 ? 'True' : '?'}`, warn };
    }
    // tìm lỗi sai: các lựa chọn nằm trong câu theo đúng thứ tự
    const marked = /\(\s*[A-D]\s*\)/.test(stem);
    if (hint === 'error' || marked) {
      const conv = toErrorSyntax(stem, opts, correct);
      if (conv) { if (correct < 0) warn.push('no answer – put * before the wrong part, e.g. [*have]'); return { type: 'error', text: `[ERROR] ${conv}`, warn }; }
    }
    if (correct < 0) warn.push('no correct option – put * before it');
    const L = opts.slice(0, 4).map((o, i) => `${i === correct ? '*' : ''}${'ABCD'[i]}. ${o.text}`);
    if (opts.length > 4) warn.push('only the first 4 options were kept');
    return { type: 'mc', text: `${stem}\n${L.join('\n')}`, warn };
  }

  // --- không có lựa chọn ---
  const tfAns = ans && /^(t|f|true|false|đúng|sai|d|s)$/i.test(ans.trim());
  if (hint === 'tf' || tfAns) {
    const a = ans ? (/^(t|true|đúng|d)$/i.test(ans.trim()) ? 'True' : /^(f|false|sai|s)$/i.test(ans.trim()) ? 'False' : null) : null;
    if (!a) warn.push('no answer – write True or False');
    return { type: 'tf', text: `[TF] ${stem}\nAnswer: ${a || '?'}`, warn };
  }
  const slashes = (stem.match(/\//g) || []).length;
  if (hint === 'order' || slashes >= 2) {
    const chunks = stem.split('/').map((c) => c.trim()).filter((c) => /[\p{L}\p{N}]/u.test(c)).join(' / ');
    if (!ans) { warn.push('no answer sentence – the chunks will be treated as already in the correct order'); return { type: 'order', text: `[ORDER] ${chunks}`, warn }; }
    return { type: 'order', text: `[ORDER] ${chunks}\nAnswer: ${ans}`, warn };
  }
  if (hint === 'listen') return { type: 'listen', text: `[LISTEN] ${ans || stem}`, warn };
  if (BLANK.test(stem) || hint === 'fill' || ans) {
    const s2 = stem.replace(/\.{4,}|…{2,}|…\s*…/g, '___');
    const a = ans ? ans.replace(/\s+\/\s+|\s+or\s+|\s*;\s*/gi, ' | ') : null;
    if (!a) warn.push('no answer – add "Answer: ..."');
    return { type: 'fill', text: `[FILL] ${s2}\nAnswer: ${a || '?'}`, warn };
  }
  warn.push('could not tell the type – check this one');
  return { type: '?', text: stem, warn };
}

// Câu + lựa chọn A–D → "She [*have] lived [in] Hanoi…"
function toErrorSyntax(stem, opts, correct) {
  let s = stem.replace(/\s*\(\s*[A-D]\s*\)/g, '').replace(/\s{2,}/g, ' ');
  if (opts.length < 2 || opts.length > 4) return null;
  let out = '', pos = 0;
  for (let i = 0; i < opts.length; i++) {
    const t = opts[i].text.replace(/[.,;]$/, '');
    const re = new RegExp('(^|[^\\p{L}\\p{N}])(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^\\p{L}\\p{N}])', 'iu');
    const m = s.slice(pos).match(re);
    if (!m) return null;
    const start = pos + m.index + m[1].length;
    out += s.slice(pos, start) + `[${i === correct ? '*' : ''}${s.substr(start, m[2].length)}]`;
    pos = start + m[2].length;
  }
  return out + s.slice(pos);
}

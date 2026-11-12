// Định dạng bộ câu hỏi (mỗi câu cách nhau 1 dòng trống):
//   She ___ to school every day.
//   A. go
//   *B. goes        <- dấu * đánh dấu đáp án đúng (hoặc thêm dòng "Answer: B")
//   C. going
//   D. gone
export const SAMPLE = `She ___ to school by bus every day.
A. go
*B. goes
C. going
D. gone

Look! The children ___ in the garden.
A. play
*B. are playing
C. played
D. have played

I ___ my homework yet.
A. don't finish
B. didn't finish
*C. haven't finished
D. am not finishing

If it rains tomorrow, we ___ at home.
A. stay
*B. will stay
C. would stay
D. stayed

This is the ___ film I have ever seen.
A. good
B. better
*C. best
D. most good

He has lived in this city ___ 2015.
A. for
*B. since
C. from
D. in

Which word means "very tired"?
*A. exhausted
B. excited
C. amazed
D. annoyed

The opposite of "generous" is ___.
A. kind
*B. mean
C. brave
D. honest

While I ___ dinner, the phone rang.
A. cooked
*B. was cooking
C. am cooking
D. have cooked

You ___ wear a helmet when you ride a motorbike.
*A. must
B. mustn't
C. needn't
D. can't

This letter ___ by my grandfather in 1990.
A. wrote
B. was writing
*C. was written
D. has written

I'm looking forward to ___ you soon.
A. see
*B. seeing
C. saw
D. be seen

She asked me where I ___.
A. live
*B. lived
C. am living
D. will live

"Break the ice" means ___.
*A. start a conversation
B. break something cold
C. feel very cold
D. stop talking

Neither Tom nor his friends ___ coming to the party.
A. is
*B. are
C. was
D. has

He is used to ___ up early.
A. get
B. got
*C. getting
D. gets

The man ___ car was stolen called the police.
A. who
B. which
*C. whose
D. whom

Choose the correct spelling.
*A. necessary
B. neccessary
C. necesary
D. neccesary

By the time we arrived, the train ___.
A. leaves
B. has left
*C. had left
D. was leaving

I wish I ___ speak Chinese fluently.
A. can
*B. could
C. will
D. am able`;

const OPT = /^\s*(\*)?\s*([A-Da-d])\s*[\.\):]\s*(.+?)\s*(\*)?\s*$/;
const ANS = /^\s*(answer|đáp án|key|ans)\s*[:=]\s*([A-Da-d])\s*$/i;

export function parseQuestions(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const questions = [], errors = [];
  blocks.forEach((b, bi) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const qLines = [], options = [];
    let correct = -1;
    for (const line of lines) {
      const a = line.match(ANS);
      if (a) { correct = 'abcd'.indexOf(a[2].toLowerCase()); continue; }
      const m = line.match(OPT);
      if (m && (options.length > 0 || qLines.length > 0)) {
        if (m[1] || m[4]) correct = options.length;
        options.push(m[3]);
      } else if (options.length === 0) {
        qLines.push(line.replace(/^\s*(câu|question|q)?\s*\d+\s*[\.\):]\s*/i, ''));
      }
    }
    const qtext = qLines.join(' ').trim();
    if (!qtext) errors.push(`Câu ${bi + 1}: thiếu nội dung câu hỏi`);
    else if (options.length < 2) errors.push(`Câu ${bi + 1}: cần ít nhất 2 lựa chọn A/B/...`);
    else if (correct < 0 || correct >= options.length) errors.push(`Câu ${bi + 1}: chưa đánh dấu đáp án đúng (thêm * trước đáp án)`);
    else questions.push({ text: qtext, options: options.slice(0, 4), correct });
  });
  return { questions, errors };
}

export function speakText(q, withOptions) {
  const blank = (s) => s.replace(/_{2,}|…|\.{3,}/g, ' blank ');
  let t = blank(q.text);
  if (withOptions) t += '. ' + q.options.map((o, i) => `${'ABCD'[i]}: ${blank(o)}`).join('. ');
  return t;
}

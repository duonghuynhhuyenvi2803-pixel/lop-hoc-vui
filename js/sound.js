// Âm thanh tổng hợp bằng WebAudio (không cần file mp3)
let ctx = null;
export let muted = false;
export function setMuted(v) { muted = v; }
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlock() { try { ac(); } catch (e) {} }

function tone(freq, start, dur, type = 'sine', vol = 0.2) {
  if (muted) return;
  const c = ac(), o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(start, dur, vol = 0.15) {
  if (muted) return;
  const c = ac(), len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900;
  s.buffer = buf; g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(c.currentTime + start);
}

export const pop = () => { tone(660, 0, 0.09, 'triangle', 0.15); tone(990, 0.06, 0.12, 'triangle', 0.12); };
export const tick = (urgent) => tone(urgent ? 1000 : 760, 0, 0.06, 'square', 0.05);
export const ding = () => { tone(1046, 0, 0.5, 'sine', 0.18); tone(1568, 0.02, 0.6, 'sine', 0.08); };
export const timeUp = () => { tone(392, 0, 0.18, 'sawtooth', 0.08); tone(262, 0.18, 0.35, 'sawtooth', 0.08); };
export const reveal = () => { [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.25, 'triangle', 0.15)); };
export const shuffle = () => { for (let i = 0; i < 6; i++) tone(300 + i * 80, i * 0.07, 0.08, 'triangle', 0.07); };
export const drumroll = (sec = 1.4) => { for (let t = 0; t < sec; t += 0.05) noise(t, 0.05, 0.05 + 0.1 * t / sec); };
export const fanfare = () => {
  const n = [[523, 0, .18], [523, .2, .18], [523, .4, .18], [698, .6, .7], [880, 1.35, .25], [784, 1.6, .25], [880, 1.85, .25], [1046, 2.1, 1.1]];
  n.forEach(([f, s, d]) => { tone(f, s, d, 'triangle', 0.16); tone(f / 2, s, d, 'sine', 0.08); });
};
export const cymbal = () => noise(0, 1.2, 0.25);

// Nhân vật học sinh chibi vẽ bằng SVG
export const SKIN = ['#FFE3CC', '#F7CBA4', '#E2AA7C', '#B97F55'];
export const HAIR = ['#2B2118', '#5A3A22', '#A0582F', '#E7B44A', '#C0392B', '#6C5CE7', '#1F4E79', '#F28AB2'];
export const SHIRT = ['#E74C3C', '#3498DB', '#27AE60', '#F39C12', '#8E44AD', '#16A085', '#E84393', '#2C3E50'];
export const STYLES = ['Tóc ngắn', 'Tóc dài', 'Buộc 2 bên', 'Búi tóc', 'Tóc xù'];
export const ACCS = ['Không', 'Kính', 'Nơ', 'Mũ lưỡi trai'];

export function randomLook() {
  const r = (n) => Math.floor(Math.random() * n);
  return { skin: r(SKIN.length), hair: r(HAIR.length), style: r(STYLES.length), shirt: r(SHIRT.length), acc: Math.random() < 0.55 ? 0 : 1 + r(ACCS.length - 1) };
}

export function sanitizeLook(l) {
  const c = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
  l = l || {};
  return { skin: c(l.skin, SKIN.length), hair: c(l.hair, HAIR.length), style: c(l.style, STYLES.length), shirt: c(l.shirt, SHIRT.length), acc: c(l.acc, ACCS.length) };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// mood: normal | think | done | happy | sad | star
export function avatarSVG(look, mood = 'normal', extraClass = '') {
  const L = sanitizeLook(look);
  const skin = SKIN[L.skin], hair = HAIR[L.hair], shirt = SHIRT[L.shirt];
  const hairD = shade(hair, -25), skinD = shade(skin, -28), shirtD = shade(shirt, -35);
  let back = '', front = '';
  switch (L.style) {
    case 0: // short
      front = `<path d="M24 47 C22 22 40 14 52 15 C68 15 80 25 76 47 C73 36 66 31 58 32 C52 36 40 37 30 34 C27 38 25 42 24 47Z" fill="${hair}"/>`;
      break;
    case 1: // long
      back = `<path d="M22 44 C20 20 80 20 78 44 L81 86 C70 92 30 92 19 86Z" fill="${hairD}"/>`;
      front = `<path d="M23 50 C20 22 40 13 51 14 C66 14 82 24 77 50 C74 38 68 30 60 29 C54 35 41 38 33 35 C28 40 25 44 23 50Z" fill="${hair}"/>`;
      break;
    case 2: // pigtails
      back = `<circle cx="17" cy="52" r="11" fill="${hairD}"/><circle cx="83" cy="52" r="11" fill="${hairD}"/>
              <rect x="22" y="41" width="5" height="9" rx="2" fill="#FF6B9A"/><rect x="73" y="41" width="5" height="9" rx="2" fill="#FF6B9A"/>`;
      front = `<path d="M24 47 C22 21 40 14 51 14 C66 14 80 23 76 47 C73 35 63 29 50 31 C38 29 28 35 24 47Z" fill="${hair}"/>
               <path d="M50 16 L50 30" stroke="${hairD}" stroke-width="1.5"/>`;
      break;
    case 3: // bun
      back = `<circle cx="50" cy="13" r="11" fill="${hairD}"/>`;
      front = `<path d="M24 47 C22 22 38 17 51 17 C66 17 80 24 76 47 C72 37 62 31 50 31 C38 31 28 37 24 47Z" fill="${hair}"/>`;
      break;
    default: // messy
      front = `<path d="M23 48 L20 34 L28 34 L25 22 L35 26 L37 13 L46 21 L52 10 L57 21 L67 13 L67 26 L77 23 L73 34 L81 35 L77 48 C73 37 63 32 50 33 C38 32 28 37 23 48Z" fill="${hair}"/>`;
  }
  let eyes, mouth, brows = '';
  const eyeY = 50;
  if (mood === 'happy' || mood === 'star') {
    eyes = `<path d="M36 ${eyeY + 1} q5 -6 10 0" stroke="#2d2230" stroke-width="2.6" fill="none" stroke-linecap="round"/>
            <path d="M54 ${eyeY + 1} q5 -6 10 0" stroke="#2d2230" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M42 60 q8 10 16 0 z" fill="#8B2635"/><path d="M45 63 q5 3 10 0" fill="#FF8FA3"/>`;
  } else if (mood === 'sad') {
    eyes = `<ellipse cx="41" cy="${eyeY + 1}" rx="2.8" ry="3.2" fill="#2d2230"/><ellipse cx="59" cy="${eyeY + 1}" rx="2.8" ry="3.2" fill="#2d2230"/>`;
    brows = `<path d="M36 43 l9 -3" stroke="${hairD}" stroke-width="2" stroke-linecap="round"/><path d="M64 43 l-9 -3" stroke="${hairD}" stroke-width="2" stroke-linecap="round"/>`;
    mouth = `<path d="M44 64 q6 -5 12 0" stroke="#8B2635" stroke-width="2.4" fill="none" stroke-linecap="round"/>
             <path d="M64 54 q2 5 0 7 q-3 -2 0 -7z" fill="#7EC8F2"/>`;
  } else if (mood === 'think') {
    eyes = `<ellipse cx="42" cy="${eyeY - 1}" rx="3" ry="3.6" fill="#2d2230"/><ellipse cx="60" cy="${eyeY - 1}" rx="3" ry="3.6" fill="#2d2230"/>
            <circle cx="43" cy="${eyeY - 2.5}" r="1" fill="#fff"/><circle cx="61" cy="${eyeY - 2.5}" r="1" fill="#fff"/>`;
    mouth = `<ellipse cx="52" cy="62" rx="2.6" ry="2.2" fill="#8B2635"/>`;
    brows = `<path d="M37 42 q4 -3 9 -1" stroke="${hairD}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    eyes = `<ellipse cx="41" cy="${eyeY}" rx="3" ry="3.7" fill="#2d2230"/><ellipse cx="59" cy="${eyeY}" rx="3" ry="3.7" fill="#2d2230"/>
            <circle cx="42" cy="${eyeY - 1.5}" r="1.1" fill="#fff"/><circle cx="60" cy="${eyeY - 1.5}" r="1.1" fill="#fff"/>`;
    mouth = mood === 'done'
      ? `<path d="M44 60 q6 6 12 0" stroke="#8B2635" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : `<path d="M45 60 q5 4 10 0" stroke="#8B2635" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  }
  let acc = '';
  if (L.acc === 1) acc = `<g fill="none" stroke="#333" stroke-width="1.8"><circle cx="41" cy="50" r="7"/><circle cx="59" cy="50" r="7"/><path d="M48 50 h4"/></g>`;
  if (L.acc === 2) acc = `<g transform="translate(68 22)"><path d="M0 0 l-9 -6 v12z M0 0 l9 -6 v12z" fill="#FF4F81"/><circle r="3" fill="#E0306A"/></g>`;
  if (L.acc === 3) acc = `<path d="M24 36 C24 16 76 16 76 36 Z" fill="${shirt}"/><path d="M24 36 h-10 q2 -4 10 -5z" fill="${shirtD}"/><circle cx="50" cy="19" r="2.5" fill="${shirtD}"/>`;
  const star = mood === 'star' ? `<g fill="#FFD43B" stroke="#E0A800" stroke-width="1"><path d="M84 12 l2.5 6 6.5 .5 -5 4 1.5 6.5 -5.5 -3.5 -5.5 3.5 1.5 -6.5 -5 -4 6.5 -.5z"/></g>` : '';
  return `<svg class="ava ${extraClass}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    ${back}
    <path d="M18 100 C18 82 30 74 50 74 C70 74 82 82 82 100Z" fill="${shirt}"/>
    <path d="M42 74 L50 84 L58 74Z" fill="#fff"/>
    <rect x="45" y="66" width="10" height="10" rx="3" fill="${skinD}"/>
    <circle cx="25" cy="52" r="5" fill="${skin}"/><circle cx="75" cy="52" r="5" fill="${skin}"/>
    <ellipse cx="50" cy="47" rx="26" ry="25" fill="${skin}"/>
    <ellipse cx="34" cy="58" rx="4.5" ry="2.8" fill="#FF9AA8" opacity=".55"/><ellipse cx="66" cy="58" rx="4.5" ry="2.8" fill="#FF9AA8" opacity=".55"/>
    ${eyes}${brows}${mouth}
    ${front}${acc}${star}
  </svg>`;
}

export function teacherSVG() {
  return `<svg viewBox="0 0 120 170" xmlns="http://www.w3.org/2000/svg">
    <path d="M28 50 C26 22 94 22 92 50 L96 112 C80 118 40 118 24 112Z" fill="#3b2a20"/>
    <path d="M22 170 L26 110 C30 96 44 90 60 90 C76 90 90 96 94 110 L98 170Z" fill="#5B7FD6"/>
    <path d="M50 90 L60 104 L70 90Z" fill="#fff"/>
    <rect x="54" y="78" width="12" height="14" rx="4" fill="#E9B48C"/>
    <ellipse cx="60" cy="58" rx="28" ry="28" fill="#F6CBA6"/>
    <path d="M32 58 C28 28 50 22 62 23 C80 24 94 36 88 60 C84 44 74 38 62 40 C50 42 40 44 32 58Z" fill="#3b2a20"/>
    <g fill="none" stroke="#222" stroke-width="2"><circle cx="50" cy="62" r="8"/><circle cx="70" cy="62" r="8"/><path d="M58 62 h4"/></g>
    <circle cx="50" cy="62" r="2.6" fill="#222"/><circle cx="70" cy="62" r="2.6" fill="#222"/>
    <path d="M52 75 q8 6 16 0" stroke="#8B2635" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="42" cy="72" rx="4" ry="2.5" fill="#FF9AA8" opacity=".5"/><ellipse cx="78" cy="72" rx="4" ry="2.5" fill="#FF9AA8" opacity=".5"/>
    <path d="M94 120 L118 70" stroke="#8B5A2B" stroke-width="4" stroke-linecap="round"/>
    <circle cx="94" cy="122" r="7" fill="#F6CBA6"/>
  </svg>`;
}

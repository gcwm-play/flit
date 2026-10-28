// Characters: an animal family. Until custom art is added, each animal is drawn
// as pixel art in code, as a 4-frame walk cycle facing right (the game mirrors
// it to walk left).
//
// Custom art: put PNG walk sheets (4 frames side by side, each frame square)
// in assets/sprites/ named {animal}-{stage}-walk.png, and optionally
// {animal}-{stage}-she-walk.png for female family members. Any file that is
// missing falls back to the drawing below. See assets/sprites/README.md.
export const ANIMALS = {
  capybara: { label: 'Capybara', fur: '#c48f5c', shade: '#a2703f', light: '#ddb07e', ear: '#8a5a33' },
  cat: { label: 'Cat', fur: '#f2a54e', shade: '#d4842f', light: '#fde6c4', ear: '#f7a9b8' },
  unicorn: { label: 'Unicorn', fur: '#fbf7ff', shade: '#ddd3ee', light: '#ffe3ef', ear: '#f7c4d8' },
  dog: { label: 'Dog', fur: '#ecc48f', shade: '#cfa46d', light: '#fff4e3', ear: '#9a6438' },
  frog: { label: 'Frog', fur: '#82c96d', shade: '#5ea64e', light: '#f2eea4', ear: '#5ea64e' },
};

export const GENDERS = { male: 'He', female: 'She' };

export const OUTFITS = ['#e2574c', '#3f7fd9', '#3a9d5d', '#e0a23a', '#9a5bd1', '#2f9fb0'];

export const FRAMES = 4;
const F = 32; // each frame is F x F pixels
const BASE = 30; // the row the feet stand on
const OUTLINE = '#3b2a3a';
const EYE = '#2b1d2a';
const CHEEK = '#ff9fb2';
const MANE = ['#ffadc8', '#ffd1a1', '#b8f0cf', '#cdb8ff'];

// Body proportions for each life stage, in pixels.
const SIZES = {
  baby: { head: 9, hw: 11, body: 4, bw: 7, legs: 2 },
  child: { head: 10, hw: 12, body: 5, bw: 8, legs: 3 },
  teen: { head: 10, hw: 12, body: 7, bw: 9, legs: 4 },
  adult: { head: 11, hw: 13, body: 8, bw: 10, legs: 4 },
  senior: { head: 11, hw: 13, body: 7, bw: 10, legs: 4 },
};

export function lookOf(person, stage) {
  return { stage, animal: ANIMALS[person.animal] ? person.animal : 'capybara', gender: person.gender || 'female', outfit: person.outfit ?? 0 };
}

const cache = new Map();

// The drawn walk sheet (FRAMES frames side by side) for a look, as an image URL.
export function sheetSrc({ stage, animal, gender, outfit }) {
  const key = `${stage}|${animal}|${gender}|${outfit}`;
  if (!cache.has(key)) cache.set(key, drawSheet(stage, animal, gender === 'female', outfit));
  return cache.get(key);
}

// Custom PNGs are looked for once. Elements on screen switch over as soon as one loads.
const art = new Map(); // url -> 'loading' | 'ok' | 'missing'
function probe(url) {
  if (!art.has(url)) {
    art.set(url, 'loading');
    const img = new Image();
    img.onload = () => {
      art.set(url, 'ok');
      document.querySelectorAll('[data-art]').forEach((el) => {
        const src = customSrc(JSON.parse(el.dataset.art));
        if (src) el.style.setProperty('--sheet', `url("${src}")`);
      });
      document.querySelectorAll('[data-item]').forEach((el) => {
        if (probe(itemUrl(el.dataset.item))) el.innerHTML = itemHtml({ id: el.dataset.item });
      });
    };
    img.onerror = () => art.set(url, 'missing');
    img.src = url;
  }
  return art.get(url) === 'ok';
}

function customSrc({ stage, animal, gender }) {
  const base = `assets/sprites/${animal}-${stage}`;
  if (gender === 'female' && probe(`${base}-she-walk.png`)) return `${base}-she-walk.png`;
  return probe(`${base}-walk.png`) ? `${base}-walk.png` : '';
}

// A shop item: custom art if there is a PNG for it, otherwise its emoji.
const itemUrl = (id) => `assets/sprites/item-${id}.png`;
export function itemHtml(item) {
  return probe(itemUrl(item.id)) ? `<img class="pixel item-art" src="${itemUrl(item.id)}" alt="">` : item.icon || '';
}

// HTML for a character. Add the class "walking" to animate the walk cycle.
export function characterHtml(look, cls = '', alt = '') {
  const src = customSrc(look) || sheetSrc(look);
  const data = JSON.stringify({ stage: look.stage, animal: look.animal, gender: look.gender }).replace(/"/g, '&quot;');
  return `<span class="pixel person ${cls}" role="img" aria-label="${alt || ANIMALS[look.animal].label}" data-art="${data}" style="--sheet:url('${src}')"></span>`;
}

function drawSheet(stage, animal, she, outfitIdx) {
  const canvas = document.createElement('canvas');
  canvas.width = F * FRAMES;
  canvas.height = F;
  const ctx = canvas.getContext('2d');
  for (let f = 0; f < FRAMES; f++) {
    const g = outline(drawFrame(stage, animal, she, OUTFITS[outfitIdx % OUTFITS.length], f));
    for (let y = 0; y < F; y++) {
      for (let x = 0; x < F; x++) {
        if (!g[y][x]) continue;
        ctx.fillStyle = g[y][x];
        ctx.fillRect(f * F + x, y, 1, 1);
      }
    }
  }
  return canvas.toDataURL();
}

// One frame of the walk (or, for the frog, hop) cycle, as a grid of colours.
export function drawFrame(stage, animal, she, shirt, f) {
  const a = ANIMALS[animal];
  const sz = SIZES[stage];
  const g = Array.from({ length: F }, () => Array(F).fill(null));
  const put = (x, y, c) => { if (x >= 0 && x < F && y >= 0 && y < F) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const blob = (x, y, w, h, c) => { // a rectangle with its corners cut off
    rect(x + 1, y, w - 2, h, c);
    rect(x, y + 1, w, h - 2, c);
  };

  const frog = animal === 'frog';
  // Walk: contact, passing (body up), contact the other way, passing.
  // Frog: crouch, push off, in the air, land.
  const lift = frog ? [0, -1, -4, 0][f] : f % 2 ? -1 : 0;
  const stride = frog ? [1, -1, 0, 1][f] : [1, 0, -1, 0][f];
  const cx = 15;
  const bx = cx - Math.floor(sz.bw / 2);
  const by = BASE - sz.legs - sz.body + 1 + lift;
  const hx = cx - Math.floor(sz.hw / 2) + 1;
  const hy = by - sz.head + 1;
  const senior = stage === 'senior';

  // Tail, behind everything.
  if (animal === 'cat') {
    rect(bx - 2, by - 3, 2, sz.body + 1, a.fur);
    put(bx - 3, by - 4, a.light);
    put(bx - 2, by - 4, a.light);
  } else if (animal === 'dog') {
    rect(bx - 3, by - 1, 3, 1, a.fur);
    rect(bx - 3, by - 3, 1, 2, a.fur);
    rect(bx - 2, by - 3, 2, 1, a.light);
  } else if (animal === 'unicorn') {
    for (let i = 0; i < 4; i++) rect(bx - 2 - (i >> 1), by + 1 + i, 2, 1, MANE[i]);
  }

  // Back leg and arm (the far side), drawn darker.
  const footY = frog && f === 2 ? BASE + lift + 2 : BASE; // in the air the frog tucks its legs up
  const legTop = by + sz.body;
  const legH = Math.max(1, footY - legTop);
  rect(cx - 3 - stride, legTop, 2, legH, a.shade);
  rect(cx - 3 - stride, footY, 3, 1, a.shade);
  rect(bx + sz.bw - 1 - stride, by + 1, 2, Math.max(2, sz.body - 2), a.shade);

  // Body, then clothes.
  blob(bx, by, sz.bw, sz.body, a.fur);
  rect(bx + Math.floor(sz.bw / 2), by + 1, Math.ceil(sz.bw / 2) - 1, sz.body - 2, a.light);
  if (stage === 'baby') {
    rect(bx + 3, by, sz.bw - 4, 2, '#ffffff'); // bib
  } else {
    rect(bx, by, sz.bw, sz.body - 1, shirt);
    rect(bx, by + sz.body - 2, sz.bw, 1, darken(shirt));
    if (stage === 'adult') { put(bx + sz.bw - 3, by, '#ffffff'); put(bx + sz.bw - 2, by, '#ffffff'); } // collar
  }
  if (stage === 'child') rect(bx - 2, by + 1, 3, Math.max(3, sz.body - 1), '#d9473f'); // backpack

  // Front leg.
  rect(cx + 1 + stride, legTop, 2, legH, a.fur);
  rect(cx + 1 + stride, footY, 3, 1, frog ? a.fur : a.shade);

  // Head.
  blob(hx, hy, sz.hw, sz.head, a.fur);
  if (senior) rect(hx + 3, hy, sz.hw - 5, 1, '#e9e4ea'); // greying on top
  const ey = hy + Math.floor(sz.head / 2) - 1;
  const ex = hx + sz.hw - 4; // the near eye, towards the front

  if (animal === 'capybara') {
    rect(hx + sz.hw - 2, ey + 1, 3, 4, a.light); // blunt snout
    rect(hx + sz.hw, ey + 1, 1, 1, EYE); // nose
    rect(hx + 2, hy - 1, 2, 2, a.ear);
    rect(hx + 6, hy - 1, 2, 2, a.ear);
    rect(hx + 4, hy - 3, 3, 2, '#ffb22e'); // a yuzu on its head
    put(hx + 6, hy - 4, '#4caf50');
  } else if (animal === 'cat' || animal === 'dog') {
    if (animal === 'cat') {
      for (const x of [hx + 1, hx + sz.hw - 5]) {
        rect(x, hy - 1, 4, 1, a.fur);
        rect(x + 1, hy - 2, 2, 1, a.fur);
        put(x + 2, hy - 1, a.ear);
      }
    } else {
      // Floppy ears hanging down the side of the head.
      rect(hx + 2, hy - 1, 4, 2, a.ear);
      rect(hx + 1, hy + 1, 4, 4, a.ear);
      rect(hx + 2, hy + 5, 2, 1, a.ear);
      put(hx + 5, hy + 1, a.fur); // a gap so the ear reads as separate from the head
    }
    if (animal === 'cat') { put(hx + 5, hy + 1, a.shade); put(hx + 6, hy + 1, a.shade); put(hx + 5, hy + 2, a.shade); }
    rect(hx + sz.hw - 6, ey + 2, 6, sz.head - (ey - hy) - 3, a.light); // muzzle
    put(hx + sz.hw - 1, ey + 2, animal === 'cat' ? '#f37c95' : EYE); // nose
    if (animal === 'dog') put(hx + sz.hw - 3, ey + 4, '#f37c95'); // tongue
  } else if (animal === 'unicorn') {
    rect(hx + sz.hw - 5, ey + 2, 5, sz.head - (ey - hy) - 3, a.light); // muzzle
    put(hx + sz.hw - 2, ey + 3, '#c79ab0');
    rect(hx + 3, hy - 1, 2, 1, a.fur);
    put(hx + 3, hy - 1, a.ear);
    // Horn.
    rect(hx + sz.hw - 6, hy - 1, 2, 1, '#f5c542');
    put(hx + sz.hw - 6, hy - 2, '#e0a92c');
    put(hx + sz.hw - 5, hy - 3, '#f5c542');
    put(hx + sz.hw - 5, hy - 4, '#e0a92c');
    // Mane down the back of the head.
    for (let i = 0; i < sz.head - 1; i++) rect(hx - 1, hy + i, 3, 1, MANE[(i >> 1) % MANE.length]);
    rect(hx, hy - 1, 5, 1, MANE[0]);
  } else if (frog) {
    for (const x of [hx + 1, hx + sz.hw - 6]) {
      rect(x, hy - 2, 4, 3, a.fur);
      rect(x + 1, hy - 2, 2, 2, '#ffffff');
      put(x + 2, hy - 1, EYE);
    }
    rect(hx + 3, ey + 3, sz.hw - 3, 1, a.shade); // wide smile
    rect(hx + 2, ey + 4, sz.hw - 3, sz.head - (ey - hy) - 5, a.light);
  }

  // Eyes and cheeks (the frog's eyes are on top of its head).
  if (!frog) {
    rect(ex, ey, 2, 2, EYE);
    put(ex, ey, '#ffffff');
    rect(ex - 5, ey, 1, 2, EYE);
    put(ex + 1, ey + 2, CHEEK);
    put(ex + 2, ey + 2, CHEEK);
  } else {
    put(ex + 1, ey + 2, CHEEK);
    put(hx + 2, ey + 2, CHEEK);
  }

  if (stage === 'teen') { // headphones round the neck
    rect(bx + 1, by, sz.bw - 2, 1, '#3b3b4f');
    rect(bx + sz.bw - 2, by - 1, 2, 2, '#ff6f91');
  }
  if (senior) { // glasses and a walking stick
    rect(ex - 1, ey - 1, 4, 1, OUTLINE);
    put(ex - 1, ey, OUTLINE);
    put(ex + 2, ey, OUTLINE);
    rect(bx + sz.bw + 2 + stride, by + 2, 1, BASE - by - 1 - lift, '#8a5a33');
    put(bx + sz.bw + 3 + stride, by + 2, '#8a5a33');
  }
  if (she) { // a bow
    const x = frog ? hx + 6 : hx + 1;
    const y = frog ? hy - 1 : hy;
    rect(x, y, 4, 2, '#ff5c93');
    rect(x + 1, y, 2, 2, '#d9306f');
  }

  // Front arm, swinging opposite the front leg.
  rect(bx + sz.bw - 2 + stride, by + 1, 2, Math.max(2, sz.body - 2), stage === 'baby' ? a.fur : shirt);
  put(bx + sz.bw - 2 + stride, by + Math.max(2, sz.body - 2), a.fur);
  return g;
}

// Draws a dark line round the figure.
function outline(g) {
  const out = g.map((row) => row.slice());
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      if (g[y][x]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx])) out[y][x] = OUTLINE;
    }
  }
  return out;
}

function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

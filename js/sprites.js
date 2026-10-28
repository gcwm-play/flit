// Characters. Until custom art is added, each character is drawn as simple
// pixel art in code from its life stage, gender, skin tone and outfit.
//
// To use your own art instead, add PNGs named
//   assets/sprites/{stage}-{gender}-{tone}.png
// (stage: baby, child, teen, adult, senior; gender: male, female; tone: 0-4)
// and set CUSTOM_SPRITES to true. See assets/sprites/README.md.
export const CUSTOM_SPRITES = false;

export const SKIN_TONES = [
  { label: 'Light', skin: '#f6d5b8', shade: '#e3b896' },
  { label: 'Fair', skin: '#e9bf96', shade: '#d4a276' },
  { label: 'Medium', skin: '#c99366', shade: '#b07a4f' },
  { label: 'Tan', skin: '#a26b43', shade: '#8a5634' },
  { label: 'Deep', skin: '#6e4528', shade: '#57351d' },
];

export const GENDERS = { male: 'Male', female: 'Female' };

export const OUTFITS = ['#e2574c', '#3f7fd9', '#3a9d5d', '#e0a23a', '#9a5bd1', '#2f9fb0'];

const OUTLINE = '#2a2433';
const HAIR = { young: '#2b1d16', senior: '#c9c6c2' };
const PANTS = { child: '#3b5aa0', teen: '#2f3550', adult: '#33384d', senior: '#5b5148', baby: '#ffffff' };
const SHOES = '#2a2433';

// Body proportions in pixels for each stage.
const SHAPES = {
  baby: { w: 12, head: 7, body: 4, legs: 2 },
  child: { w: 14, head: 8, body: 6, legs: 6 },
  teen: { w: 16, head: 8, body: 8, legs: 9 },
  adult: { w: 16, head: 8, body: 9, legs: 10 },
  senior: { w: 16, head: 8, body: 9, legs: 9 },
};

const cache = new Map();

// Height in pixels of a stage's sprite, so people of different ages keep their relative sizes.
export function spriteHeight(stage) {
  const sh = SHAPES[stage];
  return 1 + sh.head + sh.body + sh.legs + 2;
}

export function lookOf(person, stage) {
  return { stage, gender: person.gender || 'female', tone: person.tone ?? 2, outfit: person.outfit ?? 0 };
}

// Returns an image URL for the character.
export function characterSrc({ stage, gender, tone, outfit }) {
  if (CUSTOM_SPRITES) return `assets/sprites/${stage}-${gender}-${tone}.png`;
  const key = `${stage}|${gender}|${tone}|${outfit}`;
  if (!cache.has(key)) cache.set(key, draw(stage, gender, tone, outfit));
  return cache.get(key);
}

function draw(stage, gender, toneIdx, outfitIdx) {
  const sh = SHAPES[stage];
  const tone = SKIN_TONES[toneIdx] || SKIN_TONES[2];
  const shirt = OUTFITS[outfitIdx % OUTFITS.length];
  const hair = stage === 'senior' ? HAIR.senior : HAIR.young;
  const female = gender === 'female';
  const W = sh.w + 2;
  const H = 1 + sh.head + sh.body + sh.legs + 2;
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
  const cx = Math.floor(W / 2);

  // Head.
  const headW = stage === 'baby' ? 7 : 8;
  const hx = cx - Math.floor(headW / 2);
  const hy = 1;
  rect(hx, hy, headW, sh.head, tone.skin);
  rect(hx, hy + sh.head - 1, headW, 1, tone.shade);
  // Hair: short on top for men and babies, longer at the sides for women and girls.
  rect(hx - 1, hy - 1, headW + 2, 3, hair);
  if (female && stage !== 'baby') {
    rect(hx - 1, hy, 2, sh.head + (stage === 'senior' ? 1 : 3), hair);
    rect(hx + headW - 1, hy, 2, sh.head + (stage === 'senior' ? 1 : 3), hair);
  } else {
    rect(hx - 1, hy, 1, 3, hair);
    rect(hx + headW, hy, 1, 3, hair);
  }
  // Face.
  const ey = hy + Math.floor(sh.head / 2);
  put(hx + 2, ey, OUTLINE);
  put(hx + headW - 3, ey, OUTLINE);
  const mx = hx + Math.floor(headW / 2);
  put(mx - 1, ey + 2, '#b5524a');
  put(mx, ey + 2, '#b5524a');
  if (stage === 'senior') {
    rect(hx + 1, ey - 1, 3, 1, OUTLINE);
    rect(hx + headW - 4, ey - 1, 3, 1, OUTLINE);
  }

  // Body.
  const by = hy + sh.head;
  const bodyW = stage === 'baby' ? 8 : stage === 'child' ? 8 : 10;
  const bx = cx - bodyW / 2;
  rect(bx, by, bodyW, sh.body, shirt);
  rect(bx, by + sh.body - 1, bodyW, 1, shade(shirt));
  // Arms.
  rect(bx - 2, by + 1, 2, sh.body - 1, shirt);
  rect(bx + bodyW, by + 1, 2, sh.body - 1, shirt);
  rect(bx - 2, by + sh.body - 1, 2, 2, tone.skin);
  rect(bx + bodyW, by + sh.body - 1, 2, 2, tone.skin);

  // Legs: a skirt for grown women, trousers otherwise.
  const ly = by + sh.body;
  if (stage === 'baby') {
    rect(bx + 1, ly, bodyW - 2, sh.legs, PANTS.baby);
  } else if (female && stage !== 'child') {
    rect(bx - 1, ly, bodyW + 2, Math.ceil(sh.legs * 0.6), shade(shirt));
    const rest = sh.legs - Math.ceil(sh.legs * 0.6);
    rect(bx + 2, ly + Math.ceil(sh.legs * 0.6), 2, rest, tone.skin);
    rect(bx + bodyW - 4, ly + Math.ceil(sh.legs * 0.6), 2, rest, tone.skin);
  } else {
    rect(bx + 1, ly, 3, sh.legs, PANTS[stage]);
    rect(bx + bodyW - 4, ly, 3, sh.legs, PANTS[stage]);
  }
  if (stage !== 'baby') {
    rect(bx + 1, ly + sh.legs, 3, 1, SHOES);
    rect(bx + bodyW - 4, ly + sh.legs, 3, 1, SHOES);
  }

  // Outline every empty pixel that touches the figure.
  const out = g.map((row) => row.slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx]);
      if (near) out[y][x] = OUTLINE;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!out[y][x]) continue;
      ctx.fillStyle = out[y][x];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL();
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * 0.78));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

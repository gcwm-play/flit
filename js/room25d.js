// Room mode (alpha): a 2.5D room drawn on a canvas. The player's animal wanders from item to
// item, gives a little hop and a heart at each one, and walks over when you tap an item.
// Animation is data (frames, ticks, loop, small per-frame moves and named events), as in the
// "animated-pixel-sprites" approach: one feet anchor, mirror about it, depth by x + y.

const TPS = 60; // animation ticks per second
const ANIMS = {
  idle: { frames: [0, 0], ticks: [45, 45], loop: true, dy: [0, 1] },
  walk: { frames: [0, 1, 2, 3], ticks: [9, 9, 9, 9], loop: true },
  // Crouch, push off, in the air (the game moves the pet up and down), land.
  hop: { frames: [0, 1, 1, 0], ticks: [6, 4, 26, 6], loop: false, dy: [3, 0, 0, 3], events: [[6, 'takeoff'], [36, 'land']] },
};
const WALK_SPEED = 2.2; // tiles a second, matched to the walk cycle so the feet don't slide

export function poseAt(anim, ticks) {
  const total = anim.ticks.reduce((a, b) => a + b, 0);
  const t = anim.loop && total > 0 ? ticks % total : ticks;
  let i = 0, sum = 0;
  for (; i < anim.ticks.length; i++) { sum += anim.ticks[i]; if (t < sum) break; }
  i = Math.min(i, anim.frames.length - 1);
  return { frame: anim.frames[i], dy: anim.dy ? anim.dy[i] : 0, index: i };
}
export function eventsBetween(anim, from, to) {
  return (anim.events || []).filter(([t]) => t > from && t <= to).map(([, n]) => n);
}
function createPlayer() {
  let name = null, cur = null, start = 0, last = -1, next = null;
  return {
    get name() { return name; },
    play(n, now, opts = {}) {
      if (n === name && !opts.restart) return;
      name = n; cur = ANIMS[n]; start = now; last = -1; next = opts.then || null;
    },
    update(now) {
      const ticks = Math.floor((now - start) * TPS);
      const events = eventsBetween(cur, last, ticks);
      last = ticks;
      const total = cur.ticks.reduce((a, b) => a + b, 0);
      if (next && !cur.loop && ticks >= total) {
        this.play(next, now, { restart: true });
        const p = this.update(now);
        return { ...p, events: events.concat(p.events) };
      }
      return { ...poseAt(cur, ticks), events, name };
    },
  };
}

// Where each shop item stands on the 8 x 8 floor. Big pieces line the two back walls; small
// things share a tile in pairs (ox nudges each one left or right). Every tile next to an item
// can be reached, even when the player owns all of them.
export const SLOTS = {
  plants: [0, 0], gamingpc: [1, 0], desk: [2, 0], posters: [3, 0], tv: [4, 0], karaoke: [5, 0], piano: [6, 0], treadmill: [7, 0],
  massage: [0, 1], bookshelf: [0, 2], coffee: [0, 3, -0.2], tablet: [0, 3, 0.22], guitar: [0, 4], fishtank: [0, 5], bike: [0, 6], garden: [0, 7],
  console: [4, 1], sofa: [3, 3], chess: [5, 5], ball: [2, 6],
  plush: [6, 3, -0.2], comics: [6, 3, 0.2], boardgame: [3, 5, -0.2], crayons: [3, 5, 0.2],
  headphones: [7, 6, -0.2], phone: [7, 6, 0.2], watch: [5, 7],
};
// How tall each item stands, as a share of an adult animal's frame (as ITEM_HEIGHT in sprites.js).
const HEIGHT = {
  bookshelf: 1.05, piano: 0.95, tv: 0.85, treadmill: 0.85, massage: 0.85, plants: 0.7, sofa: 0.6,
  guitar: 0.75, bike: 0.6, gamingpc: 0.5, karaoke: 0.6, chess: 0.55, garden: 0.45, fishtank: 0.5,
  desk: 0.45, coffee: 0.4, posters: 0.45, console: 0.3, plush: 0.35, tablet: 0.35, phone: 0.28,
  ball: 0.25, boardgame: 0.28, comics: 0.28, crayons: 0.3, headphones: 0.3, watch: 0.3,
};
// One wall colour for each kind of home: left wall, right wall, skirting.
export const WALLS = {
  bedroom: ['#BFD9F2', '#D3E6F7', '#7EA6CF'],
  teenroom: ['#CDBFEA', '#DED4F3', '#9182C0'],
  parents: ['#F3B9A3', '#F7CDB9', '#D98D74'],
  rental: ['#E3D2B4', '#EEE2CB', '#B49A70'],
  flexi2: ['#B9DFC9', '#CFEBDB', '#79B394'],
  bto3: ['#B5D3EC', '#CCE2F4', '#6C99C2'],
  bto4: ['#CDBFEA', '#DED4F3', '#9182C0'],
  resale5: ['#F0DB97', '#F7E8B8', '#C6A253'],
  condo: ['#D5CBC0', '#E6DED5', '#988775'],
};

const W = 8, H = 8, R = 0.28;
const C = { floorA: '#E9D7BC', floorB: '#E1CBAA', grout: '#CDB18A', rug: '#9CC9B4', rugEdge: '#7BB29A', shadow: 'rgba(60,40,30,.22)' };
const HEART = ['.oo.oo.', 'orrorro', 'orwrrro', 'orrrrro', '.orrro.', '..oro..', '...o...'];
const HEART_INK = { o: '#7A2234', r: '#F0506A', w: '#FFFFFF' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The pet keeps its spot between screens (the game redraws the page after every choice).
const pet = { x: 2.5, y: 1.5, z: 0, vz: 0, facing: 1, path: [] };
const pictures = new Map(); // url -> Image (loaded) | 'loading'
function picture(url, onload) {
  if (!pictures.has(url)) {
    pictures.set(url, 'loading');
    const i = new Image();
    i.onload = () => { pictures.set(url, i); onload(); };
    i.onerror = () => pictures.set(url, 'missing');
    i.src = url;
  }
  const p = pictures.get(url);
  return p instanceof Image ? p : null;
}

// Mounts the room into `el`. items: [{ id, name, ... }] (anything with a slot is drawn).
// sheet(): { url, custom } for the pet's walk sheet, or null while it is still loading.
// onItem(item | null) is called when an item is tapped (null when the floor is tapped).
export function mountRoom(el, { items, walls = 'parents', sheet, onItem = () => {} }) {
  const cv = document.createElement('canvas');
  cv.className = 'rm-canvas';
  cv.setAttribute('aria-label', 'Your room. Tap an item to see it, or tap the floor to walk there.');
  el.prepend(cv);
  const ctx = cv.getContext('2d');
  const placed = items.filter((it) => SLOTS[it.id]).map((it) => {
    const [x, y, ox = 0] = SLOTS[it.id];
    return { ...it, x, y, ox, h: HEIGHT[it.id] || 0.3 };
  });
  const blocked = new Set(placed.map((it) => `${it.x},${it.y}`));
  const isFree = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && !blocked.has(`${tx},${ty}`);
  const solid = (x, y) => x < R || y < R || x > W - R || y > H - R
    || [[-R, -R], [R, -R], [-R, R], [R, R]].some(([ox, oy]) => !isFree(Math.floor(x + ox), Math.floor(y + oy)));
  if (solid(pet.x, pet.y)) { const f = nearestFree(Math.floor(pet.x), Math.floor(pet.y)); if (f) { pet.x = f[0] + 0.5; pet.y = f[1] + 0.5; } }
  pet.path = []; pet.z = 0; pet.vz = 0;

  const player = createPlayer();
  const brain = { mode: 'rest', until: 0, target: null, last: null, bag: [] };
  const hearts = [];
  let picked = null, rects = [], view = { tw: 64, th: 32, dpr: 1, ox: 0, oy: 0, catPx: 90 }, hopping = false, stopped = false;
  const redraw = () => {};

  function nearestFree(tx, ty) {
    let best = null, bd = 1e9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isFree(x, y)) {
      const d = (x - tx) ** 2 + (y - ty) ** 2;
      if (d < bd) { bd = d; best = [x, y]; }
    }
    return best;
  }
  function findPath(from, to) { // breadth-first over tiles, 8 directions, no corner cutting
    const key = (x, y) => `${x},${y}`, prev = new Map([[key(...from), null]]), q = [from];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === to[0] && y === to[1]) {
        const out = [];
        for (let c = [x, y]; c; c = prev.get(key(...c))) out.unshift(c);
        return out;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!isFree(nx, ny) || prev.has(key(nx, ny))) continue;
        if (dx && dy && (!isFree(x + dx, y) || !isFree(x, y + dy))) continue;
        prev.set(key(nx, ny), [x, y]);
        q.push([nx, ny]);
      }
    }
    return null;
  }

  // ---- screen ----
  function layout() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const fitW = cv.width / ((W + H) / 2 + 0.4);
    const fitH = cv.height / ((W + H) / 4 + 2.2);
    const tw = Math.max(12, Math.floor(Math.min(fitW, fitH)));
    const th = tw / 2;
    view = { tw, th, dpr, catPx: tw * 1.45,
      ox: cv.width / 2 - (W - H) * tw / 4,
      oy: (cv.height - (W + H) * th / 2) / 2 + tw * 0.95 };
  }
  const toScreen = (x, y, z = 0) => [view.ox + (x - y) * view.tw / 2, view.oy + (x + y) * view.th / 2 - z * view.th];
  function toWorld(sx, sy) {
    const a = (sx - view.ox) / (view.tw / 2), b = (sy - view.oy) / (view.th / 2);
    return [(a + b) / 2, (b - a) / 2];
  }

  // ---- behaviour ----
  function hop(now) { hopping = true; player.play('hop', now, { restart: true, then: 'idle' }); }
  function spotNear(it) { // a free tile next to the item, a short walk away, preferably in front of it
    const from = [Math.floor(pet.x), Math.floor(pet.y)];
    let best = null, bestCost = 1e9;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const tx = it.x + dx, ty = it.y + dy;
      if (!isFree(tx, ty)) continue;
      const p = tx === from[0] && ty === from[1] ? [from] : findPath(from, [tx, ty]);
      if (!p) continue;
      const cost = p.length + (dx + dy < 0 ? 6 : dx + dy === 0 ? 2 : 0);
      if (cost < bestCost) { best = p; bestCost = cost; }
    }
    return best;
  }
  function goVisit(it) {
    const p = spotNear(it);
    if (!p) return false;
    const [tx, ty] = p[p.length - 1];
    p.shift();
    pet.path = p.map(([x, y]) => [x + 0.5, y + 0.5]);
    pet.path.push([clamp(it.x + 0.5, tx + R + 0.02, tx + 1 - R - 0.02), clamp(it.y + 0.5, ty + R + 0.02, ty + 1 - R - 0.02)]);
    Object.assign(brain, { mode: 'going', target: it });
    return true;
  }
  function nextItem() { // a shuffled round of every item, so each one is visited before any repeats
    if (!brain.bag.length) {
      brain.bag = placed.slice().sort(() => Math.random() - 0.5);
      if (brain.bag.length > 1 && brain.bag[0] === brain.last) brain.bag.push(brain.bag.shift());
    }
    return brain.bag.shift();
  }
  function think(now, moving) {
    if (brain.mode === 'manual') {
      if (!moving && !pet.path.length) { brain.mode = 'rest'; brain.until = now + 2; }
      return;
    }
    if (brain.mode === 'rest' && now >= brain.until) {
      const it = placed.length ? nextItem() : null;
      if (!it || !goVisit(it)) brain.until = now + 1.5; // nothing to visit: just stand
    }
    if (brain.mode === 'going' && !pet.path.length) {
      const it = brain.target;
      const [ix] = toScreen(it.x + 0.5, it.y + 0.5), [px] = toScreen(pet.x, pet.y);
      if (Math.abs(ix - px) > 2) pet.facing = ix > px ? 1 : -1;
      hop(now);
      hearts.push({ t: now });
      brain.mode = 'enjoy'; brain.until = now + 0.9; brain.last = it;
      brain.bag = brain.bag.filter((b) => b !== it);
    }
    if (brain.mode === 'enjoy' && now >= brain.until) { brain.mode = 'rest'; brain.until = now + 0.15 + Math.random() * 0.4; }
  }
  function move(dx, dy) {
    if (!solid(pet.x + dx, pet.y)) pet.x += dx;
    if (!solid(pet.x, pet.y + dy)) pet.y += dy;
  }
  let lastT = performance.now() / 1000;
  function step(now) {
    const dt = Math.min(0.05, now - lastT);
    lastT = now;
    let mx = 0, my = 0;
    if (pet.path.length) {
      const [px, py] = pet.path[0];
      if (Math.hypot(px - pet.x, py - pet.y) < 0.06) pet.path.shift();
      else { mx = px - pet.x; my = py - pet.y; }
    }
    const len = Math.hypot(mx, my);
    const moving = len > 0;
    if (moving) {
      const stepLen = Math.min(WALK_SPEED * dt, len);
      const bx = pet.x, by = pet.y;
      move(mx / len * stepLen, my / len * stepLen);
      const sdx = (pet.x - bx) - (pet.y - by);
      if (Math.abs(sdx) > 1e-4) pet.facing = sdx > 0 ? 1 : -1;
      if (Math.hypot(pet.x - bx, pet.y - by) < 1e-5) pet.path = [];
    }
    think(now, moving);
    if (!hopping) player.play(moving ? 'walk' : 'idle', now);
    const pose = player.update(now);
    for (const ev of pose.events) {
      if (ev === 'takeoff') pet.vz = 9.6; // half a second in the air, from takeoff to land
      if (ev === 'land') { pet.z = 0; pet.vz = 0; }
    }
    if (pet.vz || pet.z > 0) { pet.vz -= 38.4 * dt; pet.z = Math.max(0, pet.z + pet.vz * dt); if (pet.z === 0) pet.vz = 0; }
    if (hopping && pose.name !== 'hop') hopping = false;
    return pose;
  }

  // ---- drawing ----
  function poly(pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(1, view.tw / 64); ctx.stroke(); }
  }
  function drawRoom() {
    const [left, right, skirt] = WALLS[walls] || WALLS.parents;
    const wh = 4.8;
    poly([toScreen(0, 0), toScreen(W, 0), toScreen(W, 0, wh), toScreen(0, 0, wh)], right);
    poly([toScreen(0, 0), toScreen(0, H), toScreen(0, H, wh), toScreen(0, 0, wh)], left);
    poly([toScreen(1.4, 0, 1.6), toScreen(3, 0, 1.6), toScreen(3, 0, 3.6), toScreen(1.4, 0, 3.6)], '#BFE3F2', '#FFFFFF');
    poly([toScreen(2.2, 0, 1.6), toScreen(2.2, 0, 3.6)], null, '#FFFFFF');
    poly([toScreen(0, 0), toScreen(W, 0), toScreen(W, 0, 0.25), toScreen(0, 0, 0.25)], skirt);
    poly([toScreen(0, 0), toScreen(0, H), toScreen(0, H, 0.25), toScreen(0, 0, 0.25)], skirt);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      poly([toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)], (x + y) % 2 ? C.floorA : C.floorB, C.grout);
    }
    poly([toScreen(2.2, 1.2), toScreen(5.8, 1.2), toScreen(5.8, 2.8), toScreen(2.2, 2.8)], C.rug, C.rugEdge);
  }
  function drawItem(it) {
    const pic = picture(`assets/sprites/item-${it.id}.png`, redraw);
    const [fx0, fy] = toScreen(it.x + 0.5, it.y + 0.5);
    const fx = fx0 + it.ox * view.tw;
    const h = it.h * view.catPx, w = pic ? h * pic.width / pic.height : h;
    const footY = fy + view.th * 0.35;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(fx, footY - view.th * 0.08, Math.min(w, view.tw * 0.9) / 2, view.th * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pic) ctx.drawImage(pic, Math.round(fx - w / 2), Math.round(footY - h), Math.round(w), Math.round(h));
    rects.push({ it, x: fx - w / 2, y: footY - h, w, h });
    if (it === picked) {
      ctx.strokeStyle = 'rgba(232,115,90,.9)';
      ctx.lineWidth = Math.max(2, view.tw / 32);
      ctx.beginPath();
      ctx.ellipse(fx, footY - view.th * 0.08, Math.min(w, view.tw * 0.9) / 2 + 3, view.th * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function drawPet(pose) {
    const [fx, fy] = toScreen(pet.x, pet.y);
    const k = 1 / (1 + pet.z * 0.6);
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(fx, fy, view.tw * 0.26 * k, view.th * 0.22 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    const sh = sheet();
    const img = sh && picture(sh.url, redraw);
    if (!img) return;
    const f = img.height; // square frames, side by side
    const anchorY = sh.custom ? f * (126 / 128) : f * (31 / 32); // the row the feet stand on
    const s = view.catPx / f;
    ctx.save();
    ctx.translate(Math.round(fx), Math.round(fy - pet.z * view.th + pose.dy * (view.catPx / 128)));
    if (pet.facing < 0) ctx.scale(-1, 1); // mirror about the feet, never about the frame box
    ctx.drawImage(img, pose.frame * f, 0, f, f, Math.round(-f / 2 * s), Math.round(-anchorY * s), Math.round(f * s), Math.round(f * s));
    ctx.restore();
  }
  function drawHearts(now) {
    for (let i = hearts.length - 1; i >= 0; i--) {
      const a = (now - hearts[i].t) / 1.6;
      if (a >= 1) { hearts.splice(i, 1); continue; }
      const [x, y] = toScreen(pet.x, pet.y);
      const px = Math.max(2, Math.round(view.tw * 0.045));
      const left = Math.round(x + pet.facing * view.tw * 0.2 - px * 3.5);
      const top = Math.round(y - view.catPx * 0.98 - a * view.tw * 0.4 - pet.z * view.th);
      ctx.globalAlpha = 1 - Math.max(0, (a - 0.6) / 0.4);
      HEART.forEach((row, r) => [...row].forEach((ch, c) => {
        if (ch === '.') return;
        ctx.fillStyle = HEART_INK[ch];
        ctx.fillRect(left + c * px, top + r * px, px, px);
      }));
      ctx.globalAlpha = 1;
    }
  }
  function render(now, pose) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawRoom();
    rects = [];
    const things = placed.map((it) => ({ d: it.x + it.y + 1 + it.ox * 0.01, draw: () => drawItem(it) }));
    things.push({ d: pet.x + pet.y, draw: () => drawPet(pose) });
    things.sort((a, b) => a.d - b.d).forEach((t) => t.draw());
    drawHearts(now);
  }

  // ---- input ----
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const px = (e.clientX - r.left) * view.dpr, py = (e.clientY - r.top) * view.dpr;
    const hit = rects.slice().reverse().find((q) => px >= q.x && px <= q.x + q.w && py >= q.y && py <= q.y + q.h);
    if (hit) { picked = hit.it; onItem(hit.it); goVisit(hit.it); return; }
    picked = null;
    onItem(null);
    const [wx, wy] = toWorld(px, py);
    const tx = Math.floor(wx), ty = Math.floor(wy);
    if (!isFree(tx, ty)) return;
    const p = findPath([Math.floor(pet.x), Math.floor(pet.y)], [tx, ty]);
    if (!p) return;
    p.shift();
    pet.path = p.map(([x, y]) => [x + 0.5, y + 0.5]);
    pet.path.push([clamp(wx, tx + R, tx + 1 - R), clamp(wy, ty + R, ty + 1 - R)]);
    brain.mode = 'manual';
  });

  const ro = new ResizeObserver(layout);
  ro.observe(cv);
  layout();
  const t0 = performance.now() / 1000;
  player.play('idle', t0);
  brain.until = t0 + 0.8;
  function frame() {
    if (stopped || !cv.isConnected) { ro.disconnect(); return; }
    const now = performance.now() / 1000;
    render(now, step(now));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { destroy() { stopped = true; ro.disconnect(); cv.remove(); } };
}

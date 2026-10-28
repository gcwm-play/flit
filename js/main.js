// UI and game flow.
import * as cpf from './cpf.js';
import * as sim from './sim.js';
import * as housing from './housing.js';
import * as invest from './invest.js';
import { postcard } from './postcards.js';
import { characterHtml, itemHtml, lookOf, ANIMALS, GENDERS } from './sprites.js';
import { rollWorldEvent, rollPersonalEvent } from './events.js';
import {
  STATS, HYBRIDS, HYBRID_THRESHOLD, STAGES, ACTIVITIES, SHOP, EDUCATION,
  LIFESTYLES, RETIREMENT_LIFESTYLES, RENT_MONTHLY, FACTS, HOLIDAYS,
} from './data.js';

const SAVE_KEY = 'flit-save-v1';
const app = document.getElementById('app');
const modalEl = document.getElementById('modal');
const modalBox = modalEl.querySelector('.modal-box');
const $ = (sel, root = document) => root.querySelector(sel);
const money = sim.money;
let S = null;
let busy = false;

// ---------- saving ----------

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
  } catch {}
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = raw && JSON.parse(raw);
    return s && s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('flit-rewind-v1');
  } catch {}
}

// ---------- rewind ----------

// Snapshots taken before each turn, so a bad decision can be undone.
const REWIND_KEY = 'flit-rewind-v1';

function loadSnapshots() {
  try {
    return JSON.parse(localStorage.getItem(REWIND_KEY)) || [];
  } catch {
    return [];
  }
}

function pushSnapshot(label) {
  const list = loadSnapshots().filter((x) => x.age < S.age);
  list.push({ age: S.age, label, state: JSON.stringify(S) });
  try {
    localStorage.setItem(REWIND_KEY, JSON.stringify(list.slice(-6)));
  } catch {}
}

async function rewindDialog(reason = '') {
  const list = loadSnapshots().filter((x) => x.age < S.age || (x.age === S.age && reason)).reverse();
  if (!list.length) {
    await dialog(`<h2>⏪ Rewind</h2><p>There's nothing to go back to yet. Each turn you take is saved here so you can undo it.</p>${btn('ok', 'OK', 'primary')}`);
    return false;
  }
  const c = await dialog(`<h2>⏪ Go back in time</h2>
    ${reason ? `<p>${reason}</p>` : ''}
    <p>Pick a point to go back to. Everything after it is undone, so you can choose differently.</p>
    <div class="careers">${list.map((x, i) => `<button class="career" data-choice="${i}"><b>Age ${x.age}</b><small>Before: ${esc(x.label)}</small></button>`).join('')}</div>
    ${btn('cancel', 'Stay here', 'primary')}`, { wide: true });
  if (c === 'cancel') return false;
  const snap = list[+c];
  S = migrate(JSON.parse(snap.state));
  try {
    localStorage.setItem(REWIND_KEY, JSON.stringify(loadSnapshots().filter((x) => x.age < snap.age)));
  } catch {}
  logEvent(`⏪ Went back to age ${snap.age}`);
  save();
  closeModal();
  render();
  toast(`⏪ Back to age ${snap.age}. Choose differently this time!`);
  return true;
}

// What comes in and goes out each month under the current plan.
// How the home loan instalment will be paid each month: from the OA (as far as
// it lasts, counting what your pay adds to it) and the rest in cash.
function loanSplit() {
  const h = S.home;
  if (!h || h.loanBalance <= 1) return { fromOa: 0, fromCash: 0 };
  if (h.payWith !== 'oa') return { fromOa: 0, fromCash: h.instalment };
  const wage = sim.currentWage(S);
  const oaIn = wage > 0 ? cpf.monthlyContribution(S.age, wage, { selfEmployed: S.selfEmployed }).oa : 0;
  const fromOa = Math.min(h.instalment, oaIn + S.cpf.oa / 12);
  return { fromOa, fromCash: h.instalment - fromOa };
}

function monthlyPlan() {
  const b = { ...sim.newBudget(), ...(S.budget || {}) };
  const share = S.spouse ? 0.5 : 1;
  const payout = S.life && S.age >= S.life.startAge ? S.life.monthly : 0;
  const pay = sim.takeHome(S);
  const income = pay + payout;
  const parts = sim.spendBreakdown(S);
  const living = parts.total;
  const rent = !S.home && (S.age >= 30 || S.spouse) ? RENT_MONTHLY * share : 0;
  const loan = loanSplit();
  const loanCash = loan.fromCash;
  const dcp = S.dcp ? S.dcp.monthly : 0;
  const holidays = sim.holidayMonthly(S);
  const fun = b.hobbies + b.shopping + holidays;
  const kids = (S.children || []).filter((c) => S.age - c.bornAge < 21).length;
  const saving = b.cpfSelf + b.kidsCpf * kids + b.investAmt;
  const out = living + rent + loanCash + dcp + fun;
  return { pay, payout, income, parts, living, rent, loan, loanCash, dcp, holidays, b, kids, fun, saving, out, left: income - out };
}

// Warns before a turn if the plan spends more than comes in.
async function overspendCheck(years) {
  if (S.stage !== 'adult' && S.stage !== 'senior') return true;
  const p = monthlyPlan();
  if (p.left >= 0) return true;
  const gap = -p.left;
  const cover = S.bank > 0 ? Math.floor(S.bank / gap) : 0;
  if (cover >= years * 12) {
    toast(`⚠️ You're spending ${money(gap)}/month more than you earn. Your savings cover it for now.`);
    return true;
  }
  const c = await dialog(`<div class="event"><div class="e-icon">⚠️</div><h2>You're about to spend more than you earn</h2></div>
    <table class="summary">
      <tr><td>Money in each month${p.income ? '' : ' (you have no income now)'}</td><td class="pos">${money(p.income)}</td></tr>
      <tr><td>Everyday living (${S.stage === 'senior' && S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle].label : LIFESTYLES[S.lifestyle].label})</td><td class="neg">−${money(p.living)}</td></tr>
      ${p.rent ? `<tr><td>Rent</td><td class="neg">−${money(p.rent)}</td></tr>` : ''}
      ${p.loanCash ? `<tr><td>Home loan in cash</td><td class="neg">−${money(p.loanCash)}</td></tr>` : ''}
      ${p.dcp ? `<tr><td>Debt plan</td><td class="neg">−${money(p.dcp)}</td></tr>` : ''}
      ${p.fun ? `<tr><td>Hobbies, shopping and holidays</td><td class="neg">−${money(p.fun)}</td></tr>` : ''}
      <tr><td><b>Short each month</b></td><td class="neg"><b>−${money(gap)}</b></td></tr>
      <tr><td>Over the next ${years} year${years > 1 ? 's' : ''}</td><td class="neg">−${money(gap * 12 * years)}</td></tr>
    </table>
    <p>${S.bank > 0 ? `Your ${money(S.bank)} of cash covers about ${cover} month${cover === 1 ? '' : 's'}. After that, ` : ''}${S.age >= 55 ? 'the gap comes out of your OA, then ' : ''}the rest goes on credit cards at 25% a year, until the bank stops lending and you have to go without.</p>
    <div class="row">${btn('budget', 'Change my budget', 'primary')}${btn('go', 'Go ahead anyway')}</div>`, { wide: true });
  if (c === 'budget') {
    await budgetPanel();
    return overspendCheck(years);
  }
  return true;
}

// ---------- modal helpers ----------

// Shows html in the modal. Resolves with the `data-choice` of the button pressed.
function dialog(html, { wide = false } = {}) {
  modalBox.className = `modal-box${wide ? ' wide' : ''}`;
  modalBox.innerHTML = html;
  modalEl.hidden = false;
  modalBox.scrollTop = 0;
  return new Promise((resolve) => {
    modalBox.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (!b || b.disabled) return;
      resolve(b.dataset.choice);
    };
  });
}

function closeModal() {
  modalEl.hidden = true;
  modalBox.innerHTML = '';
  modalBox.onclick = null;
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

const btn = (choice, label, cls = '') => `<button class="btn ${cls}" data-choice="${choice}">${label}</button>`;
const person = (look, cls = '', alt = '') => characterHtml(look, cls, alt);
// A character strolling left and right across the room. `lane` spreads the family out.
const walker = (look, cls, alt, lane, count) => {
  const span = 100 / count;
  const from = Math.round(lane * span * 0.85);
  const to = Math.round(Math.min(78, from + span * 0.85 + 18));
  const dur = 9 + ((lane * 3.7) % 5);
  return `<span class="walker lane-${lane}" style="--from:${from}%;--to:${to}%;--dur:${dur.toFixed(1)}s;--delay:-${(lane * 2.3).toFixed(1)}s">${person(look, `walking ${cls}`, alt)}</span>`;
};
const me = (stage = S.stage) => lookOf(S.look, stage);

// ---------- title screen ----------

function titleScreen() {
  const saved = loadSave();
  const animals = Object.keys(ANIMALS);
  const look = { animal: animals[Math.floor(Math.random() * animals.length)], gender: Math.random() < 0.5 ? 'male' : 'female', outfit: 0 };
  app.innerHTML = `
    <div class="title-screen">
      <h1 class="logo">FLIT</h1>
      <p class="tagline">Life &amp; CPF: a Singapore life simulator</p>
      <div class="title-sprites" id="preview"></div>
      <div class="card start-card">
        <p>Grow up, build your skills, make money choices and see where they lead when you retire.</p>
        <label class="field">Your name <input id="name" maxlength="16" placeholder="Alex" autocomplete="off"></label>
        <p class="pick-label">Pick your animal <small>(your partner and children will be the same animal)</small></p>
        <div class="animal-pick" role="group" aria-label="Animal">${Object.entries(ANIMALS).map(([k, a]) => `<button class="animal-btn" data-animal="${k}">${person({ stage: 'adult', animal: k, gender: 'male', outfit: 1 }, 'tiny')}<span>${a.label}</span></button>`).join('')}</div>
        <p class="small muted">Everyone in this Singapore is an animal, but the rules are real: the same CPF, HDB and marriage rules apply.</p>
        <p class="pick-label">You are</p>
        <div class="seg" role="group" aria-label="He or she">${Object.entries(GENDERS).map(([k, l]) => `<button class="seg-btn" data-gender="${k}">${l}</button>`).join('')}</div>
        <div class="row">
          <button class="btn primary" id="start">Start a new life</button>
          ${saved ? `<button class="btn" id="continue">Continue (${esc(saved.name)}, age ${saved.age})</button>` : ''}
        </div>
      </div>
      <p class="small muted">CPF figures use the 2026 rates from cpf.gov.sg, simplified for a game. Amounts are in today's dollars.</p>
    </div>`;
  const refresh = () => {
    $('#preview').innerHTML = ['child', 'teen', 'adult', 'senior'].map((st) => person(lookOf(look, st), 'walking')).join('');
    app.querySelectorAll('[data-animal]').forEach((b) => b.classList.toggle('on', b.dataset.animal === look.animal));
    app.querySelectorAll('[data-gender]').forEach((b) => b.classList.toggle('on', b.dataset.gender === look.gender));
    app.querySelectorAll('[data-outfit]').forEach((b) => b.classList.toggle('on', +b.dataset.outfit === look.outfit));
  };
  app.querySelectorAll('[data-gender]').forEach((b) => (b.onclick = () => { look.gender = b.dataset.gender; refresh(); }));
  app.querySelectorAll('[data-animal]').forEach((b) => (b.onclick = () => { look.animal = b.dataset.animal; refresh(); }));
  app.querySelectorAll('[data-outfit]').forEach((b) => (b.onclick = () => { look.outfit = +b.dataset.outfit; refresh(); }));
  refresh();
  $('#start').onclick = async () => {
    const name = $('#name').value.trim() || 'Alex';
    S = sim.newGame(name, look);
    render();
    await stageIntro('child');
    save();
    render();
  };
  if (saved) $('#continue').onclick = () => {
    S = migrate(saved);
    render();
    milestones();
  };
}

// Saves from before the character picker used numbered sprites.
function migrate(s) {
  if (!s.look) s.look = { gender: 'female', outfit: 0 };
  // People became animals: older saves become capybaras, family included.
  if (!s.look.animal) s.look.animal = 'capybara';
  delete s.look.tone;
  delete s.sprites;
  // One cash account: the old spending fund and bank savings are merged.
  if (s.wallet != null) { s.bank += s.wallet; delete s.wallet; }
  if (s.cashLow == null) s.cashLow = s.bank;
  if (!s.holdings) {
    s.holdings = s.invest > 0 ? [{ id: 'world', src: 'cash', value: s.invest, cost: s.invest }] : [];
    delete s.invest;
  }
  if (!s.dcp && s.debt > Math.max(5000, 12 * (s.salary || 0))) sim.startDcp(s);
  if (s.spouse && !s.spouse.gender) Object.assign(s.spouse, { gender: s.look.gender === 'male' ? 'female' : 'male', outfit: 2 });
  for (const c of s.children || []) if (!c.gender) Object.assign(c, { gender: Math.random() < 0.5 ? 'male' : 'female', outfit: 1 });
  for (const p of [s.spouse, ...(s.children || [])]) if (p) { p.animal = s.look.animal; delete p.tone; }
  return s;
}

// ---------- main screen ----------

function render() {
  if (!S) return titleScreen();
  const st = STAGES[S.stage];
  const cpfTotal = cpf.cpfTotal(S.cpf);
  app.innerHTML = `
    <header class="hud">
      <div class="who">${person(me(), 'mini')}<div><b>${esc(S.name)}</b><span>Age ${S.age} · ${st.label} · <em class="status ${sim.isWorking(S) ? 'on' : ''}">${sim.workStatus(S)}</em></span></div></div>
      <div class="chips">
        <button class="chip" data-panel="money" title="Cash savings">💵 ${money(S.bank)}</button>
        ${invest.total(S) > 0 || S.stage === 'adult' || S.stage === 'senior' ? `<button class="chip" data-panel="invest" title="Investments">📈 ${money(invest.total(S))}</button>` : ''}
        ${S.debt > 0 ? `<button class="chip bad" data-panel="money" title="${S.dcp ? 'Debt Consolidation Plan' : 'Credit card debt at 25% a year'}">💳 −${money(S.debt)}</button>` : ''}
        <button class="chip cpf" data-panel="cpf" title="CPF total">CPF ${money(cpfTotal)}</button>
        <span class="chip" title="Joy: your life experiences">😊 ${Math.round(S.joy)}</span>
      </div>
      <nav class="menu">
        <button class="btn small-btn" data-panel="stats">📊 Stats</button>
        <button class="btn small-btn" data-panel="cpf">🏛️ CPF</button>
        <button class="btn small-btn" data-panel="money">💵 Money</button>
        ${S.stage === 'adult' || S.stage === 'senior' ? '<button class="btn small-btn" data-panel="invest">📈 Invest</button>' : ''}
        ${S.stage === 'adult' || S.stage === 'senior' ? '<button class="btn small-btn" data-panel="budget">📋 Budget</button><button class="btn small-btn" data-panel="holidays">✈️ Holidays</button>' : ''}
        <button class="btn small-btn" data-panel="shop">🛍️ Shop</button>
        ${S.stage === 'adult' || S.stage === 'senior' ? '<button class="btn small-btn" data-panel="home">🏠 Home</button>' : ''}
        <button class="btn small-btn" data-panel="menu">☰</button>
      </nav>
    </header>
    <div class="play">
    <div class="play-main">
    <main class="scene">${roomHtml()}</main>
    <section class="actions">
      <h2>${S.done ? 'Your life story is complete' : `Age ${S.age}: ${turnPrompt()}`}</h2>
      <div class="cards">${S.done ? btn('end', 'See your life summary', 'primary') : activityCards()}</div>
    </section>
    </div>
    ${ledgerHtml()}
    </div>`;
  if (S.ledgerFresh) S.ledgerFresh = false;
  app.querySelectorAll('[data-panel]').forEach((b) => (b.onclick = () => openPanel(b.dataset.panel)));
  const spend = app.querySelector('details.spend');
  if (spend) spend.ontoggle = () => (spendOpen = spend.open);
  app.querySelectorAll('[data-activity]').forEach((b) => (b.onclick = () => takeTurn(b.dataset.activity)));
  const endBtn = app.querySelector('[data-choice="end"]');
  if (endBtn) endBtn.onclick = endScreen;
}

function turnPrompt() {
  const years = sim.yearsThisTurn(S);
  return years > 1 ? `how will you spend the next ${years} years?` : 'what will you focus on this year?';
}

function activityCards() {
  return ACTIVITIES[S.stage].map((a) => {
    const locked = a.minAge && S.age < a.minAge;
    const stats = Object.keys(a.gains).map((k) => STATS[k].icon).join(' ');
    return `<button class="activity" data-activity="${a.id}" ${locked ? 'disabled' : ''}>
      <span class="a-icon">${a.icon}</span><span class="a-label">${a.label}</span>
      <span class="a-stats">${locked ? `From age ${a.minAge}` : stats}</span></button>`;
  }).join('');
}

function roomKind() {
  if (S.stage === 'adult' || S.stage === 'senior') {
    if (S.home) return { cls: 'home', label: `Your ${S.home.label}` };
    if (S.age >= 30) return { cls: 'rental', label: 'Rented flat' };
    return { cls: 'family', label: 'Room at your family’s flat' };
  }
  return { cls: S.stage, label: S.stage === 'child' ? 'Your bedroom' : 'Your room' };
}

function roomHtml() {
  const kind = roomKind();
  const items = sim.ownedItems(S);
  const grown = S.stage === 'adult' || S.stage === 'senior';
  const spouseStage = S.stage === 'senior' ? 'senior' : 'adult';
  const family = [[me(), 'player', esc(S.name)]];
  if (grown && S.spouse) family.push([lookOf(S.spouse, spouseStage), 'family-member', 'Your spouse']);
  if (grown) for (const c of S.children || []) {
    const age = S.age - c.bornAge;
    const st = age < 3 ? 'baby' : age < 13 ? 'child' : age < 21 ? 'teen' : 'adult';
    family.push([lookOf(c, st), 'family-member kid', `Your child, age ${age}`]);
  }
  return `
    <div class="room room-${kind.cls} stage-${S.stage}">
      <div class="wall">
        <div class="window"><div class="sky"></div><div class="hdb"></div></div>
        <span class="room-label">${kind.label}</span>
      </div>
      <div class="floor"></div>
      <div class="bed"><div class="pillow"></div><div class="blanket"></div></div>
      <div class="cabinet"></div>
      <div class="items">${placeItems(items)}</div>
      <div class="people">${family.map(([look, cls, alt], i) => walker(look, cls, alt, i, family.length)).join('')}</div>
    </div>`;
}

// Small things go on top of the low cabinet, big things on the floor.
const SHELF_SLOTS = [0, 1, 2, 3, 4];
// The left of the room fills first, keeping the cabinet on the right clear for as long as possible.
const FLOOR_SLOTS = [5, 6, 7, 15, 13, 11, 17, 10, 12, 16, 14, 8, 9];
function placeItems(items) {
  let shelf = 0, floor = 0;
  return items.map((it) => {
    const onShelf = !it.floor && shelf < SHELF_SLOTS.length;
    const slot = onShelf ? SHELF_SLOTS[shelf++] : FLOOR_SLOTS[floor++ % FLOOR_SLOTS.length];
    return `<span class="item slot-${slot}" title="${it.name}" data-item="${it.id}">${itemHtml(it)}</span>`;
  }).join('');
}

// ---------- a turn ----------

async function takeTurn(activityId) {
  if (busy) return;
  busy = true;
  try {
    const activity = ACTIVITIES[S.stage].find((a) => a.id === activityId);
    pushSnapshot(`${activity.icon} ${activity.label}`);
    await overspendCheck(sim.yearsThisTurn(S));
    // One click: how well it went is random (mini games are switched off for now).
    const score = 0.35 + Math.random() * 0.65;
    const gains = sim.activityGains(S, activity, score);
    sim.applyGains(S, gains);
    const fun = !['study', 'job', 'upskill', 'budget'].includes(activity.id);
    if (fun) S.joy += 1;
    const newHybrids = sim.checkHybrids(S);
    await dialog(`
      <div class="event"><div class="e-icon">${activity.icon}</div><h2>${activity.label}: ${scoreWord(score)}</h2></div>
      <p class="score">How it went: ${Math.round(score * 100)}%</p>
      <ul class="gains">${Object.entries(gains).map(([k, v]) => `<li>${STATS[k].icon} ${STATS[k].label} <b>+${v}</b></li>`).join('')}
      ${fun ? '<li>😊 Joy <b>+1</b></li>' : ''}</ul>
      ${newHybrids.map((h) => `<p class="unlock">✨ New hybrid stat: <b>${HYBRIDS[h].icon} ${HYBRIDS[h].label}</b></p>`).join('')}
      ${btn('ok', 'Continue', 'primary')}`);

    // World events change the years ahead.
    let opts = {};
    if (activity.job) opts.jobWage = Math.round(600 + 400 * score);
    const world = rollWorldEvent(S);
    if (world) {
      const w = world.run(S);
      opts = { ...opts, ...(w.opts || {}) };
      logEvent(`${w.icon} ${w.title}`);
      await dialog(`<div class="event world"><div class="e-icon">${w.icon}</div><p class="eyebrow">World event</p><h2>${w.title}</h2><p>${w.text}</p></div>${btn('ok', w.opts?.retrenched ? 'Look for a job' : 'OK', 'primary')}`);
      if (w.opts?.retrenched) await jobHunt('retrenched', 'recession');
    }

    const before = { stats: { ...S.stats } };
    const years = sim.yearsThisTurn(S);
    const startAge = S.age;
    const sum = sim.advanceYears(S, years, opts);
    S.totals = addTotals(S.totals, sum);
    if (S.stage === 'adult' || S.stage === 'senior') S.joy += LIFESTYLES[S.lifestyle].joy;
    recordTurn(startAge, years, sum, opts, activity, gains);
    S.ledgerFresh = true;
    await rateChangeNotice(startAge, S.age);
    if (sum.oaRanOut) await oaRanOutNotice(sum);

    // Personal events and gifts.
    const personal = rollPersonalEvent(S);
    if (personal) await runPersonalEvent(personal.run(S));
    for (const h of sim.checkHybrids(S)) toast(`✨ New hybrid stat: ${HYBRIDS[h].label}`);
    void before;

    closeModal();
    await milestones();
    save();
    render();
  } finally {
    busy = false;
  }
}

// The home loan was set to come from the OA, but the OA ran dry.
async function oaRanOutNotice(sum) {
  if (S.oaRanOutSeen && S.age - S.oaRanOutSeen < 10) return;
  S.oaRanOutSeen = S.age;
  const wage = sim.currentWage(S);
  const oaIn = wage > 0 ? cpf.monthlyContribution(S.age, wage, { selfEmployed: S.selfEmployed }).oa : 0;
  const why = S.selfEmployed
    ? `You're self-employed, so the only CPF you must pay is MediSave. <b>Nothing new goes into your OA</b>, but your home loan kept taking ${money(S.home.instalment)} from it every month until it was empty.`
    : wage <= 0
      ? `You have no salary right now, so nothing new goes into your OA, but your home loan kept taking ${money(S.home.instalment)} from it every month.`
      : `Your job adds about ${money(oaIn)} a month to your OA, but your home loan takes ${money(S.home.instalment)} a month, so the OA kept shrinking until it was empty.`;
  await dialog(`<div class="event"><div class="e-icon">🏛️</div><p class="eyebrow">Why is my OA at $0?</p><h2>Your OA has run out</h2>
    <p>${why}</p>
    <p>From now on the part your OA can't cover comes out of your cash: ${money(sum.oaRanOut)} so far. That's how it works in real life too: CPF pays the loan only while there's money in the OA.</p></div>
    <ul class="small">
      <li>Self-employed people can make <b>Voluntary Contributions</b> to CPF, which go into the OA, SA and MediSave like a salary would.</li>
      <li>Paying the loan in cash instead keeps your OA growing at 2.5% for retirement (change this in 🏠 Home).</li>
      <li>At 55, the money in your OA and SA forms your Retirement Account, so a low OA can mean smaller CPF LIFE payouts.</li>
    </ul>
    ${btn('ok', 'OK', 'primary')}`);
}

// CPF contribution and allocation rates change at set ages. Tell the player when they cross one.
async function rateChangeNotice(fromAge, toAge) {
  // Only matters if you're earning a wage now.
  if (toAge < 21 || !sim.isWorking(S)) return;
  const from = cpf.rateBand(fromAge);
  const to = cpf.rateBand(toAge);
  if (from === to) return;
  const total = (b) => b.employer + b.employee;
  const changedTotal = total(from) !== total(to);
  const row = (b, label) => `<tr><td>${label}</td><td>${b.employee}%</td><td>${b.employer}%</td><td><b>${total(b)}%</b></td><td>${b.oa}%</td><td>${b.sa}%</td><td>${b.ma}%</td></tr>`;
  logEvent(`📉 CPF rates changed at ${toAge}: now ${total(to)}% of pay (OA ${to.oa}%)`);
  await dialog(`<div class="event"><div class="e-icon">🏛️</div><p class="eyebrow">CPF rates change with age</p>
    <h2>${changedTotal ? `Your CPF contribution rate is now ${total(to)}%` : 'Your CPF money is split differently now'}</h2>
    <p>${changedTotal
      ? `From above ${from.maxAge}, you and your employer pay less into CPF (it was ${total(from)}%). You take home a little more pay, but less goes into your retirement savings.`
      : `Above ${from.maxAge}, the same ${total(to)}% of your pay goes into CPF, but less goes to your OA (for housing) and more to your ${toAge > 55 ? 'RA' : 'SA'} and MediSave, as retirement and healthcare get closer.`}</p></div>
    <div class="table-scroll"><table class="summary rates"><tr><th></th><th>You</th><th>Employer</th><th>Total</th><th>OA</th><th>${toAge > 55 ? 'RA' : 'SA'}</th><th>MA</th></tr>
    ${row(from, `Up to ${from.maxAge}`)}${row(to, to.maxAge === Infinity ? `Above ${from.maxAge}` : `${from.maxAge + 1} to ${to.maxAge}`)}</table></div>
    <p class="small">2026 rates, as % of monthly wages up to ${money(cpf.ORDINARY_WAGE_CEILING)}.</p>
    ${btn('ok', 'OK', 'primary')}`, { wide: true });
}

function addTotals(t = {}, sum) {
  const out = { ...t };
  for (const [k, v] of Object.entries(sum)) out[k] = (out[k] || 0) + v;
  return out;
}

function scoreWord(score) {
  if (score >= 0.9) return '🌟 Amazing!';
  if (score >= 0.6) return '👍 Well done!';
  if (score >= 0.3) return '🙂 Not bad!';
  return '😅 Keep practising!';
}

// Records what happened to the money this turn; the ledger beside the room shows it.
function recordTurn(startAge, years, sum, opts, activity, gains) {
  const young = S.stage === 'child' || S.stage === 'teen' || startAge < 21;
  const span = years > 1 ? `Ages ${startAge} to ${startAge + years - 1}` : `Age ${startAge}`;
  const rows = [];
  if (young) {
    rows.push(['Pocket money and earnings', money(sum.income), 'in']);
    if (sum.cpfIn) rows.push([`Into CPF from your job (employer paid ${money(sum.employerIn)})`, money(sum.cpfIn), 'in']);
  } else {
    if (sum.income - sum.payouts > 0.5) rows.push(['Take-home pay', money(sum.income - sum.payouts), 'in']);
    rows.push(['Living costs (incl. housing and kids)', `−${money(sum.spend - (sum.fun || 0))}`, 'out']);
    if (sum.cpfIn) rows.push([`Into CPF (employer paid ${money(sum.employerIn)})`, money(sum.cpfIn), 'in']);
    if (sum.housingOa) rows.push(['Home loan paid from OA', `−${money(sum.housingOa)}`, 'out']);
    if (sum.oaRanOut) rows.push(['Home loan paid in cash because your OA ran out', `−${money(sum.oaRanOut)}`, 'out']);
    if (sum.payouts) rows.push(['CPF LIFE payouts', money(sum.payouts), 'in']);
    if (sum.fun) rows.push(['Hobbies and shopping', `−${money(sum.fun)}`, 'out']);
    if (sum.holidays) rows.push(['Holidays', `−${money(sum.holidays)}`, 'out']);
    if (sum.cpfSaved) rows.push(['Your planned CPF top-ups', money(sum.cpfSaved), 'in']);
    if (sum.kidsCpf) rows.push(['Topped up your children\'s CPF', money(sum.kidsCpf), 'in']);
    if (sum.invested) rows.push(['Regular investing', money(sum.invested), 'in']);
    if (sum.investReturn) rows.push(['Investment returns', money(sum.investReturn), sum.investReturn < 0 ? 'out' : 'in']);
    if (sum.borrowed) rows.push(['Borrowed on credit cards', money(sum.borrowed), 'out']);
    if (sum.debtInterest) rows.push([S.dcp ? 'Debt plan interest' : 'Card interest (25% a year)', `−${money(sum.debtInterest)}`, 'out']);
    if (sum.debtPaid) rows.push(['Debt repaid', money(sum.debtPaid), 'in']);
    if (sum.wentWithout) rows.push(['Bills you couldn\'t pay (you went without)', money(sum.wentWithout), 'out']);
  }
  rows.push(['Interest earned (CPF and savings)', money(sum.interest), 'in']);
  if (opts.noPayMonths) rows.push([`Months without pay`, String(opts.noPayMonths), 'out']);
  S.lastTurn = { span, rows, years };
  const g = Object.entries(gains).map(([k, v]) => `${STATS[k].icon}+${v}`).join(' ');
  logEvent(`${activity.icon} ${activity.label} ${g}`, startAge);
}

function logEvent(text, age = S.age) {
  S.journal = S.journal || [];
  S.journal.unshift({ age, text });
  S.journal.length = Math.min(S.journal.length, 60);
}

function ledgerHtml() {
  const t = S.lastTurn;
  const total = cpf.cpfTotal(S.cpf);
  return `
    <aside class="ledger ${S.ledgerFresh ? 'fresh' : ''}" aria-label="Your money and life log">
      <section>
        <button class="ledger-link" data-panel="cpf" title="See how your CPF has grown">
        <h3>🏛️ CPF <span class="ledger-total">${money(total)}</span></h3>
        ${cpfBars()}
        <span class="ledger-hint">📈 Tap to see your CPF growth</span>
        </button>
        ${S.life ? `<p class="small">CPF LIFE ${S.age >= S.life.startAge ? `pays <b>${money(S.life.monthly)}</b>/month` : `starts at ${S.life.startAge}`}</p>` : ''}
      </section>
      ${S.stage === 'adult' || S.stage === 'senior' ? workHtml() : ''}
      <section>
        <button class="ledger-link" data-panel="stats" title="See all your stats">
        <h3>📊 Stats <span class="ledger-sub">😊 Joy ${Math.round(S.joy)}</span></h3>
        ${ledgerStats()}
        </button>
      </section>
      <section>
        <h3>💵 Cash</h3>
        <div class="cash-rows">
          <span>💵 Cash savings</span><b>${money(S.bank)}</b>
          ${invest.total(S, 'cash') > 0 ? `<span>📈 Invested (cash)</span><b>${money(invest.total(S, 'cash'))}</b>` : ''}
          ${invest.total(S, 'oa') + invest.total(S, 'sa') > 0 ? `<span>📈 Invested (CPFIS)</span><b>${money(invest.total(S, 'oa') + invest.total(S, 'sa'))}</b>` : ''}
          ${S.debt > 0 ? `<span class="neg">💳 ${S.dcp ? 'Debt plan' : 'Card debt'}</span><b class="neg">−${money(S.debt)}</b>` : ''}
          ${S.dcp ? `<span class="small">Debt plan instalment</span><b class="neg">${money(S.dcp.monthly)}/mo</b>` : ''}
          ${S.home ? `<span>🏠 Home loan</span><b>${money(S.home.loanBalance)}</b>` : ''}
        </div>
        ${S.debt > 0 && S.bank > 1000 ? `<button class="tip" data-panel="money">💡 You have ${money(S.bank)} in cash but owe ${money(S.debt)} at ${pctText(S.dcp ? sim.DCP.rate : sim.DEBT_INTEREST)}. Repaying is like earning that rate risk-free. Tap to repay.</button>` : ''}
      </section>
      <section>
        <h3>⏳ Last turn${t ? ` <span class="ledger-sub">${t.span}${t.years > 1 ? ', totals' : ''}</span>` : ''}</h3>
        ${t ? `<div class="turn-rows">${t.rows.map(([a, b, k]) => `<span>${a}</span><b class="${k === 'out' ? 'neg' : 'pos'}">${b}</b>`).join('')}</div>`
          : '<p class="small muted-ink">Pick an activity below to start. What happens to your money each turn shows up here.</p>'}
      </section>
      <section>
        <h3>📖 Life log</h3>
        <ol class="journal">${(S.journal || []).slice(0, 12).map((j) => `<li><span class="j-age">${j.age}</span>${esc(j.text)}</li>`).join('') || '<li class="muted-ink">Your story starts here.</li>'}</ol>
      </section>
    </aside>`;
}

// Your job and a month of money: what comes in, where it goes, what's left.
let spendOpen = false;
function workHtml() {
  const p = monthlyPlan();
  const job = sim.careerInfo(S);
  const working = sim.isWorking(S);
  const wage = sim.currentWage(S);
  const c = wage > 0 ? cpf.monthlyContribution(S.age, wage, { selfEmployed: S.selfEmployed }) : null;
  const canHunt = S.stage === 'adult' || (working && S.age < 65);
  const ls = S.stage === 'senior' && S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle] : LIFESTYLES[S.lifestyle];
  const line = (label, v, cls = 'neg') => (v > 0.5 ? `<span>${label}</span><b class="${cls}">${cls === 'neg' ? '−' : ''}${money(v)}</b>` : '');
  return `
      <section>
        <h3>💼 Work and money <span class="ledger-sub">per month</span></h3>
        <p class="job-line">${working && job ? `${job.icon} <b>${job.label}</b>${S.selfEmployed ? ' <small>(self-employed)</small>' : ''}${S.workMode === 'part' && S.stage === 'senior' ? ' <small>(part-time)</small>' : ''}` : `<span>🌅 <b>Retired</b>, no salary</span>`}
          ${canHunt ? `<button class="link-btn" data-panel="job">${working ? 'Look for a new job' : 'Find a job'}</button>` : ''}</p>
        <div class="cash-rows">
          ${wage > 0 ? `<span>Pay before CPF</span><b>${money(wage)} <small>(${money(wage * 12)}/yr)</small></b>
          <span>Your CPF${S.selfEmployed ? ' (MediSave only)' : ''}</span><b class="neg">−${money(c.employee)}</b>
          <span>Take-home pay</span><b class="pos">${money(p.pay)}</b>` : ''}
          ${p.payout ? `<span>CPF LIFE payout</span><b class="pos">${money(p.payout)}</b>` : ''}
          ${!p.income ? '<span>Money coming in</span><b>$0</b>' : ''}
        </div>
        <details class="spend" ${spendOpen ? 'open' : ''}>
          <summary><span>Spending</span><b class="neg">−${money(p.out)}</b></summary>
          <div class="cash-rows sub">
            ${line(`Everyday living (${ls.label})`, p.parts.living)}
            ${line(`Children (${p.parts.kidsCount})`, p.parts.kids)}
            ${line('Car', p.parts.car)}
            ${p.parts.allowance ? `<span>Allowance from grown-up children</span><b class="pos">+${money(p.parts.allowance)}</b>` : ''}
            ${line('Rent', p.rent)}
            ${line(p.loan.fromOa > 0.5 ? 'Home loan (the part your OA can\'t cover)' : 'Home loan', p.loanCash)}
            ${p.loan.fromOa > 0.5 ? `<span class="muted-ink">Home loan from your OA (not cash)</span><b class="muted-ink">${money(p.loan.fromOa)}</b>` : ''}
            ${line('Debt plan', p.dcp)}
            ${line('Hobbies', p.b.hobbies)}
            ${line('Shopping and treats', p.b.shopping)}
            ${line('Holidays (averaged)', p.holidays)}
          </div>
          <button class="link-btn" data-panel="budget">Change my budget</button>
        </details>
        <div class="cash-rows">
          ${p.saving ? `<span>Planned saving and investing</span><b>${money(p.saving)}</b>` : ''}
          <span><b>${p.left - p.saving < 0 ? 'Short each month' : 'Left over'}</b></span><b class="${p.left - p.saving < 0 ? 'neg' : 'pos'}">${p.left - p.saving < 0 ? '−' : ''}${money(Math.abs(p.left - p.saving))}</b>
        </div>
        ${p.left - p.saving < 0 && S.bank > 0 ? `<p class="small muted-ink">Taken from your ${money(S.bank)} cash savings${S.age >= 55 ? ', then your OA' : ''}.</p>` : ''}
      </section>`;
}

function ledgerStats() {
  const unlocked = sim.unlockedStats(S);
  const max = Math.max(30, ...unlocked.map((k) => S.stats[k]));
  const hybrids = Object.entries(HYBRIDS).filter(([k]) => S.hybrids[k]);
  return `<div class="mini-stats">${unlocked.map((k) => `
    <span class="ms-name">${STATS[k].icon} ${STATS[k].label}</span>
    <span class="bar"><span style="width:${(S.stats[k] / max) * 100}%"></span></span>
    <b>${Math.round(S.stats[k])}</b>`).join('')}</div>
    ${hybrids.length ? `<p class="mini-hybrids">${hybrids.map(([k, h]) => `<span>${h.icon} ${h.label} <b>${sim.hybridValue(S, k)}</b></span>`).join('')}</p>` : ''}`;
}

// A "Did you know?" box with a real Singapore figure.
function factBox(fact) {
  return fact ? `<aside class="fact"><b>💡 Did you know?</b><p>${fact.text}</p><small>Source: ${fact.source}</small></aside>` : '';
}

async function runPersonalEvent(e) {
  logEvent(`${e.icon} ${e.title}${e.gift ? ` (${money(e.gift)})` : ''}`);
  if (e.gift) return giftDialog(e);
  if (e.choices) {
    const c = await dialog(`<div class="event"><div class="e-icon">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p></div>
      ${factBox(e.fact)}
      <div class="row">${e.choices.map((c, i) => btn(i, c.label, i === 0 ? 'primary' : '')).join('')}</div>`);
    // A choice returns text, or { text, gift } to follow up with a gift to split.
    const result = e.choices[+c].run(S);
    logEvent(`↳ ${e.choices[+c].label}`);
    const r = typeof result === 'string' ? { text: result } : result;
    await dialog(`<div class="event"><div class="e-icon">${e.icon}</div><p>${r.text}</p></div>${btn('ok', 'OK', 'primary')}`);
    if (r.gift) await giftDialog(r.gift);
    return;
  }
  await dialog(`<div class="event"><div class="e-icon">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p></div>${factBox(e.fact)}${btn('ok', 'OK', 'primary')}`);
}

// A slider you can drag, plus a box to type an exact amount.
function amountControl(key, max, label) {
  const m = Math.max(0, Math.floor(max));
  return `<span class="amt" data-amt="${key}">
    <input type="range" min="0" max="${m}" step="1" value="0" aria-label="${label}" ${m ? '' : 'disabled'}>
    <label class="amt-box">$<input type="number" min="0" max="${m}" step="1" value="0" inputmode="numeric" aria-label="${label} amount" ${m ? '' : 'disabled'}></label>
  </span>`;
}

// Wires an amountControl. `clamp(v)` returns the allowed value; `onChange(v)` reacts to it.
function wireAmount(root, key, clamp, onChange) {
  const el = root.querySelector(`[data-amt="${key}"]`);
  if (!el) return;
  const [range, box] = el.querySelectorAll('input');
  const set = (raw, fromBox) => {
    const v = clamp(Math.max(0, Math.floor(+raw || 0)));
    range.value = v;
    if (!fromBox || +box.value !== v) box.value = v;
    onChange(v);
  };
  range.oninput = () => set(range.value, false);
  box.oninput = () => set(box.value, true);
  box.onfocus = () => box.select();
}

async function giftDialog(e) {
  const young = S.stage === 'child' || S.stage === 'teen';
  const room = sim.topUpRoom(S);
  const reliefLeft = Math.max(0, sim.TOP_UP_TAX_RELIEF_CAP - sim.topUpsThisYear(S));
  const buckets = [
    { key: 'treat', icon: '🎉', label: young ? 'Treat yourself' : 'Spend on something fun', note: 'Spend it now on something you enjoy. Joy goes up.' },
    { key: 'charity', icon: '💝', label: 'Give to charity', note: 'Help others. Joy and Communication go up a little.' },
    {
      key: 'cpf',
      icon: '🏛️',
      label: young ? 'Ask your parents to top up your CPF' : S.age < 55 ? 'CPF top-up (to SA)' : 'CPF top-up (to RA)',
      note: young
        ? `Give it to your parents and they top up your Special Account under the Retirement Sum Topping-Up Scheme. It earns 4% or more until you retire, but you can't take it out. (Top-ups to children get no tax relief.) ${room > 0 ? '' : 'Your SA is already at the FRS.'}`
        : `Earns 4% or more, but stays locked for retirement. ${topUpLimitNote(room, reliefLeft)}`,
      cap: room,
    },
  ];
  const parts = { treat: 0, charity: 0, cpf: 0 };
  const placed = () => parts.treat + parts.charity + parts.cpf;
  const done = dialog(`
    <div class="event"><div class="e-icon">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p>
    <p class="gift-amount">${money(e.gift)}</p></div>
    <p class="small">Drag a slider or type an amount. Whatever you don't place stays in your cash savings.</p>
    <div class="alloc">${buckets.map((b) => `
      <div class="alloc-row">
        <span class="al-icon">${b.icon}</span>
        <span class="al-text"><b>${b.label}</b><small>${b.note}</small></span>
        ${amountControl(b.key, Math.min(e.gift, b.cap ?? Infinity), b.label)}
      </div>`).join('')}
      <div class="alloc-row cash-row">
        <span class="al-icon">💵</span>
        <span class="al-text"><b>Cash savings</b><small>Spend it anywhere. Left untouched for a year, it earns ${pctText(sim.SAVINGS_INTEREST.untouched)} interest.</small></span>
        <b class="al-val" id="gift-cash">${money(e.gift)}</b>
      </div>
    </div>
    ${btn('ok', 'Confirm', 'primary')}`, { wide: true });
  for (const b of buckets) {
    wireAmount(modalBox, b.key,
      (v) => Math.min(v, e.gift - (placed() - parts[b.key]), b.cap ?? Infinity),
      (v) => { parts[b.key] = v; $('#gift-cash').textContent = money(e.gift - placed()); });
  }
  await done;
  const alloc = sim.allocateGift(S, { ...parts, cash: e.gift - placed() });
  if (parts.cpf) toast(`🏛️ ${money(parts.cpf - alloc.refused)} added to your CPF ${S.age < 55 ? 'SA' : 'RA'}${alloc.matched ? `, plus ${money(alloc.matched)} matched by the Government (MRSS)` : ''}`);
  if (parts.treat || parts.charity) toast(`😊 ${parts.treat ? `Spent ${money(parts.treat)} on fun` : ''}${parts.treat && parts.charity ? ' and ' : ''}${parts.charity ? `gave ${money(parts.charity)} to charity` : ''}`);
  if (alloc.refused) toast(`Your CPF is already at the top-up limit, so ${money(alloc.refused)} went to your cash.`);
  if (parts.cpf && !young && sim.topUpsThisYear(S) > sim.TOP_UP_TAX_RELIEF_CAP) toast('Top-ups this year are above $8,000: the extra still grows, but gets no tax relief.');
}

const pctText = (r) => `${(r * 100).toFixed(Math.abs(r) < 0.001 ? 2 : 1).replace(/\.0+$/, '')}%`;

// Explains the two limits on cash top-ups (RSTU).
function topUpLimitNote(room, reliefLeft) {
  const cap = S.age < 55 ? `your SA reaches the FRS (${money(cpf.RETIREMENT_SUMS.FRS)})` : `your RA reaches the ERS (${money(cpf.RETIREMENT_SUMS.ERS)})`;
  if (room <= 0) return `Limit reached: you can only top up until ${cap}.`;
  return `Limit: ${money(room)} more until ${cap}. Tax relief on the first ${money(sim.TOP_UP_TAX_RELIEF_CAP)} a year (${money(reliefLeft)} left this year).`;
}

// ---------- stage changes and milestones ----------

async function milestones() {
  let rewound = false;
  const stage = sim.ageStage(S.age);
  if (S.age >= STAGES.senior.endAge) {
    S.done = true;
    save();
    render();
    return endScreen();
  }
  if (stage !== S.stage) {
    S.stage = stage;
    logEvent(`🎉 New life stage: ${STAGES[stage].label}`);
    await stageIntro(stage);
  }
  if (S.stage === 'adult' && !S.home && S.age >= 27 && (S.homeAskedAt == null || S.age - S.homeAskedAt >= 6)) {
    await homeDecision();
  }
  if (S.dcpNew) {
    S.dcpNew = false;
    logEvent(`💳 Debt Consolidation Plan: ${money(S.dcp.monthly)}/month`);
    await dialog(`<div class="event"><div class="e-icon">💳</div><h2>Your debt is out of control</h2>
      <p>You've been spending more than you earn, and your credit card debt is now <b>${money(S.debt)}</b>, more than a year of income. At 25% interest it grows faster than you can pay.</p>
      <p>In Singapore, banks stop lending once your unsecured debt passes 12 months of income. They roll your card debts into a <b>Debt Consolidation Plan</b>: one loan at about ${pctText(sim.DCP.rate)} a year, repaid at <b>${money(S.dcp.monthly)}/month</b> over ${sim.DCP.years} years. Your cards are frozen and you switch to a simple lifestyle until it's cleared.</p>
      <p class="small">You can pay it off faster from the Money panel. If you're struggling for real, Credit Counselling Singapore offers free help.</p></div>
      <div class="row">${btn('ok', 'OK, carry on', 'primary')}${btn('rewind', '⏪ Go back and choose differently')}</div>`).then(async (c) => {
      if (c === 'rewind' && (await rewindDialog('Go back to before the debt built up, and try a cheaper lifestyle or a budget that fits your pay.'))) rewound = true;
    });
    if (rewound) return 'rewound';
  }
  const offer = sim.careerSwitchOffer(S);
  if (offer) await careerSwitchDialog(offer);
  for (const child of S.children || []) {
    if (!child.uni && S.age - child.bornAge >= 19) await universityDecision(child);
  }
  if (S.stage === 'senior' && S.age >= 65 && !S.life) await cpfLifeDecision();
  if (S.stage === 'senior' && S.age >= 70 && S.workMode !== 'retired') {
    S.workMode = 'retired';
    await dialog(`<div class="event"><div class="e-icon">🎉</div><h2>Happy retirement!</h2><p>At 70 you stop working for good. From now on your income is CPF LIFE plus whatever you saved.</p></div>${btn('ok', 'OK', 'primary')}`);
  }
  closeModal();
}

// Looking for a job: after a retrenchment, or any time you want a change.
// Offers depend on your stats, experience and the economy; better jobs unlock as you upskill.
async function jobHunt(reason, economy) {
  if (reason === 'choice' && S.jobChangedAge === S.age) {
    await dialog(`<div class="event"><div class="e-icon">💼</div><h2>You've just changed jobs</h2><p>Give it a year before looking again.</p></div>${btn('ok', 'OK', 'primary')}`);
    return;
  }
  // Offers are fixed for this age, so closing and reopening doesn't re-roll them.
  if (!S.jobMarket || S.jobMarket.age !== S.age || S.jobMarket.reason !== reason) {
    const eco = economy || (Math.random() < 0.15 ? 'boom' : Math.random() < 0.15 ? 'recession' : 'normal');
    S.jobMarket = { age: S.age, reason, ...sim.jobOffers(S, eco) };
  }
  const m = S.jobMarket;
  const now = sim.careerInfo(S);
  const working = sim.isWorking(S) && reason !== 'retrenched';
  const statName = (k, hybrid) => (hybrid ? `${HYBRIDS[k].icon} ${HYBRIDS[k].label}` : `${STATS[k].icon} ${STATS[k].label}`);
  const change = (pay) => {
    if (!working || !S.salary) return '';
    const d = pay / S.salary - 1;
    return `<em class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : ''}${Math.round(d * 100)}%</em>`;
  };
  const c = await dialog(`<div class="event"><div class="e-icon">💼</div>
    <p class="eyebrow">The job market is ${sim.ECONOMY[m.economy].label}</p>
    <h2>${reason === 'retrenched' ? 'Find your next job' : 'Look for a new job'}</h2>
    <p>${reason === 'retrenched'
      ? `You were retrenched${now ? ` as ${now.label}` : ''}. Employers are paying less in a recession, but your skills still count. Pick a job to start once your months out of work are over.`
      : `You earn ${money(S.salary)} a month${now ? ` as ${now.label}` : ''}. Offers depend on your stats, your years of experience, your Career Skills and the economy.`}</p></div>
    <div class="careers">${m.offers.map((o, i) => `
      <button class="career" data-choice="${i}"><b>${o.icon} ${o.label}</b><span>${money(o.pay)}/month ${change(o.pay)}</span>
      <small>${o.selfEmployed ? '⚠️ Self-employed: no employer CPF, only MediSave is compulsory, so your OA and SA stop growing unless you top them up.' : `Employer adds ${money(cpf.monthlyContribution(S.age, o.pay).employer)} a month to your CPF.`}${o.desc ? ` ${o.desc}` : ''}</small></button>`).join('')}
    </div>
    ${m.locked.length ? `<h3>Better jobs you could reach</h3><ul class="small locked-jobs">${m.locked.map((o) => `<li>${o.icon} <b>${o.label}</b>, about ${money(o.pay)}/month: needs ${o.needs.map(([k, v]) => `${statName(k, o.hybrid)} ${v}`).join(' and ')}</li>`).join('')}</ul>
    <p class="small">Upskill with a SkillsFuture course or other activities to raise these stats.</p>` : ''}
    <div class="row">${working ? btn('stay', 'Stay in my job') : ''}</div>`, { wide: true });
  if (c === 'stay' || c == null) return;
  const o = m.offers[+c];
  sim.takeJob(S, o);
  S.jobMarket = null;
  logEvent(`${o.icon} New job: ${o.label} (${money(o.pay)}/month)`);
  toast(`${o.icon} You start as ${o.label} at ${money(o.pay)} a month.`);
}

async function careerSwitchDialog(c) {
  (S.switchOffers ||= {})[c.id] = S.age;
  const now = sim.careerInfo(S);
  const level = c.stat ? `${STATS[c.stat].icon} ${STATS[c.stat].label} ${Math.round(S.stats[c.stat])}` : `${HYBRIDS[c.hybrid].icon} ${HYBRIDS[c.hybrid].label} ${sim.hybridValue(S, c.hybrid)}`;
  const empCpf = (w) => cpf.monthlyContribution(S.age, w).employer;
  const ch = await dialog(`<div class="event"><div class="e-icon">${c.icon}</div><p class="eyebrow">A new door opens · ${level}</p>
    <h2>Become a ${c.label}?</h2><p>${c.desc}</p></div>
    <table class="summary">
      <tr><th></th><th>Now: ${now ? now.label : 'your job'}</th><th>New</th></tr>
      <tr><td>Monthly pay</td><td>${money(S.salary)}</td><td><b>${money(c.pay)}</b>${c.selfEmployed ? ' (on average)' : ''}</td></tr>
      <tr><td>Employer CPF each month</td><td>${S.selfEmployed ? '$0' : money(empCpf(S.salary))}</td><td>${c.selfEmployed ? '$0' : money(empCpf(c.pay))}</td></tr>
    </table>
    ${c.selfEmployed ? `<p class="small">⚠️ You'd be self-employed: no employer CPF, no year-end bonus, and you only have to pay into MediSave. Your OA and SA grow only if you top them up yourself, so plan for retirement on your own.</p>` : ''}
    <div class="row">${btn('go', 'Make the switch', 'primary')}${btn('stay', 'Stay where I am')}</div>`, { wide: true });
  if (ch === 'go') {
    sim.switchCareer(S, c.id);
    logEvent(`${c.icon} Became a ${c.label}`);
    toast(`${c.icon} You're now a ${c.label}!`);
  }
}

async function universityDecision(child) {
  const fees = sim.UNI_FEES * (S.spouse ? 0.5 : 1);
  const oaMax = S.cpf.oa * 0.4;
  const c = await dialog(`
    <div class="event"><div class="e-icon">🎓</div><h2>Your child is going to university!</h2>
    <p>Four years of subsidised fees come to about ${money(sim.UNI_FEES)}${S.spouse ? `, so your half is <b>${money(fees)}</b>` : ''}. How will you pay?</p></div>
    <div class="careers">
      <button class="career" data-choice="cash"><b>Pay in cash</b><small>Your CPF stays untouched.</small></button>
      <button class="career" data-choice="oa"><b>CPF Education Scheme</b><small>Use up to 40% of your OA (${money(oaMax)} now). Your child repays it to your OA, with 2.5% interest, over 12 years after graduating.</small></button>
      <button class="career" data-choice="loan"><b>My child takes a tuition fee loan</b><small>Costs you nothing now; your child starts working life with a loan to repay.</small></button>
    </div>`);
  const r = sim.payUniversity(S, child, c);
  if (c === 'oa') toast(`🎓 ${money(r.used)} from your OA${r.cash ? `, ${money(r.cash)} in cash` : ''}`);
  if (c === 'loan') S.joy -= 1;
}

async function stageIntro(stage) {
  const st = STAGES[stage];
  dialog(`
    <p class="eyebrow">${st.label} · age ${S.age}</p>
    <h2>${st.intro.title}</h2>
    ${st.intro.body.map((p) => `<p>${p}</p>`).join('')}
    ${stage !== 'child' ? `<div class="grown"><span id="grown-me">${person(me(stage), 'walking')}</span><div><p class="small">You've grown up!</p></div></div>` : ''}
    ${btn('ok', "Let's go", 'primary')}`, { wide: true });
  modalBox.querySelectorAll('[data-outfit]').forEach((b) => (b.onclick = () => {
    S.look.outfit = +b.dataset.outfit;
    modalBox.querySelectorAll('[data-outfit]').forEach((x) => x.classList.toggle('on', x === b));
    $('#grown-me').innerHTML = person(me(stage), 'walking');
  }));
  await new Promise((r) => (modalBox.onclick = (e) => e.target.closest('[data-choice]') && r()));
  if (stage === 'adult') await adultStart();
  if (stage === 'senior') await turning55();
  closeModal();
  render();
}

async function adultStart() {
  S.education = sim.educationFor(S);
  const ed = EDUCATION[S.education];
  const opts = sim.careerOptions(S);
  const c = await dialog(`
    <p class="eyebrow">Your education</p>
    <h2>You finished with a ${ed.label}</h2>
    <p class="small">Knowledge ${Math.round(S.stats.knowledge)}: University needs ${EDUCATION.university.minKnowledge}, Polytechnic ${EDUCATION.poly.minKnowledge}. Your qualification sets your starting pay.</p>
    <h3>Choose your first job</h3>
    <div class="careers">${opts.map((o) => `
      <button class="career" data-choice="${o.id}" ${o.eligible ? '' : 'disabled'}>
        <span class="c-icon">${o.icon}</span><b>${o.label}</b>
        <span>${money(o.startPay)}/month${o.selfEmployed ? ' (varies)' : ''}</span>
        <small>${Object.entries(o.needs).map(([k, v]) => `${STATS[k].icon} ${v}`).join(' ') || 'No requirements'}${o.selfEmployed ? ' · Self-employed: no employer CPF, only MediSave' : ''}</small>
      </button>`).join('')}</div>`, { wide: true });
  sim.chooseCareer(S, c);
  logEvent(`💼 First job: ${opts.find((o) => o.id === c).label}`);
  const career = opts.find((o) => o.id === c);
  const contrib = cpf.monthlyContribution(S.age, S.salary, { selfEmployed: S.selfEmployed });
  await dialog(`
    <h2>${career.icon} You're ${/^[aeiou]/i.test(career.label) ? 'an' : 'a'} ${career.label}!</h2>
    <p>Pay: <b>${money(S.salary)}</b> a month.</p>
    ${S.selfEmployed
      ? `<p>As a self-employed person, only MediSave contributions are required (${money(contrib.ma)} a month). Nobody else adds to your OA or SA, so saving for your home and retirement is up to you.</p>`
      : `<p>Each month you put <b>${money(contrib.employee)}</b> into CPF and your employer adds <b>${money(contrib.employer)}</b>. It's split into OA ${money(contrib.oa)}, SA ${money(contrib.sa)} and MediSave ${money(contrib.ma)}.</p>`}
    ${btn('ok', 'Next', 'primary')}`);
  await lifestyleDialog();
}

// For a lifestyle choice: what it would cost you now, and what's left of your pay.
function lifestyleFit(k, takeHome) {
  const was = S.lifestyle;
  S.lifestyle = k;
  const p = monthlyPlan();
  S.lifestyle = was;
  return `<small class="${p.left < 0 ? 'neg' : 'pos'}">For you now: ${money(p.living)}/month. ${p.left >= 0 ? `Leaves ${money(p.left)}/month to save.` : `⚠️ ${money(-p.left)}/month more than you earn!`}</small>`;
}

async function lifestyleDialog() {
  const takeHome = sim.takeHome(S);
  const c = await dialog(`
    <h2>How do you want to live?</h2>
    <p>Your take-home pay is about <b>${money(takeHome)}</b> a month after CPF. This is your everyday spending (food, transport, bills). It grows as you earn more, so each lifestyle is a share of your pay, with a minimum. Hobbies, shopping and holidays are planned in your Budget.</p>
    <div class="careers">${Object.entries(LIFESTYLES).map(([k, l]) => `
      <button class="career ${S.lifestyle === k ? 'on' : ''}" data-choice="${k}"><span class="c-icon">${l.icon}</span><b>${l.label}</b>
      <span>${Math.round(l.share * 100)}% of pay (at least ${money(l.monthly)})</span><small>${l.desc}. Joy +${l.joy} every few years</small>
      ${lifestyleFit(k, takeHome)}</button>`).join('')}</div>
    <p class="small">Housing, children and a car cost extra. You can change this any time in your Budget.</p>`);
  S.lifestyle = c;
  S.debtCrisis = false;
}

async function homeDecision() {
  S.homeAskedAt = S.age;
  const picked = await chooseHome(`🏠 Ready for your own home?`);
  if (picked) await dialog(`<div class="event"><div class="e-icon">🔑</div><h2>Welcome home!</h2><p>You bought a ${S.home.label}. Your room will look a bit different now.</p></div>${btn('ok', 'OK', 'primary')}`);
}

// Lists homes the player is eligible for, with the loan limits. Returns true if one was bought.
async function chooseHome(title, { leaveLabel } = {}) {
  const quotes = sim.homeQuotes(S);
  const income = sim.grossIncome(S);
  const c = await dialog(`
    <h2>${title}</h2>
    <p>You have <b>${money(S.cpf.oa)}</b> in your OA and <b>${money(S.bank)}</b> in cash. ${S.spouse ? 'You and your spouse each pay half.' : ''} Household income: <b>${money(income)}</b>/month.</p>
    <ul class="facts small">
      <li><b>Loan limits:</b> HDB flats: loan repayments can't be more than 30% of household income (Mortgage Servicing Ratio). All property: total debt repayments can't be more than 55% (MAS Total Debt Servicing Ratio, tested at 4% interest).</li>
      <li><b>Paying:</b> loans cover up to 75%. The 25% down payment and the Buyer's Stamp Duty can come from your OA (private property needs at least 5% in cash). Monthly repayments can come from your OA too, but that's money not growing for retirement.</li>
      ${S.spouse ? '' : '<li>Singles can buy an HDB flat from 35 (2-room Flexi BTO or resale). Private property has no age limit.</li>'}
    </ul>
    <div class="careers">${quotes.map((q) => `
      <button class="career" data-choice="${q.id}" ${q.affordable ? '' : 'disabled'}>
        <span class="c-icon">${housingIcon(q)}</span><b>${q.label}</b><span>${money(q.price / q.share)}${q.share < 1 ? ` (your half ${money(q.price)})` : ''}</span>
        <small>Upfront ${money(q.down + q.bsd)} incl. stamp duty ${money(q.bsd)}: OA ${money(q.fromOa)}, cash ${money(q.fromCash)}<br>
        Loan ${money(q.instalment)}/month for ${q.years} years<br>
        ${q.kind === 'hdb' ? `MSR ${pct(q.msrPct)} ${q.msrOk ? '✅' : '❌ over 30%'} · ` : ''}TDSR ${pct(q.tdsrPct)} ${q.tdsrOk ? '✅' : '❌ over 55%'}
        ${q.affordable || !q.msrOk || !q.tdsrOk ? '' : '<br>❌ not enough cash'}</small>
      </button>`).join('') || '<p>No homes available to you yet.</p>'}</div>
    <div class="row">${btn('none', leaveLabel || (S.age >= 30 || S.spouse ? `Keep renting (${money(RENT_MONTHLY * (S.spouse ? 0.5 : 1))}/month)` : 'Not yet, stay with family'))}</div>`, { wide: true });
  if (c === 'none') return false;
  const q = sim.buyHome(S, c);
  logEvent(`🔑 Bought a ${q.label}`);
  const how = await dialog(`
    <h2>How will you pay the monthly loan?</h2>
    <p>Your share is <b>${money(q.instalment)}</b> a month.</p>
    <div class="careers">
      <button class="career" data-choice="oa"><b>From my CPF OA</b><small>Keeps more cash in hand. The CPF you use (plus 2.5% accrued interest) must be refunded to your CPF when you sell.</small></button>
      <button class="career" data-choice="cash"><b>In cash</b><small>Your OA keeps growing at 2.5% or more for retirement, but you have less to spend.</small></button>
    </div>`);
  S.home.payWith = how;
  return true;
}

function housingIcon(h) {
  return { flexi2: '🏠', bto3: '🏢', bto4: '🏬', resale5: '🏘️', condo: '🏙️' }[h.id] || '🏠';
}

const pct = (x) => `${Math.round(x * 100)}%`;

async function turning55() {
  const before = { ...S.cpf };
  const sums = cpf.RETIREMENT_SUMS;
  const r = sim.formRA(S);
  logEvent(`🏛️ Retirement Account formed: ${money(S.cpf.ra)}`);
  const est = (ra) => money(cpf.cpfLifePayout(ra * Math.pow(1 + cpf.INTEREST.ra, 10), 65));
  const oaRoom = Math.min(S.cpf.oa, sim.topUpRoom(S));
  const c = await dialog(`
    <h2>🎂 You're 55: your Retirement Account</h2>
    <p>CPF has created your Retirement Account (RA). It moved your SA savings first, then your OA savings, <b>up to the Full Retirement Sum (FRS) of ${money(sums.FRS)}</b>. Your SA is now closed.</p>
    <table class="summary">
      <tr><td>Moved from SA (${money(before.sa)})</td><td>${money(r.fromSa)}</td></tr>
      <tr><td>Moved from OA (${money(before.oa)})</td><td>${money(r.fromOa)}</td></tr>
      <tr><td><b>RA balance</b></td><td><b>${money(S.cpf.ra)}</b></td></tr>
      <tr><td>Left in your OA</td><td>${money(S.cpf.oa)}</td></tr>
      <tr><td>Estimated CPF LIFE payout from 65</td><td>about <b>${est(S.cpf.ra)}</b>/month</td></tr>
    </table>
    <p>${r.metTarget ? 'You met the FRS. 🎉' : `You're ${money(sums.FRS - S.cpf.ra)} short of the FRS, so your payouts will be smaller. You can top up your RA with cash any time from the Money panel.`}</p>
    <h3>Do you want to change it?</h3>
    <div class="careers">
      <button class="career" data-choice="keep"><b>Keep it as it is</b><small>${r.metTarget ? 'Stay at the FRS' : 'Keep what you have'}: about ${est(S.cpf.ra)}/month from 65.</small></button>
      <button class="career" data-choice="ers" ${oaRoom > 0 ? '' : 'disabled'}><b>Move OA savings in, towards the ERS</b><small>${oaRoom > 0 ? `Move up to ${money(oaRoom)} from your OA into your RA (the cap is the Enhanced Retirement Sum, ${money(sums.ERS)}). About ${est(S.cpf.ra + oaRoom)}/month from 65, but that money can't be withdrawn.` : 'You have no OA savings left to move.'}</small></button>
      <button class="career" data-choice="brs" ${sim.canPledge(S) ? '' : 'disabled'}><b>Pledge my flat and keep only the BRS</b><small>${sim.canPledge(S) ? `Withdraw ${money(S.cpf.ra - sums.BRS)} as cash, leaving the Basic Retirement Sum (${money(sums.BRS)}). Payouts drop to about ${est(sums.BRS)}/month. If you sell the flat later, you must refund it to your RA.` : S.home ? `Needs a flat whose lease lasts until you're at least 95 (yours has ${S.home.leaseLeft} years left) and an RA above the BRS.` : 'Only for people who own a home with enough lease left.'}</small></button>
    </div>
    <p class="small">The BRS only applies if you choose to pledge a property; otherwise the RA is filled up to the FRS. Cash top-ups up to the ERS are allowed any time from 55 (only top-ups up to the FRS get tax relief). Payout estimates use the CPF Board's figures for people turning 55 in 2026, on the Standard Plan.</p>`, { wide: true });
  if (c === 'ers') {
    const moved = sim.transferOaToRa(S, oaRoom);
    logEvent(`🏛️ Moved ${money(moved)} from OA to RA`);
  }
  if (c === 'brs') {
    const out = sim.pledgeToBrs(S);
    logEvent(`🏠 Pledged the flat and withdrew ${money(out)} from the RA`);
    toast(`💵 ${money(out)} withdrawn to your cash`);
  }
  // Withdrawals at 55: $5,000 for everyone, or all your OA once the FRS (or BRS with a pledge) is met.
  const met = S.cpf.ra >= sums.FRS || S.pledged;
  const withdrawable = met ? Math.max(S.cpf.oa, Math.min(5000, S.cpf.oa + S.cpf.ra)) : Math.min(5000, S.cpf.oa + S.cpf.ra);
  if (withdrawable > 0) {
    const w = await dialog(`
      <h2>Withdraw some CPF?</h2>
      <p>You may withdraw <b>${money(withdrawable)}</b> now${met ? ': everything left in your OA, as you met your retirement sum' : ' (anyone can take out up to $5,000 at 55)'}. Money left in the OA keeps earning 2.5% or more, and you can withdraw it later.</p>
      <div class="row">${btn('take', `Withdraw ${money(withdrawable)}`)}${btn('keep', 'Leave it in CPF', 'primary')}</div>`);
    if (w === 'take') sim.withdrawOa(S, withdrawable);
  }
  const rl = await dialog(`
    <h2>What kind of retirement do you want?</h2>
    <p>From now on, your everyday spending follows the retirement lifestyle you choose. Hobbies, shopping and holidays are planned separately in your Budget.</p>
    <div class="careers">${Object.entries(RETIREMENT_LIFESTYLES).map(([k, l]) => `
      <button class="career" data-choice="${k}"><b>${l.label}</b><span>${money(l.monthly)}/month</span><small>${l.desc}</small></button>`).join('')}</div>`);
  S.retirementLifestyle = rl;
  await workDialog();
}

async function workDialog() {
  const c = await dialog(`
    <h2>Keep working?</h2>
    <p>Singapore's retirement age is 63 and employers must offer re-employment up to 68. Working longer means more CPF contributions and fewer years living on savings.</p>
    <div class="row">${btn('full', 'Keep working full-time', 'primary')}${btn('part', 'Work part-time (half pay)')}${btn('retired', 'Retire now')}</div>`);
  S.workMode = c;
}

async function cpfLifeDecision() {
  const now = cpf.cpfLifePayout(S.cpf.ra, 65);
  const later = cpf.cpfLifePayout(S.cpf.ra * Math.pow(1 + cpf.INTEREST.ra, 5), 70);
  const start = await dialog(`
    <h2>🎂 You're 65: start CPF LIFE?</h2>
    <p>Your RA has <b>${money(S.cpf.ra)}</b>. CPF LIFE turns it into a monthly income for as long as you live.</p>
    <table class="summary">
      <tr><td>Start now (Standard plan)</td><td><b>${money(now)}</b>/month</td></tr>
      <tr><td>Defer to 70 (up to 7% more for each year you wait)</td><td>about <b>${money(later)}</b>/month</td></tr>
    </table>
    ${factBox(FACTS.lifeExpectancy)}
    <div class="row">${btn('65', 'Start now', 'primary')}${btn('70', 'Defer to 70')}</div>`);
  const plan = await dialog(`
    <h2>Choose your CPF LIFE plan</h2>
    <div class="careers">${Object.entries(sim.LIFE_PLANS).map(([k, p]) => `
      <button class="career" data-choice="${k}"><b>${p.label}</b><span>about ${money((+start === 65 ? now : later) * p.factor)}/month to start</span><small>${p.desc}</small></button>`).join('')}</div>
    <p class="small">Payout figures are estimates.</p>`);
  sim.startCpfLife(S, +start, plan);
  logEvent(`🏛️ CPF LIFE ${sim.LIFE_PLANS[plan].label} plan, starting at ${start}`);
  if (S.workMode !== 'retired') await workDialog();
}

// ---------- panels ----------

async function openPanel(kind) {
  if (busy) return;
  const panels = { stats: statsPanel, cpf: cpfPanel, money: moneyPanel, shop: shopPanel, menu: menuPanel, home: homePanel, invest: investPanel, budget: budgetPanel, holidays: holidaysPanel, job: () => jobHunt('choice') };
  await panels[kind]();
  closeModal();
  save();
  render();
}

async function homePanel() {
  for (;;) {
    const h = S.home;
    if (!h) {
      const bought = await chooseHome('🏠 Find a home', { leaveLabel: 'Close' });
      if (!bought) return;
      continue;
    }
    const sale = housing.saleBreakdown(h);
    const owed = housing.cpfToRefund(h);
    const lbsOk = sim.lbsCheck(S).ok;
    const c = await dialog(`
      <h2>${housingIcon(h)} Your ${h.label}</h2>
      <table class="summary">
        <tr><td>Value of your share (today's dollars)</td><td>${money(sale.sale)}</td></tr>
        <tr><td>Lease left</td><td>${h.leaseLeft} years</td></tr>
        <tr><td>Loan left</td><td>${money(h.loanBalance)}${h.loanBalance > 1 ? ` (${money(h.instalment)}/month from ${h.payWith === 'oa' ? 'OA first' : 'cash'})` : ''}</td></tr>
        <tr><td>CPF used so far</td><td>${money(h.cpfPrincipal)}</td></tr>
        <tr><td>Accrued interest on it (2.5%)</td><td>${money(h.cpfAccrued)}</td></tr>
        <tr><td>If you sold today: back to your CPF</td><td>${money(sale.refund)}</td></tr>
        <tr><td>If you sold today: cash to you</td><td>${money(sale.cash)}</td></tr>
      </table>
      <p class="small">When you sell, the CPF you used plus accrued interest goes back into your CPF${S.age >= 55 ? ' (to your RA first, up to the FRS)' : ''}, so it's there for retirement.</p>
      <div class="careers">
        ${h.loanBalance > 1 ? `<button class="career" data-choice="pay"><b>Pay the loan ${h.payWith === 'oa' ? 'in cash' : 'from my OA'} instead</b><small>${h.payWith === 'oa' ? 'Lets your OA keep growing for retirement.' : 'Frees up cash each month.'}</small></button>` : ''}
        ${owed > 1 ? `<button class="career" data-choice="vhr" ${S.bank < 1000 ? 'disabled' : ''}><b>Voluntary Housing Refund</b><small>Put up to ${money(Math.min(owed, S.bank, 20000))} of cash back into your CPF now. It earns CPF interest and you'll owe less when you sell.</small></button>` : ''}
        <button class="career" data-choice="move"><b>Sell and move</b><small>Upgrade or right-size. ${S.age >= 55 ? 'Moving to a 3-room or smaller flat can earn the Silver Housing Bonus.' : ''}</small></button>
        ${h.kind === 'hdb' && S.age >= 55 ? `<button class="career ${lbsOk ? '' : 'dim'}" data-choice="lbs"><b>Lease Buyback Scheme</b><small>${lbsOk ? 'Sell part of your lease back to HDB and keep living here. The money tops up your RA for bigger CPF LIFE payouts, plus a cash bonus.' : 'Not available to you right now. Tap to see why.'}</small></button>` : ''}
      </div>
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    if (c === 'pay') h.payWith = h.payWith === 'oa' ? 'cash' : 'oa';
    if (c === 'vhr') {
      const a = sim.voluntaryHousingRefund(S, Math.min(owed, 20000));
      toast(`🏛️ Refunded ${money(a)} to your CPF`);
    }
    if (c === 'lbs') await leaseBuybackDialog();
    if (c === 'move') await moveHome();
    render();
  }
}

async function leaseBuybackDialog() {
  const check = sim.lbsCheck(S);
  if (!check.ok) {
    await dialog(`<h2>Lease Buyback Scheme</h2>
      <p>The LBS lets HDB flat owners aged 65 and above sell the tail end of their lease to HDB, keep living in the flat, and use the money for bigger CPF LIFE payouts. You can't use it right now because:</p>
      <ul class="facts">${check.reasons.map((r) => `<li>${r}</li>`).join('')}</ul>
      <p class="small">HDB rules (2026): all owners 65 or older, at least one a Singapore Citizen, gross household income of $14,000 a month or less, lived in the flat for at least 5 years, no private property, and at least 20 years of lease left to sell after keeping the lease for your age (30 years at 65 to 69, 25 at 70 to 74, 20 at 75 to 79, 15 from 80). Other options: the Silver Housing Bonus (right-size to a smaller flat) or renting out a room.</p>
      ${btn('ok', 'OK', 'primary')}`, { wide: true });
    return;
  }
  const q = housing.lbsQuote(S.home, S.age, sim.retirementSavings(S));
  const ok = await dialog(`
    <h2>Lease Buyback Scheme</h2>
    <p>You keep ${q.keep} years of lease and sell the other ${q.sell} years to HDB for about <b>${money(q.proceeds)}</b>.</p>
    <table class="summary">
      <tr><td>Tops up your RA (for CPF LIFE)</td><td>${money(q.topUp)}</td></tr>
      <tr><td>Cash to you, including the LBS bonus of ${money(q.bonus)}</td><td>${money(q.cash)}</td></tr>
    </table>
    <div class="row">${btn('yes', 'Go ahead', 'primary')}${btn('no', 'Not now')}</div>`);
  if (ok !== 'yes') return;
  sim.leaseBuyback(S);
  if (S.life && S.age >= S.life.startAge) toast('Your CPF LIFE payouts will go up from next year.');
}

async function moveHome() {
  const oldRooms = S.home.rooms;
  const b = sim.sellHome(S);
  await dialog(`
    <h2>Sold!</h2>
    <table class="summary">
      <tr><td>Sale price (your share)</td><td>${money(b.sale)}</td></tr>
      <tr><td>Loan paid off</td><td>−${money(b.loan)}</td></tr>
      <tr><td>Refunded to your CPF</td><td>${money(b.refund)}</td></tr>
      <tr><td>Cash to you</td><td>${money(b.cash)}</td></tr>
    </table>${btn('ok', 'Find my next home', 'primary')}`);
  const bought = await chooseHome('Where to next?', { leaveLabel: 'Rent instead' });
  if (bought && S.age >= 55 && S.home.kind === 'hdb' && S.home.rooms <= 3 && S.home.rooms < oldRooms) {
    const net = b.cash + b.refund;
    const shb = housing.silverHousingBonus(Math.min(net, S.bank));
    const c = await dialog(`
      <h2>Silver Housing Bonus</h2>
      <p>You right-sized to a smaller flat. Put up to ${money(shb.topUp)} of your sale money into your RA and the Government gives you <b>${money(shb.bonus)}</b> in cash.</p>
      <div class="row">${btn('yes', 'Top up my RA', 'primary')}${btn('no', 'No thanks')}</div>`);
    if (c === 'yes') {
      sim.spendCash(S, shb.topUp);
      S.cpf.ra += shb.topUp;
      S.bank += shb.bonus;
      toast(`🏛️ ${money(shb.topUp)} into your RA, ${money(shb.bonus)} bonus`);
    }
  }
}

function statsPanel() {
  const unlocked = sim.unlockedStats(S);
  const max = Math.max(30, ...Object.values(S.stats));
  return dialog(`
    <h2>📊 ${esc(S.name)}'s stats</h2>
    ${S.career ? `<p class="small">${EDUCATION[S.education].label} · ${sim.careerInfo(S)?.label || ''}</p>` : ''}
    <div class="stats">${Object.entries(STATS).map(([k, st]) => unlocked.includes(k)
      ? `<div class="stat"><span>${st.icon} ${st.label}</span><div class="bar"><div style="width:${(S.stats[k] / max) * 100}%"></div></div><b>${Math.round(S.stats[k])}</b></div>`
      : `<div class="stat locked"><span>🔒 ${st.label}</span><small>Unlocks as a ${STAGES[st.stage].label.toLowerCase()}</small></div>`).join('')}</div>
    <h3>Hybrid stats</h3>
    <p class="small">Unlock when both stats reach ${HYBRID_THRESHOLD}.</p>
    <div class="hybrids">${Object.entries(HYBRIDS).map(([k, h]) => S.hybrids[k]
      ? `<div class="hybrid on">${h.icon} <b>${h.label}</b> ${sim.hybridValue(S, k)}</div>`
      : `<div class="hybrid">❔ ${h.needs.map((n) => STATS[n].icon).join(' + ')}</div>`).join('')}</div>
    <p>😊 Joy (life experiences): <b>${Math.round(S.joy)}</b></p>
    ${btn('ok', 'Close', 'primary')}`, { wide: true });
}

function cpfBars() {
  const c = S.cpf;
  const accounts = [
    ['oa', 'Ordinary (OA)', 'Housing, education, investment', c.oa],
    ['sa', 'Special (SA)', 'Retirement (closes at 55)', c.sa],
    ['ma', 'MediSave (MA)', 'Healthcare and insurance', c.ma],
    ['ra', 'Retirement (RA)', 'Created at 55, pays CPF LIFE', c.ra],
  ];
  const max = Math.max(1, ...accounts.map((a) => a[3]));
  return accounts.map(([k, l, d, v]) => `
    <div class="acct acct-${k}"><span class="acct-name"><b>${l}</b><small>${d}</small></span>
    <div class="bar"><div style="width:${(v / max) * 100}%"></div></div><b class="acct-val">${money(v)}</b></div>`).join('');
}

// Your cash (savings and cash investments, minus debt) by age.
function cashChart() {
  const h = S.history;
  if (h.length < 2) return '';
  const W = 560, H = 180, L = 54, R = 12, T = 14, B = 26;
  const maxV = Math.max(1, ...h.map((p) => p.cash));
  const minV = Math.min(0, ...h.map((p) => p.cash));
  const a0 = h[0].age, a1 = h[h.length - 1].age;
  const x = (a) => L + ((a - a0) / Math.max(1, a1 - a0)) * (W - L - R);
  const y = (v) => H - B - ((v - minV) / (maxV - minV)) * (H - T - B);
  const d = h.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p.cash).toFixed(1)}`).join(' ');
  const hits = h.map((p) => {
    const w = (W - L - R) / Math.max(1, h.length - 1);
    return `<rect x="${(x(p.age) - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H - T - B}" class="hit"><title>Age ${p.age}: ${money(p.cash)}</title></rect>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash savings by age">
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="axis"/>
    <text x="${L - 6}" y="${y(maxV) + 4}" text-anchor="end">${shortMoney(maxV)}</text>
    <text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">$0</text>
    ${minV < 0 ? `<text x="${L - 6}" y="${y(minV) + 4}" text-anchor="end">−${shortMoney(-minV)}</text>` : ''}
    <path d="${d}" class="l-cash"/>
    <text x="${L}" y="${H - 8}">Age ${a0}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">Age ${a1}</text>${hits}</svg>`;
}

// Stacked chart of each CPF account by age, with markers for big moments.
function cpfTrendChart() {
  const h = S.history.filter((p) => p.oa !== undefined);
  if (h.length < 2) return '<p class="small muted-ink">Your CPF growth chart appears after a couple of turns.</p>';
  const W = 560, H = 220, L = 54, R = 12, T = 14, B = 26;
  const keys = ['ma', 'sa', 'ra', 'oa'];
  const maxV = Math.max(1, ...h.map((p) => p.oa + p.sa + p.ma + p.ra));
  const a0 = h[0].age, a1 = h[h.length - 1].age;
  const x = (a) => L + ((a - a0) / Math.max(1, a1 - a0)) * (W - L - R);
  const y = (v) => H - B - (v / maxV) * (H - T - B);
  let base = h.map(() => 0);
  const areas = keys.map((k) => {
    const top = h.map((p, i) => base[i] + p[k]);
    const d = h.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(top[i]).toFixed(1)}`).join(' ')
      + ' ' + h.slice().reverse().map((p, j) => `L${x(p.age).toFixed(1)},${y(base[h.length - 1 - j]).toFixed(1)}`).join(' ') + ' Z';
    base = top;
    return `<path d="${d}" class="a-${k}"/>`;
  }).join('');
  const ticks = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(maxV * f)}" y2="${y(maxV * f)}" class="grid"/><text x="${L - 6}" y="${y(maxV * f) + 4}" text-anchor="end">${shortMoney(maxV * f)}</text>`).join('');
  const marks = [55, 65].filter((a) => a > a0 && a < a1).map((a) => `<line x1="${x(a)}" x2="${x(a)}" y1="${T}" y2="${H - B}" class="mark"/><text x="${x(a) + 4}" y="${T + 10}">${a === 55 ? '55: RA formed' : '65: CPF LIFE'}</text>`).join('');
  const hits = h.map((p, i) => {
    const w = (W - L - R) / Math.max(1, h.length - 1);
    return `<rect x="${(x(p.age) - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H - T - B}" class="hit"><title>Age ${p.age}: CPF ${money(p.cpf)} (OA ${money(p.oa)}, SA ${money(p.sa)}, MA ${money(p.ma)}, RA ${money(p.ra)})</title></rect>`;
  }).join('');
  const first = h[0], last = h[h.length - 1];
  return `<svg class="chart trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="CPF balances by account from age ${a0} to ${a1}">
    ${ticks}${areas}${marks}
    <text x="${L}" y="${H - 8}">Age ${a0}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">Age ${a1}</text>${hits}</svg>
    <p class="legend"><span class="k-oa"></span> OA <span class="k-sa"></span> SA <span class="k-ra"></span> RA <span class="k-ma"></span> MediSave</p>
    <p class="small">From age ${first.age} to ${last.age}, your CPF went from <b>${money(first.cpf)}</b> to <b>${money(last.cpf)}</b>. Hover or tap the chart for any year.</p>`;
}

function shortMoney(v) {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : money(v);
}

function cpfPanel() {
  const band = cpf.rateBand(S.age);
  const t = S.totals || {};
  return dialog(`
    <h2>🏛️ Your CPF</h2>
    <h3>📈 How your CPF has grown</h3>
    ${cpfTrendChart()}
    <h3>Today</h3>
    ${cpfBars()}
    <p class="total">Total: <b>${money(cpf.cpfTotal(S.cpf))}</b>${S.life ? ` · CPF LIFE ${S.age >= S.life.startAge ? `pays <b>${money(S.life.monthly)}</b>/month` : `starts at ${S.life.startAge}`}` : ''}</p>
    <h3>At your age (${S.age})</h3>
    <ul class="facts">
      <li>Rates change with age: the total drops after 55, 60, 65 and 70, and the OA's share drops after 35, 45 and 50.</li>
      <li>If you work: you pay <b>${band.employee}%</b> of your wage, your employer pays <b>${band.employer}%</b> (on wages up to ${money(cpf.ORDINARY_WAGE_CEILING)} a month).</li>
      <li>Split: OA ${band.oa}% · ${S.age < 55 ? 'SA' : 'RA'} ${band.sa}% · MA ${band.ma}% of your wage.</li>
      <li>Interest: OA 2.5%, SA/MA/RA 4%, plus 1% extra on your first $60,000${S.age >= 55 ? ' and another 1% on the first $30,000' : ''}.</li>
      <li>Retirement sums for 2026: BRS ${money(cpf.RETIREMENT_SUMS.BRS)}, FRS ${money(cpf.RETIREMENT_SUMS.FRS)}, ERS ${money(cpf.RETIREMENT_SUMS.ERS)}.</li>
    </ul>
    ${t.cpfIn ? `<p class="small">Lifetime so far: ${money(t.cpfIn)} contributed (${money(t.employerIn)} from employers), ${money(t.housingOa || 0)} used for housing.</p>` : ''}
    ${btn('ok', 'Close', 'primary')}`, { wide: true });
}

async function moneyPanel() {
  for (;;) {
    const adult = S.stage === 'adult' || S.stage === 'senior';
    const room = sim.topUpRoom(S);
    const untouched = Math.max(0, Math.min(S.cashLow ?? S.bank, S.bank));
    const investedCash = invest.total(S, 'cash');
    const investedCpf = invest.total(S, 'oa') + invest.total(S, 'sa');
    const limit = sim.creditLimit(S);
    let repay = 0, topUp = 0;
    const scroll = modalEl.hidden ? 0 : modalBox.scrollTop;
    const c = dialog(`
      <h2>💵 Money</h2>
      <table class="summary">
        <tr><td>💵 Cash savings</td><td>${money(S.bank)}</td></tr>
        ${investedCash || adult ? `<tr><td>📈 Investments (cash)</td><td>${money(investedCash)}</td></tr>` : ''}
        ${S.debt ? `<tr><td>💳 ${S.dcp ? 'Debt Consolidation Plan' : 'Credit card debt'}</td><td class="neg">−${money(S.debt)}</td></tr>` : ''}
        <tr><td>🏛️ CPF${investedCpf ? ` (plus ${money(investedCpf)} invested through CPFIS)` : ''}</td><td>${money(cpf.cpfTotal(S.cpf))}</td></tr>
      </table>
      <p class="small">Your cash is one account you can use for anything. Money you leave untouched for the whole year earns about ${pctText(sim.SAVINGS_INTEREST.untouched)} (like a 12-month fixed deposit); money you dip into earns the ${pctText(sim.SAVINGS_INTEREST.base)} savings base rate. Untouched so far this year: <b>${money(untouched)}</b>.</p>
      ${S.debt > 0 ? `
        <h3>💳 Debt</h3>
        ${S.dcp
          ? `<p>You're on a <b>Debt Consolidation Plan</b>: your card debts were rolled into one bank loan at about ${pctText(sim.DCP.rate)} a year, paid back at <b>${money(S.dcp.monthly)}/month</b> from your pay. Your credit cards are frozen until it's cleared.</p>`
          : `<p>Credit card debt grows at <b>${pctText(sim.DEBT_INTEREST)} a year</b>. Any cash you have at the end of a year pays it off automatically, and you can pay more now. Your credit limit is ${money(limit)}${limit ? ' (banks lend up to 12 months of income, or 2 months if you earn under $30,000 a year)' : ': with no income, no bank will lend to you'}.</p>`}
        <div class="pay-row">${amountControl('repay', Math.min(S.debt, S.bank), 'Repay debt')}${btn('repay', 'Repay', 'primary')}</div>
        ${S.bank < 1 ? '<p class="small">You need cash to repay. Cutting your lifestyle or selling investments frees some up.</p>' : ''}` : ''}
      <h3>🏛️ Top up your CPF</h3>
      <div class="pay-row">${amountControl('topup', Math.min(S.bank, room), 'CPF top-up')}${btn('topup', 'Top up')}</div>
      ${S.age >= 55 ? `<p class="gain-note" id="topup-gain">${S.life && S.age >= S.life.startAge ? `CPF LIFE pays you ${money(S.life.monthly)}/month now. Top-ups after payouts start buy extra CPF LIFE, so your payout rises from next year.` : 'Top-ups to your RA raise your CPF LIFE payouts.'} Drag the slider to see by how much.</p>` : ''}
      <div class="limit-box"><p class="small">${S.stage === 'child' || S.stage === 'teen' ? 'Your parents can top up your Special Account for you under the Retirement Sum Topping-Up Scheme (RSTU). ' : `Cash top-ups go to your ${S.age < 55 ? 'SA' : 'RA'} under the Retirement Sum Topping-Up Scheme (RSTU). `}${topUpLimitNote(room, Math.max(0, sim.TOP_UP_TAX_RELIEF_CAP - sim.topUpsThisYear(S)))} Topped up this year: <b>${money(sim.topUpsThisYear(S))}</b>.</p>
        <p class="small">Separately, the CPF Annual Limit caps your compulsory contributions plus any Voluntary Contributions at ${money(sim.CPF_ANNUAL_LIMIT)} a year; RSTU top-ups don't count towards it. ${S.age >= 55 ? 'If your RA is below the BRS, the Matched Retirement Savings Scheme adds $1 for every $1, up to $2,000 a year.' : ''}</p></div>
      ${adult ? `<h3>📈 Investing</h3><p>Buy funds and shares with cash, or with your CPF through the CPF Investment Scheme. ${btn('invest', 'Open investments')}</p>` : ''}
      ${S.stage === 'adult' ? `<h3>Lifestyle</h3><p>${LIFESTYLES[S.lifestyle].icon} ${LIFESTYLES[S.lifestyle].label}: about ${money(sim.monthlySpend(S))}/month in total ${btn('life', 'Change')}</p>` : ''}
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    modalBox.scrollTop = scroll;
    wireAmount(modalBox, 'repay', (v) => Math.min(v, S.debt, S.bank), (v) => (repay = v));
    wireAmount(modalBox, 'topup', (v) => Math.min(v, S.bank, room), (v) => {
      topUp = v;
      const note = $('#topup-gain', modalBox);
      if (!note) return;
      const gain = sim.lifePayoutGain(S, v);
      const now = S.life && S.age >= S.life.startAge;
      const base = now ? S.life.monthly : sim.lifePayoutGain(S, S.cpf.ra);
      note.innerHTML = v > 0
        ? `Topping up <b>${money(v)}</b> adds about <b>${money(gain)}/month</b> for life${now ? ' from next year' : ` from ${S.life ? S.life.startAge : 65}`}: from about ${money(base)} to <b>${money(base + gain)}</b>/month. That's ${money(gain * 12)} a year; it pays back your top-up in about ${Math.ceil(v / Math.max(1, gain * 12))} years.`
        : 'Drag the slider to see how much more CPF LIFE would pay you each month.';
    });
    const choice = await c;
    if (choice === 'ok') return;
    if (choice === 'life') await lifestyleDialog();
    if (choice === 'invest') await investPanel();
    if (choice === 'repay' && repay > 0) {
      const paid = sim.repayDebt(S, repay);
      toast(S.debt > 0 ? `💳 Repaid ${money(paid)}. ${money(S.debt)} still to go.` : `🎉 Repaid ${money(paid)}. You're debt-free!`);
      logEvent(`💳 Repaid ${money(paid)} of debt`);
    }
    if (choice === 'topup' && topUp > 0) {
      sim.spendCash(S, topUp);
      const r = sim.topUpCpf(S, topUp);
      S.bank += topUp - r.accepted;
      if (!r.accepted) {
        await dialog(`<h2>🏛️ Top-up limit reached</h2><p>${topUpLimitNote(0, 0)}</p><p class="small">The limit keeps your retirement top-ups in line with the retirement sums. Your cash stays in your savings.</p>${btn('ok', 'OK', 'primary')}`);
      } else {
        toast(`🏛️ Topped up ${money(r.accepted)} to your ${S.age < 55 ? 'SA' : 'RA'}${r.matched ? `, and the Government matched ${money(r.matched)}` : ''}`);
        logEvent(`🏛️ CPF top-up ${money(r.accepted)}`);
        if (S.stage === 'adult' || S.stage === 'senior') {
          if (sim.topUpsThisYear(S) > sim.TOP_UP_TAX_RELIEF_CAP && sim.topUpsThisYear(S) - r.accepted <= sim.TOP_UP_TAX_RELIEF_CAP) toast('You are past $8,000 of top-ups this year: more is allowed, but gets no extra tax relief.');
        }
      }
    }
    render();
  }
}

// Buy and sell fictional companies and funds, with cash or through CPFIS.
async function investPanel() {
  let picked = null;
  let src = 'cash';
  let scrollToBuy = false;
  for (;;) {
    const hs = invest.holdings(S);
    const p = picked && invest.product(picked);
    const sources = Object.keys(invest.SOURCES);
    if (p && !invest.allowed(p, src)) src = 'cash';
    const max = p ? invest.maxBuy(S, p, src) : 0;
    const why = p ? invest.blockedReason(S, p, src) : '';
    let amount = 0;
    const last = S.lastReturns || {};
    const scroll = modalEl.hidden ? 0 : modalBox.scrollTop;
    const c = dialog(`
      <h2>📈 Investments</h2>
      <p class="small">Fictional companies and funds, each modelled on a real kind of market. Prices move every year: higher risk means bigger swings both ways. Past returns don't promise future ones.</p>
      <h3>What you own</h3>
      ${hs.length ? `<div class="table-scroll"><table class="summary holdings">
        <tr><th>Holding</th><th>Paid with</th><th>Worth</th><th>Gain/loss</th><th></th></tr>
        ${hs.map((h) => {
          const pr = invest.product(h.id);
          const g = h.value - h.cost;
          return `<tr><td>${pr.icon} ${pr.name}</td><td>${invest.SOURCES[h.src].short}</td><td>${money(h.value)}</td>
            <td class="${g < 0 ? 'neg' : 'pos'}">${g < 0 ? '−' : '+'}${money(Math.abs(g))}</td>
            <td>${btn(`sell:${h.id}:${h.src}`, 'Sell')}</td></tr>`;
        }).join('')}</table></div>
        <p class="small">Selling puts cash back in your savings, and CPF money back in the account it came from${S.age >= 55 ? ' (SA money goes to your RA)' : ''}.</p>`
        : '<p class="small muted-ink">Nothing yet.</p>'}
      <h3>Choose something to buy</h3>
      <div class="products">${invest.PRODUCTS.map((pr) => `
        <button class="product ${picked === pr.id ? 'on' : ''}" data-choice="pick:${pr.id}">
          <span class="p-head"><span class="p-icon">${pr.icon}</span><b>${pr.name}</b></span>
          <small class="p-like">Like ${pr.like}</small>
          <span class="p-risk" title="Risk">${'●'.repeat(pr.risk)}${'○'.repeat(5 - pr.risk)} ${invest.RISK_LABELS[pr.risk]} risk</span>
          <small>About ${pctText(pr.mean)} a year on average${last[pr.id] != null ? ` · last year ${last[pr.id] >= 0 ? '+' : ''}${pctText(last[pr.id])}` : ''}</small>
        </button>`).join('')}</div>
      ${p ? `<div class="buy-box">
        <p><b>${p.icon} ${p.name}</b>: ${p.desc}</p>
        <div class="seg" role="group" aria-label="Pay with">${sources.map((k) => `<button class="seg-btn ${src === k ? 'on' : ''}" data-choice="src:${k}" ${invest.allowed(p, k) ? '' : 'disabled'}>${invest.SOURCES[k].label}</button>`).join('')}</div>
        ${why ? `<p class="small neg">${why}</p>` : `<p class="small">You can put in up to ${money(max)}.${src !== 'cash' ? ` Left in your ${invest.SOURCES[src].short}, this money would earn a safe ${pctText(invest.cpfAlternative(src))} or more, so an investment has to beat that to be worth it.` : ''}</p>`}
        <div class="pay-row">${amountControl('buy', max, 'Amount to invest')}${btn('buy', 'Buy', 'primary')}</div>
      </div>` : ''}
      <div class="limit-box"><p class="small"><b>CPF Investment Scheme (CPFIS) rules:</b> from age 18; keep the first ${money(invest.CPFIS.oaKeep)} in your OA and ${money(invest.CPFIS.saKeep)} in your SA; at most 35% of your investible OA savings in shares and REITs; SA money only in approved unit trusts and bonds. Many CPFIS investors have earned less than the 2.5% the OA pays risk-free.</p></div>
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    modalBox.scrollTop = scroll;
    if (scrollToBuy) $('.buy-box', modalBox)?.scrollIntoView({ block: 'center' });
    scrollToBuy = false;
    wireAmount(modalBox, 'buy', (v) => Math.min(v, max), (v) => (amount = v));
    const choice = await c;
    if (choice === 'ok') return;
    const [kind, a, b] = choice.split(':');
    if (kind === 'pick') { picked = a; scrollToBuy = true; }
    if (kind === 'src') src = a;
    if (kind === 'buy' && p && amount > 0) {
      const spent = invest.buy(S, p.id, src, amount);
      if (src === 'cash') S.cashLow = Math.min(S.cashLow ?? S.bank, S.bank);
      toast(`📈 Bought ${money(spent)} of ${p.name} with ${invest.SOURCES[src].short}`);
      logEvent(`📈 Invested ${money(spent)} in ${p.name} (${invest.SOURCES[src].short})`);
    }
    if (kind === 'sell') {
      const h = hs.find((x) => x.id === a && x.src === b);
      const got = invest.sell(S, a, b, h.value);
      toast(`📈 Sold ${invest.product(a).name} for ${money(got)}`);
      logEvent(`📈 Sold ${invest.product(a).name} for ${money(got)}`);
    }
    render();
  }
}

// Monthly plan: everyday costs are fixed by your lifestyle; you choose the rest.
async function budgetPanel() {
  for (;;) {
    const b = { ...sim.newBudget(), ...(S.budget || {}) };
    const income = sim.takeHome(S) + (S.life && S.age >= S.life.startAge ? S.life.monthly : 0);
    const share = S.spouse ? 0.5 : 1;
    const living = sim.monthlySpend(S);
    const rent = !S.home && (S.age >= 30 || S.spouse) ? RENT_MONTHLY * share : 0;
    const loan = loanSplit();
    const loanCash = loan.fromCash;
    const dcp = S.dcp ? S.dcp.monthly : 0;
    const holidays = sim.holidayMonthly(S);
    const kids = (S.children || []).filter((c) => S.age - c.bornAge < 21);
    const fixed = living + rent + loanCash + dcp;
    const room = sim.topUpRoom(S);
    const ls = S.stage === 'senior' && S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle] : LIFESTYLES[S.lifestyle];
    const scroll = modalEl.hidden ? 0 : modalBox.scrollTop;
    const c = dialog(`
      <h2>📋 Your monthly budget</h2>
      <p class="small">Plan how you use your pay each month. It repeats every year until you change it. Anything left over goes to your cash savings.</p>
      <table class="summary budget">
        <tr><th colspan="2">Money in each month</th></tr>
        <tr><td>Take-home pay${S.spouse ? ' (yours; your spouse covers their half of household costs)' : ''}</td><td class="pos">${money(sim.takeHome(S))}</td></tr>
        ${S.life && S.age >= S.life.startAge ? `<tr><td>CPF LIFE payout</td><td class="pos">${money(S.life.monthly)}</td></tr>` : ''}
        <tr><th colspan="2">Must-pays</th></tr>
        <tr><td>${ls.icon || '🏠'} Everyday living: ${ls.label}${kids.length ? `, incl. ${money(sim.CHILD_COST * share * kids.length)} for ${kids.length === 1 ? 'your child' : 'your children'}` : ''}${S.car ? ', incl. $1,500 for the car' : ''} ${btn('life', 'Change')}</td><td class="neg">−${money(living)}</td></tr>
        ${rent ? `<tr><td>Rent</td><td class="neg">−${money(rent)}</td></tr>` : ''}
        ${S.home && S.home.loanBalance > 1 ? `<tr><td>Home loan ${money(S.home.instalment)}: ${S.home.payWith === 'oa' ? (loanCash > 1 ? `your OA only covers ${money(loan.fromOa)}, so the rest is cash` : 'paid from your CPF OA, so no cash') : 'paid in cash'}</td><td class="neg">−${money(loanCash)}</td></tr>` : ''}
        ${dcp ? `<tr><td>Debt Consolidation Plan</td><td class="neg">−${money(dcp)}</td></tr>` : ''}
      </table>
      <h3>Your choices</h3>
      <div class="alloc">
        <div class="alloc-row"><span class="al-icon">🎨</span><span class="al-text"><b>Hobbies</b><small>Classes, sports, music, gear. Joy, plus Health and Creativity.</small></span>${amountControl('hobbies', 2000, 'Hobbies per month')}</div>
        <div class="alloc-row"><span class="al-icon">🛍️</span><span class="al-text"><b>Shopping and treats</b><small>Clothes, gadgets, nice meals out. Joy.</small></span>${amountControl('shopping', 3000, 'Shopping per month')}</div>
        <div class="alloc-row"><span class="al-icon">✈️</span><span class="al-text"><b>Holidays</b><small>${(S.holidayPlans || []).length ? `${S.holidayPlans.length} trip${S.holidayPlans.length > 1 ? 's' : ''} planned for next year, averaged per month.` : 'No trips planned.'} ${btn('holidays', 'Plan holidays')}</small></span><b class="al-val">${money(holidays)}</b></div>
        <div class="alloc-row"><span class="al-icon">🏛️</span><span class="al-text"><b>Top up my CPF</b><small>${S.age < 55 ? 'Into your SA (RSTU), up to the FRS. Earns 4%+ and cuts your income tax.' : 'Into your RA (RSTU), up to the ERS, for bigger CPF LIFE payouts.'} Room left: ${money(room)}.</small></span>${amountControl('cpfSelf', Math.min(3000, room / 12), 'CPF top-up per month')}</div>
        ${kids.length ? `<div class="alloc-row"><span class="al-icon">👶</span><span class="al-text"><b>Top up my ${kids.length === 1 ? "child's" : "children's"} CPF</b><small>Per child, into their SA (RSTU). It grows at 4%+ until they retire: a head start, but locked away. ${S.spouse ? 'Your spouse puts in the same.' : ''} No tax relief for top-ups to children.</small></span>${amountControl('kidsCpf', 500, 'Per child per month')}</div>` : ''}
        <div class="alloc-row"><span class="al-icon">📈</span><span class="al-text"><b>Invest every month</b><small>A regular savings plan into
          <select id="inv-id">${invest.PRODUCTS.map((p) => `<option value="${p.id}" ${b.investId === p.id ? 'selected' : ''}>${p.name} (${invest.RISK_LABELS[p.risk].toLowerCase()} risk)</option>`).join('')}</select></small></span>${amountControl('investAmt', 5000, 'Invest per month')}</div>
      </div>
      <div class="budget-sum" id="budget-sum"></div>
      <div class="row">${btn('save', 'Save my budget', 'primary')}${btn('ok', 'Cancel')}</div>`, { wide: true });
    modalBox.scrollTop = scroll;
    const keys = ['hobbies', 'shopping', 'cpfSelf', 'kidsCpf', 'investAmt'];
    const draw = () => {
      const spend = b.hobbies + b.shopping + holidays;
      const saving = b.cpfSelf + b.kidsCpf * kids.length + b.investAmt;
      const left = income - fixed - spend - saving;
      const total = Math.max(1, income);
      const bar = (v, cls) => `<span class="${cls}" style="width:${Math.max(0, Math.min(100, (v / total) * 100))}%"></span>`;
      $('#budget-sum', modalBox).innerHTML = `
        <div class="budget-bar">${bar(fixed, 'b-fixed')}${bar(spend, 'b-fun')}${bar(saving, 'b-save')}${bar(Math.max(0, left), 'b-left')}</div>
        <p class="legend"><span class="b-fixed"></span> Must-pays ${money(fixed)} <span class="b-fun"></span> Fun ${money(spend)} <span class="b-save"></span> Saving and investing ${money(saving)} <span class="b-left"></span> Left to cash ${money(Math.max(0, left))}</p>
        <p class="${left < 0 ? 'neg' : ''}">${left >= 0
          ? `Each month <b>${money(left)}</b> is left over and goes to your cash savings. That's ${Math.round((left / total) * 100)}% of what comes in${saving ? `, plus ${money(saving)} saved on purpose` : ''}.`
          : `You'd be <b>${money(-left)}</b> short every month. Planned saving only happens when you have the cash, and spending you can't cover goes on credit cards at 25% a year.`}</p>`;
    };
    for (const k of keys) {
      const el = modalBox.querySelector(`[data-amt="${k}"]`);
      if (!el) continue;
      const [range, box] = el.querySelectorAll('input');
      range.value = box.value = Math.min(b[k], +range.max);
      b[k] = +range.value;
      wireAmount(modalBox, k, (v) => Math.min(v, +range.max), (v) => { b[k] = v; draw(); });
    }
    $('#inv-id', modalBox).onchange = (e) => (b.investId = e.target.value);
    draw();
    const choice = await c;
    if (choice === 'ok') return;
    if (choice === 'life') {
      if (S.stage === 'senior' && S.retirementLifestyle) {
        const rl = await dialog(`<h2>Everyday living in retirement</h2><div class="careers">${Object.entries(RETIREMENT_LIFESTYLES).map(([k, l]) => `
          <button class="career ${S.retirementLifestyle === k ? 'on' : ''}" data-choice="${k}"><b>${l.label}</b><span>${money(l.monthly)}/month</span><small>${l.desc}</small></button>`).join('')}</div>`);
        S.retirementLifestyle = rl;
      } else await lifestyleDialog();
      S.budget = b;
      continue;
    }
    S.budget = b;
    if (choice === 'holidays') {
      await holidaysPanel();
      continue;
    }
    toast('📋 Budget saved. It applies from your next turn.');
    logEvent(`📋 New budget: fun ${money(b.hobbies + b.shopping)}/mo, saving ${money(b.cpfSelf + b.kidsCpf * kids.length + b.investAmt)}/mo`);
    return;
  }
}

// Plan trips: once, every year, or a set number of times.
async function holidaysPanel() {
  for (;;) {
    const plans = S.holidayPlans || (S.holidayPlans = []);
    const people = sim.travellers(S);
    const trips = S.trips || [];
    const scroll = modalEl.hidden ? 0 : modalBox.scrollTop;
    const c = await dialog(`
      <h2>✈️ Holidays</h2>
      <p class="small">Prices are per person for flights and a typical stay. ${people > 1 ? `${people} of you travel together${S.spouse ? ' and you pay half' : ''}.` : 'You travel on your own.'} Trips happen during your next turn.</p>
      ${plans.length ? `<h3>Planned</h3><ul class="plans">${plans.map((p, i) => {
        const h = HOLIDAYS.find((x) => x.id === p.id);
        return `<li>${h.icon} <b>${h.name}</b>: ${p.mode === 'yearly' ? 'every year' : p.left === 1 ? 'once' : `${p.left} more times`} · ${money(sim.holidayCost(S, p.id))} a trip ${btn(`cancel:${i}`, 'Cancel')}</li>`;
      }).join('')}</ul>` : ''}
      <div class="holidays">${HOLIDAYS.map((h) => {
        const cost = sim.holidayCost(S, h.id);
        const been = trips.filter((t) => t.id === h.id).length;
        return `<div class="holiday">
          ${postcard(h.id, h.name)}
          <b>${h.icon} ${h.name}</b><small>${h.place} · ${h.days} days · ${money(h.cost)}/person</small>
          <small>Your share: <b>${money(cost)}</b> a trip · Joy +${h.joy}${been ? ` · been ${been}×` : ''}</small>
          <div class="row tight">${btn(`once:${h.id}`, 'Go once')}${btn(`yearly:${h.id}`, 'Every year')}${btn(`times:${h.id}`, 'Go 3 times')}</div>
        </div>`;
      }).join('')}</div>
      <p class="small">Going to the same place over and over brings less joy after the third visit.</p>
      ${btn('ok', 'Done', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    const [kind, id] = c.split(':');
    if (kind === 'cancel') plans.splice(+id, 1);
    else {
      const h = HOLIDAYS.find((x) => x.id === id);
      plans.push({ id, mode: kind === 'yearly' ? 'yearly' : 'times', left: kind === 'times' ? 3 : 1 });
      toast(`${h.icon} ${h.name} planned${kind === 'yearly' ? ' every year' : kind === 'times' ? ' 3 times' : ''}: ${money(sim.holidayCost(S, id))} a trip`);
    }
    void scroll;
  }
}

async function shopPanel() {
  for (;;) {
    const c = await dialog(`
      <h2>🛍️ Shop</h2>
      <p>Cash savings: <b>${money(S.bank)}</b>. Things you buy stay in your room, and some boost your stats every turn.</p>
      <div class="shop">${SHOP[S.stage].map((it) => {
        const owned = S.room.includes(it.id);
        const boost = Object.entries(it.perTurn || {}).map(([k, v]) => `${STATS[k].icon}+${v}`).join(' ');
        return `<button class="shop-item" data-choice="${it.id}" ${owned || S.bank < it.price ? 'disabled' : ''}>
          <span class="s-icon" data-item="${it.id}">${itemHtml(it)}</span><b>${it.name}</b><span>${owned ? 'Owned' : money(it.price)}</span>
          <small>😊+${it.joy} ${boost}</small></button>`;
      }).join('')}</div>
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    const item = SHOP[S.stage].find((i) => i.id === c);
    if (sim.buy(S, item)) {
      toast(`${item.icon} ${item.name} added to your room!`);
      logEvent(`${item.icon} Bought ${item.name} (${money(item.price)})`);
    }
    render();
  }
}

async function menuPanel() {
  const c = await dialog(`
    <h2>Menu</h2>
    <div class="row wrap">${btn('rewind', '⏪ Go back to an earlier age')}${btn('recap', 'End my story here and see my life recap')}${btn('about', 'About the CPF figures')}${btn('restart', 'Start a new life')}${btn('ok', 'Back', 'primary')}</div>`);
  if (c === 'rewind') return rewindDialog();
  if (c === 'recap') {
    const sure = await dialog(`<h2>End your story at ${S.age}?</h2><p>You'll see a recap of the life you've lived so far. You can keep playing afterwards.</p><div class="row">${btn('yes', 'Show my recap', 'primary')}${btn('no', 'Keep playing')}</div>`);
    if (sure === 'yes') await endScreen();
  }
  if (c === 'restart') {
    const sure = await dialog(`<h2>Start over?</h2><p>This life will be lost.</p><div class="row">${btn('yes', 'Yes, start over')}${btn('no', 'Cancel', 'primary')}</div>`);
    if (sure === 'yes') {
      clearSave();
      S = null;
    }
  }
  if (c === 'about') {
    await dialog(`
      <h2>About the numbers</h2>
      <p>The game uses the CPF Board's 2026 contribution and allocation rates, the $8,000 Ordinary Wage ceiling, the 2026 retirement sums and interest rates (with extra interest), and works out interest monthly the way CPF does. Housing uses HDB and bank loan limits (75% loan, MSR 30%, TDSR 55%), Buyer's Stamp Duty, CPF refunds with 2.5% accrued interest, the Lease Buyback Scheme and the Silver Housing Bonus as they stand in 2026.</p>
      <p>To keep it playable, some things are simplified: there is no inflation (all amounts are in today's dollars), there are no bonuses or Additional Wages, salaries grow at fixed rates, home values only change with the lease, and CPF LIFE payouts are estimated from the CPF Board's published figures.</p>
      <p>For your real plans, use the tools at <b>cpf.gov.sg</b>.</p>
      ${btn('ok', 'Close', 'primary')}`);
  }
}

// ---------- the end ----------

// A recap of the life lived, with questions to reflect on. There is no score.
function holidayRecap() {
  const trips = S.trips || [];
  if (!trips.length) return '<h3>✈️ Holidays</h3><p class="small muted-ink">You never took a planned holiday.</p>';
  const by = HOLIDAYS.map((h) => ({ h, list: trips.filter((t) => t.id === h.id) })).filter((x) => x.list.length);
  return `<h3>✈️ Your holidays</h3>
    <div class="holidays recap">${by.map(({ h, list }) => `<div class="holiday">${postcard(h.id, h.name)}
      <b>${h.icon} ${h.name} ×${list.length}</b><small>Age ${list.slice(0, 6).map((t) => t.age).join(', ')}${list.length > 6 ? '…' : ''}</small></div>`).join('')}</div>
    <p class="small">${trips.length} trip${trips.length > 1 ? 's' : ''}, costing you ${money(S.totals?.holidays || 0)} in all.</p>`;
}

function kidsCpfRecap() {
  const kids = (S.children || []).filter((c) => c.cpfGiven);
  if (!kids.length) return '';
  return `<h3>👶 Your children's CPF head start</h3><ul class="facts">${kids.map((c, i) => `<li>Child ${i + 1}: you put in ${money(c.cpfGiven)}${S.spouse ? ', your spouse matched it' : ''}, and with interest it has grown to <b>${money(c.cpfSa)}</b> in their SA.</li>`).join('')}</ul>`;
}

async function endScreen() {
  const final = S.age >= STAGES.senior.endAge;
  const life = sim.retirementIncome(S);
  const need = S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle].monthly : null;
  const cash = S.bank + invest.total(S, 'cash') - S.debt;
  const t = S.totals || {};
  const hybrids = Object.keys(S.hybrids).map((h) => `${HYBRIDS[h].icon} ${HYBRIDS[h].label}`).join(', ');
  const career = sim.careerInfo(S);
  const moments = [
    S.education && `🎓 Finished with a ${EDUCATION[S.education].label}`,
    career && `${career.icon} Worked as ${/^[aeiou]/i.test(career.label) ? 'an' : 'a'} ${career.label}`,
    S.spouse && '💍 Got married',
    S.children && S.children.length && `👶 Raised ${S.children.length} ${S.children.length === 1 ? 'child' : 'children'}`,
    S.home && `🏠 Lived in a ${S.home.label}`,
    S.car && '🚗 Owned a car',
    S.room.length && `🛍️ Filled your rooms with ${S.room.length} things you loved`,
    S.life && `🏛️ Started CPF LIFE at ${S.life.startAge}`,
  ].filter(Boolean);
  modalBox.className = 'modal-box wide';
  modalEl.hidden = false;
  modalBox.innerHTML = `
    <div class="end">
      ${person(me(), 'big')}
      <p class="eyebrow">${final ? 'A life well lived' : 'Your story so far'}</p>
      <h2>${esc(S.name)}, age ${S.age}</h2>
      <ul class="moments">${moments.map((m) => `<li>${m}</li>`).join('')}</ul>
      ${hybrids ? `<p class="small">Strengths you built: ${hybrids}</p>` : ''}
      <h3>Your money in numbers</h3>
      <table class="summary">
        ${life ? `<tr><td>CPF LIFE income</td><td>${money(life)}/month</td></tr>` : ''}
        ${need ? `<tr><td>Your retirement lifestyle costs</td><td>${money(need)}/month</td></tr>` : ''}
        <tr><td>CPF savings now</td><td>${money(cpf.cpfTotal(S.cpf))}</td></tr>
        <tr><td>Cash and investments, minus debt</td><td>${money(cash)}</td></tr>
        ${S.shortfallAge ? `<tr><td>Money ran short from age</td><td>${S.shortfallAge}</td></tr>` : ''}
        <tr><td>Paid into your CPF over your life</td><td>${money(t.cpfIn || 0)}</td></tr>
        <tr><td>…of which your employers paid</td><td>${money(t.employerIn || 0)}</td></tr>
        <tr><td>Interest earned</td><td>${money(t.interest || 0)}</td></tr>
        <tr><td>CPF used for housing</td><td>${money(t.housingOa || 0)}</td></tr>
        <tr><td>😊 Joy from life experiences</td><td>${Math.round(S.joy)}</td></tr>
      </table>
      <h3>🏛️ Your CPF over your life</h3>
      ${cpfTrendChart()}
      ${S.life ? `<p class="small">At ${S.life.startAge} your RA savings (${money(S.life.premium)}) went into CPF LIFE, so they leave the chart and come back as monthly payouts for life: ${money(t.payouts || 0)} paid so far.</p>` : ''}
      <h3>💵 Your cash over your life</h3>
      <p class="small">Savings plus cash investments, minus any debt.</p>
      ${cashChart()}
      ${holidayRecap()}
      ${kidsCpfRecap()}
      <h3>Looking back</h3>
      <p>How do you feel about the life you lived?</p>
      <div class="feel">${['😞', '🙁', '😐', '🙂', '😄'].map((f, i) => `<button class="pick ${S.reflection?.feel === i ? 'on' : ''}" data-feel="${i}">${f}</button>`).join('')}</div>
      <label class="field">What would you do differently?<textarea id="r-diff" rows="2">${esc(S.reflection?.different || '')}</textarea></label>
      <label class="field">What kind of retirement do you want in real life, and what will it cost each month?<textarea id="r-want" rows="2">${esc(S.reflection?.want || '')}</textarea></label>
      <ul class="facts small">
        <li>Which choice made the biggest difference to your savings? To your joy?</li>
        <li>When did you use CPF instead of cash, and what did that trade off?</li>
        <li>Check your own CPF and try the retirement planner at cpf.gov.sg.</li>
      </ul>
      <div class="row">${final ? '' : btn('back', 'Keep playing', 'primary')}${btn('again', 'Start a new life', final ? 'primary' : '')}</div>
    </div>`;
  modalBox.querySelectorAll('[data-feel]').forEach((b) => (b.onclick = () => {
    modalBox.querySelectorAll('[data-feel]').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    S.reflection = { ...(S.reflection || {}), feel: +b.dataset.feel };
  }));
  const choice = await new Promise((resolve) => {
    modalBox.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (b) resolve(b.dataset.choice);
    };
  });
  S.reflection = { ...(S.reflection || {}), different: $('#r-diff').value, want: $('#r-want').value };
  save();
  if (choice === 'again') {
    clearSave();
    S = null;
  }
  closeModal();
  render();
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

render();

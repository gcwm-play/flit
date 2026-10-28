// UI and game flow.
import * as cpf from './cpf.js';
import * as sim from './sim.js';
import * as housing from './housing.js';
import * as invest from './invest.js';
import { characterSrc, lookOf, spriteHeight, SKIN_TONES, GENDERS, OUTFITS } from './sprites.js';
import { rollWorldEvent, rollPersonalEvent } from './events.js';
import {
  STATS, HYBRIDS, HYBRID_THRESHOLD, STAGES, ACTIVITIES, SHOP, EDUCATION,
  LIFESTYLES, RETIREMENT_LIFESTYLES, RENT_MONTHLY, FACTS,
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
  } catch {}
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
const person = (look, cls = '', alt = '') =>
  `<img class="pixel person ${cls}" style="--h:${spriteHeight(look.stage)}" src="${characterSrc(look)}" alt="${alt}">`;
const me = (stage = S.stage) => lookOf(S.look, stage);

// Outfit colour swatches, used when you grow into a new life stage.
function outfitPicker(selected) {
  return `<div class="swatches" role="group" aria-label="Outfit colour">${OUTFITS.map((c, i) =>
    `<button class="swatch ${i === selected ? 'on' : ''}" data-outfit="${i}" style="background:${c}" aria-label="Outfit colour ${i + 1}"></button>`).join('')}</div>`;
}

// ---------- title screen ----------

function titleScreen() {
  const saved = loadSave();
  const look = { gender: Math.random() < 0.5 ? 'male' : 'female', tone: Math.floor(Math.random() * SKIN_TONES.length), outfit: 0 };
  app.innerHTML = `
    <div class="title-screen">
      <h1 class="logo">FLIT</h1>
      <p class="tagline">Life &amp; CPF: a Singapore life simulator</p>
      <div class="title-sprites" id="preview"></div>
      <div class="card start-card">
        <p>Grow up, build your skills, make money choices and see where they lead when you retire.</p>
        <label class="field">Your name <input id="name" maxlength="16" placeholder="Alex" autocomplete="off"></label>
        <p class="pick-label">You are</p>
        <div class="seg" role="group" aria-label="Gender">${Object.entries(GENDERS).map(([k, l]) => `<button class="seg-btn" data-gender="${k}">${l}</button>`).join('')}</div>
        <p class="pick-label">Skin tone <small>(your partner and children will share it)</small></p>
        <div class="swatches" role="group" aria-label="Skin tone">${SKIN_TONES.map((t, i) => `<button class="swatch" data-tone="${i}" style="background:${t.skin}" aria-label="${t.label}"></button>`).join('')}</div>
        <p class="pick-label">Outfit colour</p>
        ${outfitPicker(look.outfit)}
        <div class="row">
          <button class="btn primary" id="start">Start a new life</button>
          ${saved ? `<button class="btn" id="continue">Continue (${esc(saved.name)}, age ${saved.age})</button>` : ''}
        </div>
      </div>
      <p class="small muted">CPF figures use the 2026 rates from cpf.gov.sg, simplified for a game. Amounts are in today's dollars.</p>
    </div>`;
  const refresh = () => {
    $('#preview').innerHTML = ['child', 'teen', 'adult', 'senior'].map((st) => person(lookOf(look, st), 'bob')).join('');
    app.querySelectorAll('[data-gender]').forEach((b) => b.classList.toggle('on', b.dataset.gender === look.gender));
    app.querySelectorAll('[data-tone]').forEach((b) => b.classList.toggle('on', +b.dataset.tone === look.tone));
    app.querySelectorAll('[data-outfit]').forEach((b) => b.classList.toggle('on', +b.dataset.outfit === look.outfit));
  };
  app.querySelectorAll('[data-gender]').forEach((b) => (b.onclick = () => { look.gender = b.dataset.gender; refresh(); }));
  app.querySelectorAll('[data-tone]').forEach((b) => (b.onclick = () => { look.tone = +b.dataset.tone; refresh(); }));
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
  if (!s.look) s.look = { gender: 'female', tone: 2, outfit: 0 };
  delete s.sprites;
  // One cash account: the old spending fund and bank savings are merged.
  if (s.wallet != null) { s.bank += s.wallet; delete s.wallet; }
  if (s.cashLow == null) s.cashLow = s.bank;
  if (!s.holdings) {
    s.holdings = s.invest > 0 ? [{ id: 'world', src: 'cash', value: s.invest, cost: s.invest }] : [];
    delete s.invest;
  }
  if (!s.dcp && s.debt > Math.max(5000, 12 * (s.salary || 0))) sim.startDcp(s);
  if (s.spouse && !s.spouse.gender) Object.assign(s.spouse, { gender: s.look.gender === 'male' ? 'female' : 'male', tone: s.look.tone, outfit: 2 });
  for (const c of s.children || []) if (!c.gender) Object.assign(c, { gender: Math.random() < 0.5 ? 'male' : 'female', tone: s.look.tone, outfit: 1 });
  return s;
}

// ---------- main screen ----------

function render() {
  if (!S) return titleScreen();
  const st = STAGES[S.stage];
  const cpfTotal = cpf.cpfTotal(S.cpf);
  app.innerHTML = `
    <header class="hud">
      <div class="who">${person(me(), 'mini')}<div><b>${esc(S.name)}</b><span>Age ${S.age} · ${st.label}</span></div></div>
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
  const family = grown ? [
    S.spouse ? person(lookOf(S.spouse, spouseStage), 'family-member', 'Your spouse') : '',
    ...(S.children || []).map((c) => {
      const age = S.age - c.bornAge;
      const st = age < 3 ? 'baby' : age < 13 ? 'child' : age < 21 ? 'teen' : 'adult';
      return person(lookOf(c, st), `family-member kid ${st === 'baby' ? 'baby' : ''}`, `Your child, age ${age}`);
    }),
  ].join('') : '';
  return `
    <div class="room room-${kind.cls} stage-${S.stage}">
      <div class="wall">
        <div class="window"><div class="sky"></div><div class="hdb"></div></div>
        <div class="shelf"></div>
        <span class="room-label">${kind.label}</span>
      </div>
      <div class="floor"></div>
      <div class="bed"><div class="pillow"></div><div class="blanket"></div></div>
      <div class="items">${placeItems(items)}</div>
      <div class="people">${person(me(), 'player bob', esc(S.name))}${family}</div>
    </div>`;
}

// Small things go on the shelf, big things on the floor.
const SHELF_SLOTS = [0, 1, 2, 3, 4];
const FLOOR_SLOTS = [5, 8, 6, 9, 7, 10, 11, 12, 15, 16, 14, 13, 17];
function placeItems(items) {
  let shelf = 0, floor = 0;
  return items.map((it) => {
    const onShelf = !it.floor && shelf < SHELF_SLOTS.length;
    const slot = onShelf ? SHELF_SLOTS[shelf++] : FLOOR_SLOTS[floor++ % FLOOR_SLOTS.length];
    return `<span class="item slot-${slot}" title="${it.name}">${it.icon}</span>`;
  }).join('');
}

// ---------- a turn ----------

async function takeTurn(activityId) {
  if (busy) return;
  busy = true;
  try {
    const activity = ACTIVITIES[S.stage].find((a) => a.id === activityId);
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
      await dialog(`<div class="event world"><div class="e-icon">${w.icon}</div><p class="eyebrow">World event</p><h2>${w.title}</h2><p>${w.text}</p></div>${btn('ok', 'OK', 'primary')}`);
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

// CPF contribution and allocation rates change at set ages. Tell the player when they cross one.
async function rateChangeNotice(fromAge, toAge) {
  if (toAge < 21 || !S.cpfWorked) return;
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
    rows.push(['Take-home pay and payouts', money(sum.income), 'in']);
    rows.push(['Living costs', `−${money(sum.spend)}`, 'out']);
    if (sum.cpfIn) rows.push([`Into CPF (employer paid ${money(sum.employerIn)})`, money(sum.cpfIn), 'in']);
    if (sum.housingOa) rows.push(['Home loan paid from OA', `−${money(sum.housingOa)}`, 'out']);
    if (sum.payouts) rows.push(['CPF LIFE payouts', money(sum.payouts), 'in']);
    if (sum.investReturn) rows.push(['Investment returns', money(sum.investReturn), sum.investReturn < 0 ? 'out' : 'in']);
    if (sum.borrowed) rows.push(['Borrowed on credit cards', money(sum.borrowed), 'out']);
    if (sum.debtInterest) rows.push([S.dcp ? 'Debt plan interest' : 'Card interest (25% a year)', `−${money(sum.debtInterest)}`, 'out']);
    if (sum.debtPaid) rows.push(['Debt repaid', money(sum.debtPaid), 'in']);
    if (sum.wentWithout) rows.push(['Bills you couldn\'t pay (you went without)', money(sum.wentWithout), 'out']);
  }
  rows.push(['Interest earned (CPF and savings)', money(sum.interest), 'in']);
  if (opts.noPayMonths) rows.push([`Months without pay`, String(opts.noPayMonths), 'out']);
  S.lastTurn = { span, rows };
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
        <h3>⏳ Last turn${t ? ` <span class="ledger-sub">${t.span}</span>` : ''}</h3>
        ${t ? `<div class="turn-rows">${t.rows.map(([a, b, k]) => `<span>${a}</span><b class="${k === 'out' ? 'neg' : 'pos'}">${b}</b>`).join('')}</div>`
          : '<p class="small muted-ink">Pick an activity below to start. What happens to your money each turn shows up here.</p>'}
      </section>
      <section>
        <h3>📖 Life log</h3>
        <ol class="journal">${(S.journal || []).slice(0, 12).map((j) => `<li><span class="j-age">${j.age}</span>${esc(j.text)}</li>`).join('') || '<li class="muted-ink">Your story starts here.</li>'}</ol>
      </section>
    </aside>`;
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
      <p class="small">You can pay it off faster from the Money panel. If you're struggling for real, Credit Counselling Singapore offers free help.</p></div>${btn('ok', 'OK', 'primary')}`);
  }
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
    ${stage !== 'child' ? `<div class="grown"><span id="grown-me">${person(me(stage), 'bob')}</span><div><p class="small">You've grown up! Pick a new outfit colour.</p>${outfitPicker(S.look.outfit)}</div></div>` : ''}
    ${btn('ok', "Let's go", 'primary')}`, { wide: true });
  modalBox.querySelectorAll('[data-outfit]').forEach((b) => (b.onclick = () => {
    S.look.outfit = +b.dataset.outfit;
    modalBox.querySelectorAll('[data-outfit]').forEach((x) => x.classList.toggle('on', x === b));
    $('#grown-me').innerHTML = person(me(stage), 'bob');
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

async function lifestyleDialog() {
  const takeHome = sim.takeHome(S);
  const c = await dialog(`
    <h2>How do you want to live?</h2>
    <p>Your take-home pay is about <b>${money(takeHome)}</b> a month after CPF. Spending tends to grow as you earn more, so each lifestyle is a share of your pay, with a minimum.</p>
    <div class="careers">${Object.entries(LIFESTYLES).map(([k, l]) => `
      <button class="career ${S.lifestyle === k ? 'on' : ''}" data-choice="${k}"><span class="c-icon">${l.icon}</span><b>${l.label}</b>
      <span>${Math.round(l.share * 100)}% of pay (at least ${money(l.monthly)})</span><small>${l.desc}. Joy +${l.joy} every few years</small></button>`).join('')}</div>
    <p class="small">Housing, children and a car cost extra. You can change this any time in Money.</p>`);
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
  const t = await dialog(`
    <h2>Setting aside your retirement sum</h2>
    <p>You have <b>${money(before.sa)}</b> in your SA and <b>${money(before.oa)}</b> in your OA. Your RA is filled from your SA first, then your OA, up to the sum you choose.</p>
    <div class="careers">
      <button class="career" data-choice="FRS"><b>Full (FRS)</b><span>${money(sums.FRS)}</span><small>About ${money(cpf.LIFE_PAYOUT_ESTIMATES.FRS)}/month from 65.</small></button>
      <button class="career" data-choice="BRS" ${S.home ? '' : 'disabled'}><b>Basic (BRS)</b><span>${money(sums.BRS)}</span><small>About ${money(cpf.LIFE_PAYOUT_ESTIMATES.BRS)}/month from 65. Needs a property pledge${S.home ? '' : ' (you have no home)'}.</small></button>
      <button class="career" data-choice="ERS"><b>Enhanced (ERS)</b><span>${money(sums.ERS)}</span><small>About ${money(cpf.LIFE_PAYOUT_ESTIMATES.ERS)}/month from 65.</small></button>
    </div>
    <p class="small">Payout estimates are the CPF Board's figures for people turning 55 in 2026, on the CPF LIFE Standard Plan.</p>`, { wide: true });
  const r = sim.formRA(S, t);
  logEvent(`🏛️ Retirement Account formed: ${money(S.cpf.ra)} (${t})`);
  const c = await dialog(`
    <h2>Your Retirement Account is ready</h2>
    <table class="summary">
      <tr><td>Moved from SA to RA</td><td>${money(r.fromSa)}</td></tr>
      <tr><td>Moved from OA to RA</td><td>${money(r.fromOa)}</td></tr>
      <tr><td><b>RA balance</b></td><td><b>${money(S.cpf.ra)}</b></td></tr>
      <tr><td>Left in OA</td><td>${money(S.cpf.oa)}</td></tr>
    </table>
    <p>${r.metTarget ? `You reached the ${t}! 🎉` : `You're ${money(r.sum - S.cpf.ra)} short of the ${t}. Your payouts will be smaller, but you can still top up your RA with cash.`}</p>
    <p>You may withdraw <b>${money(r.withdrawable)}</b> from your OA now${r.metTarget ? '' : ' (anyone can take out up to $5,000 at 55)'}. Money left in the OA keeps earning 2.5% or more.</p>
    <div class="row">${btn('take', `Withdraw ${money(r.withdrawable)}`)}${btn('keep', 'Leave it in CPF', 'primary')}</div>`);
  if (c === 'take') sim.withdrawOa(S, r.withdrawable);
  const rl = await dialog(`
    <h2>What kind of retirement do you want?</h2>
    <p>From now on, your monthly spending follows the retirement lifestyle you choose.</p>
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
  const panels = { stats: statsPanel, cpf: cpfPanel, money: moneyPanel, shop: shopPanel, menu: menuPanel, home: homePanel, invest: investPanel };
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
    const lbsOk = h.kind === 'hdb' && S.age >= 65 && h.loanBalance < 1 && !h.lbsDone && h.leaseLeft > 35;
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
        ${lbsOk ? `<button class="career" data-choice="lbs"><b>Lease Buyback Scheme</b><small>Sell part of your lease back to HDB and keep living here. The money tops up your RA for bigger CPF LIFE payouts, plus a cash bonus.</small></button>` : ''}
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
    ${S.career ? `<p class="small">${EDUCATION[S.education].label} · ${sim.careerOptions(S).find((c) => c.id === S.career).label}</p>` : ''}
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

function historyChart() {
  const h = S.history;
  if (h.length < 2) return '';
  const W = 520, H = 160, pad = 28;
  const maxV = Math.max(1, ...h.map((p) => Math.max(p.cpf, p.cash)));
  const minV = Math.min(0, ...h.map((p) => p.cash));
  const x = (a) => pad + ((a - h[0].age) / Math.max(1, h[h.length - 1].age - h[0].age)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
  const line = (key) => h.map((p, i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="CPF and cash savings by age">
    <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" class="axis"/>
    <path d="${line('cpf')}" class="l-cpf"/><path d="${line('cash')}" class="l-cash"/>
    <text x="${pad}" y="${H - 8}">Age ${h[0].age}</text><text x="${W - pad}" y="${H - 8}" text-anchor="end">Age ${h[h.length - 1].age}</text>
    <text x="${pad}" y="14">${money(maxV)}</text></svg>
    <p class="legend"><span class="k-cpf"></span> CPF <span class="k-cash"></span> Cash, bank and investments</p>`;
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
      <div class="limit-box"><p class="small">${S.stage === 'child' || S.stage === 'teen' ? 'Your parents can top up your Special Account for you under the Retirement Sum Topping-Up Scheme (RSTU). ' : `Cash top-ups go to your ${S.age < 55 ? 'SA' : 'RA'} under the Retirement Sum Topping-Up Scheme (RSTU). `}${topUpLimitNote(room, Math.max(0, sim.TOP_UP_TAX_RELIEF_CAP - sim.topUpsThisYear(S)))} Topped up this year: <b>${money(sim.topUpsThisYear(S))}</b>.</p>
        <p class="small">Separately, the CPF Annual Limit caps your compulsory contributions plus any Voluntary Contributions at ${money(sim.CPF_ANNUAL_LIMIT)} a year; RSTU top-ups don't count towards it. ${S.age >= 55 ? 'If your RA is below the BRS, the Matched Retirement Savings Scheme adds $1 for every $1, up to $2,000 a year.' : ''}</p></div>
      ${adult ? `<h3>📈 Investing</h3><p>Buy funds and shares with cash, or with your CPF through the CPF Investment Scheme. ${btn('invest', 'Open investments')}</p>` : ''}
      ${S.stage === 'adult' ? `<h3>Lifestyle</h3><p>${LIFESTYLES[S.lifestyle].icon} ${LIFESTYLES[S.lifestyle].label}: about ${money(sim.monthlySpend(S))}/month in total ${btn('life', 'Change')}</p>` : ''}
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    modalBox.scrollTop = scroll;
    wireAmount(modalBox, 'repay', (v) => Math.min(v, S.debt, S.bank), (v) => (repay = v));
    wireAmount(modalBox, 'topup', (v) => Math.min(v, S.bank, room), (v) => (topUp = v));
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

async function shopPanel() {
  for (;;) {
    const c = await dialog(`
      <h2>🛍️ Shop</h2>
      <p>Cash savings: <b>${money(S.bank)}</b>. Things you buy stay in your room, and some boost your stats every turn.</p>
      <div class="shop">${SHOP[S.stage].map((it) => {
        const owned = S.room.includes(it.id);
        const boost = Object.entries(it.perTurn || {}).map(([k, v]) => `${STATS[k].icon}+${v}`).join(' ');
        return `<button class="shop-item" data-choice="${it.id}" ${owned || S.bank < it.price ? 'disabled' : ''}>
          <span class="s-icon">${it.icon}</span><b>${it.name}</b><span>${owned ? 'Owned' : money(it.price)}</span>
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
    <div class="row wrap">${btn('recap', 'End my story here and see my life recap')}${btn('about', 'About the CPF figures')}${btn('restart', 'Start a new life')}${btn('ok', 'Back', 'primary')}</div>`);
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
async function endScreen() {
  const final = S.age >= STAGES.senior.endAge;
  const life = sim.retirementIncome(S);
  const need = S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle].monthly : null;
  const cash = S.bank + invest.total(S, 'cash') - S.debt;
  const t = S.totals || {};
  const hybrids = Object.keys(S.hybrids).map((h) => `${HYBRIDS[h].icon} ${HYBRIDS[h].label}`).join(', ');
  const career = S.career ? sim.careerOptions(S).find((c) => c.id === S.career) : null;
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
        <tr><td>Cash, bank and investments now</td><td>${money(cash)}</td></tr>
        ${S.shortfallAge ? `<tr><td>Money ran short from age</td><td>${S.shortfallAge}</td></tr>` : ''}
        <tr><td>Paid into your CPF over your life</td><td>${money(t.cpfIn || 0)}</td></tr>
        <tr><td>…of which your employers paid</td><td>${money(t.employerIn || 0)}</td></tr>
        <tr><td>Interest earned</td><td>${money(t.interest || 0)}</td></tr>
        <tr><td>CPF used for housing</td><td>${money(t.housingOa || 0)}</td></tr>
        <tr><td>😊 Joy from life experiences</td><td>${Math.round(S.joy)}</td></tr>
      </table>
      ${historyChart()}
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

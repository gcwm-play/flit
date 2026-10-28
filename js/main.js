// UI and game flow.
import * as cpf from './cpf.js';
import * as sim from './sim.js';
import * as housing from './housing.js';
import * as invest from './invest.js';
import * as health from './health.js';
import * as cars from './car.js';
import * as tax from './tax.js';
import { postcard } from './postcards.js';
import { characterHtml, itemHtml, itemWidth, lookOf, ANIMALS, GENDERS } from './sprites.js';
import { rollWorldEvent, rollPersonalEvent, PERSONAL_EVENTS } from './events.js';
import {
  STATS, HYBRIDS, HYBRID_THRESHOLD, STAGES, ACTIVITIES, SHOP, EDUCATION, CAREERS, CAREER_SWITCHES,
  LIFESTYLES, RETIREMENT_LIFESTYLES, RENT_MONTHLY, FACTS, HOLIDAYS, HOLIDAY_GROUPS,
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
  const share = housing.oaShareOf(h);
  if (share <= 0) return { fromOa: 0, fromCash: h.instalment };
  const wage = sim.currentWage(S);
  const oaIn = wage > 0 ? cpf.monthlyContribution(S.age, wage, { selfEmployed: S.selfEmployed }).oa : 0;
  const fromOa = Math.min(h.instalment * share, oaIn + S.cpf.oa / 12);
  return { fromOa, fromCash: h.instalment - fromOa };
}

function monthlyPlan() {
  const b = { ...sim.newBudget(), ...(S.budget || {}) };
  const share = sim.householdShare(S);
  const payout = S.life && S.age >= S.life.startAge ? S.life.monthly : 0;
  const pay = sim.takeHome(S);
  const income = pay + payout;
  const parts = sim.spendBreakdown(S);
  const living = parts.total;
  const rent = sim.isRenting(S) ? RENT_MONTHLY * share : 0;
  const loan = loanSplit();
  const loanCash = loan.fromCash;
  const dcp = S.dcp ? S.dcp.monthly : 0;
  const holidays = sim.holidayMonthly(S);
  const fun = b.hobbies + b.shopping + holidays;
  const kids = (S.children || []).filter((c) => S.age - c.bornAge < 21).length;
  const saving = sim.cpfTopUpPerYear(S) / 12 + b.kidsCpf * kids + sim.dcaCashPerYear(S) / 12;
  // Health insurance premiums: the part MediSave can't pay comes from cash.
  const insurance = sim.insurancePremiums(S).cash / 12;
  // Income tax isn't taken from your pay in Singapore: IRAS sends one bill a year.
  const incomeTax = sim.taxEstimate(S).tax / 12;
  const giving = (b.donateYearly || 0) / 12;
  const out = living + rent + loanCash + dcp + fun + insurance + incomeTax + giving;
  return { pay, payout, income, parts, living, rent, loan, loanCash, dcp, holidays, insurance, incomeTax, giving, b, kids, fun, saving, out, left: income - out };
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
      ${p.incomeTax ? `<tr><td>Income tax</td><td class="neg">−${money(p.incomeTax)}</td></tr>` : ''}
      ${p.giving ? `<tr><td>Giving to charity</td><td class="neg">−${money(p.giving)}</td></tr>` : ''}
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
  // Panels you close get a close button that stays in the corner while you scroll.
  const closer = [...modalBox.querySelectorAll('[data-choice="ok"]')].find((x) => /^(Close|Done|Back|Cancel)$/.test(x.textContent.trim()));
  if (closer) modalBox.insertAdjacentHTML('afterbegin', '<button class="modal-x" data-choice="ok" aria-label="Close" title="Close">✕</button>');
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
const walker = (look, cls, alt, lane, count, tag = '') => {
  const span = 100 / count;
  const from = Math.round(lane * span * 0.85);
  const to = Math.round(Math.min(78, from + span * 0.85 + 18));
  const dur = 9 + ((lane * 3.7) % 5);
  return `<span class="walker lane-${lane}" style="--from:${from}%;--to:${to}%;--dur:${dur.toFixed(1)}s;--delay:-${(lane * 2.3).toFixed(1)}s">${tag ? `<span class="age-tag">${tag}</span>` : ''}${person(look, `walking ${cls}`, alt)}</span>`;
};
const me = (stage = S.stage) => lookOf(S.look, stage);

// ---------- title screen ----------

// A default name to start with, swapped when you switch between he and she (until you type your own).
const DEFAULT_NAMES = { male: ['Daniel', 'Ryan', 'Ethan', 'Marcus', 'Jason', 'Adam'], female: ['Sarah', 'Rachel', 'Chloe', 'Emily', 'Grace', 'Hannah'] };
const defaultName = (gender) => DEFAULT_NAMES[gender][Math.floor(Math.random() * DEFAULT_NAMES[gender].length)];

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
        <label class="field">Your name <input id="name" maxlength="16" autocomplete="off"></label>
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
  const nameInput = $('#name');
  let autoName = defaultName(look.gender);
  nameInput.value = autoName;
  app.querySelectorAll('[data-gender]').forEach((b) => (b.onclick = () => {
    look.gender = b.dataset.gender;
    if (nameInput.value.trim() === autoName || !nameInput.value.trim()) nameInput.value = autoName = defaultName(look.gender);
    refresh();
  }));
  app.querySelectorAll('[data-animal]').forEach((b) => (b.onclick = () => { look.animal = b.dataset.animal; refresh(); }));
  app.querySelectorAll('[data-outfit]').forEach((b) => (b.onclick = () => { look.outfit = +b.dataset.outfit; refresh(); }));
  refresh();
  $('#start').onclick = async () => {
    const name = nameInput.value.trim() || defaultName(look.gender);
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
  if (s.budget) { s.budget.hobbies = 0; s.budget.shopping = 0; } // no longer in the budget
  if (s.spouse && s.spouse.ageGap === undefined) s.spouse.ageGap = sim.spouseAgeGap();
  if (s.renting === undefined) s.renting = !s.home && (s.age >= 30 || !!s.spouse);
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
  if (!s.insurance) s.insurance = { plan: 'msl', rider: false };
  // Cars used to be a yes/no: an old car becomes one bought 3 years ago.
  if (s.car === true) { s.car = cars.newCar(s.age - 3); s.car.monthsLeft -= 36; s.carsOwned = 1; }
  if (s.car === false) s.car = null;
  if (!s.healthPlan) s.healthPlan = health.planHealthEvents(Math.max(21, s.age + 1));
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
        <button class="btn small-btn" data-panel="menu">☰</button>
      </nav>
    </header>
    <div class="play">
    <div class="play-main">
    <div class="top-row">
      <main class="scene">${roomHtml()}</main>
      ${cashboardHtml()}
    </div>
    <section class="actions">
      ${S.done ? '' : actionTiles()}
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

// Self-employed: no employer CPF and no OA or SA contributions, so each turn the top-up tile
// asks whether to set money aside for retirement, until there's a yearly plan or they decide.
function selfEmployedTopUpPending() {
  return !!(S.selfEmployed && sim.isWorking(S) && S.age < 65 && !sim.cpfTopUpPerYear(S) && S.sepTopUpDecided !== S.age && sim.topUpRoom(S) > 0);
}

// Things you can do as often as you like before you pick this turn's activity.
function actionTiles() {
  const grown = S.stage === 'adult' || S.stage === 'senior';
  const working = sim.isWorking(S);
  const job = sim.careerInfo(S);
  const plans = S.holidayPlans || [];
  const tiles = [];
  if (grown) {
    tiles.push(['holidays', '✈️', 'Holidays', plans.length ? `${plans.length} planned` : 'None planned']);
    tiles.push(['invest', '📈', 'Invest', invest.total(S) > 0 ? money(invest.total(S)) : 'None yet']);
    const p = monthlyPlan();
    const left = p.left - p.saving;
    tiles.push(['budget', '📋', 'Budget', `${left < 0 ? '−' : '+'}${money(Math.abs(left * 12))} a year`, left < 0]);
    if (S.stage === 'adult') tiles.push(['family', '💞', 'Family', S.spouse ? `${S.children.length ? `${S.children.length} kid${S.children.length > 1 ? 's' : ''}` : 'Married'}${S.spouse.home ? ', 1 income' : ''}` : S.dating != null ? 'Dating' : 'Single']);
    tiles.push(['insurance', '🩺', 'Insurance', health.PLANS[(S.insurance || {}).plan || 'msl'].label.replace(' only', '').replace(' plan', '').replace('Standard (B1 ward)', 'B1 plan')]);
    const loanYrs = S.home ? Math.ceil(housing.monthsLeft(S.home) / 12) : 0;
    tiles.push(['home', '🏠', 'Home', S.home ? (S.home.loanBalance > 0.01 ? `${S.home.label} · ${loanYrs} yr${loanYrs === 1 ? '' : 's'} to own` : `${S.home.label} · fully owned 🎉`) : sim.isRenting(S) ? 'Renting' : 'With your parents']);
    if (S.stage === 'adult' || (working && S.age < 65)) tiles.push(['job', '💼', working ? 'Change job' : 'Find a job', working && job ? job.label : 'No job', !working]);
  }
  if (grown) tiles.push(['donate', '💝', 'Give', sim.donationsThisYear(S) ? `${money(sim.donationsThisYear(S))} this year` : (S.budget || {}).donateYearly ? `${money(S.budget.donateYearly)} a year` : 'Help others']);
  if (grown) tiles.push(['car', '🚗', 'Car', S.car ? `${cars.CAR.coeYears - cars.carAge(S.car, S.age)} yrs of COE left` : 'No car', S.car && cars.carAge(S.car, S.age) >= 8]);
  tiles.push(['shop', '🛍️', 'Shop', `${S.room.length} owned`]);
  const sepAsk = selfEmployedTopUpPending();
  tiles.push(['money', '💵', S.debt > 0 ? 'Repay debt' : sepAsk ? 'CPF top-up ❗' : 'CPF top-up', S.debt > 0 ? `−${money(S.debt)}` : sepAsk ? 'Self-employed: your call' : 'From your cash', S.debt > 0 || sepAsk]);
  return `<h2 class="tiles-head">Before you move on <small>as many as you like</small></h2>
    <div class="tiles">${tiles.map(([panel, icon, label, note, warn]) => `
      <button class="tile" data-panel="${panel}"><span class="t-icon">${icon}</span><span class="t-label">${label}</span><span class="t-note ${warn ? 'neg' : ''}">${note}</span></button>`).join('')}</div>`;
}

// What you spend money on, for one month, from your current budget.
function outflows(p) {
  const ls = S.stage === 'senior' && S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle] : LIFESTYLES[S.lifestyle];
  return [
    ['living', `Everyday living (${ls.label})`, p.parts.living, 'Food, transport, bills and phone. Change your lifestyle to change this.'],
    ['kids', `Children (${p.parts.kidsCount})`, p.parts.kids, `Childcare, school, tuition and pocket money until 22${S.spouse && !S.spouse.home ? ', split with your spouse' : ''}.`],
    ['kids', 'Family groceries', p.parts.groceries, 'Extra food for your children and a stay-at-home spouse.'],
    ['living', 'Allowance for your spouse at home', p.parts.homeSpouse, 'Your spouse stays at home and you cover their spending.'],
    ['debt', 'Health insurance (cash part)', p.insurance, 'Shield plan premiums above what MediSave can pay, and any rider.'],
    ['car', S.car && S.car.monthsLeft > 0 ? 'Car (loan and running costs)' : 'Car (running costs)', p.parts.car, 'Car loan, petrol, parking, insurance, road tax and servicing.'],
    ['home', 'Rent', p.rent, S.spouse && sim.householdShare(S) < 1 ? 'Your half of the rent.' : 'Renting a room or small flat.'],
    ['home', p.loan.fromOa > 0.5 ? 'Home loan (cash part)' : 'Home loan', p.loanCash, p.loan.fromOa > 0.5 ? `The rest, ${money(p.loan.fromOa)} a month, comes from your OA.` : 'Paid in cash. You can switch to your OA in 🏠 Home.'],
    ['debt', 'Debt plan', p.dcp, 'Fixed instalment until your debt is cleared.'],
    ['fun', 'Hobbies', p.b.hobbies, ''],
    ['fun', 'Shopping and treats', p.b.shopping, ''],
    ['trip', 'Holidays', p.holidays, 'Your planned trips, spread over the year.'],
    ['tax', 'Income tax', p.incomeTax, 'Tap to see how your tax is worked out.'],
    ['give', 'Giving to charity', p.giving, 'Your yearly donation, set in your budget.'],
  ].filter((r) => r[2] > 0.5);
}

function cashboardHtml() {
  const grown = S.stage === 'adult' || S.stage === 'senior';
  const t = S.lastTurn;
  const change = t && t.cash ? t.cash[1] - t.cash[0] : null;
  const cashCard = `
      <div class="cb-cash">
        <span class="cb-label">💵 Cash you can spend</span>
        <b class="cb-big">${money(S.bank)}</b>
        ${change !== null ? `<span class="cb-change">Last turn <b class="${change < 0 ? 'neg' : 'pos'}">${change < 0 ? '−' : '+'}${money(Math.abs(change))}</b>${t.years > 1 ? ` over ${t.years} years (${change < 0 ? '−' : '+'}${money(Math.abs(change / t.years))} a year)` : ''}</span>` : ''}
        <div class="cb-mini">
          ${invest.total(S, 'cash') > 0 ? `<span>📈 Invested</span><b>${money(invest.total(S, 'cash'))}</b>` : ''}
          ${S.debt > 0 ? `<span class="neg">💳 Debt</span><b class="neg">−${money(S.debt)}</b>` : ''}
          ${grown && S.home && S.home.loanBalance > 1 ? `<span>🏠 Loan left</span><b>${money(S.home.loanBalance)}</b>` : ''}
        </div>
      </div>`;
  if (!grown) {
    const st = STAGES[S.stage];
    return `<section class="cashboard young">${cashCard}
      <p class="small">Pocket money: about <b>${money(st.yearlyAllowance)}</b> a year. You spend about half, and your parents bank the rest for you.</p></section>`;
  }
  const p = monthlyPlan();
  const items = outflows(p);
  const allowance = p.parts.allowance;
  const inMonth = p.income + allowance;
  const outMonth = items.reduce((a, r) => a + r[2], 0);
  const left = inMonth - outMonth - p.saving;
  const years = sim.yearsThisTurn(S);
  const top = Math.max(1, ...items.map((r) => r[2]));
  const yr = (v) => money(v * 12);
  return `<section class="cashboard">
      ${cashCard}
      <div class="cb-year">
        <h3>Your year in money <span>at today's pay and budget</span></h3>
        <div class="cb-flow">
          <div><span>In</span><b class="pos">${yr(inMonth)}</b><small>${money(inMonth)}/mo</small></div>
          <div><span>Spent</span><b class="neg">${yr(outMonth)}</b><small>${money(outMonth)}/mo</small></div>
          ${p.saving ? `<div><span>Saved</span><b>${yr(p.saving)}</b><small>${money(p.saving)}/mo</small></div>` : ''}
          <div><span>${left < 0 ? 'Short' : 'Spare'}</span><b class="${left < 0 ? 'neg' : 'pos'}">${left < 0 ? '−' : ''}${yr(Math.abs(left))}</b><small>${left < 0 ? '−' : ''}${money(Math.abs(left))}/mo</small></div>
        </div>
        <div class="cb-split" aria-hidden="true">${items.map((r) => `<span class="k-${r[0]}" style="flex:${r[2]}" title="${r[1]}"></span>`).join('')}${p.saving ? `<span class="k-save" style="flex:${p.saving}" title="Saving"></span>` : ''}${left > 0 ? `<span class="k-spare" style="flex:${left}" title="Spare"></span>` : ''}</div>
        <div class="cb-out">
          <span class="cb-h">Where it goes</span><span class="cb-h num">a month</span><span class="cb-h num">a year</span>
          ${items.sort((a, b) => b[2] - a[2]).map((r) => `
          ${r[0] === 'tax' ? '<button class="cb-item cb-link" data-panel="tax"' : '<span class="cb-item"'} title="${r[3]}"><i class="k-${r[0]}"></i>${r[1]}${r[0] === 'tax' ? ' <u>how?</u>' : ''}<em style="width:${(r[2] / top) * 100}%" class="k-${r[0]}"></em>${r[0] === 'tax' ? '</button>' : '</span>'}<b class="num">${money(r[2])}</b><b class="num">${yr(r[2])}</b>`).join('')}
          ${p.loan.fromOa > 0.5 ? `<span class="cb-item muted-ink" title="Paid from your CPF Ordinary Account, so it doesn't come out of your cash."><i></i>Home loan from your OA (not cash)</span><b class="num muted-ink">${money(p.loan.fromOa)}</b><b class="num muted-ink">${yr(p.loan.fromOa)}</b>` : ''}
          ${allowance ? `<span class="cb-item"><i class="k-spare"></i>Allowance from your children</span><b class="num pos">+${money(allowance)}</b><b class="num pos">+${yr(allowance)}</b>` : ''}
          ${p.saving ? `<span class="cb-item"><i class="k-save"></i>Saving: ${[sim.cpfTopUpPerYear(S) && 'CPF top-ups', p.b.kidsCpf && p.kids && "kids' CPF", sim.dcaCashPerYear(S) && 'investing'].filter(Boolean).join(', ')}</span><b class="num">${money(p.saving)}</b><b class="num">${yr(p.saving)}</b>` : ''}
        </div>
        <p class="small muted-ink">${years > 1 ? `Your next turn is ${years} years: about <b class="${left < 0 ? 'neg' : ''}">${left < 0 ? '−' : ''}${money(Math.abs(left * 12 * years))}</b> ${left < 0 ? 'short' : 'spare'} in all. ` : ''}${left < 0 && S.bank > 0 ? `Shortfalls come out of your cash${S.age >= 55 ? ', then your OA' : ''}, then credit cards. ` : ''}<button class="link-btn" data-panel="budget">Change my budget</button></p>
      </div>
    </section>`;
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
    if (sim.isRenting(S)) return { cls: 'rental', label: 'Rented flat' };
    return { cls: 'family', label: 'Room at your family’s flat' };
  }
  return { cls: S.stage, label: S.stage === 'child' ? 'Your bedroom' : 'Your room' };
}

function roomHtml() {
  const kind = roomKind();
  const items = sim.ownedItems(S);
  const grown = S.stage === 'adult' || S.stage === 'senior';
  const spouseStage = S.stage === 'senior' ? 'senior' : 'adult';
  // Each animal carries a small tag with its age.
  const family = [[me(), 'player', esc(S.name), `<b>You</b> ${S.age}`]];
  if (grown && S.spouse) {
    const age = S.age + (S.spouse.ageGap || 0);
    family.push([lookOf(S.spouse, spouseStage), 'family-member', `Your spouse, age ${age}`, `${age}`]);
  }
  if (grown) for (const c of S.children || []) {
    const age = S.age - c.bornAge;
    const st = age < 3 ? 'baby' : age < 13 ? 'child' : age < 21 ? 'teen' : 'adult';
    family.push([lookOf(c, st), 'family-member kid', `Your child, age ${age}`, age < 1 ? '👶' : `${age}`]);
  }
  return `
    <div class="room room-${kind.cls} stage-${S.stage}">
      <div class="wall">
        <div class="window"><div class="sky"></div><div class="hdb"></div></div>
        <span class="room-label">${kind.label}</span>
        <span class="age-box"><b>Age ${S.age}</b>${S.done ? '' : `<small>${(() => { const y = sim.yearsThisTurn(S); return y > 1 ? `This turn: ${S.age} to ${S.age + y - 1}` : 'This turn: 1 year'; })()}</small>`}</span>
      </div>
      <div class="floor"></div>
      <div class="bed"><div class="pillow"></div><div class="blanket"></div></div>
      <div class="cabinet"></div>
      <div class="items">${placeItems(items)}</div>
      <div class="people">${family.map(([look, cls, alt, tag], i) => walker(look, cls, alt, i, family.length, tag)).join('')}</div>
    </div>`;
}

// Small things go on top of the low cabinet, big things on the floor.
const SHELF_SLOTS = [0, 1, 2, 3, 4];
// Floor items go against the wall first (left of the cabinet), then in a front row across the
// room. Each one takes the free spot that overlaps least with what's already there, keeps
// clear of the bed where it can, and stays as far from its neighbours as possible, so big
// pieces spread out instead of piling up on one side.
const BED = [27, 44];
const ROWS = [{ max: 62, bottom: 22, z: 1, cost: 0 }, { max: 99, bottom: 3, z: 3, cost: 4 }];
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
function layoutFloor(items) {
  const done = [];
  const order = [...items].sort((a, b) => itemWidth(b) - itemWidth(a));
  for (const it of order) {
    const w = itemWidth(it);
    let best = null;
    ROWS.forEach((row, r) => {
      for (let x = 1; x + w <= row.max || x === 1; x++) {
        let cost = row.cost;
        let near = Infinity;
        for (const d of done) {
          cost += overlap(x, x + w, d.x, d.x + d.w) * (d.r === r ? 3 : 1);
          near = Math.min(near, Math.abs(x + w / 2 - (d.x + d.w / 2)));
        }
        if (r === 0) cost += overlap(x, x + w, ...BED) * 0.5;
        cost -= Math.min(near, 40) * 0.05;
        if (!best || cost < best.cost - 1e-9) best = { cost, x, r };
        if (x + w > row.max) break;
      }
    });
    done.push({ it, w, x: best.x, r: best.r });
  }
  return new Map(done.map((d) => [d.it, `left:${d.x}%;bottom:${ROWS[d.r].bottom}%;z-index:${ROWS[d.r].z}`]));
}
function placeItems(items) {
  let shelf = 0;
  const onShelf = new Set(items.filter((it) => !it.floor).slice(0, SHELF_SLOTS.length));
  const floor = layoutFloor(items.filter((it) => !onShelf.has(it)));
  return items.map((it) => {
    const where = onShelf.has(it) ? `class="item slot-${SHELF_SLOTS[shelf++]}"` : `class="item" style="${floor.get(it)}"`;
    return `<span ${where} title="${it.name}" data-item="${it.id}">${itemHtml(it)}</span>`;
  }).join('');
}

// ---------- a turn ----------

async function takeTurn(activityId) {
  if (busy) return;
  busy = true;
  try {
    const activity = ACTIVITIES[S.stage].find((a) => a.id === activityId);
    (S.did ||= {})[activity.label] = (S.did[activity.label] || 0) + 1;
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
      if (w.opts?.retrenched) {
        sim.story(S, 'job', '📉', `Retrenched in a recession at ${S.age}`);
        await jobHunt('retrenched', 'recession');
      }
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

    // Illnesses and accidents planned for this life, at the ages they happen.
    for (const e of S.healthPlan || []) {
      if (!e.done && e.age >= startAge && e.age < S.age) {
        e.done = true;
        await medicalDialog(e);
      }
    }

    // Personal events and gifts.
    const personal = rollPersonalEvent(S);
    if (personal) await runPersonalEvent(personal.run(S));
    for (const h of sim.checkHybrids(S)) toast(`✨ New hybrid stat: ${HYBRIDS[h].label}`);
    void before;

    closeModal();
    await milestones();
    save();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    busy = false;
  }
}

// ---------- health ----------

// A hospital ward, drawn small: more beds in the cheaper wards, and you in the middle one.
function wardHtml(ward) {
  const w = health.WARDS[ward];
  const beds = Math.min(w.beds, 6);
  const mine = Math.floor((beds - 1) / 2);
  return `<div class="ward ward-${ward}" aria-hidden="true">
    <div class="ward-wall">${ward === 'C' || ward === 'B2' ? '<span class="fan"></span>' : '<span class="aircon"></span>'}${ward === 'B1' || ward === 'A' || ward === 'private' ? '<span class="tv"></span>' : ''}${ward === 'private' ? '<span class="sofa"></span><span class="plant">🪴</span>' : ''}</div>
    <div class="ward-beds">${Array.from({ length: beds }, (_, i) => `<div class="ward-bed ${i === mine ? 'me' : ''}">${i === mine ? person(me(), 'patient') : ''}<span class="sheet"></span></div>`).join('')}</div>
  </div>`;
}

async function medicalDialog(e) {
  const { c, b } = sim.treat(S, e.id);
  const ins = S.insurance || { plan: 'msl' };
  const plan = health.PLANS[ins.plan];
  const row = (label, v, cls = '') => (v > 0.5 ? `<tr class="${cls}"><td>${label}</td><td>${cls === 'pay' ? '' : '−'}${money(v)}</td></tr>` : '');
  logEvent(`${c.icon} In hospital with ${c.label}`);
  await dialog(`
    <div class="event"><div class="e-icon">${c.icon}</div><p class="eyebrow">${c.kind === 'major' ? 'A serious illness' : 'A trip to hospital'}</p>
    <h2>You're recovering from ${c.label}</h2></div>
    ${wardHtml(b.ward)}
    <p class="ward-caption">${c.days} days in ${b.wardInfo.desc}: a <b>${b.wardInfo.label}</b>${c.icu ? `, including ${c.icu} day${c.icu > 1 ? 's' : ''} in intensive care` : ''}. ${ins.plan === 'msl' ? 'With MediShield Life only, you stay in a subsidised ward.' : `Your ${plan.label} covers this ward.`}</p>
    <h3>Who paid the bill</h3>
    <table class="summary bill">
      <tr><td><b>Hospital bill</b></td><td><b>${money(b.gross)}</b></td></tr>
      ${row(`Government subsidy (${Math.round(b.subsidyPct * 100)}%, means-tested on household income of ${money(sim.pchi(S))} a person a month)`, b.subsidy)}
      ${b.wardInfo.subsidised ? '' : '<tr><td class="muted-ink">No Government subsidy in B1, A or private wards</td><td></td></tr>'}
      ${row(`MediShield Life (after the ${money(b.deductible)} deductible and co-insurance)`, b.msl)}
      ${b.msl < 0.5 ? `<tr><td class="muted-ink">MediShield Life pays nothing below the ${money(b.deductible)} deductible</td><td></td></tr>` : ''}
      ${row(`Your ${plan.label}`, b.ip)}
      ${row('Your rider', b.rider)}
      <tr><td><b>Left for you to pay</b></td><td><b>${money(b.owed)}</b></td></tr>
      ${row(`from your MediSave (limit for this stay ${money(b.medisaveLimit)})`, b.fromMedisave, 'pay')}
      ${row('in cash', b.fromCash, 'pay')}
      ${row('MediFund (help for those who still can\'t pay)', b.medifund, 'pay')}
    </table>
    ${factBox(FACTS.healthcare)}
    <ul class="facts small">
      <li>MediShield Life covers everyone for life, including existing illnesses, but it pays for subsidised B2 and C wards.</li>
      <li>MediSave is your own savings for healthcare; it can also pay your family's hospital bills.</li>
      ${ins.plan === 'msl' ? '<li>A Shield plan (🩺 Insurance) would let you choose a B1, A or private ward, but it costs more every year as you get older.</li>' : '<li>Shield plans cost more every year as you age. Compare what you paid in premiums with what they paid out.</li>'}
    </ul>
    ${btn('ok', 'Get well soon', 'primary')}`, { wide: true });
}

// ---------- cars ----------

async function carPanel() {
  for (;;) {
    const car = S.car;
    const q = car && cars.quote(car, S.age);
    const fresh = cars.newCar(S.age);
    const c = await dialog(`
      <h2>🚗 Your car</h2>
      ${car ? `
        <table class="summary">
          <tr><td>Bought at</td><td>${car.boughtAge} (${q.years} year${q.years === 1 ? '' : 's'} ago)</td></tr>
          <tr><td>COE left</td><td>${Math.max(0, cars.CAR.coeYears - q.years)} years</td></tr>
          <tr><td>Costs you each month</td><td>${money(cars.monthlyCost(car))}${car.monthsLeft > 0 ? `<small>incl. loan ${money(car.monthly)} for ${Math.ceil(car.monthsLeft / 12)} more years</small>` : ''}</td></tr>
        </table>
        <h3>A dealer's quote</h3>
        <table class="summary">
          <tr><td>Unused COE (${Math.max(0, cars.CAR.coeYears - q.years)} of ${cars.CAR.coeYears} years)</td><td>${money(q.coeRebate)}</td></tr>
          <tr><td>PARF rebate (part of the registration fee back)</td><td>${money(q.parf)}</td></tr>
          <tr><td>For the car itself</td><td>${money(q.extra)}</td></tr>
          <tr><td><b>Offer</b></td><td><b>${money(q.value)}</b></td></tr>
          ${q.loan > 1 ? `<tr><td>Car loan still to pay off</td><td class="neg">−${money(q.loan)}</td></tr><tr><td><b>Cash to you</b></td><td><b>${money(q.net)}</b></td></tr>` : ''}
        </table>
        <p class="small">You paid ${money(car.price)}. In Singapore most of a car's price is the 10-year COE, so its value falls steadily and is close to zero when the COE ends. Cars registered from February 2026 get a smaller PARF rebate (at most 30% of the registration fee).</p>
        <div class="row">${btn('sell', `Sell for ${money(q.value)}`, 'primary')}</div>`
      : `
        <p>You don't own a car. A new one costs about <b>${money(cars.CAR.price)}</b>, mostly for the 10-year COE.</p>
        <table class="summary">
          <tr><td>Down payment (cash, 30%)</td><td>${money(fresh.down)}</td></tr>
          <tr><td>Car loan for 7 years</td><td>${money(fresh.monthly)}/month</td></tr>
          <tr><td>Petrol, parking, insurance, road tax, servicing</td><td>${money(cars.CAR.running)}/month</td></tr>
          <tr><td>Over 10 years, about</td><td>${money(fresh.down + fresh.monthly * 84 + cars.CAR.running * 120)}</td></tr>
        </table>
        <div class="row">${btn('buy', `Buy a car (${money(fresh.down)} down)`, 'primary')}</div>`}
      ${btn('ok', 'Close')}`, { wide: true });
    if (c === 'ok') return;
    if (c === 'sell') {
      const r = sim.sellCar(S);
      logEvent(`🚗 Sold the car for ${money(r.value)}`);
      toast(`🚗 Sold for ${money(r.value)}${r.loan > 1 ? `; ${money(r.loan)} paid off the loan` : ''}`);
    }
    if (c === 'buy') {
      if (S.bank < fresh.down) { toast(`You need ${money(fresh.down)} in cash for the down payment.`); continue; }
      sim.buyCar(S);
      logEvent('🚗 Bought a car');
      toast('🚗 Vroom! Joy +2');
    }
    render();
  }
}

// The COE has run out: scrap the car (and get the small PARF rebate), then buy again or not.
async function coeEndDialog() {
  const q = cars.quote(S.car, S.age);
  const fresh = cars.newCar(S.age);
  const c = await dialog(`<div class="event"><div class="e-icon">🚗</div><p class="eyebrow">Your COE has ended</p>
    <h2>Your car is 10 years old</h2>
    <p>A car's Certificate of Entitlement lasts 10 years. Scrapping it now gets you a PARF rebate of only <b>${money(q.parf)}</b>: the car is worth almost nothing. (You could also renew the COE at the current price, but most owners scrap.)</p></div>
    <table class="summary">
      <tr><td>A new car: down payment</td><td>${money(fresh.down)}</td></tr>
      <tr><td>…then each month (loan and running costs)</td><td>${money(cars.monthlyCost(fresh))}</td></tr>
    </table>
    <div class="row">${btn('new', 'Buy a new car', 'primary')}${btn('none', 'Go car-free: MRT, bus and Grab')}</div>`);
  sim.sellCar(S, 'Scrapped');
  if (c === 'new') {
    sim.buyCar(S);
    logEvent('🚗 Scrapped the old car and bought a new one');
  } else logEvent('🚌 Went car-free');
}

// The yearly CPF top-up stopped because the SA reached the FRS (or the RA the ERS).
async function cpfPlanStoppedNotice() {
  const st = S.cpfPlanStopped;
  if (!st || st.told) return;
  st.told = true;
  await dialog(`<div class="event"><div class="e-icon">🏛️</div><p class="eyebrow">CPF top-ups</p>
    <h2>${st.before55 ? 'Your SA has reached the FRS' : 'Your RA has reached the ERS'}</h2>
    <p>${st.before55
      ? `Your Special Account now holds the Full Retirement Sum (${money(cpf.RETIREMENT_SUMS.FRS)}), the most cash top-ups can take. Your yearly top-up has stopped. Your SA keeps earning 4% or more. At 55 your SA closes and you can top up your Retirement Account again, up to the ERS.`
      : `Your Retirement Account now holds the Enhanced Retirement Sum (${money(cpf.RETIREMENT_SUMS.ERS)}), the most it can take. Your yearly top-up has stopped.`}</p></div>
    ${btn('ok', 'OK', 'primary')}`);
  logEvent('🏛️ Yearly CPF top-up stopped: limit reached');
}

// Owning your home outright is a big milestone: count down the last 10 years, then celebrate.
async function homeLoanMilestones() {
  const h = S.home;
  if (!h) return;
  if (h.paidOffAge != null && !h.celebrated) {
    h.celebrated = true;
    const years = h.paidOffAge - h.boughtAge + 1;
    sim.story(S, 'home', '🎉', `Paid off the ${h.label} loan at ${h.paidOffAge} and owned it outright`);
    logEvent(`🎉 Home loan paid off: you own your ${h.label}`);
    await dialog(`<div class="event"><div class="e-icon">🎉</div><p class="eyebrow">A big milestone</p>
      <h2>You own your ${h.label}!</h2>
      <p>After ${years} years you've made your last loan payment. The home is fully yours, and the ${money(h.instalment)} you paid every month is now yours to keep${housing.oaShareOf(h) > 0 ? ', and your OA can grow again' : ''}.</p></div>
      ${btn('ok', 'Celebrate! 🥳', 'primary')}`);
    S.joy += 3;
    return;
  }
  if (h.loanBalance <= 0.01) return;
  const left = housing.monthsLeft(h) / 12;
  const mark = left <= 5 ? 5 : left <= 10 ? 10 : 0;
  if (!mark || (h.countdown || []).includes(mark)) return;
  h.countdown = [...new Set([...(h.countdown || []), mark, 10])]; // reaching 5 also covers 10
  await dialog(`<div class="event"><div class="e-icon">🏁</div><p class="eyebrow">Home loan countdown</p>
    <h2>${Math.ceil(left) <= 1 ? 'Less than a year' : `About ${Math.ceil(left)} years`} to go</h2>
    <p>Only ${money(h.loanBalance)} left on your ${h.label} loan. ${mark === 5 ? 'The finish line is in sight!' : 'You\'re on the home stretch.'}</p></div>
    ${btn('ok', 'Keep going', 'primary')}`);
}

// ---------- family ----------

async function familyPanel() {
  for (;;) {
    const sp = S.spouse;
    const kids = S.children || [];
    const lastKid = kids.at(-1);
    const canBaby = sp && kids.length < 4 && S.age <= 45 && (!lastKid || S.age - lastKid.bornAge >= 1);
    const parts = sim.spendBreakdown(S);
    const shown = dialog(`
      <h2>💞 Relationship and family</h2>
      ${!sp ? `
        <p>${S.dating != null ? `You've been seeing someone special since ${S.dating}.` : 'You\'re single.'} Married couples can apply for a BTO flat together and share household costs.</p>
        ${factBox(FACTS.marriage)}
        <div class="careers">
          ${S.dating == null
            ? `<button class="career" data-choice="date" ${S.age < 21 ? 'disabled' : ''}><b>💞 Start a relationship</b><small>Meet someone and see where it goes.</small></button>`
            : `<button class="career" data-choice="propose"><b>💍 Get married</b><small>Pick a simple or a big wedding. You can apply for a flat right after.</small></button>
               <button class="career" data-choice="split"><b>💔 Go your separate ways</b><small>Back to single life.</small></button>`}
        </div>`
      : `
        <p>You're married${kids.length ? ` with ${kids.length} ${kids.length === 1 ? 'child' : 'children'}` : ''}.</p>
        <h3>Your spouse's work</h3>
        <div class="careers">
          <button class="career ${!sp.home ? 'on' : ''}" data-choice="dual"><b>👥 Dual income</b><small>Your spouse works and earns about ${money(sp.salary)} a month. You split household costs half and half.</small></button>
          <button class="career ${sp.home ? 'on' : ''}" data-choice="home"><b>🏠 Stay-at-home spouse</b><small>Your spouse looks after the home and children. You pay all household costs, their groceries and a monthly allowance. Their CPF stops growing, though you can top it up.</small></button>
        </div>
        ${sp.home ? `<div class="alloc-row"><span class="al-icon">💵</span><span class="al-text"><b>Monthly allowance for your spouse</b><small>Their personal spending: phone, transport, clothes, meals out.</small></span>${amountControl('allow', 2000, 'Spouse allowance', sp.allowance || 0)}</div>` : ''}
        <h3>Children</h3>
        <table class="summary">
          ${sim.CHILD_COSTS.map(([max, cost, what], i) => `<tr><td>Age ${i ? sim.CHILD_COSTS[i - 1][0] + 1 : 0} to ${max}: ${what}</td><td>${money(cost)}/month</td></tr>`).join('')}
          <tr><td>Groceries for each child</td><td>${money(sim.GROCERIES.child)}/month</td></tr>
        </table>
        <p class="small">2026 estimates after Government subsidies, before university.${!sp.home ? ' You pay half; your spouse pays the other half.' : ''} Your family now costs you <b>${money(parts.kids + parts.groceries + parts.homeSpouse)}</b> a month. Each child gets the SG Child Support Package: a ${money(sim.CHILD_SUPPORT.babyGift)} Baby Gift, ${money(sim.CHILD_SUPPORT.childCredit)} of Child Credits a year from 1 to 16 (they help with these costs), a CDA grant and ${money(sim.CHILD_SUPPORT.psea)} for their education at 17.</p>
        ${factBox(FACTS.fertility)}
        <div class="row">${canBaby ? btn('baby', kids.length ? '👶 Have another baby' : '👶 Have a baby', 'primary') : `<span class="small muted-ink">${kids.length >= 4 ? 'Your family is complete.' : S.age > 45 ? 'Past 45, the game stops offering babies.' : 'A new baby can come a year after the last.'}</span>`}</div>`}
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    // Wire the slider before waiting for a choice, or it can't be dragged.
    if (sp && sp.home) wireAmount(modalBox, 'allow', (v) => Math.min(v, 2000), (v) => (sp.allowance = v));
    const c = await shown;
    if (c === 'ok') return;
    if (c === 'date') { S.dating = S.age; logEvent('💞 Started a relationship'); toast('💞 You\'re seeing someone special'); }
    if (c === 'split') { S.dating = null; logEvent('💔 Broke up'); }
    if (c === 'propose') await runPersonalEvent(PERSONAL_EVENTS.find((e) => e.id === 'partner').run(S));
    if (c === 'baby') await runPersonalEvent(PERSONAL_EVENTS.find((e) => e.id === 'baby').run(S));
    if ((c === 'dual' || c === 'home') && sp.home !== (c === 'home')) {
      sp.home = c === 'home';
      // Only the last change in a year goes in your life story.
      S.story = (S.story || []).filter((e) => !(e.spouseWork && e.age === S.age));
      sim.story(S, 'family', sp.home ? '🏠' : '👥', sp.home ? 'Your spouse became a stay-at-home parent' : 'Your spouse went back to work', { spouseWork: true });
    }
    if (S.spouse && !S.home && S.homeAskedMarried == null && S.stage === 'adult') { closeModal(); await homeDecision(); }
    render();
  }
}

async function insurancePanel() {
  for (;;) {
    const ins = S.insurance || (S.insurance = { plan: 'msl', rider: false });
    const ages = [S.age, 50, 65, 75, 85].filter((a, i, all) => a >= S.age && all.indexOf(a) === i).slice(0, 4);
    const paid = (S.totals?.insuranceCash || 0) + (S.totals?.insuranceMa || 0);
    const claims = (S.illnesses || []).length;
    const c = await dialog(`
      <h2>🩺 Health insurance</h2>
      <p>Everyone in Singapore has <b>MediShield Life</b>, paid from MediSave. On top of it you can buy an <b>Integrated Shield Plan</b> from a private insurer for a better ward, and a <b>rider</b> that pays most of what's left of the bill. Premiums rise steeply with age.</p>
      <div class="table-scroll"><table class="summary rates">
        <tr><th>Yearly premium</th>${ages.map((a) => `<th>Age ${a}</th>`).join('')}</tr>
        ${Object.entries(health.PLANS).map(([id, p]) => `
          <tr class="${ins.plan === id && !ins.rider ? 'on' : ''}"><td>${p.icon} ${p.label}</td>${ages.map((a) => { const r = health.premiums(a, id); return `<td>${money(r.total)}<br><small>${money(r.cash)} cash</small></td>`; }).join('')}</tr>
          ${p.rider ? `<tr class="${ins.plan === id && ins.rider ? 'on' : ''}"><td>&nbsp;&nbsp;+ rider</td>${ages.map((a) => { const r = health.premiums(a, id, true); return `<td>${money(r.total)}<br><small>${money(r.cash)} cash</small></td>`; }).join('')}</tr>` : ''}`).join('')}
      </table></div>
      <p class="small">MediSave pays MediShield Life plus up to ${money(health.awl(S.age))} a year of a Shield plan (the Additional Withdrawal Limit: $300 up to 40, $600 from 41 to 70, $900 from 71). The rest, and all rider premiums, are paid in cash. Typical 2026 premiums, rounded; real quotes differ by insurer. Buying a plan later in life can be harder: insurers can exclude illnesses you already had.</p>
      <h3>Your cover: ${health.PLANS[ins.plan].icon} ${health.PLANS[ins.plan].label}${ins.rider ? ' + rider' : ''}</h3>
      <p class="small">Premiums paid so far: ${money(paid)}. Hospital stays so far: ${claims}.</p>
      <div class="careers">${Object.entries(health.PLANS).map(([id, p]) => `
        <button class="career ${ins.plan === id ? 'on' : ''}" data-choice="plan:${id}"><span class="c-icon">${p.icon}</span><b>${p.label}</b><span>${money(health.premiums(S.age, id).total)} a year now</span><small>${p.desc} Ward: ${health.WARDS[p.ward].label}.</small></button>`).join('')}</div>
      ${ins.plan !== 'msl' ? `<div class="row">${btn('rider', ins.rider ? 'Drop the rider' : `Add a rider (+${money(health.premiums(S.age, ins.plan, true).rider)} a year, cash)`)}</div>` : ''}
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    if (c === 'rider') ins.rider = !ins.rider;
    if (c.startsWith('plan:')) {
      const id = c.slice(5);
      if (id !== ins.plan) {
        ins.plan = id;
        if (id === 'msl') ins.rider = false;
        logEvent(`🩺 Health cover: ${health.PLANS[id].label}`);
        sim.story(S, 'cpf', '🩺', id === 'msl' ? `Kept to MediShield Life only at ${S.age}` : `Bought a ${health.PLANS[id].label} at ${S.age}`);
      }
    }
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
  for (const [k, v] of Object.entries(sum)) if (k !== 'cashStart' && k !== 'cashEnd') out[k] = (out[k] || 0) + v;
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
  // Each row: label, amount over the whole turn, and whether it's money in, money out, or a CPF/saving move.
  const rows = [];
  const add = (label, v, kind) => { if (Math.abs(v) > 0.5) rows.push([label, v, kind]); };
  if (young) {
    add('Pocket money and earnings', sum.income, 'in');
    add(`Into CPF from your job (employer paid ${money(sum.employerIn / years)})`, sum.cpfIn, 'cpf');
  } else {
    add('Take-home pay', sum.income - sum.payouts, 'in');
    add('CPF LIFE payouts', sum.payouts, 'in');
    add('Allowance from your children', sum.allowance, 'in');
    add('Child Credits (SG Child Support Package)', sum.childCredits || 0, 'in');
    add('Everyday living', -sum.living, 'out');
    add('Children', -sum.kids, 'out');
    add('Family groceries', -(sum.groceries || 0), 'out');
    add('Allowance for your spouse at home', -(sum.homeSpouse || 0), 'out');
    add('Health insurance premiums (cash)', -(sum.insuranceCash || 0), 'out');
    add('Car', -sum.car, 'out');
    add('Rent', -sum.rent, 'out');
    add(sum.oaRanOut ? 'Home loan in cash (your OA ran out)' : 'Home loan in cash', -(sum.housingCash || 0), 'out');
    add('Debt plan instalments', -sum.dcpPaid, 'out');
    add('Hobbies and shopping', -sum.fun, 'out');
    add('Holidays', -sum.holidays, 'out');
    add('Income tax', -(sum.tax || 0), 'out');
    add('Given to charity (your budget)', -(sum.donated || 0), 'out');
    add('Your planned CPF top-ups', sum.cpfSaved, 'save');
    add('Topped up your children\'s CPF', sum.kidsCpf, 'save');
    add('Regular investing', sum.invested, 'save');
    add('Investment returns', sum.investReturn, sum.investReturn < 0 ? 'out' : 'in');
    add('Borrowed on credit cards', sum.borrowed, 'warn');
    add(S.dcp ? 'Debt plan interest' : 'Card interest (25% a year)', -sum.debtInterest, 'out');
    add('Bills you couldn\'t pay (you went without)', sum.wentWithout, 'warn');
    add(`Into CPF (employer paid ${money(sum.employerIn / years)})`, sum.cpfIn, 'cpf');
    add('Home loan paid from OA', -sum.housingOa, 'cpf');
    add('Health insurance premiums from MediSave', -(sum.insuranceMa || 0), 'cpf');
  }
  if (sum.cpfInterest != null) {
    add('Interest on your CPF', sum.cpfInterest, 'cpf');
    add(`Interest on your cash (bank, ${pctText(sim.SAVINGS_RATE)})`, sum.bankInterest, 'in');
  } else add('Interest earned (CPF and savings)', sum.interest, 'in');
  S.lastTurn = { span, rows, years, cash: [sum.cashStart, sum.cashEnd], noPayMonths: opts.noPayMonths || 0 };
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
        <h3>⏳ Last turn${t ? ` <span class="ledger-sub">${t.span}${t.years > 1 ? ', a year on average' : ''}</span>` : ''}</h3>
        ${t ? lastTurnHtml(t) : '<p class="small muted-ink">Pick an activity below to start. What happens to your money each turn shows up here.</p>'}
      </section>
      <section>
        <h3>📖 Life log</h3>
        <ol class="journal">${(S.journal || []).slice(0, 12).map((j) => `<li><span class="j-age">${j.age}</span>${esc(j.text)}</li>`).join('') || '<li class="muted-ink">Your story starts here.</li>'}</ol>
      </section>
    </aside>`;
}

// Last turn's money, a year at a time, so turns of different lengths compare.
function lastTurnHtml(t) {
  const per = t.years || 1;
  const fmt = (v) => (typeof v === 'string' ? v : `${v < 0 ? '−' : ''}${money(Math.abs(v) / per)}`);
  const cls = (v, k) => (k === 'cpf' || k === 'save' ? '' : k === 'warn' || k === 'out' || v < 0 ? 'neg' : 'pos');
  const group = (kinds, title) => {
    const rows = t.rows.filter((r) => kinds.includes(r[2]));
    return rows.length ? `<span class="tr-h">${title}</span><span></span>${rows.map(([a, v, k]) => `${a === 'Income tax' ? `<button class="link-btn tr-link" data-panel="tax">${a}</button>` : `<span>${a}</span>`}<b class="${cls(v, k)}">${fmt(v)}</b>`).join('')}` : '';
  };
  const old = t.rows.some((r) => typeof r[1] === 'string');
  const cashLine = t.cash ? `<p class="small">Cash went from <b>${money(t.cash[0])}</b> to <b>${money(t.cash[1])}</b>${per > 1 ? ` over the ${per} years` : ''}.</p>` : '';
  if (old) return `<div class="turn-rows">${t.rows.map(([a, b, k]) => `<span>${a}</span><b class="${k === 'out' ? 'neg' : 'pos'}">${b}</b>`).join('')}</div>`;
  return `<div class="turn-rows">${group(['in'], 'Money in')}${group(['out', 'warn'], 'Money out')}${group(['save'], 'Saved')}${group(['cpf'], 'CPF')}</div>
    ${t.noPayMonths ? `<p class="small neg">${t.noPayMonths} months without pay.</p>` : ''}${cashLine}`;
}

// Your job and what it pays a month.
function workHtml() {
  const p = monthlyPlan();
  const job = sim.careerInfo(S);
  const working = sim.isWorking(S);
  const wage = sim.currentWage(S);
  const c = wage > 0 ? cpf.monthlyContribution(S.age, wage, { selfEmployed: S.selfEmployed }) : null;
  const canHunt = S.stage === 'adult' || (working && S.age < 65);
  return `
      <section>
        <h3>💼 Work and pay <span class="ledger-sub">per month</span></h3>
        <p class="job-line">${working && job ? `${job.icon} <b>${job.label}</b>${S.selfEmployed ? ' <small>(self-employed)</small>' : ''}${S.workMode === 'part' && S.stage === 'senior' ? ' <small>(part-time)</small>' : ''}` : `<span>🌅 <b>Retired</b>, no salary</span>`}
          ${canHunt ? `<button class="link-btn" data-panel="job">${working ? 'Look for a new job' : 'Find a job'}</button>` : ''}</p>
        <div class="cash-rows">
          ${wage > 0 ? `<span>Pay before CPF</span><b>${money(wage)} <small>(${money(wage * 12)}/yr)</small></b>
          <span>Your CPF${S.selfEmployed ? ' (MediSave only)' : ''}</span><b class="neg">−${money(c.employee)}</b>
          <span>Take-home pay</span><b class="pos">${money(p.pay)}</b>` : ''}
          ${p.payout ? `<span>CPF LIFE payout</span><b class="pos">${money(p.payout)}</b>` : ''}
          ${!p.income ? '<span>Money coming in</span><b>$0</b>' : ''}
        </div>
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
function amountControl(key, max, label, value = 0) {
  const m = Math.max(0, Math.floor(max));
  const v = Math.min(m, Math.round(value));
  return `<span class="amt" data-amt="${key}">
    <input type="range" min="0" max="${m}" step="1" value="${v}" aria-label="${label}" ${m ? '' : 'disabled'}>
    <label class="amt-box">$<input type="number" min="0" max="${m}" step="1" value="${v}" inputmode="numeric" aria-label="${label} amount" ${m ? '' : 'disabled'}></label>
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
  const reliefLeft = sim.taxReliefLeft(S);
  // Keep it as cash or top up CPF; grown-ups can also give some to charity.
  const buckets = [
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
  if (!young) buckets.push({ key: 'charity', icon: '💝', label: 'Give to charity', note: `Help others. Joy and Communication go up a little, and gifts to approved charities cut your income tax (a ${tax.DONATION_DEDUCTION * 100}% deduction).` });
  const parts = { charity: 0, cpf: 0 };
  const placed = () => parts.charity + parts.cpf;
  const done = dialog(`
    <div class="event"><div class="e-icon">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p>
    <p class="gift-amount">${money(e.gift)}</p></div>
    <p class="small">It all stays in your cash unless you move some${young ? ' to your CPF' : ''}. Drag a slider or type an amount.</p>
    <div class="alloc">${buckets.map((b) => `
      <div class="alloc-row">
        <span class="al-icon">${b.icon}</span>
        <span class="al-text"><b>${b.label}</b><small>${b.note}</small></span>
        ${amountControl(b.key, Math.min(e.gift, b.cap ?? Infinity), b.label)}
      </div>`).join('')}
      <div class="alloc-row cash-row">
        <span class="al-icon">💵</span>
        <span class="al-text"><b>Cash savings</b><small>Spend it anywhere. A bank savings account pays about ${pctText(sim.SAVINGS_RATE)} interest a year.</small></span>
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
  if (parts.charity) toast(`💝 Gave ${money(parts.charity)} to charity`);
  if (alloc.refused) toast(`Your CPF is already at the top-up limit, so ${money(alloc.refused)} went to your cash.`);
  if (parts.cpf && !young && sim.topUpReliefThisYear(S) > sim.TOP_UP_TAX_RELIEF_CAP) toast('Top-ups this year are above $8,000: the extra still grows, but gets no tax relief.');
}

const pctText = (r) => `${(r * 100).toFixed(Math.abs(r) < 0.001 ? 2 : 1).replace(/\.0+$/, '')}%`;

// Explains the limits on retirement top-ups (RSTU). Children and teens don't pay tax, and
// top-ups to a child's CPF get no relief for the parents either, so they see no tax line.
function topUpLimitNote(room, reliefLeft) {
  const young = S.stage === 'child' || S.stage === 'teen';
  const cap = S.age < 55 ? `your SA reaches the FRS (${money(cpf.RETIREMENT_SUMS.FRS)})` : `your RA reaches the ERS (${money(cpf.RETIREMENT_SUMS.ERS)})`;
  if (room <= 0) return S.age < 55
    ? `Your SA has reached the FRS (${money(cpf.RETIREMENT_SUMS.FRS)}), so CPF won't take more cash top-ups until you turn 55. At 55 your SA closes and you can top up your RA instead, up to the ERS.`
    : `Limit reached: you can only top up until ${cap}.`;
  if (young) return `Limit: ${money(room)} more until ${cap}. Top-ups to a child's CPF get no tax relief.`;
  return `Limit: ${money(room)} more until ${cap}. ${reliefNote(reliefLeft)}`;
}

function reliefNote(reliefLeft) {
  return `Tax relief on the first ${money(sim.TOP_UP_TAX_RELIEF_CAP)} a year of top-ups to your own SA, RA and MediSave together (${money(reliefLeft)} left this year)${S.age >= 55 ? ', and only while your RA is below the FRS' : ''}.`;
}

// What each kind of top-up does, for the Money panel.
function topUpAccountInfo(account, room) {
  const band = cpf.rateBand(S.age);
  const tot = band.oa + band.sa + band.ma;
  const pc = (v) => `${Math.round((v / tot) * 100)}%`;
  const limitLeft = sim.annualLimitRoom(S);
  const limitLine = `Counts towards the CPF Annual Limit of ${money(sim.CPF_ANNUAL_LIMIT)} together with your compulsory contributions (about ${money(sim.compulsoryThisYear(S))} this year): ${money(limitLeft)} left.`;
  if (account === 'ma') return {
    label: 'MediSave',
    text: `A Voluntary Contribution to your MediSave. It earns 4% or more and pays for healthcare and MediShield Life or Shield premiums. MediSave takes cash only up to the Basic Healthcare Sum (${money(cpf.BASIC_HEALTHCARE_SUM)}); you have ${money(S.cpf.ma)}. ${limitLine} ${reliefNote(sim.taxReliefLeft(S)).replace(', and only while your RA is below the FRS', '')}`,
    full: room <= 0 ? (S.cpf.ma >= cpf.BASIC_HEALTHCARE_SUM - 1 ? 'Your MediSave is at the Basic Healthcare Sum, so it can\'t take more.' : 'You\'ve reached the CPF Annual Limit for this year.') : '',
  };
  if (account === 'all') return {
    label: 'All three',
    text: `A Voluntary Contribution split like your monthly contributions at your age: ${pc(band.oa)} to the OA, ${pc(band.sa)} to the ${S.age < 55 ? 'SA' : 'RA'} and ${pc(band.ma)} to MediSave. The OA part can be used for housing. ${limitLine} ${S.selfEmployed ? 'As you are self-employed, it counts for CPF relief on your income tax.' : 'Employees get no tax relief for this kind of top-up.'}`,
    full: room <= 0 ? 'You\'ve reached the CPF Annual Limit for this year.' : '',
  };
  return {
    label: S.age < 55 ? 'Retirement SA' : 'Retirement RA',
    text: `${S.stage === 'child' || S.stage === 'teen' ? 'Your parents can top up your Special Account for you under the Retirement Sum Topping-Up Scheme (RSTU). ' : `Goes to your ${S.age < 55 ? 'SA' : 'RA'} under the Retirement Sum Topping-Up Scheme (RSTU). It earns 4% or more${S.age < 55 ? ' and stays locked for retirement' : ' and raises your CPF LIFE payouts'}. `}${topUpLimitNote(room, sim.taxReliefLeft(S))} RSTU top-ups don't count towards the CPF Annual Limit.${S.age >= 55 ? ' If your RA is below the BRS, the Matched Retirement Savings Scheme adds $1 for every $1, up to $2,000 a year (those matched dollars get no tax relief).' : ''}`,
    full: '',
  };
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
  if (S.stage === 'adult' && !S.home && ((S.spouse && S.homeAskedMarried == null) || (S.age >= 27 && (S.homeAskedAt == null || S.age - S.homeAskedAt >= 6)))) {
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
  if (S.car && cars.carAge(S.car, S.age) >= cars.CAR.coeYears) await coeEndDialog();
  await homeLoanMilestones();
  await cpfPlanStoppedNotice();
  const offer = sim.careerSwitchOffer(S);
  if (offer) await careerSwitchDialog(offer);
  for (const child of S.children || []) {
    if (!child.uni && S.age - child.bornAge >= 19) await universityDecision(child);
  }
  if (S.stage === 'senior' && S.age >= 65 && !S.life) await cpfLifeDecision();
  if (S.stage === 'senior' && S.age >= 70 && S.workMode !== 'retired') {
    S.workMode = 'retired';
    sim.story(S, 'job', '🌅', `Retired at ${S.age}`);
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
  const net = sim.uniFeesAfterPsea(child);
  const fees = net * sim.householdShare(S);
  const oaMax = S.cpf.oa * 0.4;
  const c = await dialog(`
    <div class="event"><div class="e-icon">🎓</div><h2>Your child is going to university!</h2>
    <p>Four years of subsidised fees come to about ${money(sim.UNI_FEES)}.${child.psea ? ` The ${money(child.psea)} the Government put in their Post-Secondary Education Account at 17 pays part, leaving ${money(net)}.` : ''}${fees < net ? ` Your half is <b>${money(fees)}</b>.` : ''} How will you pay?</p></div>
    <div class="careers">
      <button class="career" data-choice="cash"><b>Pay in cash</b><small>Your CPF stays untouched.</small></button>
      <button class="career" data-choice="oa"><b>CPF Education Scheme</b><small>Use up to 40% of your OA (${money(oaMax)} now). Your child repays it to your OA, with 2.5% interest, over 12 years after graduating.</small></button>
      <button class="career" data-choice="loan"><b>My child takes a tuition fee loan</b><small>Costs you nothing now; your child starts working life with a loan to repay.</small></button>
    </div>`);
  const r = sim.payUniversity(S, child, c);
  if (c === 'oa') toast(`🎓 ${money(r.used)} from your OA${r.cash ? `, ${money(r.cash)} in cash` : ''}`);
  if (c === 'oa') sim.story(S, 'cpf', '🎓', `Used ${money(r.used)} of your OA for your child's university (CPF Education Scheme)`, { amount: r.used });
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
        <small>${Object.entries(o.needs).map(([k, v]) => S.stats[k] >= v
          ? `✓ ${STATS[k].label} ${v}`
          : `<span class="neg">✗ ${STATS[k].label} ${v} (you have ${Math.round(S.stats[k])})</span>`).join('<br>') || 'No requirements'}${o.selfEmployed ? '<br>Self-employed: no employer CPF, only MediSave' : ''}</small>
      </button>`).join('')}</div>
    <p class="small">Locked jobs need a second skill as well as your qualification. You can still switch later: build the skill as an adult, then use "Look for a new job".</p>`, { wide: true });
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
    <p>Your take-home pay is about <b>${money(takeHome)}</b> a month after CPF. This is your everyday spending (food, transport, bills). It grows as you earn more, so each lifestyle is a share of your pay, with a minimum. Holidays and regular saving are planned in your Budget.</p>
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
  if (S.spouse) S.homeAskedMarried = S.age;
  const picked = await chooseHome(S.spouse && !S.children.length ? '🏠 Newly married: apply for a flat?' : '🏠 Ready for your own home?');
  if (picked) await dialog(`<div class="event"><div class="e-icon">🔑</div><h2>Welcome home!</h2><p>You bought a ${S.home.label}. Your room will look a bit different now.</p></div>${btn('ok', 'OK', 'primary')}`);
}

// Lists homes the player is eligible for, with the loan limits. Returns true if one was bought.
let loanYears = 25;
async function chooseHome(title, { leaveLabel } = {}) {
  for (;;) {
    const quotes = sim.homeQuotes(S, loanYears);
    const income = sim.grossIncome(S);
    const c = await dialog(`
    <button class="modal-x" data-choice="back" aria-label="Back" title="Not now">✕</button>
    <h2>${title}</h2>
    <p>You have <b>${money(S.cpf.oa)}</b> in your OA and <b>${money(S.bank)}</b> in cash. ${S.spouse ? S.spouse.home ? 'Your spouse stays at home, so you pay for the whole home.' : 'You and your spouse each pay half.' : ''} Household income: <b>${money(income)}</b>/month.</p>
    <div class="term-pick"><span>Loan term</span>${housing.LOAN_TERMS.map((y) => `<button class="pick ${y === loanYears ? 'on' : ''}" data-choice="term:${y}">${y} yrs</button>`).join('')}</div>
    <p class="small">${loanYears <= 25 ? `An HDB loan at ${pctText(cpf.HDB_LOAN_RATE)} lends up to 75% for up to 25 years. A shorter term means bigger monthly payments but much less interest.` : `HDB loans stop at 25 years. For 30 years you'd need a bank loan (about ${pctText(housing.BANK_LOAN_RATE)}), and MAS rules then cap it at 55% of the price, so you pay more upfront.`} Loans that run past age 65 are also capped at 55% for bank loans.</p>
    <ul class="facts small">
      <li><b>Grants:</b> first-time buyers of an HDB flat get the Enhanced CPF Housing Grant (up to $120,000, less as household income rises, none above $9,000 a month); resale flats also get the CPF Housing Grant. Grants go into your OA and come off the price. When you sell, they're refunded to your CPF with accrued interest.</li>
      <li><b>Loan limits:</b> the loan is cut, not refused, if repayments would be more than 30% of household income for an HDB flat (Mortgage Servicing Ratio) or all debt repayments more than 55% (MAS Total Debt Servicing Ratio). HDB tests this at 3% interest, banks at 4%. You pay the rest upfront.</li>
      <li><b>Paying:</b> the down payment and the Buyer's Stamp Duty can come from your OA (bank loans need 5 to 10% in cash). Monthly repayments can come from your OA, from cash, or part of each.</li>
      ${S.spouse ? '' : '<li>Singles can buy an HDB flat from 35 (2-room Flexi BTO or resale). Private property has no age limit. Married couples can apply for a BTO flat right away.</li>'}
    </ul>
    <div class="careers">${quotes.map((q) => `
      <button class="career" data-choice="${q.id}" ${q.affordable ? '' : 'disabled'}>
        <span class="c-icon">${housingIcon(q)}</span><b>${q.label}</b><span>${money(q.price / q.share)}${q.share < 1 ? ` (your half ${money(q.price)})` : ''}</span>
        <small>${q.grant > 0 ? `🎁 CPF housing grants ${money(q.grant)}${q.share < 1 ? ' (your half)' : ''}<br>` : ''}
        Upfront ${money(q.down + q.bsd)} incl. stamp duty ${money(q.bsd)}: OA ${money(q.fromOa)}, cash ${money(q.fromCash)}<br>
        ${q.loanType} ${money(q.loan)}: <b>${money(q.instalment)}/month</b> for ${q.years} years<br>
        Total interest about ${money(Math.max(0, q.instalment * q.years * 12 - q.loan))}<br>
        ${q.cappedBy ? `⚠️ Loan cut from ${money(q.maxLtvLoan)} by the ${q.cappedBy} limit, so you pay more upfront` : `Repayments: ${pct(q.msrPct)} of household income ✅`}
        ${q.affordable ? '' : `<br>❌ You'd need ${money(q.fromCash - S.bank)} more cash`}</small>
      </button>`).join('') || '<p>No homes available to you yet.</p>'}</div>
    <h3>Not buying yet?</h3>
    <p class="small">Many Singaporeans live with their parents until their flat is ready. It's free, but you share the space. Renting gives you your own place for about ${money(RENT_MONTHLY)} a month${S.spouse && sim.householdShare(S) < 1 ? ', split between you' : ''}.</p>
    <div class="row">${btn('parents', `${!S.renting ? '✓ ' : ''}Live with my parents`, !S.renting ? 'primary' : '')}${btn('rent', `${S.renting ? '✓ ' : ''}Rent a place (${money(RENT_MONTHLY * sim.householdShare(S))}/month)`, S.renting ? 'primary' : '')}</div>
    <div class="row">${btn('back', leaveLabel || 'Back: decide later')}</div>`, { wide: true });
    if (c === 'back') return false;
    if (c === 'parents' || c === 'rent') {
      const was = !!S.renting;
      S.renting = c === 'rent';
      if (was !== S.renting) {
        logEvent(S.renting ? '🏢 Moved out to rent a place' : '🏡 Living with my parents');
        sim.story(S, 'home', S.renting ? '🏢' : '🏡', S.renting ? `Moved out to rent a place at ${S.age}` : `Lived with family at ${S.age}`);
        if (S.renting) S.joy += 1;
      }
      render();
      return false;
    }
    if (c.startsWith('term:')) { loanYears = +c.slice(5); continue; }
    const q = sim.buyHome(S, c, loanYears);
    logEvent(`🔑 Bought a ${q.label} (${q.years}-year ${q.loanType.toLowerCase()})`);
    await repaymentDialog(true);
    return true;
  }
}

// How each month's loan instalment is paid: all OA, all cash, or a split.
async function repaymentDialog(first = false) {
  const h = S.home;
  let pctOa = Math.round(housing.oaShareOf(h) * 100);
  const monthsLeft = Math.max(1, housing.monthsLeft(h));
  const preview = () => {
    const oa = h.instalment * pctOa / 100;
    // CPF used over the rest of the loan, and what it would grow to with 2.5% accrued interest.
    let used = 0, owed = 0;
    for (let m = 0; m < monthsLeft; m++) { used += oa; owed = (owed + oa) * (1 + housing.CPF_HOUSING_INTEREST / 12); }
    return `<table class="summary">
      <tr><td>Each month from your CPF OA</td><td>${money(oa)}</td></tr>
      <tr><td>Each month in cash</td><td>${money(h.instalment - oa)}</td></tr>
      <tr><td>CPF used over the rest of the loan (about ${Math.round(monthsLeft / 12)} years)</td><td>${money(used)}</td></tr>
      <tr><td>…plus accrued interest you'd refund to your CPF if you sold then</td><td>${money(owed - used)}</td></tr>
    </table>`;
  };
  const c = dialog(`
    <h2>How will you pay the monthly loan?</h2>
    <p>Your share is <b>${money(h.instalment)}</b> a month. Choose how much of it comes from your CPF Ordinary Account.</p>
    <div class="pay-row"><input type="range" id="oa-pct" min="0" max="100" step="10" value="${pctOa}" aria-label="Percent from CPF OA"><b id="oa-pct-v">${pctOa}% CPF · ${100 - pctOa}% cash</b></div>
    <div id="oa-prev">${preview()}</div>
    <ul class="facts small">
      <li>CPF savings can be used for housing: your down payment, stamp duty and monthly loan.</li>
      <li>Money taken from your OA stops earning CPF interest (2.5% or more), and less of it is there to form your Retirement Account at 55.</li>
      <li>Some people pay part in cash and part with CPF so their CPF keeps growing for retirement; others use CPF so they have more cash for daily needs. Both are allowed.</li>
    </ul>
    ${btn('ok', first ? 'Confirm' : 'Save', 'primary')}`, { wide: true });
  const slider = $('#oa-pct', modalBox);
  slider.oninput = () => {
    pctOa = +slider.value;
    $('#oa-pct-v', modalBox).textContent = `${pctOa}% CPF · ${100 - pctOa}% cash`;
    $('#oa-prev', modalBox).innerHTML = preview();
  };
  await c;
  housing.setOaShare(h, pctOa / 100);
  sim.story(S, 'cpf', '🏠', pctOa === 100 ? `Paid the ${h.label} loan from your CPF OA` : pctOa === 0 ? `Paid the ${h.label} loan in cash` : `Paid the ${h.label} loan ${pctOa}% from CPF, ${100 - pctOa}% in cash`);
}

function housingIcon(h) {
  return { flexi2: '🏠', bto3: '🏢', bto4: '🏬', resale5: '🏘️', condo: '🏙️' }[h.id] || '🏠';
}

const pct = (x) => `${Math.round(x * 100)}%`;

async function turning55() {
  const before = { ...S.cpf };
  const sums = cpf.RETIREMENT_SUMS;
  const r = sim.formRA(S);
  sim.story(S, 'cpf', '🎂', `At 55, your Retirement Account was formed with ${money(S.cpf.ra)}${r.metTarget ? ', meeting the FRS' : ''}`, { amount: S.cpf.ra });
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
    <p>From now on, your everyday spending follows the retirement lifestyle you choose. Holidays and regular saving are planned separately in your Budget.</p>
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
  if (c !== S.workMode && c !== 'full') sim.story(S, 'job', c === 'retired' ? '🌅' : '⏳', c === 'retired' ? `Retired at ${S.age}` : `Went part-time at ${S.age}`);
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
  const panels = { car: carPanel, stats: statsPanel, cpf: cpfPanel, money: moneyPanel, shop: shopPanel, menu: menuPanel, home: homePanel, invest: investPanel, budget: budgetPanel, holidays: holidaysPanel, job: () => jobHunt('choice'), insurance: insurancePanel, family: familyPanel, donate: donatePanel, tax: taxPanel };
  await panels[kind]();
  closeModal();
  save();
  render();
}

async function homePanel() {
  for (;;) {
    const h = S.home;
    if (!h) {
      const bought = await chooseHome(`🏠 Find a home${sim.isRenting(S) ? ' (you rent now)' : ' (you live with your parents)'}`, { leaveLabel: 'Back' });
      if (!bought) return;
      continue;
    }
    const sale = housing.saleBreakdown(h);
    const owed = housing.cpfToRefund(h);
    const lbsOk = sim.lbsCheck(S).ok;
    const c = await dialog(`
      <h2>${housingIcon(h)} Your ${h.label}</h2>
      <table class="summary">
        <tr><td>Value of your share (today’s dollars)</td><td>${money(sale.sale)}</td></tr>
        <tr><td>Lease left</td><td>${h.leaseLeft} years</td></tr>
        <tr><td>Loan left</td><td>${money(h.loanBalance)}${h.loanBalance > 1 ? `<small>${money(h.instalment)}/month, ${Math.round(housing.oaShareOf(h) * 100)}% from CPF</small>` : ''}</td></tr>
        <tr><td>CPF used so far</td><td>${money(h.cpfPrincipal)}</td></tr>
        <tr><td>Accrued interest on it (2.5% a year, compounded)</td><td>${money(h.cpfAccrued)}</td></tr>
        <tr><td>If you sold today: back to your CPF</td><td>${money(sale.refund)}</td></tr>
        <tr><td>If you sold today: cash to you</td><td>${money(sale.cash)}</td></tr>
      </table>
      <p class="small">When you sell, the CPF you used plus accrued interest goes back into your CPF${S.age >= 55 ? ' (to your RA first, up to the FRS)' : ''}, so it's there for retirement.</p>
      <div class="careers">
        ${h.loanBalance > 1 ? `<button class="career" data-choice="pay"><b>Change how I pay the loan</b><small>Now ${Math.round(housing.oaShareOf(h) * 100)}% from CPF OA and ${100 - Math.round(housing.oaShareOf(h) * 100)}% in cash.</small></button>` : ''}
        ${owed > 1 ? `<button class="career" data-choice="vhr" ${S.bank < 1000 ? 'disabled' : ''}><b>Voluntary Housing Refund</b><small>Put up to ${money(Math.min(owed, S.bank, 20000))} of cash back into your CPF now. It earns CPF interest and you'll owe less when you sell.</small></button>` : ''}
        <button class="career" data-choice="move"><b>Sell and move</b><small>Upgrade or right-size. ${S.age >= 55 ? 'Moving to a 3-room or smaller flat can earn the Silver Housing Bonus.' : ''}</small></button>
        ${h.kind === 'hdb' && S.age >= 55 ? `<button class="career ${lbsOk ? '' : 'dim'}" data-choice="lbs"><b>Lease Buyback Scheme</b><small>${lbsOk ? 'Sell part of your lease back to HDB and keep living here. The money tops up your RA for bigger CPF LIFE payouts, plus a cash bonus.' : 'Not available to you right now. Tap to see why.'}</small></button>` : ''}
      </div>
      ${btn('ok', 'Close', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    if (c === 'pay') await repaymentDialog();
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
      <tr><td>Refunded to your CPF: the CPF you used</td><td>${money(b.principal)}</td></tr>
      <tr><td>Refunded to your CPF: accrued interest</td><td>${money(b.accrued)}</td></tr>
      <tr><td>Cash to you</td><td>${money(b.cash)}</td></tr>
    </table>
    ${b.owed - b.refund > 1 ? `<p class="small">The sale didn't cover all ${money(b.owed)} owed to your CPF. For a sale at market value you don't have to top up the ${money(b.owed - b.refund)} difference in cash.</p>` : ''}
    ${factBox(FACTS.accruedInterest)}
    ${btn('ok', 'Find my next home', 'primary')}`);
  const bought = await chooseHome('Where to next?', { leaveLabel: 'Decide later (renting for now)' });
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
      sim.story(S, 'cpf', '🏛️', `Put ${money(shb.topUp)} into your RA and got the ${money(shb.bonus)} Silver Housing Bonus`, { amount: shb.topUp });
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
    <p class="small">From age ${first.age} to ${last.age}, your CPF went from <b>${money(first.cpf)}</b> to <b>${money(last.cpf)}</b>. Hover or tap the chart for any year.</p>
    <p class="small">The accounts are stacked, so each band's thickness is that account. While you work the OA usually grows fastest, even at 2.5%: it gets the biggest share of every contribution (23% of your wage up to 35, against 6% for the SA), unless it's paying for a home.</p>`;
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

let topUpAccount = 'ret';
async function moneyPanel() {
  for (;;) {
    const adult = S.stage === 'adult' || S.stage === 'senior';
    const accounts = sim.topUpAccounts(S);
    if (!accounts.includes(topUpAccount)) topUpAccount = 'ret';
    const room = sim.topUpRoom(S, topUpAccount);
    const info = topUpAccountInfo(topUpAccount, room);
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
      <p class="small">Your cash is one bank savings account you can use for anything. It earns the base savings rate of about ${pctText(sim.SAVINGS_RATE)} a year, far less than CPF (2.5% to 4% or more).</p>
      ${S.debt > 0 ? `
        <h3>💳 Debt</h3>
        ${S.dcp
          ? `<p>You're on a <b>Debt Consolidation Plan</b>: your card debts were rolled into one bank loan at about ${pctText(sim.DCP.rate)} a year, paid back at <b>${money(S.dcp.monthly)}/month</b> from your pay. Your credit cards are frozen until it's cleared.</p>`
          : `<p>Credit card debt grows at <b>${pctText(sim.DEBT_INTEREST)} a year</b>. Any cash you have at the end of a year pays it off automatically, and you can pay more now. Your credit limit is ${money(limit)}${limit ? ' (banks lend up to 12 months of income, or 2 months if you earn under $30,000 a year)' : ': with no income, no bank will lend to you'}.</p>`}
        <div class="pay-row">${amountControl('repay', Math.min(S.debt, S.bank), 'Repay debt')}${btn('repay', 'Repay', 'primary')}</div>
        ${S.bank < 1 ? '<p class="small">You need cash to repay. Cutting your lifestyle or selling investments frees some up.</p>' : ''}` : ''}
      <h3>🏛️ Top up your CPF</h3>
      ${S.selfEmployed && sim.isWorking(S) ? `<div class="limit-box sep-box"><p>${selfEmployedTopUpPending() ? '❗ ' : ''}<b>You're self-employed.</b> The only CPF you must pay is MediSave: about <b>${money(cpf.monthlyContribution(S.age, sim.currentWage(S), { selfEmployed: true }).ma * 12)}</b> a year at your income, taken automatically. No one pays into your OA or SA for you, so your retirement savings and CPF LIFE payouts only grow if you put money in yourself. Setting some aside each year is your choice: a yearly top-up to your SA (tax relief up to $8,000) or to all three accounts (counts for CPF relief, as you're self-employed).</p>
        <div class="row">${btn('sep-plan', '📋 Set a yearly top-up')}${selfEmployedTopUpPending() ? btn('sep-skip', 'Not this time') : ''}</div></div>` : ''}
      ${accounts.length > 1 ? `<div class="seg" role="group" aria-label="Top up which account">${accounts.map((k) => `<button class="seg-btn ${topUpAccount === k ? 'on' : ''}" data-choice="acct:${k}">${topUpAccountInfo(k, 0).label}</button>`).join('')}</div>` : ''}
      <div class="pay-row">${amountControl('topup', Math.min(S.bank, room), 'CPF top-up')}${btn('topup', 'Top up')}</div>
      ${topUpAccount === 'ret' && S.age >= 55 ? `<p class="gain-note" id="topup-gain">${S.life && S.age >= S.life.startAge ? `CPF LIFE pays you ${money(S.life.monthly)}/month now. Top-ups after payouts start buy extra CPF LIFE, so your payout rises from next year.` : 'Top-ups to your RA raise your CPF LIFE payouts.'} Drag the slider to see by how much.</p>` : ''}
      <div class="limit-box"><p class="small">${info.full ? `<b>${info.full}</b> ` : ''}${info.text} Topped up this year: <b>${money(sim.topUpsThisYear(S))}</b>.</p></div>
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
    if (choice.startsWith('acct:')) { topUpAccount = choice.slice(5); continue; }
    if (choice === 'sep-skip') { S.sepTopUpDecided = S.age; render(); continue; }
    if (choice === 'sep-plan') { S.sepTopUpDecided = S.age; await budgetPanel(); render(); continue; }
    if (choice === 'repay' && repay > 0) {
      const paid = sim.repayDebt(S, repay);
      toast(S.debt > 0 ? `💳 Repaid ${money(paid)}. ${money(S.debt)} still to go.` : `🎉 Repaid ${money(paid)}. You're debt-free!`);
      logEvent(`💳 Repaid ${money(paid)} of debt`);
    }
    if (choice === 'topup' && topUp > 0) {
      sim.spendCash(S, topUp);
      S.sepTopUpDecided = S.age;
      const reliefBefore = sim.topUpReliefThisYear(S);
      const r = sim.topUpCpf(S, topUp, topUpAccount);
      S.bank += topUp - r.accepted;
      const where = { ret: S.age < 55 ? 'SA' : 'RA', ma: 'MediSave', all: 'OA, SA and MediSave' }[topUpAccount].replace('SA and', S.age < 55 ? 'SA and' : 'RA and');
      if (!r.accepted) {
        await dialog(`<h2>🏛️ Top-up limit reached</h2><p>${topUpAccount === 'ret' ? topUpLimitNote(0, 0) : info.full}</p><p class="small">Your cash stays in your savings.</p>${btn('ok', 'OK', 'primary')}`);
      } else {
        toast(`🏛️ Topped up ${money(r.accepted)} to your ${where}${r.matched ? `, and the Government matched ${money(r.matched)}` : ''}`);
        logEvent(`🏛️ CPF top-up ${money(r.accepted)} (${where})`);
        if (adult && sim.topUpReliefThisYear(S) > sim.TOP_UP_TAX_RELIEF_CAP && reliefBefore <= sim.TOP_UP_TAX_RELIEF_CAP) toast('You are past $8,000 of top-ups this year: more is allowed, but gets no extra tax relief.');
      }
    }
    render();
  }
}

// Buy and sell fictional companies and funds, with cash or through CPFIS.
const DCA_LINE = 'Dollar-cost averaging (DCA) means investing the same amount at regular times, whatever the price: you buy more units when prices are low and fewer when they are high, so you don\'t have to guess the right moment.';

async function sellDialog(h) {
  const pr = invest.product(h.id);
  let amount = 0;
  const c = dialog(`
    <h2>${pr.icon} Sell ${pr.name}</h2>
    <p>You own <b>${money(h.value)}</b> of it (paid with ${invest.SOURCES[h.src].short}). Sell some or all.</p>
    <div class="pay-row">${amountControl('sell', h.value, 'Amount to sell')}${btn('all', 'Sell all')}</div>
    <div class="row">${btn('sell', 'Sell', 'primary')}${btn('ok', 'Cancel')}</div>`);
  wireAmount(modalBox, 'sell', (v) => Math.min(v, h.value), (v) => (amount = v));
  const choice = await c;
  if (choice === 'all') return h.value;
  return choice === 'sell' ? amount : 0;
}

async function investPanel() {
  let picked = null;
  let src = 'cash';
  let mode = 'once';
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
      ${sim.dcaPlans(S).length ? `<h3>Your DCA plans</h3>
        <p class="small">${DCA_LINE}</p>
        <table class="summary">${sim.dcaPlans(S).map((d, i) => `<tr><td>${invest.product(d.id).icon} ${invest.product(d.id).name}${d.src === 'cash' ? '' : ` (${invest.SOURCES[d.src].short})`}</td><td>${money(d.perYear)}/year</td><td>${btn(`stop:${i}`, 'Stop')}</td></tr>`).join('')}</table>` : ''}
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
        ${why && mode === 'once' ? `<p class="small neg">${why}</p>` : mode === 'dca' ? '' : `<p class="small">You can put in up to ${money(max)}.${src !== 'cash' ? ` Left in your ${invest.SOURCES[src].short}, this money would earn a safe ${pctText(invest.cpfAlternative(src))} or more, so an investment has to beat that to be worth it.` : ''}</p>`}
        <div class="seg" role="group" aria-label="How to invest"><button class="seg-btn ${mode === 'once' ? 'on' : ''}" data-choice="mode:once">Invest once</button><button class="seg-btn ${mode === 'dca' ? 'on' : ''}" data-choice="mode:dca">Every year (DCA)</button></div>
        ${mode === 'dca' ? `<p class="small">${DCA_LINE} The plan buys once a year at the start of each year, if you have the money, until you stop it.</p>` : ''}
        <div class="pay-row">${mode === 'dca' ? amountControl('buy', Math.max(1000, Math.min(60000, max)), 'Amount to invest each year') : amountControl('buy', max, 'Amount to invest')}${btn('buy', mode === 'dca' ? 'Start plan' : 'Buy', 'primary')}</div>
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
    if (kind === 'mode') { mode = a; scrollToBuy = true; }
    if (kind === 'stop') {
      const d = sim.dcaPlans(S).splice(+a, 1)[0];
      toast(`⏹️ Stopped the ${invest.product(d.id).name} plan. You keep what you bought.`);
      logEvent(`⏹️ Stopped DCA into ${invest.product(d.id).name}`);
    }
    if (kind === 'buy' && p && amount > 0 && mode === 'dca') {
      sim.dcaPlans(S).push({ id: p.id, src, perYear: amount });
      toast(`📅 ${money(amount)} a year into ${p.name}, from next year`);
      logEvent(`📅 Started DCA: ${money(amount)}/year into ${p.name} (${invest.SOURCES[src].short})`);
    } else if (kind === 'buy' && p && amount > 0) {
      const spent = invest.buy(S, p.id, src, amount);
      if (src === 'cash') S.cashLow = Math.min(S.cashLow ?? S.bank, S.bank);
      toast(`📈 Bought ${money(spent)} of ${p.name} with ${invest.SOURCES[src].short}`);
      logEvent(`📈 Invested ${money(spent)} in ${p.name} (${invest.SOURCES[src].short})`);
    }
    if (kind === 'sell') {
      const h = hs.find((x) => x.id === a && x.src === b);
      const want = await sellDialog(h);
      if (want > 0) {
        const got = invest.sell(S, a, b, want);
        toast(`📈 Sold ${money(got)} of ${invest.product(a).name}`);
        logEvent(`📈 Sold ${money(got)} of ${invest.product(a).name}`);
      }
    }
    render();
  }
}

// Monthly plan: everyday costs are fixed by your lifestyle; you choose the rest.
async function budgetPanel() {
  for (;;) {
    const dcaMonthly = sim.dcaCashPerYear(S) / 12; // also moves an old monthly plan into the DCA plans
    sim.cpfTopUpPerYear(S); // and an old monthly CPF top-up into a yearly one
    const b = { ...sim.newBudget(), ...(S.budget || {}) };
    const income = sim.takeHome(S) + (S.life && S.age >= S.life.startAge ? S.life.monthly : 0);
    const share = sim.householdShare(S);
    const living = sim.monthlySpend(S);
    const insurance = sim.insurancePremiums(S).cash / 12;
    const parts = sim.spendBreakdown(S);
    const rent = sim.isRenting(S) ? RENT_MONTHLY * share : 0;
    const loan = loanSplit();
    const loanCash = loan.fromCash;
    const dcp = S.dcp ? S.dcp.monthly : 0;
    const holidays = sim.holidayMonthly(S);
    const kids = (S.children || []).filter((c) => S.age - c.bornAge < 21);
    const baseFixed = living + rent + loanCash + dcp + insurance;
    const room = sim.topUpRoom(S);
    const ls = S.stage === 'senior' && S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle] : LIFESTYLES[S.lifestyle];
    const scroll = modalEl.hidden ? 0 : modalBox.scrollTop;
    const c = dialog(`
      <h2>📋 Your monthly budget</h2>
      <p class="small">Plan how you use your pay each month. It repeats every year until you change it. Anything left over goes to your cash savings.</p>
      <table class="summary budget">
        <tr><th colspan="2">Money in each month</th></tr>
        <tr><td>Take-home pay${S.spouse && !S.spouse.home ? ' (yours; your spouse covers their half of household costs)' : ''}</td><td class="pos">${money(sim.takeHome(S))}</td></tr>
        ${S.life && S.age >= S.life.startAge ? `<tr><td>CPF LIFE payout</td><td class="pos">${money(S.life.monthly)}</td></tr>` : ''}
        <tr><th colspan="2">Must-pays</th></tr>
        <tr><td>${ls.icon || '🏠'} Everyday living: ${ls.label}${parts.kids + parts.groceries ? `, incl. ${money(parts.kids + parts.groceries)} for ${kids.length === 1 ? 'your child' : 'your children'}` : ''}${parts.homeSpouse ? `, ${money(parts.homeSpouse + 300)} for your spouse at home` : ''}${S.car ? `, incl. ${money(parts.car)} for the car` : ''} ${btn('life', 'Change')}</td><td class="neg">−${money(living)}</td></tr>
        <tr><td>🩺 Health insurance: ${health.PLANS[(S.insurance || {}).plan || 'msl'].label}${(S.insurance || {}).rider ? ' + rider' : ''} (cash part) ${btn('insurance', 'Change')}</td><td class="neg">${insurance ? `−${money(insurance)}` : '$0'}</td></tr>
        ${rent ? `<tr><td>Rent</td><td class="neg">−${money(rent)}</td></tr>` : ''}
        ${S.home && S.home.loanBalance > 1 ? `<tr><td>Home loan ${money(S.home.instalment)}: ${money(loan.fromOa)} from your CPF OA, the rest in cash</td><td class="neg">−${money(loanCash)}</td></tr>` : ''}
        ${dcp ? `<tr><td>Debt Consolidation Plan</td><td class="neg">−${money(dcp)}</td></tr>` : ''}
        <tr><td>🧾 Income tax (one bill a year, shown per month) ${btn('tax', 'How it\'s worked out')}<br><small id="tax-note"></small></td><td class="neg" id="tax-cell"></td></tr>
      </table>
      <h3>Your choices</h3>
      <div class="alloc">
        <div class="alloc-row"><span class="al-icon">✈️</span><span class="al-text"><b>Holidays</b><small>${(S.holidayPlans || []).length ? `${S.holidayPlans.length} trip${S.holidayPlans.length > 1 ? 's' : ''} planned for next year, averaged per month.` : 'No trips planned.'} ${btn('holidays', 'Plan holidays')}</small></span><b class="al-val">${money(holidays)}</b></div>
        <div class="alloc-row"><span class="al-icon">🏛️</span><span class="al-text"><b>Top up my CPF every year</b><small>${S.age < 55 ? 'Into your SA (RSTU), up to the FRS. Earns 4%+, and the first $8,000 a year cuts your income tax.' : 'Into your RA (RSTU), up to the ERS, for bigger CPF LIFE payouts.'} ${room > 0 ? `Room left: ${money(room)}. The top-ups stop by themselves when you reach the ${S.age < 55 ? 'FRS' : 'ERS'}.` : S.age < 55 ? 'Your SA is at the FRS: no more top-ups until 55.' : 'Your RA is at the ERS: no more top-ups.'}</small></span>${amountControl('cpfYearly', Math.min(36000, room), 'CPF top-up per year')}</div>
        <div class="alloc-row"><span class="al-icon">💝</span><span class="al-text"><b>Give to charity every year</b><small>Your money helps people who need it: food, care and education. Gifts to approved charities (Institutions of a Public Character, IPCs) also get a ${tax.DONATION_DEDUCTION * 100}% tax deduction: give $1,000 and $2,500 comes off your taxable income.</small></span>${amountControl('donateYearly', 12000, 'Donation per year')}</div>
        ${kids.length ? `<div class="alloc-row"><span class="al-icon">👶</span><span class="al-text"><b>Top up my ${kids.length === 1 ? "child's" : "children's"} CPF</b><small>Per child, into their SA (RSTU). It grows at 4%+ until they retire: a head start, but locked away. ${S.spouse ? 'Your spouse puts in the same.' : ''} No tax relief for top-ups to children.</small></span>${amountControl('kidsCpf', 500, 'Per child per month')}</div>` : ''}
        <div class="alloc-row"><span class="al-icon">📈</span><span class="al-text"><b>Regular investing (DCA)</b><small>${sim.dcaPlans(S).length ? sim.dcaPlans(S).map((d) => `${invest.product(d.id).name}: ${money(d.perYear)}/year${d.src === 'cash' ? '' : ` from your ${invest.SOURCES[d.src].short}`}`).join('<br>') : 'No plans yet.'} ${btn('invest', 'Investments')}</small></span><b class="al-val">${money(dcaMonthly)}</b></div>
      </div>
      <div class="budget-sum" id="budget-sum"></div>
      <div class="row">${btn('save', 'Save my budget', 'primary')}${btn('ok', 'Cancel')}</div>`, { wide: true });
    modalBox.scrollTop = scroll;
    const keys = ['cpfYearly', 'kidsCpf', 'donateYearly'];
    const draw = () => {
      // Tax depends on this year's top-up and giving, so it updates with the sliders.
      const est = sim.taxEstimate(S, { topUp: Math.min(b.cpfYearly, room), donate: b.donateYearly || 0 });
      const bare = sim.taxEstimate(S, { bare: true });
      const taxMonthly = est.tax / 12;
      $('#tax-cell', modalBox).textContent = taxMonthly > 0.5 ? `−${money(taxMonthly)}` : '$0';
      $('#tax-note', modalBox).textContent = `About ${money(est.tax)} this year${bare.tax - est.tax > 0.5 ? `, ${money(bare.tax - est.tax)} less thanks to your top-ups and giving` : ''}.`;
      const fixed = baseFixed + taxMonthly;
      const spend = holidays + (b.donateYearly || 0) / 12;
      const saving = b.cpfYearly / 12 + b.kidsCpf * kids.length + dcaMonthly;
      const left = income - fixed - spend - saving;
      const total = Math.max(1, income);
      const bar = (v, cls) => `<span class="${cls}" style="width:${Math.max(0, Math.min(100, (v / total) * 100))}%"></span>`;
      $('#budget-sum', modalBox).innerHTML = `
        <div class="budget-bar">${bar(fixed, 'b-fixed')}${bar(spend, 'b-fun')}${bar(saving, 'b-save')}${bar(Math.max(0, left), 'b-left')}</div>
        <p class="legend"><span class="b-fixed"></span> Must-pays ${money(fixed)} <span class="b-fun"></span> Fun and giving ${money(spend)} <span class="b-save"></span> Saving and investing ${money(saving)} <span class="b-left"></span> Left to cash ${money(Math.max(0, left))}</p>
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
    if (choice === 'invest') {
      await investPanel();
      continue;
    }
    if (choice === 'insurance') {
      await insurancePanel();
      continue;
    }
    if (choice === 'tax') {
      await taxPanel({ topUp: Math.min(b.cpfYearly, room), donate: b.donateYearly || 0 });
      continue;
    }
    toast('📋 Budget saved. It applies from your next turn.');
    logEvent(`📋 New budget: saving ${money(b.cpfYearly / 12 + b.kidsCpf * kids.length + dcaMonthly)}/mo`);
    return;
  }
}

// Give to charity now. Gifts to approved charities (IPCs) get a 250% tax deduction.
async function donatePanel() {
  for (;;) {
    let amount = 0;
    const given = sim.donationsThisYear(S);
    const c = dialog(`
      <h2>💝 Give to charity</h2>
      <p>Your gift helps people who need it: meals for families, care for the elderly, school support for children. Giving also lifts your Joy and Communication a little.</p>
      <div class="pay-row">${amountControl('give', Math.max(0, S.bank), 'Donation')}${btn('give', 'Give', 'primary')}</div>
      <p class="gain-note" id="give-note">Drag the slider to see how much tax it saves you.</p>
      <div class="limit-box"><p class="small"><b>Tax deduction:</b> cash gifts to approved charities (Institutions of a Public Character, IPCs) are deducted ${tax.DONATION_DEDUCTION * 100}% from your income before tax, so giving $1,000 takes $2,500 off your taxable income. The charity passes your NRIC to IRAS, so it's applied for you. If the deduction is more than your income, the rest carries forward for up to ${tax.DONATION_CARRY_YEARS} years. Given this year: <b>${money(given)}</b>${S.given ? `; in your life so far: <b>${money(S.given)}</b>` : ''}.</p></div>
      <p class="small">To give a set amount every year, use ${btn('budget', '📋 Budget')}.</p>
      ${btn('ok', 'Close')}`, { wide: true });
    const base = sim.taxEstimate(S).tax;
    wireAmount(modalBox, 'give', (v) => Math.min(v, Math.max(0, S.bank)), (v) => {
      amount = v;
      const saved = base - sim.taxEstimate(S, { extraDonation: v }).tax;
      $('#give-note', modalBox).innerHTML = v > 0
        ? (saved > 0.5 ? `Giving <b>${money(v)}</b> lowers your income tax this year by about <b>${money(saved)}</b>, so it costs you about ${money(v - saved)}.` : `Giving <b>${money(v)}</b> doesn't change your tax this year${base < 0.5 ? ': your income is already below the taxable level' : ''}.`)
        : 'Drag the slider to see how much tax it saves you.';
    });
    const choice = await c;
    if (choice === 'budget') { await budgetPanel(); continue; }
    if (choice === 'give' && amount > 0) {
      const a = sim.donate(S, amount);
      toast(`💝 Gave ${money(a)} to charity. Thank you!`);
      logEvent(`💝 Gave ${money(a)} to charity`);
      render();
      continue;
    }
    render();
    return;
  }
}

// How this year's income tax is worked out, following IRAS's steps.
async function taxPanel(plan = {}) {
  const est = sim.taxEstimate(S, plan);
  const bare = sim.taxEstimate(S, { ...plan, bare: true });
  const last = S.lastTax && S.lastTax.age === S.age - 1 ? S.lastTax : null;
  const working = sim.currentWage(S) > 0;
  const pct = (r) => `${+(r * 100).toFixed(1)}%`;
  const breakdown = (r) => `
    <table class="summary tax-table">
      <tr><td>Employment income <small>(pay before your CPF is taken off)</small></td><td>${money(r.earned)}</td></tr>
      ${r.donationDeduction ? `<tr><td>Less donations × ${tax.DONATION_DEDUCTION} <small>(${money(r.donations)} given this year${r.donationDeduction < r.donations * tax.DONATION_DEDUCTION ? '; some carried forward' : ''})</small></td><td class="pos">−${money(r.donationDeduction)}</td></tr>` : ''}
      <tr class="sub"><td>Assessable income</td><td>${money(r.assessable)}</td></tr>
      ${r.reliefs.map((x) => `<tr><td>Less ${x.label}<br><small>${x.note}</small></td><td class="pos">−${money(x.amount)}</td></tr>`).join('')}
      ${r.capped ? `<tr><td colspan="2"><small>Personal reliefs are capped at ${money(tax.RELIEF_CAP)} a year, so ${money(r.reliefSum - tax.RELIEF_CAP)} is lost.</small></td></tr>` : ''}
      <tr class="sub"><td>Chargeable income</td><td>${money(r.chargeable)}</td></tr>
    </table>
    <table class="summary tax-bands">
      <tr><th>Part of your chargeable income</th><th>Rate</th><th>Tax</th></tr>
      ${r.bands.map((band) => `<tr><td>${band.from === 0 ? 'First' : 'Next'} ${money(band.to - band.from)}${band.from ? ` <small>(${money(band.from)} to ${money(band.to)})</small>` : ''}</td><td>${pct(band.rate)}</td><td>${money(band.amount)}</td></tr>`).join('') || '<tr><td colspan="3">Nothing to tax.</td></tr>'}
      <tr class="sub"><td colspan="2">Tax before rebates</td><td>${money(r.grossTax)}</td></tr>
      ${r.rebate ? `<tr><td colspan="2">Less Parenthood Tax Rebate <small>(${money(r.rebateLeft)} left for later years)</small></td><td class="pos">−${money(r.rebate)}</td></tr>` : ''}
      <tr class="sub"><td colspan="2"><b>Income tax to pay</b></td><td><b>${money(r.tax)}</b></td></tr>
    </table>
    <p class="small">That's ${r.earned ? pct(r.tax / r.earned) : '0%'} of your income, about ${money(r.tax / 12)} a month.</p>`;
  await dialog(`
    <h2>🧾 Your income tax</h2>
    <p class="small">Singapore taxes your income for a year as one bill from IRAS (in real life it arrives the following year). Rates are the resident rates from Year of Assessment 2024. There's no personal tax rebate for YA2026. CPF LIFE payouts, CPF withdrawals and investment gains aren't taxed.</p>
    ${working ? `<h3>This year, at today's pay${plan.topUp != null || plan.donate != null ? ' and your new budget' : ''}</h3>${breakdown(est)}
      ${bare.tax - est.tax > 0.5 ? `<p class="gain-note">Without your CPF top-ups and donations you'd pay <b>${money(bare.tax)}</b>: they save you <b>${money(bare.tax - est.tax)}</b> this year.</p>` : est.tax > 0 ? `<p class="gain-note">Cash top-ups to your own CPF (up to $8,000 a year) and gifts to approved charities (${tax.DONATION_DEDUCTION * 100}% deduction) would lower this.</p>` : ''}`
      : '<p>You have no income from work this year, so there is no income tax to pay.</p>'}
    ${last && last.earned ? `<details><summary>Last year: ${money(last.tax)}</summary>${breakdown(last)}</details>` : ''}
    <p class="small muted-ink">Simplified: no bonuses, no other income, and only the reliefs the game tracks (Earned Income, CPF, CPF cash top-up, NSman, Spouse, Qualifying Child and Working Mother's Child Relief, plus the Parenthood Tax Rebate). Check your own tax with IRAS at iras.gov.sg.</p>
    ${btn('ok', 'Close', 'primary')}`, { wide: true });
}

// Plan trips: once, every year, or a set number of times.
let holidayTab = 'near';
async function holidaysPanel() {
  for (;;) {
    const plans = S.holidayPlans || (S.holidayPlans = []);
    const people = sim.travellers(S);
    const trips = S.trips || [];
    const c = await dialog(`
      <h2>✈️ Holidays</h2>
      <p class="small">Prices are per person for flights and a typical stay. ${people > 1 ? `${people} of you travel together${S.spouse ? ' and you pay half' : ''}.` : 'You travel on your own.'} Trips happen during your next turn.</p>
      ${plans.length ? `<ul class="plans">${plans.map((p, i) => {
        const h = HOLIDAYS.find((x) => x.id === p.id);
        return `<li>${h.icon} <b>${h.name}</b>: ${p.mode === 'yearly' ? 'every year' : p.left === 1 ? 'once' : `${p.left} more times`} · ${money(sim.holidayCost(S, p.id))} a trip ${btn(`cancel:${i}`, 'Cancel')}</li>`;
      }).join('')}</ul>` : ''}
      <div class="tabs" role="tablist">${HOLIDAY_GROUPS.map((g) => `<button class="tab ${g.id === holidayTab ? 'on' : ''}" role="tab" aria-selected="${g.id === holidayTab}" data-choice="tab:${g.id}">${g.label}</button>`).join('')}</div>
      <div class="trips">${HOLIDAYS.filter((h) => h.group === holidayTab).map((h) => {
        const been = trips.filter((t) => t.id === h.id).length;
        return `<div class="trip">
          ${postcard(h.id, h.name)}
          <div class="trip-text"><b>${h.icon} ${h.name}</b>
            <small>${h.place} · ${h.days} days · Joy +${h.joy}${been ? ` · been ${been}×` : ''}</small>
            <small>${money(h.cost)}/person · your share <b>${money(sim.holidayCost(S, h.id))}</b></small></div>
          <div class="trip-go">${btn(`once:${h.id}`, 'Once')}${btn(`yearly:${h.id}`, 'Yearly')}${btn(`times:${h.id}`, '3 times')}</div>
        </div>`;
      }).join('')}</div>
      <p class="small">Going to the same place over and over brings less joy after the third visit.</p>
      ${btn('ok', 'Done', 'primary')}`, { wide: true });
    if (c === 'ok') return;
    const [kind, id] = c.split(':');
    if (kind === 'tab') holidayTab = id;
    else if (kind === 'cancel') plans.splice(+id, 1);
    else {
      const h = HOLIDAYS.find((x) => x.id === id);
      plans.push({ id, mode: kind === 'yearly' ? 'yearly' : 'times', left: kind === 'times' ? 3 : 1 });
      toast(`${h.icon} ${h.name} planned${kind === 'yearly' ? ' every year' : kind === 'times' ? ' 3 times' : ''}: ${money(sim.holidayCost(S, id))} a trip`);
    }
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
      <p>Income tax follows IRAS's resident rates (from YA2024) and the main personal reliefs: Earned Income, CPF, CPF cash top-up ($8,000 for your own SA, RA and MediSave), NSman, Spouse, Qualifying Child and Working Mother's Child Relief, with the $80,000 relief cap, the Parenthood Tax Rebate and the 250% deduction for gifts to approved charities.</p>
      <p>To keep it playable, some things are simplified: there is no inflation (all amounts are in today's dollars), there are no bonuses or Additional Wages, salaries grow at fixed rates, home values only change with the lease, and CPF LIFE payouts are estimated from the CPF Board's published figures.</p>
      <p>For your real plans, use the tools at <b>cpf.gov.sg</b>.</p>
      ${btn('ok', 'Close', 'primary')}`);
  }
}

// ---------- the end ----------

// A recap of the life lived, with questions to reflect on. There is no score.
// The holidays as a scrapbook: one postcard at a time, like flipping through an album.
const PARTY = { solo: 'on your own', couple: 'with your partner', family: 'with the family' };
function holidayRecap() {
  const trips = S.trips || [];
  if (!trips.length) return '<h3>✈️ Holidays</h3><p class="small muted-ink">You never took a planned holiday.</p>';
  const places = new Set(trips.map((t) => t.id)).size;
  return `<h3>✈️ Your holiday scrapbook</h3>
    <div class="scrapbook" data-slides="${trips.length}">
      <div class="pages">${trips.map((t, i) => {
        const h = HOLIDAYS.find((x) => x.id === t.id) || HOLIDAYS[0];
        const n = trips.slice(0, i + 1).filter((x) => x.id === t.id).length;
        return `<figure class="page ${i === 0 ? 'on' : ''}" style="--tilt:${[-3, 2, -1.5, 3, -2.5, 1][i % 6]}deg" aria-hidden="${i !== 0}">
          <div class="photo">${postcard(h.id, h.name)}<i class="tape l"></i><i class="tape r"></i></div>
          <figcaption><b>${h.icon} ${h.name}</b><span>Age ${t.age} · ${h.place}${t.party ? ` · ${PARTY[t.party]}` : ''}${n > 1 ? ` · visit ${n}` : ''}</span></figcaption>
        </figure>`;
      }).join('')}</div>
      <div class="sb-nav">
        <button class="sb-btn" data-sb="-1" aria-label="Previous trip">◀</button>
        <span class="sb-count" aria-live="polite">1 / ${trips.length}</span>
        <button class="sb-btn" data-sb="pause" aria-label="Pause slideshow">⏸</button>
        <button class="sb-btn" data-sb="1" aria-label="Next trip">▶</button>
      </div>
    </div>
    <p class="small">${trips.length} trip${trips.length > 1 ? 's' : ''} to ${places} place${places > 1 ? 's' : ''}, costing you ${money(S.totals?.holidays || 0)} in all.</p>`;
}

// Turns the scrapbook pages every few seconds; the buttons flip by hand and pause it.
function startScrapbook(root) {
  const book = root.querySelector('.scrapbook');
  if (!book) return;
  const pages = [...book.querySelectorAll('.page')];
  const count = book.querySelector('.sb-count');
  const pauseBtn = book.querySelector('[data-sb="pause"]');
  let at = 0;
  let playing = pages.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = (i) => {
    pages[at].classList.remove('on'); pages[at].setAttribute('aria-hidden', 'true');
    at = (i + pages.length) % pages.length;
    pages[at].classList.add('on'); pages[at].setAttribute('aria-hidden', 'false');
    count.textContent = `${at + 1} / ${pages.length}`;
  };
  const setPlaying = (on) => {
    playing = on;
    pauseBtn.textContent = on ? '⏸' : '▶︎▶︎';
    pauseBtn.setAttribute('aria-label', on ? 'Pause slideshow' : 'Play slideshow');
  };
  setPlaying(playing);
  const timer = setInterval(() => {
    if (!book.isConnected) return clearInterval(timer);
    if (playing) show(at + 1);
  }, 2800);
  book.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sb]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.sb === 'pause') setPlaying(!playing);
    else { setPlaying(false); show(at + +b.dataset.sb); }
  });
}

function kidsCpfRecap() {
  const kids = (S.children || []).filter((c) => c.cpfGiven);
  if (!kids.length) return '';
  return `<h3>👶 Your children's CPF head start</h3><ul class="facts">${kids.map((c, i) => `<li>Child ${i + 1}: you put in ${money(c.cpfGiven)}${S.spouse ? ', your spouse matched it' : ''}, and with interest it has grown to <b>${money(c.cpfSa)}</b> in their SA.</li>`).join('')}</ul>`;
}

// ---------- the life recap ----------

// A kind of story, without repeats (older saves logged the same line many times).
// Changes to your spouse's work in the same year count as one: the last.
const storyKey = (e) => (e.spouseWork || /^Your spouse (became|went back)/.test(e.text) ? `spouse@${e.age}` : `${e.text}@${e.age}`);
const stories = (kind) => (S.story || []).filter((e, i, all) => e.kind === kind
  && !all.some((x, j) => j > i && x.kind === kind && storyKey(x) === storyKey(e)));
// "at 48" unless the line already says when.
const atAge = (e) => (/\bat \d+\b/.test(e.text) ? '' : ` at ${e.age}`);
const storyList = (list) => `<ol class="timeline">${list.map((e) => `<li><span class="j-age">${e.age}</span><span>${e.icon} ${esc(e.text)}</span></li>`).join('')}</ol>`;
const ageSpan = (a, b) => (a === b ? `at ${a}` : `${a} to ${b}`);

// Runs of the same value in the yearly history, e.g. the jobs you held and when.
function runs(key) {
  const out = [];
  for (const h of S.history || []) {
    if (!(key in h)) continue;
    const last = out[out.length - 1];
    if (last && last.value === h[key]) { last.to = h.age - 1; last.peak = Math.max(last.peak, h.pay || 0); } else out.push({ value: h[key], from: h.age - 1, to: h.age - 1, peak: h.pay || 0 });
  }
  return out;
}

function careerRecap() {
  const t = S.totals || {};
  const jobs = runs('job').filter((r) => r.value);
  const info = (id) => CAREERS.find((c) => c.id === id) || CAREER_SWITCHES.find((c) => c.id === id);
  const retiredAt = stories('job').find((e) => /^Retired/.test(e.text))?.age;
  const knocks = stories('job').filter((e) => e.icon === '📉');
  const peak = Math.max(0, ...(S.history || []).map((h) => h.pay || 0));
  const now = sim.careerInfo(S);
  const lines = jobs.length
    ? jobs.map((r) => { const c = info(r.value); return `<li><span class="j-age">${r.from}</span><span>${c ? `${c.icon} <b>${c.title || c.label}</b>` : 'Working'} ${ageSpan(r.from, r.to)}${r.peak ? `, up to ${money(r.peak)} a month` : ''}</span></li>`; }).join('')
    : now ? `<li><span class="j-age">${S.careerStartAge ?? 21}</span><span>${now.icon} <b>${now.title || now.label}</b></span></li>` : '';
  return `<div class="recap-card">
    <h3>💼 Your career</h3>
    <p>${S.education ? `You finished with ${/^[aeiou]/i.test(EDUCATION[S.education].label) ? 'an' : 'a'} <b>${EDUCATION[S.education].label}</b>. ` : ''}${retiredAt ? `You retired at <b>${retiredAt}</b>.` : S.age >= 55 && !sim.isWorking(S) ? 'You have stopped working.' : S.age >= 21 ? 'You are still working.' : ''}</p>
    ${lines ? `<ol class="timeline">${lines}</ol>` : '<p class="small muted-ink">You haven\'t started work yet.</p>'}
    ${knocks.length ? `<p class="small">Setbacks: retrenched ${knocks.length} time${knocks.length > 1 ? 's' : ''} (age ${knocks.map((e) => e.age).join(', ')}).</p>` : ''}
    <div class="recap-nums">
      ${peak ? `<span>Highest pay</span><b>${money(peak)}/month</b>` : ''}
      ${t.income ? `<span>Take-home pay over your life</span><b>${money((t.income || 0) - (t.payouts || 0))}</b>` : ''}
    </div>
  </div>`;
}

function housingRecap() {
  const t = S.totals || {};
  const buys = stories('home').filter((e) => e.icon === '🔑');
  const upfrontOa = buys.reduce((a, e) => a + (e.oa || 0), 0);
  const upfrontCash = buys.reduce((a, e) => a + (e.cash || 0), 0);
  const loanOa = t.housingOa || 0;
  const loanCash = t.housingCash || 0;
  const rent = t.rent || 0;
  const total = upfrontOa + upfrontCash + loanOa + loanCash + rent;
  const moves = stories('home').filter((e) => e.icon === '🏷️').length;
  const homes = stories('home');
  const journey = homes.length ? storyList(homes) : S.home ? `<ol class="timeline"><li><span class="j-age">${S.home.boughtAge ?? ''}</span><span>🔑 ${S.home.label}</span></li></ol>` : '';
  return `<div class="recap-card">
    <h3>🏠 Your housing journey</h3>
    <p>${!homes.length && !S.home ? 'You never bought a home of your own.' : `${buys.length ? `You bought ${buys.length} home${buys.length > 1 ? 's' : ''}` : 'You owned your home'}${moves ? ` and moved ${moves} time${moves > 1 ? 's' : ''}` : ''}. ${S.home ? `You live in your <b>${S.home.label}</b>${S.home.loanBalance > 1 ? ` with ${money(S.home.loanBalance)} of loan left` : ', fully paid off'}.` : 'You rent now.'}`}</p>
    ${journey}
    <div class="recap-nums">
      ${upfrontOa + upfrontCash ? `<span>Down payments and stamp duty</span><b>${money(upfrontOa + upfrontCash)} <small>(${money(upfrontOa)} CPF)</small></b>` : ''}
      ${loanOa + loanCash ? `<span>Loan repayments</span><b>${money(loanOa + loanCash)} <small>(${money(loanOa)} CPF)</small></b>` : ''}
      ${rent ? `<span>Rent</span><b>${money(rent)}</b>` : ''}
      ${total ? `<span><b>Spent on housing in all</b></span><b>${money(total)}</b>` : ''}
    </div>
  </div>`;
}

function cpfRecap() {
  const t = S.totals || {};
  const decisions = stories('cpf');
  return `<div class="recap-card">
    <h3>🏛️ Your CPF decisions</h3>
    ${decisions.length ? storyList(decisions) : '<p class="small muted-ink">You left your CPF to grow on its own.</p>'}
    <div class="recap-nums">
      <span>Paid in by you and your employers</span><b>${money(t.cpfIn || 0)}</b>
      <span>Interest CPF paid you</span><b>${money(t.cpfInterest ?? t.interest ?? 0)}</b>
      ${S.lifeTopUps ? `<span>Cash top-ups you made</span><b>${money(S.lifeTopUps)}</b>` : ''}
      ${t.housingOa ? `<span>Used for your home</span><b>${money(t.housingOa)}</b>` : ''}
      ${S.life ? `<span>CPF LIFE pays you</span><b>${money(S.life.monthly)}/month</b>` : ''}
    </div>
  </div>`;
}

const STYLE_WORDS = { simple: 'Frugal', comfortable: 'Average', lavish: 'Lavish' };
function lifestyleRecap() {
  const t = S.totals || {};
  const years = {};
  for (const h of S.history || []) if (h.style) years[h.style] = (years[h.style] || 0) + 1;
  const ranked = Object.entries(years).sort((a, b) => b[1] - a[1]);
  const main = ranked[0]?.[0] || S.lifestyle;
  const earned = Math.max(1, (t.income || 0) - (t.payouts || 0));
  const given = S.given || 0;
  const generous = given > 0 && given >= Math.max(5000, earned * 0.01);
  const word = generous ? 'Generous' : STYLE_WORDS[main] || 'Average';
  return `<div class="recap-card">
    <h3>🎭 The life you lived</h3>
    <p class="recap-word">${generous ? '💝' : LIFESTYLES[main]?.icon || '🛋️'} ${word}${generous && STYLE_WORDS[main] ? ` <small>and ${STYLE_WORDS[main].toLowerCase()}</small>` : ''}</p>
    <p class="small">${LIFESTYLES[main]?.desc || ''}${generous ? `. You also gave ${money(given)} to charity.` : '.'}</p>
    ${ranked.length ? `<p class="small">${ranked.map(([k, n]) => `${STYLE_WORDS[k] || k} (${LIFESTYLES[k]?.label || k}) for ${n} year${n > 1 ? 's' : ''}`).join(', ')}.</p>` : ''}
    <div class="recap-nums">
      ${t.living ? `<span>Everyday living</span><b>${money(t.living)}</b>` : ''}
      ${t.fun ? `<span>Hobbies and shopping</span><b>${money(t.fun)}</b>` : ''}
      ${t.holidays ? `<span>Holidays</span><b>${money(t.holidays)}</b>` : ''}
      ${t.kids ? `<span>Raising children</span><b>${money(t.kids)}</b>` : ''}
      ${given ? `<span>Given to charity</span><b>${money(given)}</b>` : ''}
    </div>
  </div>`;
}

function joysRecap() {
  const family = stories('family');
  const buys = stories('buy');
  const items = buys.length ? buys : sim.ownedItems(S).map((it) => ({ icon: it.icon, text: it.name, amount: it.price, joy: it.joy }));
  const favourites = [...items].sort((a, b) => (b.joy || 0) - (a.joy || 0)).slice(0, 6);
  const trips = S.trips || [];
  const places = HOLIDAYS.map((h) => ({ h, n: trips.filter((x) => x.id === h.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  const did = Object.entries(S.did || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `<div class="recap-card wide">
    <h3>😊 Your joys <span class="ledger-sub">Joy ${Math.round(S.joy)}</span></h3>
    <ul class="moments">
      ${family.map((e) => `<li>${e.icon} ${esc(e.text)}${atAge(e)}</li>`).join('')}
      ${places.length ? `<li>✈️ ${trips.length} holiday${trips.length > 1 ? 's' : ''} to ${places.length} place${places.length > 1 ? 's' : ''}; your favourite was <b>${places[0].h.name}</b>${places[0].n > 1 ? ` (${places[0].n} times)` : ''}</li>` : ''}
      ${items.length ? `<li>🛍️ ${items.length} things you bought and loved, costing ${money(items.reduce((a, e) => a + (e.amount || 0), 0))}. Favourites: ${favourites.map((e) => `${e.icon} ${esc(e.text)}`).join(', ')}</li>` : ''}
      ${S.given ? `<li>💝 You gave ${money(S.given)} to charity</li>` : ''}
      ${S.carsOwned ? `<li>🚗 You owned ${S.carsOwned} car${S.carsOwned > 1 ? 's' : ''}, costing you about ${money((S.carSpent || 0) + (S.totals?.car || 0))} in all (down payments, loans and running costs, less what you sold them for)</li>` : ''}
      ${did.length ? `<li>⏳ How you spent your time most: ${did.map(([k, n]) => `${esc(k)} (${n} turn${n > 1 ? 's' : ''})`).join(', ')}</li>` : ''}
    </ul>
  </div>`;
}

async function endScreen() {
  const final = S.age >= STAGES.senior.endAge;
  const life = sim.retirementIncome(S);
  const need = S.retirementLifestyle ? RETIREMENT_LIFESTYLES[S.retirementLifestyle].monthly : null;
  const cash = S.bank + invest.total(S, 'cash') - S.debt;
  const t = S.totals || {};
  const hybrids = Object.keys(S.hybrids).map((h) => `${HYBRIDS[h].icon} ${HYBRIDS[h].label}`).join(', ');
  modalBox.className = 'modal-box wide';
  modalEl.hidden = false;
  modalBox.innerHTML = `
    ${final ? '' : '<button class="modal-x" data-choice="back" aria-label="Keep playing" title="Keep playing">✕</button>'}
    <div class="end">
      ${person(me(), 'big')}
      <p class="eyebrow">${final ? 'A life well lived' : 'Your story so far'}</p>
      <h2>${final ? `Congratulations, ${esc(S.name)}! You made it to ${S.age}.` : `${esc(S.name)}, age ${S.age}`}</h2>
      <p>Here are the highlights of your life.</p>
      ${hybrids ? `<p class="small">Strengths you built: ${hybrids}</p>` : ''}
      <div class="recap">
        ${careerRecap()}
        ${housingRecap()}
        ${cpfRecap()}
        ${lifestyleRecap()}
        ${joysRecap()}
      </div>
      <h3>Your money in numbers</h3>
      <table class="summary">
        ${life ? `<tr><td>CPF LIFE income</td><td>${money(life)}/month</td></tr>` : ''}
        ${need ? `<tr><td>Your retirement lifestyle costs</td><td>${money(need)}/month</td></tr>` : ''}
        <tr><td>CPF savings now</td><td>${money(cpf.cpfTotal(S.cpf))}</td></tr>
        <tr><td>Cash and investments, minus debt</td><td>${money(cash)}</td></tr>
        ${S.shortfallAge ? `<tr><td>Money ran short from age</td><td>${S.shortfallAge}</td></tr>` : ''}
        <tr><td>Paid into your CPF over your life</td><td>${money(t.cpfIn || 0)}</td></tr>
        <tr><td>…of which your employers paid</td><td>${money(t.employerIn || 0)}</td></tr>
        ${t.cpfInterest != null ? `<tr><td>Interest on your CPF</td><td>${money(t.cpfInterest)}</td></tr><tr><td>Interest on your cash (bank)</td><td>${money(t.bankInterest || 0)}</td></tr>` : `<tr><td>Interest earned</td><td>${money(t.interest || 0)}</td></tr>`}
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
  startScrapbook(modalBox);
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

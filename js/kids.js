// Simple mode: the same CPF, tax, housing and health rules as the full game, with fewer,
// simpler choices. Life is played in periods: share out a focus action and an extra for each
// year with +/- buttons, then watch the years go by as your character runs across the screen.
import * as cpf from './cpf.js';
import * as sim from './sim.js';
import * as invest from './invest.js';
import { characterHtml, lookOf } from './sprites.js';
import { rollWorldEvent, rollPersonalEvent } from './events.js';
import { scamsFor, mishapsFor } from './mishaps.js';
import { STATS, HYBRIDS, ACTIVITIES, SHOP, SCHOOLS, EDUCATION, LIFESTYLES, RETIREMENT_LIFESTYLES, HOLIDAYS } from './data.js';

const SAVE_KEY = 'flit-simple-v1';
const money = sim.money;
const app = document.getElementById('app');
const modalEl = document.getElementById('modal');
const modalBox = modalEl.querySelector('.modal-box');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Each period ends on its birthday: 7 to 12 is five years, so five focus actions and five extras.
export const PERIODS = [
  { to: 12, title: 'Primary school', icon: '🎒', acts: 'child',
    tip: 'You already have CPF savings! When you were born, the Government put $4,000 into your MediSave Account, and it earns 4% interest a year.' },
  { to: 17, title: 'Secondary school', icon: '🏫', acts: 'teen',
    tip: 'From 13 you can take a weekend part-time job. If you earn less than $500 a month, only your employer pays into your CPF, so you keep all your pay.' },
  { to: 21, title: 'JC, poly or ITE', icon: '🎓', acts: 'teen',
    tip: 'Your exam results decide which schools you can get into. Guys do two years of National Service at 18; the allowance isn\'t taxed and has no CPF.' },
  { to: 30, title: 'Starting work', icon: '💼', acts: 'adult',
    tip: 'Up to 55, 37% of your pay goes into CPF each month: 20% from you and 17% from your employer.' },
  { to: 40, title: 'Your thirties', icon: '🏡', acts: 'adult',
    tip: 'Most Singaporeans pay for their HDB flat with the money in their CPF Ordinary Account.' },
  { to: 55, title: 'Your forties and fifties', icon: '🧭', acts: 'adult',
    tip: 'Your Special Account earns at least 4% a year, plus extra interest on your first $60,000 of CPF savings.' },
  { to: 65, title: 'Getting ready to retire', icon: '🌇', acts: 'senior',
    tip: 'At 55 CPF sets up your Retirement Account. It will pay you a monthly income from 65.' },
  { to: 85, title: 'Retirement', icon: '🌅', acts: 'senior',
    tip: 'CPF LIFE pays you every month for as long as you live, however long that is.' },
];

const young = (s) => s.age < 21;
// The extras: one for each year. Amounts grow with you.
const EXTRAS = {
  save: { icon: '🐷', label: 'Save my money', note: () => 'Keep it in the bank. Builds Money Sense.' },
  treat: { icon: '🛍️', label: 'Buy something fun', note: (s) => (s.age < 13 ? 'A toy or a game: more joy now, less saved.' : 'Something for your room: more joy, less saved.') },
  give: { icon: '🫶', label: 'Give to charity', note: (s) => `Give ${money(giveAmount(s))}. Joy and Communication.` },
  cpf: { icon: '🏛️', label: 'Top up my CPF', note: (s) => `Put ${money(topUpAmount(s))} into CPF. It grows at 4% but stays locked until 55${s.age >= 55 ? ' (you\'re past it: more monthly income later)' : ''}.` },
  holiday: { icon: '✈️', label: 'Go on holiday', note: () => 'A trip you can afford. Lots of joy, costs cash.', from: 21 },
  invest: { icon: '📈', label: 'Invest', note: (s) => `Put ${money(investAmount(s))} into an index fund. It can go up or down.`, from: 21, until: 65 },
};
const giveAmount = (s) => (s.age < 13 ? 20 : s.age < 21 ? 50 : 500);
const topUpAmount = (s) => (s.age < 13 ? 100 : s.age < 21 ? 300 : 3000);
const investAmount = () => 3000;
const extrasFor = (s) => Object.entries(EXTRAS).filter(([, e]) => (!e.from || s.age >= e.from) && (!e.until || s.age < e.until)).map(([id]) => id);

let S = null; // the game state, the same shape as the full game's
let P = 0; // the period being played
let fast = false;

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ s: S, p: P })); } catch { /* storage may be blocked */ }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage may be blocked */ }
}

const btn = (choice, label, cls = '') => `<button class="btn ${cls}" data-choice="${choice}">${label}</button>`;
const me = (stage = sim.ageStage(S.age)) => lookOf(S.look, stage);

// Shows a screen in the app area and waits for a button with data-choice.
function screen(html, wire) {
  app.innerHTML = `<div class="kids">${html}</div>`;
  window.scrollTo({ top: 0 });
  // Wire the new screen itself, so listeners from earlier screens never pile up.
  if (wire) wire(app.firstElementChild);
  return new Promise((resolve) => {
    app.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (b && !b.disabled) { app.onclick = null; resolve(b.dataset.choice); }
    };
  });
}

// A pop-up over the running screen, for a choice that comes up along the way.
function popup(html) {
  modalBox.className = 'modal-box';
  modalBox.innerHTML = html;
  modalEl.hidden = false;
  return new Promise((resolve) => {
    modalBox.onclick = (e) => {
      const b = e.target.closest('[data-choice]');
      if (b && !b.disabled) { modalEl.hidden = true; modalBox.onclick = null; resolve(b.dataset.choice); }
    };
  });
}

// A big choice: one card per option.
const pick = (eyebrow, title, text, options) => screen(`
  <div class="card k-card">
    <p class="eyebrow">${eyebrow}</p>
    <h2>${title}</h2>
    ${text ? `<p>${text}</p>` : ''}
    <div class="careers k-picks">${options.map((o) => `
      <button class="career" data-choice="${o.id}" ${o.disabled ? 'disabled' : ''}>
        ${o.icon ? `<span class="c-icon">${o.icon}</span>` : ''}<b>${o.label}</b>${o.sub ? `<span>${o.sub}</span>` : ''}${o.note ? `<small>${o.note}</small>` : ''}
      </button>`).join('')}</div>
  </div>`);

// ---------- start ----------

export async function startSimple(name, look, back) {
  const saved = loadSave();
  if (saved && saved.s && !saved.s.done) {
    const c = await screen(`<div class="card k-card">
      <p class="eyebrow">Simple mode</p>
      <h2>Carry on with ${esc(saved.s.name)}?</h2>
      <p>${esc(saved.s.name)} is ${saved.s.age}. You can carry on, or start a new life with the animal and name you picked.</p>
      <div class="row">${btn('continue', 'Carry on', 'primary')}${btn('new', 'Start a new life')}${btn('back', 'Back')}</div></div>`);
    if (c === 'back') return back();
    if (c === 'continue') { S = saved.s; P = saved.p; return play(back); }
  }
  S = sim.newGame(name, look);
  S.simple = true;
  P = 0;
  await screen(`<div class="card k-card k-hello">
    ${characterHtml(me(), 'walking k-big')}
    <p class="eyebrow">Simple mode</p>
    <h2>Hi, ${esc(S.name)}! You're 7.</h2>
    <p>Your life is played in steps. In each step you choose what to focus on each year, and one extra thing to do with your money. Then watch the years go by.</p>
    <p>${PERIODS[0].tip}</p>
    <h3>How do you want to play?</h3>
    <div class="careers k-picks">
      <button class="career" data-choice="run"><span class="c-icon">🏃</span><b>Run mode</b><small>Run through life! Pick a path at each gate, collect stars and jump over scams and mishaps.</small></button>
      <button class="career" data-choice="plan"><span class="c-icon">🧮</span><b>Plan mode</b><small>Share out your choices with + and − buttons, then watch the years go by.</small></button>
    </div></div>`).then((c) => { S.runMode = c === 'run'; });
  return play(back);
}

async function play(back) {
  while (P < PERIODS.length) {
    await bigChoicesBefore();
    let plan;
    for (;;) {
      plan = S.runMode ? await runGame() : await planPeriod();
      if (plan !== 'switch') break;
      S.runMode = !S.runMode;
    }
    if (plan === 'quit') { save(); return back(); }
    const before = snapshot();
    const happened = await runPeriod(plan);
    P++;
    save();
    const c = await results(before, happened);
    if (c === 'quit') return back();
  }
  S.done = true;
  save();
  await recap(back);
}

// ---------- big choices at the start of a period ----------

async function bigChoicesBefore() {
  if (S.age === 17 && !S.school) {
    const k = sim.lvl(S, 'knowledge');
    const id = await pick('Your O-level results are out', 'Where to next?', `Your Knowledge is <b>${k}</b>. It decides which schools you can get into.`,
      sim.schoolOptions(S).map((o) => ({ id: o.id, icon: o.icon, label: o.label, sub: `Ages ${o.years}`, note: o.ok ? o.desc : `Needs Knowledge ${o.minKnowledge}`, disabled: !o.ok })));
    sim.chooseSchool(S, id);
    if (id === 'ite') S.postNs = 'work';
  }
  if (S.age === 21) {
    // Guys choose after NS. (Girls chose at 19, on the way.)
    if (!S.postNs) await uniOrWork();
    S.education = sim.educationFor(S);
    const ed = EDUCATION[S.education];
    const open = sim.careerOptions(S).filter((o) => o.eligible).slice(0, 6);
    const studying = sim.firstJobAge(S) > S.age;
    const id = await pick('Your first job', `You'll finish with ${sim.aOrAn(ed.label)} ${ed.label}`,
      `${studying ? `You start work at ${sim.firstJobAge(S)}, after university. ` : ''}Here are the jobs your skills and certificate open up. Pay is per month, before CPF.`,
      open.map((o) => ({ id: o.id, icon: o.icon, label: o.label, sub: `${money(o.startPay)}/month`, note: o.selfEmployed ? 'Your own boss: no employer CPF' : '' })));
    S.pendingCareer = id;
    if (!studying) startJob();
    const life = await pick('How do you want to live?', 'Choose your lifestyle', 'This is your everyday spending: food, transport and fun. You can spend less and save more, or enjoy more now.',
      Object.entries(LIFESTYLES).map(([k, l]) => ({ id: k, icon: l.icon, label: l.label, sub: `${money(l.monthly)}/month`, note: l.desc })));
    S.lifestyle = life;
  }
  if (S.age === 30) {
    if (!S.spouse) {
      const c = await pick('Love and family', 'You\'ve met someone special', 'Do you want to get married? You\'d share your home and household costs.', [
        { id: 'simple', icon: '💒', label: 'Simple wedding', sub: 'Costs $15,000, shared', note: 'Guests give about $12,000 in gifts.' },
        { id: 'big', icon: '🎉', label: 'Big wedding', sub: 'Costs $50,000, shared', note: 'Guests give about $40,000 in gifts.' },
        { id: 'single', icon: '🧘', label: 'Stay single', note: 'Singles can buy an HDB flat from 35.' },
      ]);
      if (c !== 'single') {
        const cost = c === 'big' ? 50000 : 15000;
        sim.marry(S, cost);
        S.bank += (c === 'big' ? 40000 : 12000) / 2;
        S.joy += c === 'big' ? 5 : 3;
      }
    }
    if (S.spouse) {
      const n = await pick('Love and family', 'How many children?', 'A child costs about $550 to $1,000 a month until they grow up. The Government gives a $10,000 Baby Gift and other help for each child.',
        [0, 1, 2, 3].map((k) => ({ id: String(k), icon: k ? '👶'.repeat(k) : '🙂', label: k ? `${k} ${k === 1 ? 'child' : 'children'}` : 'No children' })));
      S.plannedKids = +n;
    }
  }
  if ((S.age === 30 || S.age === 40) && !S.home) await homeChoice();
  if (S.age === 55) await turning55();
  if (S.age === 65) await turning65();
}

async function uniOrWork() {
  const can = sim.canGoToUniversity(S);
  const k = EDUCATION.university.minKnowledge;
  const ns = sim.doesNs(S);
  const c = await pick(ns ? 'National Service is done' : 'JC or poly is done', 'University, or start work?',
    can ? `University needs Knowledge ${k}, and you have ${sim.lvl(S, 'knowledge')}.` : `University needs JC or poly and Knowledge ${k}. You can start work now.`, [
      { id: 'work', icon: '💼', label: 'Start work', sub: 'First job at 21', note: 'Earn and save sooner.' },
      { id: 'uni', icon: '🎓', label: 'Go to university', sub: `First job at ${ns ? 23 : 22}`, note: can ? 'Higher pay for most jobs.' : `Needs Knowledge ${k}`, disabled: !can },
    ]);
  S.postNs = c;
  if (c === 'uni') sim.story(S, 'life', '🎓', 'Went to university');
}

function startJob() {
  if (!S.pendingCareer) return;
  S.education = sim.educationFor(S);
  sim.chooseCareer(S, S.pendingCareer);
  S.pendingCareer = null;
}

async function homeChoice() {
  const quotes = sim.homeQuotes(S).filter((q) => q.affordable).slice(0, 3);
  const c = await pick('A home of your own', S.spouse ? 'Buy a home together?' : 'Buy a home?',
    `CPF pays the down payment and the monthly loan from your Ordinary Account (OA: ${money(S.cpf.oa)}). You have ${money(S.bank)} in cash.${quotes.length ? '' : ' Nothing fits your savings and pay yet.'}`, [
      ...quotes.map((q) => ({ id: q.id, icon: q.kind === 'private' ? '🏙️' : '🏢', label: q.label, sub: `${money(q.price / q.share)}${q.share < 1 ? `, your half ${money(q.price)}` : ''}${q.grant ? `, minus ${money(q.grant)} grant` : ''}`,
        note: `Pay ${money(q.fromOa)} from CPF and ${money(q.fromCash)} cash now, then ${money(q.instalment)}/month.` })),
      { id: 'stay', icon: '🏠', label: S.age >= 35 || S.spouse ? 'Not yet' : 'Keep living with my parents', note: 'No loan. Save more and decide later.' },
    ]);
  if (c !== 'stay') sim.buyHome(S, c);
}

async function turning55() {
  if (S.retirementTarget) return;
  const r = sim.formRA(S);
  const est = money(cpf.cpfLifePayout(S.cpf.ra * Math.pow(1 + cpf.INTEREST.ra, 10), 65));
  sim.story(S, 'cpf', '🎂', `At 55, your Retirement Account was formed with ${money(S.cpf.ra)}`, { amount: S.cpf.ra });
  await screen(`<div class="card k-card">
    <p class="eyebrow">Happy 55th birthday</p>
    <h2>🏛️ Your Retirement Account</h2>
    <p>CPF moved <b>${money(r.fromSa + r.fromOa)}</b> from your Special and Ordinary Accounts into a new Retirement Account, up to the Full Retirement Sum of ${money(cpf.RETIREMENT_SUMS.FRS)}.</p>
    <p>${r.metTarget ? 'You reached the Full Retirement Sum! 🎉' : `You're ${money(cpf.RETIREMENT_SUMS.FRS - S.cpf.ra)} short of the Full Retirement Sum, so your monthly income will be smaller.`} From 65 it should pay about <b>${est}</b> a month.</p>
    ${btn('ok', 'Next', 'primary')}</div>`);
  const rl = await pick('Retirement', 'What kind of retirement do you want?', 'From now on your everyday spending follows the lifestyle you pick.',
    Object.entries(RETIREMENT_LIFESTYLES).map(([k, l]) => ({ id: k, label: l.label, sub: `${money(l.monthly)}/month`, note: l.desc })));
  S.retirementLifestyle = rl;
  await workChoice();
}

async function turning65() {
  if (S.life) return;
  const now = cpf.cpfLifePayout(S.cpf.ra, 65);
  const later = cpf.cpfLifePayout(S.cpf.ra * Math.pow(1 + cpf.INTEREST.ra, 5), 70);
  const c = await pick('Happy 65th birthday', 'Start your CPF LIFE income?', `Your Retirement Account has <b>${money(S.cpf.ra)}</b>. CPF LIFE turns it into a monthly income for as long as you live.`, [
    { id: '65', icon: '🏛️', label: 'Start now', sub: `${money(now)}/month` },
    { id: '70', icon: '⏳', label: 'Wait until 70', sub: `about ${money(later)}/month`, note: 'Up to 7% more for each year you wait.' },
  ]);
  sim.startCpfLife(S, +c, 'standard');
  if (S.workMode !== 'retired') await workChoice();
}

async function workChoice() {
  if (!S.career || S.workMode === 'retired') return;
  const c = await pick('Work', 'Keep working?', 'Working longer means more CPF and fewer years living on your savings.', [
    { id: 'full', icon: '💼', label: 'Keep working full-time' },
    { id: 'part', icon: '🕐', label: 'Work part-time', note: 'Half the pay, more free time.' },
    { id: 'retired', icon: '🌴', label: 'Retire now' },
  ]);
  sim.setWorkMode(S, c);
}

// ---------- planning a period ----------

function planPeriod() {
  const per = PERIODS[P];
  const years = per.to - S.age;
  const acts = ACTIVITIES[per.acts].filter((a) => !a.minAge || per.to > a.minAge);
  const extras = extrasFor(S);
  // Everything starts at 0: the player shares out every action.
  const share = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));
  const focus = share(acts.map((a) => a.id));
  const extra = share(extras);
  const row = (kind, id, icon, label, note, n) => `
    <div class="k-row">
      <span class="k-i">${icon}</span>
      <span class="k-l"><b>${label}</b><small>${note}</small></span>
      <span class="k-step">
        <button class="k-pm" data-pm="${kind}|${id}|-1" aria-label="One less">−</button>
        <b class="k-n" data-n="${kind}|${id}">${n}</b>
        <button class="k-pm" data-pm="${kind}|${id}|1" aria-label="One more">+</button>
      </span>
    </div>`;
  const gains = (a) => Object.keys(a.gains).map((k) => `${STATS[k].icon} ${STATS[k].label}`).join(', ');
  const html = `
    ${hud()}
    <div class="k-plan-track" aria-hidden="true">
      <div class="k-runner" style="--p:0">${characterHtml(me(), 'k-runner-art')}</div>
      <div class="k-ground"><span>${S.age}</span><span class="k-done" data-done>0 of ${years * 2} chosen</span><span>${per.to}</span></div>
    </div>
    <div class="card k-card">
      <p class="eyebrow">${per.icon} Age ${S.age} to ${per.to}</p>
      <h2>${per.title}</h2>
      <p>You have <b>${years} focus actions</b> and <b>${years} extras</b> to give out, one of each for every year until you turn ${per.to}. Tap <b>+</b> to choose. ${esc(S.name)} walks forward with every one you pick.</p>
      <h3>🎯 Focus <span class="k-left" data-left="focus"></span></h3>
      <div class="k-rows">${acts.map((a) => row('focus', a.id, a.icon, a.label, gains(a) + (a.job ? `. Earn about ${money(sim.teenJob(Math.max(13, S.age)).monthly)}/month` : ''), focus[a.id])).join('')}</div>
      <h3>⭐ Extras <span class="k-left" data-left="extra"></span></h3>
      <div class="k-rows">${extras.map((id) => row('extra', id, EXTRAS[id].icon, EXTRAS[id].label, EXTRAS[id].note(S), extra[id])).join('')}</div>
      <p class="k-tip">💡 ${per.tip}</p>
      <div class="row">${btn('go', `▶️ Live ages ${S.age} to ${per.to}`, 'primary')}${btn('switch', '🏃 Play as a run instead')}${btn('quit', 'Save and leave')}</div>
    </div>`;
  const plan = { focus, extra, years };
  const refresh = (root) => {
    for (const kind of ['focus', 'extra']) {
      const left = years - Object.values(plan[kind]).reduce((t, n) => t + n, 0);
      root.querySelector(`[data-left="${kind}"]`).textContent = left ? `${left} left to choose` : 'all chosen ✓';
      root.querySelector(`[data-left="${kind}"]`).classList.toggle('done', !left);
      root.querySelectorAll(`[data-pm^="${kind}|"]`).forEach((b) => {
        const [, id, d] = b.dataset.pm.split('|');
        b.disabled = +d < 0 ? !plan[kind][id] : !left;
      });
      for (const [id, n] of Object.entries(plan[kind])) root.querySelector(`[data-n="${kind}|${id}"]`).textContent = n;
    }
    const chosen = ['focus', 'extra'].reduce((t, k) => t + Object.values(plan[k]).reduce((a, n) => a + n, 0), 0);
    const go = root.querySelector('[data-choice="go"]');
    go.disabled = chosen < years * 2;
    go.textContent = go.disabled ? `Choose ${years * 2 - chosen} more to start` : `▶️ Live ages ${S.age} to ${per.to}`;
    root.querySelector('[data-done]').textContent = `${chosen} of ${years * 2} chosen`;
    // The character walks along as a progress bar: one step for each action given out.
    const runner = root.querySelector('.k-plan-track .k-runner');
    const p = chosen / (years * 2);
    if (+runner.style.getPropertyValue('--p') !== p) {
      runner.style.setProperty('--p', p);
      const art = runner.querySelector('.person');
      art.classList.add('walking');
      clearTimeout(runner.stop);
      runner.stop = setTimeout(() => art.classList.remove('walking'), 650);
    }
  };
  return screen(html, (root) => {
    refresh(root);
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pm]');
      if (!b || b.disabled) return;
      const [kind, id, d] = b.dataset.pm.split('|');
      plan[kind][id] = Math.max(0, plan[kind][id] + +d);
      refresh(root);
    });
  }).then((c) => (c === 'quit' || c === 'switch' ? c : plan));
}

// Turns { id: count } into one id per year. Weekend jobs go last, so they land once you're 13.
function schedule(counts, years) {
  const list = Object.entries(counts).flatMap(([id, n]) => Array(n).fill(id));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  list.sort((a, b) => (a === 'job') - (b === 'job'));
  return list.slice(0, years);
}


// ---------- run mode ----------
// An endless-runner take on planning: three paths, gates that choose your focus and your
// extra for each age, stars for joy, and scams and mishaps to jump over. The choices then
// run through the same simulation as plan mode.

const STAR_JOY = 0.25;
const SHORT = {
  study: 'Study', play: 'Play', friends: 'Friends', create: 'Create', sports: 'Sports', hangout: 'Friends', arts: 'Arts',
  job: 'Part-time job', volunteer: 'Volunteer', upskill: 'Upskill', exercise: 'Exercise', network: 'Network', hobby: 'Hobby',
  budget: 'Budget', active: 'Stay active', learn: 'Learn', family: 'Family',
  save: 'Save', treat: 'Treat', give: 'Give', cpf: 'Top up CPF', holiday: 'Holiday', invest: 'Invest',
};
const pick3 = (xs) => [...xs].sort(() => Math.random() - 0.5).slice(0, 3);

async function runGame() {
  const per = PERIODS[P];
  const years = per.to - S.age;
  const c = await screen(`
    ${hud()}
    <div class="card k-card">
      <p class="eyebrow">${per.icon} Age ${S.age} to ${per.to}</p>
      <h2>${per.title}</h2>
      <p>Run through ages ${S.age} to ${per.to}! At each 🚧 gate, move to the path you want: the first gate of each age picks your <b>focus</b>, the second your <b>extra</b>.</p>
      <ul class="k-how">
        <li>📱 On a phone, drag up and down on the track to change path, and tap to jump.</li>
        <li>🖱️ On a computer, move the mouse up and down and click to jump, or use the arrow keys and space.</li>
        <li>⤴️ Jump over scams and mishaps, or run around them. If you hit one, it costs real money!</li>
        <li>⭐ Collect stars for joy</li>
      </ul>
      <p class="k-tip">💡 ${per.tip}</p>
      <div class="row">${btn('go', '🏃 Start running', 'primary')}${btn('switch', '🧮 Use plan mode instead')}${btn('quit', 'Save and leave')}</div>
    </div>`);
  if (c !== 'go') return c;
  return runTrack(per, years);
}

function runTrack(per, years) {
  const startAge = S.age;
  const acts = ACTIVITIES[per.acts];
  const extras = extrasFor(S);
  // At most 6 ages to run through; in longer periods each one stands for a few years.
  const gates = Math.min(years, 6);
  const span = Array.from({ length: gates }, (_, g) => Math.floor(years / gates) + (g < years % gates ? 1 : 0));
  const first = span.map((_, g) => span.slice(0, g).reduce((t, n) => t + n, 0));
  const ageLabel = (g) => (span[g] > 1 ? `Age ${startAge + first[g]}–${startAge + first[g] + span[g] - 1}` : `Age ${startAge + first[g]}`);
  const plan = { years, focus: {}, extra: {}, order: { focus: [], extra: [] }, obstacles: [], stars: 0 };
  let html = '';
  const objs = [];
  // Lay out the track in units of its width (W), filled in once it's on screen.
  const L = 2.3; // track length for each age
  const x0 = 0.9;
  const add = (o) => objs.push(o);
  for (let g = 0; g < gates; g++) {
    const base = x0 + g * L;
    const age = startAge + first[g];
    add({ t: 'age', x: base - 0.15, g });
    for (const at of [0.12, 0.62]) {
      const lane = Math.floor(Math.random() * 3);
      for (let k = 0; k < 3; k++) add({ t: 'star', x: base + at + k * 0.1, lane });
    }
    const focusOpts = pick3(acts.filter((a) => !a.minAge || age >= a.minAge)).map((a) => ({ id: a.id, icon: a.icon }));
    add({ t: 'gate', kind: 'focus', x: base + 0.5, g, opts: focusOpts });
    add({ t: 'gate', kind: 'extra', x: base + 1.05, g, opts: pick3(extras).map((id) => ({ id, icon: EXTRAS[id].icon })) });
    // A scam or a mishap, now and then.
    for (const at of [Math.random() < 0.5 ? 0.32 : 0.85]) {
      if (Math.random() > 0.55) continue;
      const pool = Math.random() < 0.5 ? scamsFor(age) : mishapsFor(age);
      if (!pool.length) continue;
      add({ t: 'obstacle', x: base + at, lane: Math.floor(Math.random() * 3), year: first[g], o: pool[Math.floor(Math.random() * pool.length)] });
    }
  }
  const endX = x0 + gates * L + 0.1;
  objs.forEach((o, i) => {
    o.id = i;
    if (o.t === 'star') html += `<span class="k-obj k-star" data-o="${i}">⭐</span>`;
    if (o.t === 'obstacle') html += `<span class="k-obj k-bad" data-o="${i}"><em>${o.o.tag}</em>${o.o.icon}</span>`;
    if (o.t === 'gate') html += `<span class="k-obj k-gate ${o.kind}" data-o="${i}">${o.opts.map((p, l) => `<span class="k-sign" style="--l:${l}"><b>${p.icon}</b>${SHORT[p.id] || p.id}</span>`).join('')}</span>`;
    if (o.t === 'age') html += `<span class="k-obj k-agesign" data-o="${i}">${ageLabel(o.g)}</span>`;
  });
  return screen(`
    <div class="k-game" tabindex="0" aria-label="Run mode: up and down change path, space jumps">
      <div class="k-game-sky"><span class="k-cloud c1">☁️</span><span class="k-cloud c2">☁️</span></div>
      <div class="k-bigage" data-big>${ageLabel(0)}</div>
      <div class="k-next" data-next>Next gate: pick a focus</div>
      ${[0, 1, 2].map((l) => `<div class="k-lane" style="--l:${l}"></div>`).join('')}
      ${html}
      <div class="k-player" data-player>${characterHtml(me(), 'walking k-runner-art')}</div>
      <div class="k-pops" data-pops></div>
      <div class="k-finish" data-finish hidden></div>
    </div>
    <div class="k-score"><span>⭐ <b data-s="stars">0</b></span><span>🛡️ Dodged <b data-s="dodged">0</b></span><span>💥 Hit <b data-s="hit">0</b></span></div>
    <p class="k-hint" data-hint><span>📱 Drag up and down to change path, tap to jump</span><span>🖱️ Move the mouse up and down, click to jump</span><span>⌨️ Arrow keys or W and S, space to jump</span></p>
    <div class="row k-run-btns" data-after hidden></div>`, (root) => {
    const game = root.querySelector('.k-game');
    const player = root.querySelector('[data-player]');
    const els = new Map([...root.querySelectorAll('[data-o]')].map((e) => [+e.dataset.o, e]));
    const W = game.clientWidth;
    const laneTop = (l) => 52 + l * 74;
    const px = W * 0.14;
    const speed = W * 0.42;
    let dist = 0, lane = 1, y = laneTop(1), jump = -1, last = 0, done = false, raf = 0;
    const score = { stars: 0, dodged: 0, hit: 0 };
    const setScore = () => { for (const k in score) root.querySelector(`[data-s="${k}"]`).textContent = score[k]; };
    const pop = (text, cls = '') => {
      const el = document.createElement('span');
      el.className = `k-pop ${cls}`;
      el.textContent = text;
      el.style.top = `${y - 10}px`;
      el.style.left = `${px + 30}px`;
      root.querySelector('[data-pops]').append(el);
      setTimeout(() => el.remove(), 1200);
    };
    const move = (d) => { lane = Math.max(0, Math.min(2, lane + d)); };
    const hop = () => { if (jump < 0) jump = 0; };
    // Touch: the path under your finger as you drag; a tap jumps. Mouse: the path under the
    // pointer as you move it; a click jumps.
    const laneAt = (clientY) => {
      const top = game.getBoundingClientRect().top;
      return Math.max(0, Math.min(2, Math.round((clientY - top - laneTop(0) - 35) / 74)));
    };
    let press = null;
    game.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      press = { y: e.clientY, t: performance.now(), moved: false };
      game.setPointerCapture?.(e.pointerId);
    });
    game.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && !press) { lane = laneAt(e.clientY); return; }
      if (!press) return;
      if (Math.abs(e.clientY - press.y) > 10) press.moved = true;
      if (press.moved || e.pointerType === 'mouse') lane = laneAt(e.clientY);
    });
    const release = () => {
      if (press && !press.moved && performance.now() - press.t < 350) hop();
      press = null;
    };
    game.addEventListener('pointerup', release);
    game.addEventListener('pointercancel', () => { press = null; });
    const onKey = (e) => {
      if (!document.body.contains(game)) { window.removeEventListener('keydown', onKey); return; }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') move(-1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') move(1);
      else if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') hop();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    game.focus({ preventScroll: true });

    const resolve = (o) => {
      o.done = true;
      const el = els.get(o.id);
      const airborne = jump >= 0;
      if (o.t === 'star') {
        if (o.lane === lane) { score.stars++; el.classList.add('got'); pop('+⭐', 'good'); }
      } else if (o.t === 'obstacle') {
        const hit = o.lane === lane && !airborne;
        plan.obstacles.push({ year: o.year, x: o.o, hit });
        if (hit) { score.hit++; el.classList.add('hit'); pop(`💥 ${o.o.title}`, 'bad'); }
        else if (o.lane === lane) { score.dodged++; el.classList.add('dodged'); pop('🛡️ Dodged!', 'good'); }
        else { score.dodged++; }
      } else if (o.t === 'gate') {
        const choice = o.opts[Math.min(lane, o.opts.length - 1)];
        const box = o.kind === 'focus' ? plan.focus : plan.extra;
        box[choice.id] = (box[choice.id] || 0) + span[o.g];
        for (let k = 0; k < span[o.g]; k++) plan.order[o.kind].push(choice.id);
        el.querySelectorAll('.k-sign')[Math.min(lane, o.opts.length - 1)].classList.add('on');
        pop(`${choice.icon} ${SHORT[choice.id]}`, 'pick');
        root.querySelector('[data-next]').textContent = o.kind === 'focus' ? 'Next gate: pick an extra' : 'Next gate: pick a focus';
      } else if (o.t === 'age') {
        root.querySelector('[data-big]').textContent = ageLabel(o.g);
      }
      setScore();
    };

    const finish = () => {
      done = true;
      cancelAnimationFrame(raf);
      player.querySelector('.person').classList.remove('walking');
      plan.stars = score.stars;
      const f = root.querySelector('[data-finish]');
      f.hidden = false;
      f.innerHTML = `<b>🏁 You made it to ${per.to}!</b><span>⭐ ${score.stars} stars · 🛡️ ${score.dodged} dodged · 💥 ${score.hit} hit</span>`;
      root.querySelector('[data-hint]').hidden = true;
      const after = root.querySelector('[data-after]');
      after.hidden = false;
      after.innerHTML = btn('done', `See how ages ${startAge} to ${per.to} went`, 'primary');
    };

    const frame = (t) => {
      if (done) return;
      if (!document.body.contains(game)) return;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      dist += speed * dt;
      y += (laneTop(lane) - y) * Math.min(1, dt * 14);
      if (jump >= 0) { jump += dt; if (jump > 0.6) jump = -1; }
      const lift = jump >= 0 ? Math.sin((Math.PI * jump) / 0.6) * 46 : 0;
      player.style.transform = `translate(${px}px, ${y - lift}px)`;
      player.classList.toggle('air', jump >= 0);
      for (const o of objs) {
        const sx = o.x * W - dist;
        const el = els.get(o.id);
        if (!o.done && sx <= px + 24) resolve(o);
        if (sx < -120 || sx > W + 40) { el.style.visibility = 'hidden'; continue; }
        el.style.visibility = '';
        const oy = o.t === 'gate' || o.t === 'age' ? 0 : laneTop(o.lane) + 18;
        el.style.transform = `translate(${sx}px, ${oy}px)`;
      }
      if (dist >= endX * W) return finish();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }).then(() => plan);
}

// ---------- running through the years ----------

const totalCpf = () => cpf.cpfTotal(S.cpf);
const hud = () => `
  <div class="k-hud">
    <span><small>Age</small><b data-hud="age">${S.age}</b></span>
    <span><small>💵 Cash</small><b data-hud="cash">${money(S.bank - S.debt)}</b></span>
    <span><small>🏛️ CPF</small><b data-hud="cpf">${money(totalCpf())}</b></span>
    <span><small>😊 Joy</small><b data-hud="joy">${Math.round(S.joy)}</b></span>
  </div>`;
function updateHud() {
  const set = (k, v) => { const el = app.querySelector(`[data-hud="${k}"]`); if (el) el.textContent = v; };
  set('age', S.age);
  set('cash', money(S.bank - S.debt));
  set('cpf', money(totalCpf()));
  set('joy', Math.round(S.joy));
}

function snapshot() {
  return { age: S.age, bank: S.bank, debt: S.debt, cpf: { ...S.cpf }, cpfTotal: totalCpf(), stats: { ...S.stats }, joy: S.joy, invested: invest.total(S, 'cash'), hybrids: { ...S.hybrids } };
}

async function runPeriod(plan) {
  const per = PERIODS[P];
  const startAge = S.age;
  // Run mode chose the order itself; plan mode shuffles the years.
  const focus = plan.order ? plan.order.focus : schedule(plan.focus, plan.years);
  const extras = plan.order ? plan.order.extra : schedule(plan.extra, plan.years);
  if (plan.stars) S.joy += plan.stars * STAR_JOY;
  const acts = ACTIVITIES[per.acts];
  const kidsAt = Array.from({ length: S.plannedKids || 0 }, (_, i) => startAge + 1 + i * 2);
  S.plannedKids = 0;
  const happened = [];
  const money0 = { income: 0, spend: 0, cpfIn: 0, interest: 0, tax: 0 };
  fast = !!plan.order;
  await screen(`
    ${hud()}
    <div class="k-run" style="--years:${plan.years}">
      <div class="k-sky"><span class="k-cloud c1">☁️</span><span class="k-cloud c2">☁️</span><span class="k-sun">${per.icon}</span></div>
      <div class="k-track">
        <div class="k-runner" style="--p:0">${characterHtml(me(), 'walking k-runner-art')}</div>
        <div class="k-ground">${Array.from({ length: plan.years + 1 }, (_, i) => `<span>${startAge + i}</span>`).join('')}</div>
      </div>
    </div>
    <div class="k-feed" aria-live="polite"></div>
    <div class="row k-run-btns"><button class="btn" id="k-fast">⏩ Faster</button></div>`, (root) => {
    root.querySelector('#k-fast').onclick = (e) => { fast = true; e.target.disabled = true; };
    run().then(() => {
      const row = root.querySelector('.k-run-btns');
      row.innerHTML = btn('done', `See how ages ${startAge} to ${per.to} went`, 'primary');
    });
  });
  return { happened, money: money0, startAge };

  async function run() {
    for (let i = 0; i < plan.years; i++) {
      const age = S.age;
      S.stage = sim.ageStage(age);
      // The obstacles from run mode: the ones you ran into cost real money.
      for (const o of (plan.obstacles || []).filter((x) => x.year === i)) {
        if (o.hit) {
          const w1 = wallet();
          const lost = Math.min(o.x.cost(S.bank), Math.max(0, S.bank));
          if (lost > 0) sim.spendCash(S, lost);
          S.joy = Math.max(0, S.joy - 0.5);
          feed(`${o.x.icon} ${o.x.title}. ${o.x.lesson}`, age, 'bad', change(w1));
        } else {
          S.joy += 0.5;
          S.stats.moneySense = Math.round((S.stats.moneySense + 0.3) * 10) / 10;
          feed(`🛡️ Jumped over: ${o.x.title}`, age, 'good');
        }
      }
      if (S.pendingCareer && age >= sim.firstJobAge(S)) startJob();
      // Girls choose at 19, after JC or poly.
      if (!sim.doesNs(S) && age === 19 && S.school && S.school !== 'ite' && !S.postNs) await uniOrWorkPopup();
      const opts = {};
      // Focus: the stats grow, by a random amount (a good year or an OK one).
      const act = acts.find((a) => a.id === focus[i]) || acts[0];
      const score = rand(0.4, 1);
      sim.applyGains(S, sim.activityGains(S, act, score));
      if (!['study', 'job', 'upskill', 'budget'].includes(act.id)) S.joy += 1;
      if (act.job && age >= 13 && !sim.isNsf(S)) opts.jobWage = sim.teenJob(age, score).monthly;
      // The extra for this year.
      let w0 = wallet();
      const note = doExtra(extras[i]);
      // A holiday is paid during the year, so its cost is shown up front.
      if (note && note.cost) feed(note.text, age, '', { cash: -note.cost, inv: 0, cpf: 0 });
      else if (note) feed(note, age, '', change(w0));
      if (kidsAt.includes(age) && S.spouse) {
        w0 = wallet();
        const b = sim.haveChild(S);
        S.bank += b.cashGift;
        S.joy += 4;
        feed(`👶 A baby is born! The Government gives a ${money(b.cashGift)} Baby Gift.`, age, '', change(w0));
      }
      // Something in the world, now and then.
      const w = rollWorldEvent(S);
      if (w) {
        const r = w.run(S);
        Object.assign(opts, r.opts || {});
        feed(`${r.icon} ${r.title}`, age, 'world');
      }
      const sum = sim.advanceYears(S, 1, opts);
      money0.income += sum.income;
      money0.spend += sum.spend;
      money0.cpfIn += sum.cpfIn;
      money0.interest += sum.interest;
      money0.tax += sum.tax || 0;
      if (S.career && !young(S)) S.joy += LIFESTYLES[S.lifestyle]?.joy || 0;
      // Illnesses and accidents planned for this life.
      for (const e of S.healthPlan || []) {
        if (!e.done && e.age === age) {
          e.done = true;
          const h0 = wallet();
          const { c, b } = sim.treat(S, e.id);
          const covered = b.gross - b.fromCash;
          feed(`${c.icon} ${c.label}. The bill was ${money(b.gross)}; subsidies, MediShield Life and MediSave paid ${money(covered)}${b.fromCash > 0 ? `, you paid ${money(b.fromCash)} cash` : ''}.`, age, 'bad', change(h0));
        }
      }
      await personalEvent(age);
      for (const h of sim.checkHybrids(S)) feed(`✨ New strength: ${HYBRIDS[h].label}`, age, 'good');
      // Run to the next birthday.
      const runner = app.querySelector('.k-runner');
      if (runner) {
        runner.style.setProperty('--p', (i + 1) / plan.years);
        const art = runner.querySelector('.person');
        if (sim.ageStage(S.age) !== sim.ageStage(age)) runner.innerHTML = characterHtml(me(), 'walking k-runner-art');
        else if (art) art.classList.add('walking');
      }
      updateHud();
      await sleep(fast ? 250 : 1100);
    }
    S.stage = sim.ageStage(S.age);
    app.querySelector('.k-runner .person')?.classList.remove('walking');
  }

  // `d` is how the event changed your cash, investments and CPF. It sets the colour:
  // green when you gained, red when you lost, blue when money only moved between them.
  function feed(text, age, kind = '', d = null) {
    if (d) kind = flowKind(d) || kind;
    happened.push({ age, text, kind, d });
    const el = app.querySelector('.k-feed');
    if (!el) return;
    el.insertAdjacentHTML('afterbegin', bubbleHtml({ age, text, kind, d }, 'p'));
    while (el.children.length > 4) el.lastElementChild.remove();
  }

  async function uniOrWorkPopup() {
    const can = sim.canGoToUniversity(S);
    const k = EDUCATION.university.minKnowledge;
    const c = await popup(`<div class="event"><div class="e-icon">🎓</div>
      <h2>University, or start work?</h2>
      <p>${can ? `University needs Knowledge ${k}, and you have ${sim.lvl(S, 'knowledge')}. You'd start work at 22.` : `University needs Knowledge ${k} and you have ${sim.lvl(S, 'knowledge')}, so you'll start work at 21.`}</p></div>
      ${can ? btn('uni', '🎓 Go to university', 'primary') : ''}${btn('work', can ? '💼 Start work at 21' : 'OK', can ? '' : 'primary')}`);
    S.postNs = c;
    feed(c === 'uni' ? '🎓 Off to university!' : '💼 You\'ll start work at 21', S.age, c === 'uni' ? 'good' : '');
  }

  // Personal events and gifts. Love and babies are chosen up front in simple mode.
  async function personalEvent(age) {
    const e = rollPersonalEvent(S);
    // Love and babies are chosen up front; in run mode, scams and mishaps were the obstacles.
    if (!e || ['partner', 'baby'].includes(e.id) || (plan.order && ['scam', 'mishap'].includes(e.id))) return;
    const w0 = wallet();
    const r = e.run(S);
    if (!r) return;
    let result = null;
    if (r.choices) {
      const i = await popup(`<div class="event"><div class="e-icon">${r.icon}</div><h2>${r.title}</h2><p>${r.text}</p></div>
        ${r.choices.map((ch, k) => btn(String(k), ch.label, k ? '' : 'primary')).join('')}`);
      result = r.choices[+i].run(S);
    }
    const g = r.gift ?? (result && typeof result === 'object' ? result.gift : null);
    const amount = typeof g === 'number' ? g : g?.gift || 0;
    if (amount > 0) S.bank += amount;
    feed(`${r.icon} ${r.title}`, age, '', change(w0));
  }
}

// What you have, to see how an event changed it.
const wallet = () => ({ cash: S.bank - S.debt, inv: invest.total(S, 'cash'), cpf: totalCpf() });
function change(w0) {
  const w = wallet();
  return { cash: w.cash - w0.cash, inv: w.inv - w0.inv, cpf: w.cpf - w0.cpf };
}
const moved = (v) => Math.abs(v) >= 1;
function flowKind(d) {
  if (![d.cash, d.inv, d.cpf].some(moved)) return '';
  const net = d.cash + d.inv + d.cpf;
  return Math.abs(net) < 1 ? 'move' : net > 0 ? 'good' : 'bad';
}
function chips(d) {
  if (!d) return '';
  const chip = (v, label) => (moved(v) ? `<span class="k-chip ${v > 0 ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${money(Math.abs(v))} ${label}</span>` : '');
  const out = chip(d.cash, 'cash') + chip(d.inv, 'invested') + chip(d.cpf, 'CPF');
  return out ? `<span class="k-chips">${out}</span>` : '';
}
const bubbleHtml = (h, tag) => `<${tag} class="k-bubble ${h.kind}"><span class="k-age">${h.age}</span><span class="k-text">${h.text}${chips(h.d)}</span></${tag}>`;

// Does this year's extra. Returns a line for the feed, or nothing.
function doExtra(id) {
  const cash = Math.max(0, S.bank);
  if (id === 'save') {
    S.stats.moneySense = Math.round((S.stats.moneySense + 0.5) * 10) / 10;
    return '';
  }
  if (id === 'treat') {
    const stage = sim.ageStage(S.age);
    const items = (SHOP[stage] || []).filter((it) => !S.room.includes(it.id) && it.price <= cash / 2);
    if (items.length) {
      const it = items[Math.floor(Math.random() * items.length)];
      sim.buy(S, it);
      return `${it.icon} Bought: ${it.name}, ${money(it.price)}`;
    }
    const treat = Math.min(cash, S.age < 13 ? 20 : S.age < 21 ? 50 : 300);
    if (treat <= 0) return '🛍️ No cash for a treat this year';
    sim.spendCash(S, treat);
    S.joy += 1;
    return `🍦 Spent ${money(treat)} on treats`;
  }
  if (id === 'give') {
    const a = sim.donate(S, Math.min(cash, giveAmount(S)));
    return a ? `🫶 Gave ${money(a)} to charity` : '🫶 No cash to give this year';
  }
  if (id === 'cpf') {
    const want = Math.min(cash, topUpAmount(S), sim.topUpRoom(S));
    if (want <= 0) return cash <= 0 ? '🏛️ No cash to top up your CPF' : '🏛️ Your CPF is full: the top-up limit is reached';
    sim.spendCash(S, want);
    const r = sim.topUpCpf(S, want);
    S.bank += want - r.accepted;
    return `🏛️ Topped up ${money(r.accepted)} to your CPF${r.matched ? `, and the Government added ${money(r.matched)}` : ''}`;
  }
  if (id === 'invest') {
    const a = invest.buy(S, 'world', 'cash', Math.min(cash, investAmount(S)));
    return a ? `📈 Invested ${money(a)} in an index fund` : '📈 No cash to invest this year';
  }
  if (id === 'holiday') {
    const party = sim.holidayParties(S).at(-1).id;
    const trips = HOLIDAYS.filter((h) => sim.holidayCost(S, h.id, party) <= cash / 3);
    if (!trips.length) return '✈️ Not enough cash for a holiday this year';
    const h = trips[Math.min(trips.length - 1, Math.floor(Math.random() * 3) + Math.max(0, trips.length - 3))];
    (S.holidayPlans ||= []).push({ id: h.id, mode: 'times', left: 1, party });
    const cost = sim.holidayCost(S, h.id, party);
    return { text: `${h.icon} Holiday: ${h.name}`, cost };
  }
  return '';
}

// ---------- after a period ----------

function results(before, { happened, money: m, startAge }) {
  const statRows = sim.unlockedStats(S).map((k) => {
    const d = Math.round(S.stats[k]) - Math.round(before.stats[k] || 0);
    return `<span class="k-stat">${STATS[k].icon} ${STATS[k].label} <b>${Math.round(S.stats[k])}</b>${d > 0 ? ` <em>+${d}</em>` : ''}</span>`;
  }).join('');
  const delta = (now, then) => {
    const d = now - then;
    return `<td class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '+' : '−'}${money(Math.abs(d))}</td>`;
  };
  const acct = (k, label) => (S.cpf[k] > 0.5 || before.cpf[k] > 0.5 ? `<tr><td>${label}</td><td>${money(S.cpf[k])}</td>${delta(S.cpf[k], before.cpf[k])}</tr>` : '');
  const next = PERIODS[P];
  const home = S.home ? `🏠 You own ${sim.aOrAn(S.home.label)} ${S.home.label}${S.home.loanBalance > 1 ? `, with ${money(S.home.loanBalance)} of loan left` : ', fully paid'}.` : '';
  const job = S.career ? `💼 ${S.workMode === 'retired' ? 'Retired' : `Earning ${money(sim.currentWage(S))} a month`}.` : '';
  const fam = S.spouse ? `💞 Married${S.children.length ? ` with ${S.children.length} ${S.children.length === 1 ? 'child' : 'children'}` : ''}.` : '';
  return screen(`
    ${hud()}
    <div class="card k-card">
      <p class="eyebrow">Ages ${startAge} to ${S.age}</p>
      <h2>${characterHtml(me(), 'k-mini')} You're ${S.age} now!</h2>
      ${[job, home, fam].filter(Boolean).map((t) => `<p>${t}</p>`).join('')}
      <h3>💰 Your money</h3>
      <table class="summary k-money">
        <tr><th></th><th>Now</th><th>Change</th></tr>
        <tr><td>💵 Cash</td><td>${money(S.bank)}</td>${delta(S.bank, before.bank)}</tr>
        ${invest.total(S, 'cash') > 0 ? `<tr><td>📈 Investments</td><td>${money(invest.total(S, 'cash'))}</td>${delta(invest.total(S, 'cash'), before.invested)}</tr>` : ''}
        ${S.debt > 0 || before.debt > 0 ? `<tr><td>💳 Debt</td><td>${money(S.debt)}</td>${delta(before.debt, S.debt)}</tr>` : ''}
        ${acct('oa', '🏛️ CPF Ordinary')}${acct('sa', '🏛️ CPF Special')}${acct('ma', '🏛️ CPF MediSave')}${acct('ra', '🏛️ CPF Retirement')}
      </table>
      <p class="small">Over these years you took home ${money(m.income)} and spent ${money(m.spend)} on living costs.${m.cpfIn > 0 ? ` ${money(m.cpfIn)} of pay went into your CPF.` : ''} Your savings earned ${money(m.interest)} in interest.${S.life && S.life.monthly ? ` CPF LIFE pays you ${money(S.life.monthly)} a month.` : ''}</p>
      <h3>📊 Your stats</h3>
      <div class="k-stats">${statRows}</div>
      ${happened.length ? `<h3>📅 What happened</h3><p class="k-legend small"><span class="k-chip up">+ money in</span> <span class="k-chip down">− money out</span> <span class="k-chip move">moved</span> <span class="k-chip world">🌍 news</span></p><div class="k-feed k-log">${happened.map((h) => bubbleHtml(h, 'p')).join('')}</div>` : ''}
      <div class="row">${next ? btn('next', `Next: ${next.title} ▶️`, 'primary') : btn('next', 'See my life story ▶️', 'primary')}${next ? btn('quit', 'Save and leave') : ''}</div>
    </div>`);
}

async function recap(back) {
  const life = sim.retirementIncome(S);
  const trips = (S.trips || []).length;
  const kids = S.children.length;
  const lines = [
    S.career ? `💼 You worked as ${sim.aOrAn(careerLabel())} ${careerLabel()}.` : '',
    S.home ? `🏠 You bought ${sim.aOrAn(S.home.label)} ${S.home.label}.` : '🏠 You never bought a home of your own.',
    S.spouse ? `💞 You got married${kids ? ` and raised ${kids} ${kids === 1 ? 'child' : 'children'}` : ''}.` : '🧘 You stayed single.',
    trips ? `✈️ You went on ${trips} ${trips === 1 ? 'holiday' : 'holidays'}.` : '',
    S.given ? `🫶 You gave ${money(S.given)} to charity.` : '',
    life ? `🏛️ CPF LIFE pays you ${money(life)} a month.` : '',
    S.shortfallAge ? `💳 Money ran short from age ${S.shortfallAge}.` : '',
  ].filter(Boolean);
  const c = await screen(`
    <div class="card k-card k-end">
      ${characterHtml(me(), 'walking k-big')}
      <p class="eyebrow">A life well lived</p>
      <h2>Well done, ${esc(S.name)}! You made it to ${S.age}.</h2>
      <ul class="k-list k-life">${lines.map((t) => `<li><span>${t}</span></li>`).join('')}</ul>
      <table class="summary">
        <tr><td>💵 Cash and investments</td><td>${money(S.bank + invest.total(S, 'cash') - S.debt)}</td></tr>
        <tr><td>🏛️ CPF savings left</td><td>${money(totalCpf())}</td></tr>
        <tr><td>😊 Joy</td><td>${Math.round(S.joy)}</td></tr>
      </table>
      <h3>Looking back</h3>
      <p>How do you feel about your life?</p>
      <div class="feel">${['😞', '🙁', '😐', '🙂', '😄'].map((f, i) => `<button class="pick" data-feel="${i}">${f}</button>`).join('')}</div>
      <ul class="facts small">
        <li>What would you do differently next time?</li>
        <li>Which choice helped your savings the most? Which gave you the most joy?</li>
        <li>Ask a grown-up about their own CPF!</li>
      </ul>
      <div class="row">${btn('again', 'Play again', 'primary')}${btn('back', 'Back to the start')}</div>
    </div>`, (root) => root.querySelectorAll('[data-feel]').forEach((b) => (b.onclick = () => {
    root.querySelectorAll('[data-feel]').forEach((x) => x.classList.toggle('on', x === b));
  })));
  clearSave();
  if (c === 'again') return startSimple(S.name, S.look, back);
  return back();
}

function careerLabel() {
  const o = sim.careerInfo(S);
  const label = (o && (o.title || o.label)) || S.career;
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

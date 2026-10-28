// Game state and the year-by-year money simulation. No DOM code here.
import * as cpf from './cpf.js';
import * as housing from './housing.js';
import * as invest from './invest.js';
import {
  STATS, HYBRIDS, HYBRID_THRESHOLD, STAGES, STAGE_ORDER, SHOP, LIFESTYLES,
  RETIREMENT_LIFESTYLES, RENT_MONTHLY, EDUCATION, CAREERS, ACTIVITY_BASE, ACTIVITY_BONUS, HOLIDAYS, CAREER_SWITCHES,
} from './data.js';

// Cash you leave untouched for a whole year earns about what a 12-month fixed
// deposit paid in 2026; money you dip into only earns the savings-account base rate.
export const SAVINGS_INTEREST = { untouched: 0.015, base: 0.0005 };
export const DEBT_INTEREST = 0.25; // typical credit card interest (it compounds fast!)
// Debt Consolidation Plan: banks roll card debts into one loan at about 6-8% EIR,
// repaid in fixed instalments over up to 10 years.
export const DCP = { rate: 0.075, years: 10 };

export function newGame(name, look) {
  const s = {
    version: 1,
    name,
    age: STAGES.child.startAge,
    stage: 'child',
    look: { gender: look.gender, tone: look.tone, outfit: look.outfit },
    stats: Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])),
    hybrids: {},
    bank: 20, // your cash: savings you can spend anywhere
    cashLow: 20, // lowest cash balance this year: the untouched part earns more interest
    holdings: [],
    debt: 0, // unsecured debt (credit cards), or a Debt Consolidation Plan when s.dcp is set
    dcp: null,
    // Monthly spending and saving plan, set in the Budget panel (adults and seniors).
    budget: newBudget(),
    holidayPlans: [], // { id, mode: 'once' | 'yearly' | 'times', left }
    trips: [], // { age, id }
    cpf: cpf.newCpfAccounts(),
    cpfWorked: false,
    room: [],
    joy: 0,
    education: null,
    career: null,
    salary: 0,
    lifestyle: 'simple',
    home: null,
    car: false,
    spouse: null,
    children: [],
    eduRefunds: [],
    workMode: 'full',
    retirementTarget: null,
    retirementLifestyle: null,
    life: null,
    shortfallAge: null,
    history: [],
    log: [],
    done: false,
  };
  // MediSave Grant for Newborns, grown with interest from birth to the starting age.
  s.cpf.ma = cpf.MEDISAVE_NEWBORN_GRANT;
  for (let a = 0; a < s.age; a++) cpf.applyYearlyInterest(s.cpf, a);
  record(s);
  return s;
}

export function newBudget() {
  return { hobbies: 0, shopping: 0, cpfSelf: 0, kidsCpf: 0, investAmt: 0, investId: 'world' };
}

export function unlockedStats(s) {
  const reached = STAGE_ORDER.indexOf(s.stage);
  return Object.keys(STATS).filter((k) => STAGE_ORDER.indexOf(STATS[k].stage) <= reached);
}

export function hybridValue(s, id) {
  return Math.min(...HYBRIDS[id].needs.map((k) => s.stats[k]));
}

// Returns the ids of hybrid stats unlocked by this call.
export function checkHybrids(s) {
  const fresh = [];
  for (const [id, h] of Object.entries(HYBRIDS)) {
    if (!s.hybrids[id] && h.needs.every((k) => s.stats[k] >= HYBRID_THRESHOLD)) {
      s.hybrids[id] = true;
      fresh.push(id);
    }
  }
  return fresh;
}

// Points gained from an activity given a mini game score (0..1), plus owned items.
export function activityGains(s, activity, score) {
  const gains = {};
  const points = ACTIVITY_BASE + ACTIVITY_BONUS * score;
  for (const [k, w] of Object.entries(activity.gains)) gains[k] = round1(points * w);
  for (const item of ownedItems(s)) {
    for (const [k, v] of Object.entries(item.perTurn || {})) {
      if (unlockedStats(s).includes(k)) gains[k] = round1((gains[k] || 0) + v);
    }
  }
  return gains;
}

export function applyGains(s, gains) {
  for (const [k, v] of Object.entries(gains)) s.stats[k] = round1(s.stats[k] + v);
}

export function ownedItems(s) {
  const all = Object.values(SHOP).flat();
  return s.room.map((id) => all.find((i) => i.id === id)).filter(Boolean);
}

export function buy(s, item) {
  if (s.bank < item.price || s.room.includes(item.id)) return false;
  spendCash(s, item.price);
  s.room.push(item.id);
  s.joy += item.joy;
  s.log.push(`Age ${s.age}: bought ${item.name} for ${money(item.price)}`);
  return true;
}

// Takes money out of cash. Dipping into savings means that money doesn't earn the
// higher rate for untouched savings this year.
export function spendCash(s, amount) {
  s.bank -= amount;
  s.cashLow = Math.min(s.cashLow ?? s.bank, s.bank);
}

// How much joy a treat or a donation brings, per dollar: a little goes a long way for a kid.
export function joyPerDollar(s) {
  return { child: 1 / 40, teen: 1 / 100, adult: 1 / 1500, senior: 1 / 1500 }[s.stage];
}

export function allocateGift(s, { cash = 0, treat = 0, charity = 0, cpf: toCpf = 0 }) {
  s.bank += cash;
  const joy = Math.min(6, (treat + charity * 1.3) * joyPerDollar(s));
  s.joy += joy;
  if (charity > 0) s.stats.communication += Math.min(2, charity * joyPerDollar(s));
  let refused = 0, matched = 0;
  if (toCpf > 0) {
    const r = topUpCpf(s, toCpf);
    refused = toCpf - r.accepted;
    matched = r.matched;
    s.bank += refused;
  }
  settleDebt(s);
  return { refused, matched };
}

// Anyone can top up: before you work, your parents can top up your SA for you (RSTU).
export function canTopUpCpf(s) {
  return true;
}

export function educationFor(s) {
  if (s.stats.knowledge >= EDUCATION.university.minKnowledge) return 'university';
  if (s.stats.knowledge >= EDUCATION.poly.minKnowledge) return 'poly';
  return 'ite';
}

export function careerOptions(s) {
  return CAREERS.map((c) => ({
    ...c,
    eligible: Object.entries(c.needs).every(([k, v]) => s.stats[k] >= v),
    startPay: Math.round((c.pay * EDUCATION[s.education].pay) / 50) * 50,
  }));
}

export function chooseCareer(s, careerId) {
  const c = careerOptions(s).find((x) => x.id === careerId);
  s.career = c.id;
  s.selfEmployed = !!c.selfEmployed;
  s.salary = c.startPay;
  s.cpfWorked = true;
}

// The job you have now, whether you started in it or switched into it later.
export function careerInfo(s) {
  return CAREERS.find((c) => c.id === s.career) || CAREER_SWITCHES.find((c) => c.id === s.career) || null;
}

// A career switch you've earned with a very high stat, not offered in the last 10 years.
export function careerSwitchOffer(s) {
  if (s.stage !== 'adult' || s.age < 25 || s.age > 60) return null;
  return CAREER_SWITCHES.find((c) => {
    if (c.id === s.career) return false;
    const last = (s.switchOffers || {})[c.id];
    if (last != null && s.age - last < 10) return false;
    const level = c.stat ? s.stats[c.stat] : s.hybrids[c.hybrid] ? hybridValue(s, c.hybrid) : 0;
    return level >= c.min;
  }) || null;
}

export function switchCareer(s, id) {
  const c = CAREER_SWITCHES.find((x) => x.id === id);
  s.career = c.id;
  s.selfEmployed = !!c.selfEmployed;
  s.salary = c.pay;
  s.log.push(`Age ${s.age}: became a ${c.label}`);
}

export function ageStage(age) {
  return STAGE_ORDER.find((k) => age >= STAGES[k].startAge && age < STAGES[k].endAge) || 'senior';
}

export function yearsThisTurn(s) {
  const st = STAGES[s.stage];
  return Math.min(st.yearsPerTurn, st.endAge - s.age);
}

// ---------- the money simulation ----------

// Runs `years` years of life. `opts.jobWage` is a teen's part-time monthly pay.
// Returns a summary of what happened to the money.
export function advanceYears(s, years, opts = {}) {
  const sum = { income: 0, spend: 0, cpfIn: 0, employerIn: 0, interest: 0, investReturn: 0, housingOa: 0, payouts: 0, debtInterest: 0, debtPaid: 0, borrowed: 0, wentWithout: 0, fun: 0, holidays: 0, cpfSaved: 0, kidsCpf: 0, invested: 0 };
  for (let y = 0; y < years; y++) {
    // One-off effects (like months without pay) only hit the first year.
    oneYear(s, sum, y === 0 ? opts : { jobWage: opts.jobWage });
    s.age++;
    record(s);
  }
  return sum;
}

function oneYear(s, sum, opts) {
  const age = s.age;
  const st = STAGES[s.stage];
  const young = s.stage === 'child' || s.stage === 'teen';
  const lifeOn = !!(s.life && age >= s.life.startAge);
  if (lifeOn) {
    const plan = LIFE_PLANS[s.life.plan || 'standard'];
    if (age > s.life.startAge) s.life.monthly *= 1 + plan.rise;
    if (s.cpf.ra > 0) {
      // CPF LIFE starts (or top-ups made after it started raise the payout).
      s.life.monthly += cpf.cpfLifePayout(s.cpf.ra, s.life.startAge) * plan.factor;
      s.life.premium += s.cpf.ra;
      s.cpf.ra = 0;
    }
  }
  const wage = young ? 0 : currentWage(s);
  const jobMonths = young && opts.jobWage && age >= 16 ? 3 : 0; // teen holiday job
  const spendMonthly = young ? 0 : monthlySpend(s) * (opts.costFactor || 1);
  const b = s.budget || newBudget();
  const funMonthly = young ? 0 : (b.hobbies || 0) + (b.shopping || 0);
  const acc = cpf.newInterestAccrual();
  let cash = 0;

  // MediShield Life premiums are deducted from MediSave once a year.
  if (!young) payFromMedisave(s, medishieldPremium(age));

  for (let m = 0; m < 12; m++) {
    // Outflows first: housing loan instalments come out of the OA, then cash.
    let out = spendMonthly + funMonthly;
    sum.fun += funMonthly;
    if (!young) {
      if (s.home) {
        // Loan instalments: from the OA first if you chose that, then cash.
        const paid = housing.payMonth(s.home, s.cpf.oa);
        s.cpf.oa -= paid.fromOa;
        sum.housingOa += paid.fromOa;
        out += paid.fromCash;
      } else if (age >= 30 || s.spouse) {
        out += RENT_MONTHLY * (s.spouse ? 0.5 : 1);
      }
      // Debt Consolidation Plan: a fixed monthly instalment, with interest worked out monthly.
      if (s.dcp && s.debt > 0) {
        const interest = s.debt * (DCP.rate / 12);
        const pay = Math.min(s.dcp.monthly, s.debt + interest);
        s.debt += interest - pay;
        sum.debtInterest += interest;
        sum.debtPaid += pay;
        out += pay;
        if (s.debt < 1) { s.debt = 0; s.dcp = null; s.debtCrisis = false; }
      }
      // CPF Education Scheme: your child repays your OA after graduating.
      for (const r of s.eduRefunds || []) {
        if (age >= r.startAge && r.monthsLeft > 0) {
          s.cpf.oa += r.monthly;
          r.monthsLeft--;
        }
      }
    }
    // Interest is worked out on the month's lowest balance, before new contributions land.
    cpf.accrueMonthlyInterest(s.cpf, age, acc, { lifeStarted: lifeOn });

    let pay = 0;
    const monthWage = young ? (m < jobMonths ? opts.jobWage : 0) : (opts.noPayMonths > m ? 0 : wage);
    if (monthWage > 0) {
      const c = cpf.monthlyContribution(age, monthWage, { selfEmployed: !young && s.selfEmployed });
      pay = monthWage - c.employee;
      cpf.deposit(s.cpf, age, c);
      sum.cpfIn += c.total;
      sum.employerIn += c.employer;
      s.cpfWorked = true;
    }
    if (lifeOn) {
      pay += s.life.monthly;
      sum.payouts += s.life.monthly;
    }
    sum.income += pay;
    sum.spend += out;
    cash += pay - out;
  }
  const interest = cpf.creditInterest(s.cpf, age, acc, { lifeStarted: lifeOn });

  if (young) {
    // Pocket money: half is yours to spend, your parents bank the rest.
    const allowance = st.yearlyAllowance * (opts.allowanceFactor ?? 1);
    sum.income += allowance;
    // Pocket money gets spent through the year, so only what you had at the start stays untouched.
    s.bank += allowance + cash;
  } else if (cash >= 0) {
    s.bank += cash;
  } else {
    coverShortfall(s, -cash, sum);
  }

  if (!young) {
    takeHolidays(s, sum);
    budgetTransfers(s, sum);
    // Hobbies and treats: joy, and hobbies keep you healthy and creative.
    s.joy += Math.min(4, funMonthly * 12 * joyPerDollar(s));
    const h = Math.min(1, ((b.hobbies || 0) * 12) / 3000);
    if (h > 0) {
      s.stats.health = round1(s.stats.health + h);
      s.stats.creativity = round1(s.stats.creativity + h);
    }
  }
  // Children's CPF top-ups grow at the SA rate plus 1% extra interest.
  for (const c of s.children || []) if (c.cpfSa) c.cpfSa *= 1 + cpf.INTEREST.sa + 0.01;

  // Savings interest: the higher rate on what you never touched this year.
  const untouched = Math.max(0, Math.min(s.cashLow ?? 0, s.bank));
  const bankInt = untouched * SAVINGS_INTEREST.untouched + Math.max(0, s.bank - untouched) * SAVINGS_INTEREST.base;
  s.bank += bankInt;
  s.cashLow = s.bank;
  const invRet = invest.yearPassed(s, opts.market);
  sum.interest += interest + bankInt;
  sum.investReturn += invRet;
  // Credit card debt: 25% a year, and any spare cash pays it off first.
  if (s.debt > 0 && !s.dcp) {
    const di = s.debt * DEBT_INTEREST;
    s.debt += di;
    sum.debtInterest += di;
    sum.debtPaid += settleDebt(s);
  }
  // Debt crisis: once card debt passes 12 months of income, banks stop lending and
  // roll it into a Debt Consolidation Plan with fixed instalments.
  if (!young && !s.dcp && s.debt > Math.max(5000, 12 * currentWage(s))) startDcp(s);
  if (s.debt > 0 && s.age >= 55 && !s.shortfallAge) s.shortfallAge = age;

  // Pay rises: faster early in your career.
  const growth = age < 45 ? 0.025 : age < 55 ? 0.005 : 0; // real pay growth, after inflation
  if (s.salary && !young) s.salary = Math.min(15000, s.salary * (1 + growth));
  if (s.spouse) s.spouse.salary *= 1 + growth;
  if (s.home) housing.yearPassed(s.home);
}

export function currentWage(s) {
  if (s.stage === 'adult') return s.salary;
  if (s.stage === 'senior') {
    if (s.age >= 70 || s.workMode === 'retired') return 0;
    return s.workMode === 'part' ? s.salary * 0.5 : s.salary;
  }
  return 0;
}

// Your own monthly spending. With a spouse, you share household costs;
// each child costs the household about $1,200 a month until they are 22.
export function monthlySpend(s) {
  let m;
  if (s.age >= 55 && s.retirementLifestyle) {
    m = RETIREMENT_LIFESTYLES[s.retirementLifestyle].monthly;
  } else {
    const l = LIFESTYLES[s.lifestyle];
    const th = takeHome(s);
    // On a small income a simple or comfortable life costs less; lavish can overspend.
    // (A simple life on a low income leaves room for children and a home loan.)
    const floor = s.lifestyle === 'lavish' ? l.monthly : Math.min(l.monthly, (s.lifestyle === 'simple' ? 0.6 : 0.75) * th);
    m = Math.max(floor, l.share * th);
  }
  if (s.car) m += 1500;
  const share = s.spouse ? 0.5 : 1;
  for (const c of s.children || []) {
    const childAge = s.age - c.bornAge;
    if (childAge < 22) m += CHILD_COST * share;
    // Grown-up children often give their parents a monthly allowance.
    else if (s.age >= 60) m -= CHILD_ALLOWANCE;
  }
  return m;
}

export const CHILD_COST = 1200;

export function takeHome(s) {
  const wage = currentWage(s);
  return wage - cpf.monthlyContribution(s.age, wage, { selfEmployed: s.selfEmployed }).employee;
}
export const CHILD_ALLOWANCE = 200;

export function medishieldPremium(age) {
  if (age <= 40) return 300;
  if (age <= 60) return 700;
  if (age <= 75) return 1300;
  return 1800;
}

// Pays a bill from MediSave first, then cash. Returns how it was split.
export function payFromMedisave(s, amount) {
  const ma = Math.min(amount, s.cpf.ma);
  s.cpf.ma -= ma;
  if (amount > ma) coverShortfall(s, amount - ma);
  return { ma, cash: amount - ma };
}

// Covers a bill from cash, then (from 55) the OA, then a credit card up to your
// credit limit. Past the limit no one will lend, so you go without.
export function coverShortfall(s, amount, sum = null) {
  let left = amount;
  const fromCash = Math.min(Math.max(0, s.bank), left);
  spendCash(s, fromCash);
  left -= fromCash;
  if (left > 0 && s.age >= 55) left -= takeFromOa(s, left);
  if (left <= 0) return;
  const borrow = Math.min(left, creditRoom(s));
  s.debt += borrow;
  left -= borrow;
  if (sum) sum.borrowed += borrow;
  if (left > 0) {
    // Bills you couldn't pay: you cut back hard, and family helps a little.
    s.joy = Math.max(0, s.joy - Math.min(3, left / 5000));
    s.wentWithout = (s.wentWithout || 0) + left;
    if (sum) sum.wentWithout += left;
  }
  if (s.age >= 55 && !s.shortfallAge) s.shortfallAge = s.age;
}

// Unsecured credit limit: banks lend up to 12 months' income (2 months' if you earn
// under $30,000 a year), and nothing more once you're on a debt plan.
export function creditLimit(s) {
  const monthly = currentWage(s);
  if (s.dcp || monthly <= 0) return 0;
  return monthly * (monthly * 12 >= 30000 ? 12 : 2);
}

function creditRoom(s) {
  return Math.max(0, creditLimit(s) - s.debt);
}

export function startDcp(s) {
  s.dcp = { monthly: cpf.monthlyInstalment(s.debt, DCP.rate, DCP.years), startAge: s.age, startDebt: s.debt };
  s.debtCrisis = true;
  s.dcpNew = true;
  if (s.stage === 'adult') s.lifestyle = 'simple';
}

// Pays off debt from cash. Returns the amount paid.
export function repayDebt(s, amount) {
  const pay = Math.min(amount, s.debt, Math.max(0, s.bank));
  if (pay <= 0) return 0;
  spendCash(s, pay);
  s.debt -= pay;
  if (s.debt < 1) {
    s.debt = 0;
    s.dcp = null;
    s.debtCrisis = false;
  } else if (s.dcp) {
    // Paying early shortens nothing here: the instalment is recalculated over the time left.
    const yearsLeft = Math.max(1, DCP.years - (s.age - s.dcp.startAge));
    s.dcp.monthly = cpf.monthlyInstalment(s.debt, DCP.rate, yearsLeft);
  }
  return pay;
}

function takeFromOa(s, amount) {
  const t = Math.min(s.cpf.oa, amount);
  s.cpf.oa -= t;
  return t;
}

function settleDebt(s) {
  if (s.debt <= 0 || s.dcp) return 0;
  return repayDebt(s, s.debt);
}

function scale(c, n) {
  return { oa: c.oa * n, sa: c.sa * n, ma: c.ma * n };
}

// ---------- big decisions ----------

// At 55 the RA is always filled up to the FRS (from SA, then OA).
export function formRA(s) {
  s.retirementTarget = 'FRS';
  return cpf.formRetirementAccount(s.cpf, 'FRS', { ownsHome: !!s.home });
}

// A property whose lease lasts until you're 95 lets you pledge it and keep only the BRS.
export function canPledge(s) {
  return !!s.home && s.home.leaseLeft >= 95 - s.age && s.cpf.ra > cpf.RETIREMENT_SUMS.BRS;
}

// Pledge your property and withdraw the RA savings above the BRS as cash.
export function pledgeToBrs(s) {
  const extra = Math.max(0, s.cpf.ra - cpf.RETIREMENT_SUMS.BRS);
  s.cpf.ra -= extra;
  s.bank += extra;
  s.retirementTarget = 'BRS';
  s.pledged = true;
  return extra;
}

// Move OA savings into the RA, up to the ERS, for bigger CPF LIFE payouts.
export function transferOaToRa(s, amount) {
  const a = Math.max(0, Math.min(amount, s.cpf.oa, topUpRoom(s)));
  s.cpf.oa -= a;
  s.cpf.ra += a;
  if (s.cpf.ra > cpf.RETIREMENT_SUMS.FRS) s.retirementTarget = 'ERS';
  return a;
}

export function withdrawOa(s, amount) {
  const fromOa = Math.min(amount, s.cpf.oa);
  const fromRa = Math.min(amount - fromOa, s.cpf.ra);
  s.cpf.oa -= fromOa;
  s.cpf.ra -= fromRa;
  s.bank += fromOa + fromRa;
  settleDebt(s);
}

// Payouts begin at startAge (65 to 70); the RA keeps earning interest until then.
// Plans: Standard (level payouts), Basic (lower payouts, more left as a bequest),
// Escalating (starts about 20% lower, rises 2% a year).
export const LIFE_PLANS = {
  standard: { label: 'Standard', factor: 1, rise: 0, desc: 'Level monthly payouts for life.' },
  basic: { label: 'Basic', factor: 0.9, rise: 0, desc: 'Lower payouts, but more is left for your loved ones.' },
  escalating: { label: 'Escalating', factor: 0.8, rise: 0.02, desc: 'Starts lower, rises 2% every year to keep up with prices.' },
};

export function startCpfLife(s, startAge, plan = 'standard') {
  s.life = { startAge, plan, monthly: 0, premium: 0 };
  if (startAge <= s.age) {
    s.life.monthly = cpf.cpfLifePayout(s.cpf.ra, startAge) * LIFE_PLANS[plan].factor;
    s.life.premium = s.cpf.ra;
    s.cpf.ra = 0;
  }
}

export function retirementIncome(s) {
  return s.life ? s.life.monthly : 0;
}

export function record(s) {
  const c = s.cpf;
  s.history.push({
    age: s.age,
    cpf: Math.round(cpf.cpfTotal(c)),
    cpfInvested: Math.round(invest.total(s, 'oa') + invest.total(s, 'sa')),
    cash: Math.round(s.bank + invest.total(s, 'cash') - s.debt),
    oa: Math.round(c.oa), sa: Math.round(c.sa), ma: Math.round(c.ma), ra: Math.round(c.ra),
  });
}

export function netWorth(s) {
  return s.bank + invest.total(s) - s.debt + cpf.cpfTotal(s.cpf);
}

export function money(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-SG')}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ---------- family ----------

export function marry(s, weddingCost) {
  const ratio = 0.7 + Math.random() * 0.5;
  // Your spouse is the opposite gender and shares your skin tone.
  s.spouse = {
    salary: Math.max(2500, (s.salary || 3500) * ratio),
    gender: s.look.gender === 'male' ? 'female' : 'male',
    tone: s.look.tone,
    outfit: (s.look.outfit + 2) % 6,
  };
  coverShortfall(s, weddingCost / 2);
  s.log.push(`Age ${s.age}: got married`);
}

// Government support for each new baby (children born from 18 Feb 2025).
export function babySupport(birthOrder) {
  return birthOrder <= 2
    ? { cashGift: 11000, cdaGrant: 5000 }
    : { cashGift: 13000, cdaGrant: 10000 };
}

export function haveChild(s) {
  s.children.push({
    bornAge: s.age,
    gender: Math.random() < 0.5 ? 'male' : 'female',
    tone: s.look.tone,
    outfit: Math.floor(Math.random() * 6),
    uni: null,
  });
  s.joy += 4;
  s.log.push(`Age ${s.age}: welcomed child number ${s.children.length}`);
  return babySupport(s.children.length);
}

export const UNI_FEES = 34000; // about four years of subsidised local university fees

// How a child's university fees are paid. Your share is half if you're married.
// 'oa' uses the CPF Education Scheme: up to 40% of your OA, which your child
// repays (with 2.5% interest) over 12 years, starting a year after graduating.
export function payUniversity(s, child, how) {
  const fees = UNI_FEES * (s.spouse ? 0.5 : 1);
  child.uni = how;
  if (how === 'cash') coverShortfall(s, fees);
  if (how === 'oa') {
    const used = Math.min(fees, s.cpf.oa * 0.4);
    s.cpf.oa -= used;
    coverShortfall(s, fees - used);
    const owed = used * Math.pow(1 + cpf.INTEREST.oa, 5);
    s.eduRefunds.push({ startAge: s.age + 5, monthsLeft: 144, monthly: cpf.monthlyInstalment(owed, cpf.INTEREST.oa, 12) });
    return { used, cash: fees - used };
  }
  return { used: 0, cash: how === 'cash' ? fees : 0 };
}

// ---------- housing ----------

export function grossIncome(s) {
  const own = s.stage === 'adult' || s.stage === 'senior' ? currentWage(s) : 0;
  return own + (s.spouse ? s.spouse.salary : 0);
}

export function otherDebt(s) {
  return s.car ? 900 : 0; // car loan instalment counts towards the TDSR
}

export function homeQuotes(s) {
  const share = s.spouse ? 0.5 : 1;
  return housing.HOMES
    .filter((h) => (s.spouse ? h.id !== 'flexi2' : h.kind === 'private' || (s.age >= 35 && h.singles)))
    .map((h) => housing.quote(h, {
      share,
      grossIncome: Math.max(1, grossIncome(s)),
      otherDebt: otherDebt(s),
      oa: s.cpf.oa,
      cash: s.bank,
    }));
}

export function buyHome(s, id) {
  const q = homeQuotes(s).find((x) => x.id === id);
  s.cpf.oa -= q.fromOa;
  coverShortfall(s, q.fromCash);
  s.home = housing.newHome(q, s.age);
  s.joy += q.joy;
  s.log.push(`Age ${s.age}: bought a ${q.label}`);
  return q;
}

// Sells the current home. CPF refunds go back to the OA (or to the RA from 55).
export function sellHome(s) {
  const b = housing.saleBreakdown(s.home);
  housing.creditHousingRefund(s.cpf, s.age, b.refund);
  s.bank += b.cash;
  s.log.push(`Age ${s.age}: sold the ${s.home.label}`);
  s.home = null;
  return b;
}

export function voluntaryHousingRefund(s, amount) {
  const a = Math.min(amount, s.bank, s.home ? housing.cpfToRefund(s.home) : 0);
  if (a <= 0) return 0;
  housing.voluntaryRefund(s.home, a);
  spendCash(s, a);
  housing.creditHousingRefund(s.cpf, s.age, a);
  return a;
}

// Savings already in CPF LIFE count towards the retirement sum.
export function retirementSavings(s) {
  return s.cpf.ra + (s.life ? s.life.premium : 0);
}

export function leaseBuyback(s) {
  const q = housing.lbsQuote(s.home, s.age, retirementSavings(s));
  s.cpf.ra += q.topUp;
  s.bank += q.cash;
  s.home.leaseLeft = q.keep;
  s.home.lbsDone = true;
  s.home.lbsAge = s.age;
  return q;
}

// ---------- budget, holidays and status ----------

// What you're doing for a living, in words.
export function workStatus(s) {
  if (s.stage === 'child') return 'At school';
  if (s.stage === 'teen') return s.age >= 17 ? 'Studying' : 'At school';
  if (s.stage === 'adult') return s.selfEmployed ? 'Running your own business' : 'Working full-time';
  if (s.age >= 70 || s.workMode === 'retired') return 'Retired';
  return s.workMode === 'part' ? 'Working part-time' : 'Working full-time';
}

export const isWorking = (s) => currentWage(s) > 0;

// Who goes on a family holiday: you, your spouse, and children under 21.
export function travellers(s) {
  return 1 + (s.spouse ? 1 : 0) + (s.children || []).filter((c) => s.age - c.bornAge < 21).length;
}

// Your share of one trip. Couples split household costs.
export function holidayCost(s, id) {
  const h = HOLIDAYS.find((x) => x.id === id);
  return h.cost * travellers(s) * (s.spouse ? 0.5 : 1);
}

// Average monthly cost of your holiday plans over the next year.
export function holidayMonthly(s) {
  return (s.holidayPlans || []).reduce((t, p) => t + holidayCost(s, p.id), 0) / 12;
}

function takeHolidays(s, sum) {
  for (const p of s.holidayPlans || []) {
    const h = HOLIDAYS.find((x) => x.id === p.id);
    const cost = holidayCost(s, p.id);
    coverShortfall(s, cost, sum);
    sum.holidays += cost;
    // The first few visits to a place are the most memorable.
    const visits = (s.trips || []).filter((t) => t.id === p.id).length;
    s.joy += h.joy * (visits >= 3 ? 0.5 : 1);
    (s.trips ||= []).push({ age: s.age, id: p.id });
    if (p.mode !== 'yearly') p.left--;
  }
  s.holidayPlans = (s.holidayPlans || []).filter((p) => p.mode === 'yearly' || p.left > 0);
}

// Planned saving each year, only from cash you actually have (never borrowed).
function budgetTransfers(s, sum) {
  const b = s.budget || newBudget();
  const take = (want) => {
    const a = Math.max(0, Math.min(want, s.bank));
    return a;
  };
  if (b.cpfSelf > 0) {
    const a = take(Math.min(b.cpfSelf * 12, topUpRoom(s)));
    if (a > 0) {
      spendCash(s, a);
      const r = topUpCpf(s, a);
      s.bank += a - r.accepted;
      sum.cpfSaved += r.accepted;
    }
  }
  const kids = (s.children || []).filter((c) => s.age - c.bornAge < 21);
  if (b.kidsCpf > 0 && kids.length) {
    for (const c of kids) {
      // Your share: couples split it.
      const a = take(b.kidsCpf * 12);
      if (a <= 0) break;
      spendCash(s, a);
      c.cpfSa = (c.cpfSa || 0) + a / (s.spouse ? 0.5 : 1);
      c.cpfGiven = (c.cpfGiven || 0) + a;
      sum.kidsCpf += a;
    }
  }
  if (b.investAmt > 0) {
    const a = take(b.investAmt * 12);
    if (a > 0) {
      sum.invested += invest.buy(s, b.investId || 'world', 'cash', a);
      s.cashLow = Math.min(s.cashLow ?? s.bank, s.bank);
    }
  }
}

// Lease Buyback Scheme checks (HDB rules, 2026). Returns { ok, reasons, keep }.
export function lbsCheck(s) {
  const h = s.home;
  const reasons = [];
  if (!h) return { ok: false, reasons: ['You don\'t own a home.'] };
  const keep = s.age >= 80 ? 15 : s.age >= 75 ? 20 : s.age >= 70 ? 25 : 30;
  if (h.kind !== 'hdb') reasons.push('LBS is only for HDB flats. Private property owners can rent out or sell instead.');
  if (s.age < 65) reasons.push(`All owners must be at least 65 (you are ${s.age}).`);
  if (h.lbsDone) reasons.push(`You already sold part of this flat's lease to HDB at ${h.lbsAge ?? 'an earlier age'}. The ${h.leaseLeft} years you kept are what's left to live in, so there is nothing more to sell.`);
  else if (h.leaseLeft - keep < 20) reasons.push(`At your age you must keep ${keep} years of lease, and at least 20 years must be left to sell to HDB. Your flat has ${h.leaseLeft} years left, so only ${Math.max(0, h.leaseLeft - keep)} could be sold.`);
  if (s.age - (h.boughtAge ?? s.age) < 5) reasons.push('You must have lived in the flat for at least 5 years.');
  if (grossIncome(s) > 14000) reasons.push(`Gross household income must be $14,000 a month or less (yours is ${money(grossIncome(s))}).`);
  return { ok: reasons.length === 0, reasons, keep };
}

// ---------- CPF top-ups ----------

// Only the first $8,000 of cash top-ups to your own SA/RA each year gets income tax relief.
export const TOP_UP_TAX_RELIEF_CAP = 8000;

// Compulsory contributions plus Voluntary Contributions in a year can't go above this.
export const CPF_ANNUAL_LIMIT = 37740;

export function topUpsThisYear(s) {
  return s.topUps && s.topUps.age === s.age ? s.topUps.amount : 0;
}

// How much more cash you can top up: the SA up to the FRS before 55, the RA up to the ERS after.
export function topUpRoom(s) {
  return cpf.topUpRoom(s.cpf, s.age, s.life ? s.life.premium : 0);
}

// Roughly how much more CPF LIFE pays each month for an extra RA top-up today.
export function lifePayoutGain(s, amount) {
  if (s.age < 55 || amount <= 0) return 0;
  const plan = LIFE_PLANS[(s.life && s.life.plan) || 'standard'];
  if (s.life && s.age >= s.life.startAge) return cpf.cpfLifePayout(amount, s.life.startAge) * plan.factor;
  const start = s.life ? s.life.startAge : 65;
  return cpf.cpfLifePayout(amount * Math.pow(1 + cpf.INTEREST.ra, start - s.age), start) * plan.factor;
}

// Cash top-up. From 55, if your RA is below the BRS, the Matched Retirement
// Savings Scheme matches it dollar for dollar, up to $2,000 a year.
export function topUpCpf(s, amount) {
  const accepted = cpf.cashTopUp(s.cpf, s.age, amount, s.life ? s.life.premium : 0);
  const before = topUpsThisYear(s);
  s.topUps = { age: s.age, amount: before + accepted };
  let matched = 0;
  if (s.age >= 55 && accepted > 0 && s.cpf.ra - accepted < cpf.RETIREMENT_SUMS.BRS) {
    const usedThisYear = s.mrss && s.mrss.age === s.age ? s.mrss.amount : 0;
    const room = Math.min(2000 - usedThisYear, 20000 - (s.mrssTotal || 0));
    matched = Math.max(0, Math.min(accepted, room, cpf.RETIREMENT_SUMS.BRS - (s.cpf.ra - accepted)));
    s.cpf.ra += matched;
    s.mrss = { age: s.age, amount: usedThisYear + matched };
    s.mrssTotal = (s.mrssTotal || 0) + matched;
  }
  return { accepted, matched };
}

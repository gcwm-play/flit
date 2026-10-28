// Game state and the year-by-year money simulation. No DOM code here.
import * as cpf from './cpf.js';
import * as housing from './housing.js';
import {
  STATS, HYBRIDS, HYBRID_THRESHOLD, STAGES, STAGE_ORDER, SHOP, LIFESTYLES,
  RETIREMENT_LIFESTYLES, RENT_MONTHLY, EDUCATION, CAREERS, ACTIVITY_BASE, ACTIVITY_BONUS,
} from './data.js';

export const BANK_INTEREST = 0.005;
export const DEBT_INTEREST = 0.25; // typical credit card interest (it compounds fast!)
export const DCP_INTEREST = 0.08; // after a debt crisis: a Debt Consolidation Plan at a lower rate
export const INVEST_RETURN = 0.05; // long-run average for a diversified fund (not guaranteed!)

export function newGame(name, look) {
  const s = {
    version: 1,
    name,
    age: STAGES.child.startAge,
    stage: 'child',
    look: { gender: look.gender, tone: look.tone, outfit: look.outfit },
    stats: Object.fromEntries(Object.keys(STATS).map((k) => [k, 0])),
    hybrids: {},
    wallet: 20,
    bank: 0,
    invest: 0,
    debt: 0,
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
  if (s.wallet < item.price || s.room.includes(item.id)) return false;
  s.wallet -= item.price;
  s.room.push(item.id);
  s.joy += item.joy;
  s.log.push(`Age ${s.age}: bought ${item.name} for ${money(item.price)}`);
  return true;
}

// Moves money from the bank to the spending fund (or back with a negative amount).
export function transfer(s, amount) {
  const a = amount > 0 ? Math.min(amount, s.bank) : -Math.min(-amount, s.wallet);
  s.bank -= a;
  s.wallet += a;
}

export function allocateGift(s, { wallet = 0, bank = 0, invest = 0, cpf: toCpf = 0 }) {
  s.wallet += wallet;
  s.bank += bank;
  s.invest += invest;
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

export function canTopUpCpf(s) {
  return s.cpfWorked;
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
  const sum = { income: 0, spend: 0, cpfIn: 0, employerIn: 0, interest: 0, investReturn: 0, housingOa: 0, payouts: 0, debtInterest: 0 };
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
  const acc = cpf.newInterestAccrual();
  let cash = 0;

  // MediShield Life premiums are deducted from MediSave once a year.
  if (!young) payFromMedisave(s, medishieldPremium(age));

  for (let m = 0; m < 12; m++) {
    // Outflows first: housing loan instalments come out of the OA, then cash.
    let out = spendMonthly;
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
    s.wallet += allowance / 2 + cash / 2;
    s.bank += allowance / 2 + cash / 2;
  } else if (cash >= 0) {
    s.bank += cash;
  } else {
    coverShortfall(s, -cash);
  }

  // Bank interest, investment returns and debt interest.
  const bankInt = s.bank * BANK_INTEREST;
  s.bank += bankInt;
  const invRet = s.invest * (opts.investReturn ?? INVEST_RETURN);
  s.invest = Math.max(0, s.invest + invRet);
  sum.interest += interest + bankInt;
  sum.investReturn += invRet;
  if (s.debt > 0) {
    const di = s.debt * (s.debtCrisis ? DCP_INTEREST : DEBT_INTEREST);
    s.debt += di;
    sum.debtInterest += di;
  }
  settleDebt(s);
  // Debt crisis: once debt passes a year of take-home pay, the bank stops lending.
  // You cut back to a simple lifestyle and start paying it down.
  if (!young && s.debt > Math.max(20000, 12 * takeHome(s)) && s.lifestyle !== 'simple') {
    s.lifestyle = 'simple';
    s.debtCrisis = true;
  }
  if (s.debt > 0 && s.age >= 55 && !s.shortfallAge) s.shortfallAge = age;

  // Pay rises: faster early in your career.
  const growth = age < 45 ? 0.025 : age < 55 ? 0.005 : 0; // real pay growth, after inflation
  if (s.salary && !young) s.salary = Math.min(15000, s.salary * (1 + growth));
  if (s.spouse) s.spouse.salary *= 1 + growth;
  if (s.home) housing.yearPassed(s.home);
}

function currentWage(s) {
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
    const floor = s.lifestyle === 'lavish' ? l.monthly : Math.min(l.monthly, 0.8 * th);
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

// Covers a bill from the spending fund, then the bank, then (from 55) the OA, then debt.
export function coverShortfall(s, amount) {
  let left = amount;
  for (const take of [
    () => takeFrom(s, 'wallet', left),
    () => takeFrom(s, 'bank', left),
    () => (s.age >= 55 ? takeFromOa(s, left) : 0),
  ]) {
    left -= take();
    if (left <= 0) return;
  }
  s.debt += left;
  if (s.age >= 55 && !s.shortfallAge) s.shortfallAge = s.age;
}

function takeFrom(s, key, amount) {
  const t = Math.min(Math.max(0, s[key]), amount);
  s[key] -= t;
  return t;
}

function takeFromOa(s, amount) {
  const t = Math.min(s.cpf.oa, amount);
  s.cpf.oa -= t;
  return t;
}

function settleDebt(s) {
  if (s.debt <= 0) return;
  const pay = Math.min(s.debt, Math.max(0, s.bank));
  s.bank -= pay;
  s.debt -= pay;
}

function scale(c, n) {
  return { oa: c.oa * n, sa: c.sa * n, ma: c.ma * n };
}

// ---------- big decisions ----------

export function formRA(s, target) {
  s.retirementTarget = target;
  return cpf.formRetirementAccount(s.cpf, target, { ownsHome: !!s.home });
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
    cash: Math.round(s.bank + s.wallet + s.invest - s.debt),
    oa: Math.round(c.oa), sa: Math.round(c.sa), ma: Math.round(c.ma), ra: Math.round(c.ra),
  });
}

export function netWorth(s) {
  return s.wallet + s.bank + s.invest - s.debt + cpf.cpfTotal(s.cpf);
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
      cash: s.bank + s.wallet,
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
  s.bank -= a;
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
  return q;
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
  return cpf.topUpRoom(s.cpf, s.age);
}

// Cash top-up. From 55, if your RA is below the BRS, the Matched Retirement
// Savings Scheme matches it dollar for dollar, up to $2,000 a year.
export function topUpCpf(s, amount) {
  const accepted = cpf.cashTopUp(s.cpf, s.age, amount);
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

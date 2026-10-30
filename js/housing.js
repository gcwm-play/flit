// Housing rules: buying with cash and CPF, loan limits (MSR / TDSR), stamp duty,
// selling with the CPF refund, Voluntary Housing Refund, Lease Buyback Scheme
// and Silver Housing Bonus. No DOM code here.
import * as cpf from './cpf.js';

export const MSR = 0.3; // HDB Mortgage Servicing Ratio: HDB flats, % of gross monthly income
export const TDSR = 0.55; // MAS Total Debt Servicing Ratio: all property loans
export const TDSR_STRESS_RATE = 0.04; // banks test TDSR at a 4% medium-term rate
export const BANK_LOAN_RATE = 0.03;
export const HDB_LOAN_FLOOR = 0.03; // HDB works out how much it can lend at 3%, not the 2.6% you pay (from Sep 2022)
export const CPF_HOUSING_INTEREST = 0.025; // accrued interest on CPF used for housing

// Prices in today's dollars. Leases are 99 years; resale flats come with some used up.
export const HOMES = [
  // BTO prices are the middle of HDB's ranges for Standard projects (June 2026 launch).
  { id: 'flexi2', label: '2-room Flexi BTO', price: 180000, kind: 'hdb', rooms: 2, leaseUsed: 0, joy: 1, singles: true },
  { id: 'bto3', label: '3-room BTO flat', price: 300000, kind: 'hdb', rooms: 3, leaseUsed: 0, joy: 2 },
  { id: 'bto4', label: '4-room BTO flat', price: 390000, kind: 'hdb', rooms: 4, leaseUsed: 0, joy: 3, singles: false },
  { id: 'resale5', label: '5-room resale flat', price: 720000, kind: 'hdb', rooms: 5, leaseUsed: 25, joy: 4, singles: true },
  { id: 'condo', label: 'Condominium', price: 1600000, kind: 'private', rooms: 4, leaseUsed: 0, joy: 5, singles: true },
];

// Buyer's Stamp Duty for residential property (can be paid with CPF OA).
export function buyersStampDuty(price) {
  const tiers = [[180000, 0.01], [180000, 0.02], [640000, 0.03], [500000, 0.04], [1500000, 0.05], [Infinity, 0.06]];
  let left = price, duty = 0;
  for (const [band, rate] of tiers) {
    const part = Math.min(left, band);
    duty += part * rate;
    left -= part;
    if (left <= 0) break;
  }
  return duty;
}

// Loan terms you can pick, in 5-year steps. HDB loans run up to 25 years; a bank loan
// for an HDB flat can run to 30 (MAS limit), but then lends only 55% of the price.
export const LOAN_TERMS = [5, 10, 15, 20, 25, 30];

// Which loan a term means, and how much it lends (MAS loan-to-value limits for a first loan):
// 75% normally; 55% if the term is over 25 years for an HDB flat (30 for private) or runs past age 65.
export function loanFor(home, years, age = 30) {
  const hdb = home.kind === 'hdb';
  if (hdb && years <= 25) return { type: 'HDB loan', rate: cpf.HDB_LOAN_RATE, ltv: 0.75, minCashPct: 0 };
  const long = years > (hdb ? 25 : 30) || age + years > 65;
  return { type: 'Bank loan', rate: BANK_LOAN_RATE, ltv: long ? 0.55 : 0.75, minCashPct: long ? 0.1 : 0.05 };
}

// ---------- CPF housing grants for first-timers ----------

// Enhanced CPF Housing Grant (EHG) for couples and families, by average monthly
// household income (HDB, from August 2024). For BTO and resale flats.
const EHG = [[1500, 120000], [2000, 110000], [2500, 105000], [3000, 95000], [3500, 90000], [4000, 80000], [4500, 70000],
  [5000, 65000], [5500, 55000], [6000, 50000], [6500, 40000], [7000, 30000], [7500, 25000], [8000, 20000], [8500, 10000], [9000, 5000]];
// Singles get half, with income bands half as wide.
export function ehg(income, single = false) {
  const band = EHG.find(([max]) => (single ? income * 2 : income) <= max);
  return band ? band[1] / (single ? 2 : 1) : 0;
}
// Resale flats also get the CPF Housing Grant: $80,000 for couples ($50,000 for 5-room or
// bigger); singles get the Singles Grant of $40,000 ($25,000 for 5-room or bigger).
export function resaleGrant(home, single = false) {
  const big = home.rooms >= 5;
  return single ? (big ? 25000 : 40000) : big ? 50000 : 80000;
}
export function grantsFor(home, income, single = false) {
  if (home.kind !== 'hdb') return { ehg: 0, resale: 0, total: 0 };
  const e = ehg(income, single);
  const r = home.leaseUsed > 0 ? resaleGrant(home, single) : 0;
  return { ehg: e, resale: r, total: e + r };
}

// The most a monthly payment can repay over `years` at `rate`.
const maxLoan = (monthly, rate, years) => Math.max(0, monthly / cpf.monthlyInstalment(1, rate, years));

// What a home costs this household. `share` is the player's part (0.5 with a working spouse).
// `grant` is the household's CPF housing grants. Loan limits don't block a purchase: they cap
// the loan, and you pay the rest upfront.
// `years` 0 means no loan: you pay the whole price upfront from your OA and cash.
// `payFrom` 'cash' uses your cash first for the upfront part and keeps your CPF for retirement.
export function quote(home, { share, grossIncome, otherDebt = 0, oa, cash, years = 25, age = 30, grant = 0, payFrom = 'oa' }) {
  const hdb = home.kind === 'hdb';
  years = hdb ? Math.min(years, 30) : years;
  const terms = years > 0 ? loanFor(home, years, age) : { type: 'No loan', rate: 0, ltv: 0, minCashPct: 0 };
  const rate = terms.rate;
  const full = home.price;
  grant = Math.min(grant, full);
  // The loan, worked out for the whole household: up to the LTV limit, and no more than
  // a repayment of 30% of income (MSR, HDB flats) and 55% for all debts (TDSR), tested at
  // 3% for HDB loans and 4% for bank loans.
  const floor = terms.type === 'HDB loan' ? HDB_LOAN_FLOOR : TDSR_STRESS_RATE;
  const byLtv = Math.min(full * terms.ltv, full - grant);
  const byMsr = !years ? 0 : hdb ? maxLoan(MSR * grossIncome, floor, years) : Infinity;
  const byTdsr = !years ? 0 : maxLoan(TDSR * grossIncome - otherDebt, floor, years);
  const fullLoan = Math.min(byLtv, byMsr, byTdsr);
  const cappedBy = !years || fullLoan >= byLtv - 1 ? null : byMsr <= byTdsr ? 'MSR' : 'TDSR';
  const price = full * share;
  const loan = fullLoan * share;
  const myGrant = grant * share;
  const down = price - myGrant - loan;
  const minCash = price * terms.minCashPct; // bank loans need part of the down payment in cash
  const bsd = buyersStampDuty(full) * share;
  const instalment = years ? cpf.monthlyInstalment(loan, rate, years) : 0;
  const upfront = down + bsd;
  let fromOa, fromCash;
  if (payFrom === 'cash') {
    fromCash = Math.max(minCash, Math.min(Math.max(0, cash), upfront));
    fromOa = Math.min(oa, upfront - fromCash);
    fromCash = upfront - fromOa;
  } else {
    fromOa = Math.min(oa, Math.max(0, upfront - minCash));
    fromCash = upfront - fromOa;
  }
  return {
    ...home, share, price, grant: myGrant, loan, ltv: terms.ltv, loanType: terms.type, down, bsd, rate, years, instalment,
    maxLtvLoan: byLtv * share, cappedBy, fromOa, fromCash, minCash, affordable: fromCash <= cash,
    msrPct: instalment / share / grossIncome, tdsrPct: years ? (cpf.monthlyInstalment(fullLoan, floor, years) + otherDebt) / grossIncome : 0,
  };
}

export function newHome(q, age) {
  return {
    id: q.id, label: q.label, kind: q.kind, rooms: q.rooms, joy: q.joy,
    price: q.price, // the player's share of the price
    share: q.share,
    boughtAge: age,
    leaseLeft: 99 - q.leaseUsed,
    loanBalance: q.loan,
    rate: q.rate,
    instalment: q.instalment,
    years: q.years,
    loanType: q.loanType,
    payWith: 'oa', // 'oa' if any of the instalment comes from CPF, 'cash' if none
    oaShare: 1, // how much of each instalment comes from your OA (the rest in cash)
    cpfPrincipal: q.fromOa + (q.grant || 0), // CPF used so far (grants count too), refunded to your OA when you sell
    cpfAccrued: 0,
    lbsDone: false,
  };
}

// One month of owning a home. Returns { fromOa, fromCash, oaShort }: oaShort is
// the part you wanted to pay from your OA but couldn't, because it ran out.
export function payMonth(home, oaBalance) {
  // Accrued interest: what your CPF would have earned had you not used it.
  home.cpfAccrued += (home.cpfPrincipal + home.cpfAccrued) * (CPF_HOUSING_INTEREST / 12);
  if (home.loanBalance <= 0.01) return { fromOa: 0, fromCash: 0 };
  const interest = home.loanBalance * (home.rate / 12);
  const due = Math.min(home.instalment, home.loanBalance + interest);
  home.loanBalance = home.loanBalance + interest - due;
  const want = due * oaShareOf(home);
  const fromOa = Math.min(want, Math.max(0, oaBalance));
  home.cpfPrincipal += fromOa;
  return { fromOa, fromCash: due - fromOa, oaShort: want - fromOa };
}

// Months of instalments left on the loan.
export function monthsLeft(home) {
  if (home.loanBalance <= 0.01) return 0;
  const r = home.rate / 12;
  const n = -Math.log(1 - (home.loanBalance * r) / home.instalment) / Math.log(1 + r);
  return Number.isFinite(n) ? Math.ceil(n) : (home.years || 25) * 12;
}

export const oaShareOf = (home) => home.oaShare ?? (home.payWith === 'oa' ? 1 : 0);
export function setOaShare(home, share) {
  home.oaShare = Math.max(0, Math.min(1, share));
  home.payWith = home.oaShare > 0 ? 'oa' : 'cash';
}

export function yearPassed(home) {
  home.leaseLeft = Math.max(0, home.leaseLeft - 1);
}

// Today's-dollar value of the player's share. HDB values fall as the lease runs down.
export function value(home) {
  if (home.kind !== 'hdb') return home.price;
  const start = HOMES.find((h) => h.id === home.id);
  const leaseAtPurchase = 99 - (start ? start.leaseUsed : 0);
  return home.price * (leaseFactor(home.leaseLeft) / leaseFactor(leaseAtPurchase));
}

// Roughly follows the shape of the Bala's table used to value leases: values
// hold up while the lease is long and fall faster as it runs out.
function leaseFactor(years) {
  return 1 - Math.pow(1 - years / 99, 2);
}

export function cpfToRefund(home) {
  return home.cpfPrincipal + home.cpfAccrued;
}

// Selling: pay off the loan, refund CPF (principal + accrued interest) to the OA
// up to the sale proceeds, and the rest is cash.
export function saleBreakdown(home) {
  const sale = value(home);
  const afterLoan = Math.max(0, sale - home.loanBalance);
  const refund = Math.min(afterLoan, cpfToRefund(home));
  // If the sale doesn't cover it all, the shortfall doesn't have to be topped up in cash.
  const principal = Math.min(refund, home.cpfPrincipal);
  return { sale, loan: home.loanBalance, refund, principal, accrued: refund - principal, owed: cpfToRefund(home), cash: afterLoan - refund };
}

// Refunds to CPF from age 55 go to the RA first, up to the Full Retirement Sum.
export function creditHousingRefund(acc, age, amount) {
  if (age >= 55) {
    const toRa = Math.min(amount, Math.max(0, cpf.RETIREMENT_SUMS.FRS - acc.ra));
    acc.ra += toRa;
    acc.oa += amount - toRa;
  } else {
    acc.oa += amount;
  }
}

// Voluntary Housing Refund: put cash back into CPF to rebuild retirement savings.
// It reduces the amount you will have to refund when you sell.
export function voluntaryRefund(home, amount) {
  const a = Math.min(amount, cpfToRefund(home));
  const fromAccrued = Math.min(a, home.cpfAccrued);
  home.cpfAccrued -= fromAccrued;
  home.cpfPrincipal -= a - fromAccrued;
  return a;
}

// Lease Buyback Scheme (65+, HDB, loan paid off): sell the tail of the lease to
// HDB, keep living there. Proceeds top up the RA (single owner: up to the FRS),
// then a bonus is paid, and up to $100,000 can be kept in cash.
export const LBS_BONUS = { 2: [30000, 2], 3: [30000, 2], 4: [15000, 4], 5: [7500, 8] };

export function lbsQuote(home, age, ra) {
  const keep = age >= 80 ? 15 : age >= 75 ? 20 : age >= 70 ? 25 : 30;
  const sell = Math.max(0, home.leaseLeft - keep);
  // The far end of a lease is worth less than the near end.
  const proceeds = value(home) * (sell / home.leaseLeft) * 0.6;
  const frs = age >= 80 ? 200400 : age >= 70 ? 210400 : 220400; // age-adjusted FRS, 2026
  const target = home.share < 1 ? frs / 2 : frs;
  const topUp = Math.min(proceeds, Math.max(0, target - ra));
  const [maxBonus, ratio] = LBS_BONUS[Math.min(5, home.rooms)];
  const bonus = Math.min(maxBonus, topUp / ratio);
  const cash = Math.min(100000, proceeds - topUp);
  const extraToRa = proceeds - topUp - cash; // anything above $100k cash also goes to the RA
  return { keep, sell, proceeds, topUp: topUp + extraToRa, bonus, cash: cash + bonus };
}

// Silver Housing Bonus (55+): sell and move to a 3-room or smaller flat, put up
// to $60,000 of the net proceeds into your RA and get $1 cash for every $2.
export function silverHousingBonus(netProceeds) {
  const topUp = Math.min(60000, netProceeds);
  return { topUp, bonus: Math.min(30000, topUp / 2) };
}

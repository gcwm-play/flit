// Housing rules: buying with cash and CPF, loan limits (MSR / TDSR), stamp duty,
// selling with the CPF refund, Voluntary Housing Refund, Lease Buyback Scheme
// and Silver Housing Bonus. No DOM code here.
import * as cpf from './cpf.js';

export const MSR = 0.3; // HDB Mortgage Servicing Ratio: HDB flats, % of gross monthly income
export const TDSR = 0.55; // MAS Total Debt Servicing Ratio: all property loans
export const TDSR_STRESS_RATE = 0.04; // banks test TDSR at a 4% medium-term rate
export const BANK_LOAN_RATE = 0.03;
export const CPF_HOUSING_INTEREST = 0.025; // accrued interest on CPF used for housing

// Prices in today's dollars. Leases are 99 years; resale flats come with some used up.
export const HOMES = [
  { id: 'flexi2', label: '2-room Flexi BTO', price: 200000, kind: 'hdb', rooms: 2, leaseUsed: 0, joy: 1, singles: true },
  { id: 'bto3', label: '3-room BTO flat', price: 320000, kind: 'hdb', rooms: 3, leaseUsed: 0, joy: 2 },
  { id: 'bto4', label: '4-room BTO flat', price: 480000, kind: 'hdb', rooms: 4, leaseUsed: 0, joy: 3, singles: false },
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

// What a home costs this household. `share` is the player's part (0.5 with a working spouse).
export function quote(home, { share, grossIncome, otherDebt = 0, oa, cash, years = 25, age = 30 }) {
  const price = home.price * share;
  const hdb = home.kind === 'hdb';
  years = hdb ? Math.min(years, 30) : years;
  const terms = loanFor(home, years, age);
  const loan = price * terms.ltv;
  const down = price - loan;
  const minCash = price * terms.minCashPct; // bank loans need part of the down payment in cash
  const bsd = buyersStampDuty(home.price) * share;
  const rate = terms.rate;
  const instalment = cpf.monthlyInstalment(loan, rate, years);
  // Loan limits use the whole household's income and the whole loan.
  const fullInstalment = instalment / share;
  const stressInstalment = cpf.monthlyInstalment(loan / share, hdb ? rate : TDSR_STRESS_RATE, years);
  const msrOk = !hdb || fullInstalment <= MSR * grossIncome;
  const tdsrOk = stressInstalment + otherDebt <= TDSR * grossIncome;
  const upfront = down + bsd;
  const fromOa = Math.min(oa, upfront - minCash);
  const fromCash = upfront - fromOa;
  return {
    ...home, share, price, loan, ltv: terms.ltv, loanType: terms.type, down, bsd, rate, years, instalment, fullInstalment, stressInstalment,
    msrOk, tdsrOk, fromOa, fromCash, minCash, affordable: msrOk && tdsrOk && fromCash <= cash,
    msrPct: fullInstalment / grossIncome, tdsrPct: (stressInstalment + otherDebt) / grossIncome,
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
    cpfPrincipal: q.fromOa, // CPF used so far, refunded to your OA when you sell
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

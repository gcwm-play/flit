// CPF rules used by the game.
// Figures are the 2026 rates published by the CPF Board (cpf.gov.sg).
// They change every year, so re-check this file each January.
// All game money is in today's dollars: we do not model inflation.

export const ORDINARY_WAGE_CEILING = 8000; // monthly, from 1 Jan 2026

// Cohort turning 55 in 2026.
export const RETIREMENT_SUMS = {
  BRS: 110200, // Basic Retirement Sum (needs a property pledge to stop here)
  FRS: 220400, // Full Retirement Sum
  ERS: 440800, // Enhanced Retirement Sum
};

// CPF Board estimates of CPF LIFE Standard Plan payouts from 65 for each sum.
export const LIFE_PAYOUT_ESTIMATES = { BRS: 950, FRS: 1780, ERS: 3440 };

export const BASIC_HEALTHCARE_SUM = 79000; // MediSave cap for 2026

export const MEDISAVE_NEWBORN_GRANT = 4000;

export const INTEREST = { oa: 0.025, sa: 0.04, ma: 0.04, ra: 0.04 };

// Contribution and allocation rates from 1 Jan 2026, as % of monthly wage.
// maxAge is inclusive ("35 and below", "above 35 to 45", ...).
export const RATE_TABLE = [
  { maxAge: 35, employer: 17, employee: 20, oa: 23, sa: 6, ma: 8 },
  { maxAge: 45, employer: 17, employee: 20, oa: 21, sa: 7, ma: 9 },
  { maxAge: 50, employer: 17, employee: 20, oa: 19, sa: 8, ma: 10 },
  { maxAge: 55, employer: 17, employee: 20, oa: 15, sa: 11.5, ma: 10.5 },
  // Above 55 the Special Account is closed: the "sa" share goes to the RA.
  { maxAge: 60, employer: 16, employee: 18, oa: 12, sa: 11.5, ma: 10.5 },
  { maxAge: 65, employer: 12.5, employee: 12.5, oa: 3.5, sa: 11, ma: 10.5 },
  { maxAge: 70, employer: 9, employee: 7.5, oa: 1, sa: 5, ma: 10.5 },
  { maxAge: Infinity, employer: 7.5, employee: 5, oa: 1, sa: 1, ma: 10.5 },
];

export function rateBand(age) {
  return RATE_TABLE.find((r) => age <= r.maxAge);
}

export function newCpfAccounts() {
  return { oa: 0, sa: 0, ma: 0, ra: 0 };
}

export function cpfTotal(cpf) {
  return cpf.oa + cpf.sa + cpf.ma + cpf.ra;
}

// Monthly CPF contribution for an employee (or MediSave-only for the self-employed).
// Returns { employer, employee, total, oa, sa, ma } in dollars per month.
export function monthlyContribution(age, wage, { selfEmployed = false } = {}) {
  const band = rateBand(age);
  const zero = { employer: 0, employee: 0, total: 0, oa: 0, sa: 0, ma: 0 };
  if (selfEmployed) {
    // Self-employed people only have to contribute to MediSave
    // (when yearly net trade income is above $6,000).
    if (wage * 12 <= 6000) return zero;
    const ma = Math.min(wage, ORDINARY_WAGE_CEILING) * (band.ma / 100);
    return { ...zero, employee: ma, total: ma, ma };
  }
  if (wage <= 50) return zero;
  const w = Math.min(wage, ORDINARY_WAGE_CEILING);
  let employeeRaw;
  if (w <= 500) employeeRaw = 0;
  // Phased in for low wages: 3x the employee rate on the part above $500
  // (0.6 up to 55, 0.54 at 55 to 60, 0.375 at 60 to 65, 0.225 at 65 to 70, 0.15 above 70).
  else if (w <= 750) employeeRaw = ((3 * band.employee) / 100) * (w - 500);
  else employeeRaw = w * (band.employee / 100);
  // CPF rounds the total to the nearest dollar and the employee share down.
  const total = Math.round(w * (band.employer / 100) + employeeRaw);
  const employee = Math.floor(employeeRaw);
  const employer = total - employee;
  const allocTotal = band.oa + band.sa + band.ma;
  return {
    employer,
    employee,
    total,
    oa: (total * band.oa) / allocTotal,
    sa: (total * band.sa) / allocTotal,
    ma: (total * band.ma) / allocTotal,
  };
}

// Puts a contribution into the accounts, following the 55+ and MediSave cap rules.
export function deposit(cpf, age, { oa = 0, sa = 0, ma = 0 }) {
  cpf.oa += oa;
  if (age < 55) cpf.sa += sa;
  else depositRetirement(cpf, sa);
  cpf.ma += ma;
  overflowMedisave(cpf, age);
}

// 55 and above: retirement money goes to the RA up to the FRS, then to the OA.
function depositRetirement(cpf, amount) {
  const room = Math.max(0, RETIREMENT_SUMS.FRS - cpf.ra);
  const toRa = Math.min(room, amount);
  cpf.ra += toRa;
  cpf.oa += amount - toRa;
}

function overflowMedisave(cpf, age) {
  const extra = cpf.ma - BASIC_HEALTHCARE_SUM;
  if (extra <= 0) return;
  cpf.ma = BASIC_HEALTHCARE_SUM;
  if (age >= 55) return depositRetirement(cpf, extra);
  // Under 55: to the SA up to the FRS, then to the OA.
  const toSa = Math.min(extra, Math.max(0, RETIREMENT_SUMS.FRS - cpf.sa));
  cpf.sa += toSa;
  cpf.oa += extra - toSa;
}

// Interest works like CPF's own: it is worked out every month on that month's
// balance (call this after the month's withdrawals and before its deposits, so
// it uses the lowest balance), then credited once at the end of the year.
//
// Extra interest: +1% on the first $60k of combined balances (only $20k of it
// from the OA), and from 55 another +1% on the first $30k. It is paid into the
// SA, or the RA from 55.
export function newInterestAccrual() {
  return { oa: 0, sa: 0, ma: 0, ra: 0, extra: 0 };
}

export function accrueMonthlyInterest(cpf, age, acc, { lifeStarted = false } = {}) {
  const ra = lifeStarted ? 0 : cpf.ra;
  acc.oa += (cpf.oa * INTEREST.oa) / 12;
  acc.sa += (cpf.sa * INTEREST.sa) / 12;
  acc.ma += (cpf.ma * INTEREST.ma) / 12;
  acc.ra += (ra * INTEREST.ra) / 12;
  const eligible = Math.min(cpf.oa, 20000) + cpf.sa + cpf.ma + ra;
  let extra = 0.01 * Math.min(eligible, 60000);
  if (age >= 55) extra += 0.01 * Math.min(eligible, 30000);
  acc.extra += extra / 12;
  return acc;
}

export function creditInterest(cpf, age, acc, { lifeStarted = false } = {}) {
  cpf.oa += acc.oa;
  cpf.sa += acc.sa;
  cpf.ra += acc.ra;
  cpf.ma += acc.ma;
  if (age < 55) cpf.sa += acc.extra;
  else if (lifeStarted) cpf.oa += acc.extra; // CPF LIFE members: paid into the annuity in real life
  else cpf.ra += acc.extra;
  overflowMedisave(cpf, age);
  return acc.oa + acc.sa + acc.ma + acc.ra + acc.extra;
}

// A year with no money moving in or out.
export function applyYearlyInterest(cpf, age, opts = {}) {
  const acc = newInterestAccrual();
  for (let m = 0; m < 12; m++) accrueMonthlyInterest(cpf, age, acc, opts);
  return creditInterest(cpf, age, acc, opts);
}

// At 55: the RA is created from SA then OA savings, up to the chosen sum.
// The SA closes and whatever is left in it moves to the OA.
// Returns how much the member may then withdraw in cash.
export function formRetirementAccount(cpf, target = 'FRS', { ownsHome = false } = {}) {
  const sum = RETIREMENT_SUMS[target];
  const fromSa = Math.min(cpf.sa, Math.max(0, sum - cpf.ra));
  cpf.sa -= fromSa;
  cpf.ra += fromSa;
  const fromOa = Math.min(cpf.oa, Math.max(0, sum - cpf.ra));
  cpf.oa -= fromOa;
  cpf.ra += fromOa;
  cpf.oa += cpf.sa;
  cpf.sa = 0;
  // BRS only counts as enough if you pledge a property.
  const metTarget = cpf.ra >= sum && (target !== 'BRS' || ownsHome);
  // Everyone can take out at least $5,000 at 55 (from the OA, then the RA).
  const withdrawable = metTarget ? Math.max(cpf.oa, Math.min(5000, cpf.oa + cpf.ra)) : Math.min(5000, cpf.oa + cpf.ra);
  return { fromSa, fromOa, withdrawable, metTarget, sum };
}

// Cash top-up (Retirement Sum Topping-Up). Under 55 it goes to the SA up to the
// FRS; from 55 to the RA up to the ERS. Returns the amount accepted.
// From 55 the limit counts RA savings already used to join CPF LIFE (`premium`).
export function topUpRoom(cpf, age, premium = 0) {
  if (age < 55) return Math.max(0, RETIREMENT_SUMS.FRS - cpf.sa);
  return Math.max(0, RETIREMENT_SUMS.ERS - cpf.ra - premium);
}

export function cashTopUp(cpf, age, amount, premium = 0) {
  const accepted = Math.min(amount, topUpRoom(cpf, age, premium));
  if (age < 55) cpf.sa += accepted;
  else cpf.ra += accepted;
  return accepted;
}

// Rough CPF LIFE Standard Plan payout from the RA balance when payouts start.
// Fitted to the CPF Board's own estimates: an FRS set aside at 55 grows to
// about $326k by 65 and pays about $1,780 a month.
export const LIFE_PAYOUT_FACTOR = 0.00545;
export const DEFERRAL_BONUS_PER_YEAR = 0.07; // up to 7% more for each year deferred past 65

// The 7% includes the RA's own 4% interest over the extra year, which the game
// already adds to the balance, so only the rest is applied on top here.
export function cpfLifePayout(raAtStart, startAge = 65) {
  const deferYears = Math.max(0, Math.min(5, startAge - 65));
  const bonus = (1 + DEFERRAL_BONUS_PER_YEAR) / (1 + INTEREST.ra);
  return raAtStart * LIFE_PAYOUT_FACTOR * Math.pow(bonus, deferYears);
}

// Equal monthly instalment for a loan.
export function monthlyInstalment(principal, annualRate, years) {
  const r = annualRate / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export const HDB_LOAN_RATE = 0.026; // HDB concessionary loan
export const HDB_DOWNPAYMENT = 0.25; // HDB loans cover up to 75% of the price

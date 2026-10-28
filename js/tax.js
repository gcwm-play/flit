// Singapore personal income tax for tax residents (IRAS, iras.gov.sg).
// Rates apply from Year of Assessment (YA) 2024 onwards. Re-check each year's Budget:
// there is no personal income tax rebate for YA2026.
//
// How IRAS works it out:
//   employment income (gross pay, including your own CPF contributions)
//   − approved donations × 2.5                 = assessable income
//   − personal reliefs (capped at $80,000)    = chargeable income
//   tax on chargeable income − Parenthood Tax Rebate = tax payable

// [top of band, rate]: the first $20,000 is tax-free, the next $10,000 is taxed at 2%, and so on.
export const RESIDENT_RATES = [
  [20000, 0], [30000, 0.02], [40000, 0.035], [80000, 0.07], [120000, 0.115], [160000, 0.15],
  [200000, 0.18], [240000, 0.19], [280000, 0.195], [320000, 0.2], [500000, 0.22], [1000000, 0.23], [Infinity, 0.24],
];

export const RELIEF_CAP = 80000; // all personal reliefs together, each YA
export const TOP_UP_RELIEF_SELF = 8000; // cash top-ups to your own SA/RA (RSTU) and MediSave together
export const DONATION_DEDUCTION = 2.5; // 250% for cash gifts to approved charities (IPCs), extended to 2029
export const DONATION_CARRY_YEARS = 5; // unused deductions carry forward for up to 5 YAs
export const QCR = 4000; // Qualifying Child Relief, per child
export const WMCR = [8000, 10000, 12000]; // Working Mother's Child Relief, children born from 2024: 1st, 2nd, 3rd and later
export const PARENTHOOD_REBATE = [5000, 10000, 20000]; // Parenthood Tax Rebate: 1st, 2nd, 3rd and later child
export const SPOUSE_RELIEF = 2000; // spouse earned $8,000 or less in the year
export const ANNUAL_LIMIT = 37740; // CPF Annual Limit, also the cap on CPF relief

// Earned Income Relief: $1,000 below 55, $6,000 at 55 to 59, $8,000 from 60 (never more than you earned).
export const earnedIncomeRelief = (age) => (age >= 60 ? 8000 : age >= 55 ? 6000 : 1000);

// NSman Self Relief: $3,000 in a year you did NS activities, $1,500 in a year you didn't.
// The game assumes in-camp training every year for 10 years after full-time NS (ages 22 to 31),
// then no activities until the usual statutory age of 40.
export const nsmanRelief = (age) => (age >= 22 && age <= 31 ? 3000 : age >= 32 && age <= 40 ? 1500 : 0);

// Tax on chargeable income, with the amount from each band.
export function taxOn(chargeable) {
  const bands = [];
  let from = 0, tax = 0;
  for (const [top, rate] of RESIDENT_RATES) {
    if (chargeable <= from) break;
    const slice = Math.min(chargeable, top) - from;
    const amount = slice * rate;
    bands.push({ from, to: Math.min(chargeable, top), rate, amount });
    tax += amount;
    from = top;
  }
  return { tax, bands };
}

// Works out one year's income tax.
// p: { age, male, earned, cpfRelief, topUpRelief, donations (cash given this year),
//      donationCarry ([{ age, amount }] unused deductions from earlier years),
//      spouseAtHome, children: [{ age, order }] (order 1 for the first child),
//      mother (a woman with children, so WMCR applies), rebateLeft (Parenthood Tax Rebate not yet used) }
export function incomeTax(p) {
  const earned = Math.max(0, p.earned || 0);
  // Donations: 2.5 times what you gave, but only up to your income. The rest carries forward.
  const carry = (p.donationCarry || []).filter((d) => p.age - d.age <= DONATION_CARRY_YEARS && d.amount > 0);
  const thisYear = (p.donations || 0) * DONATION_DEDUCTION;
  // Older deductions are used first.
  let room = earned;
  const left = [];
  let used = 0;
  for (const d of [...carry, { age: p.age, amount: thisYear }]) {
    const take = Math.min(room, d.amount);
    used += take;
    room -= take;
    if (d.amount - take > 0.5) left.push({ age: d.age, amount: d.amount - take });
  }
  const assessable = earned - used;

  const reliefs = [];
  const add = (id, label, amount, note) => { if (amount > 0.5) reliefs.push({ id, label, amount, note }); };
  if (earned > 0) {
    add('earned', 'Earned Income Relief', Math.min(earned, earnedIncomeRelief(p.age)), p.age >= 60 ? '$8,000 from age 60.' : p.age >= 55 ? '$6,000 at ages 55 to 59.' : '$1,000 below age 55.');
    add('cpf', 'CPF relief', Math.min(p.cpfRelief || 0, ANNUAL_LIMIT), 'Your own compulsory CPF contributions. Your employer\'s share is never taxed.');
  }
  add('topup', 'CPF cash top-up relief', Math.min(p.topUpRelief || 0, TOP_UP_RELIEF_SELF), 'Cash top-ups to your own SA, RA or MediSave, up to $8,000 a year.');
  if (p.male) add('nsman', 'NSman Self Relief', nsmanRelief(p.age), p.age <= 31 ? '$3,000 in a year with in-camp training.' : '$1,500 in a year without NS activities.');
  if (p.spouseAtHome) add('spouse', 'Spouse Relief', SPOUSE_RELIEF, 'Your spouse stays at home and earns $8,000 or less a year.');
  const kids = (p.children || []).filter((c) => c.age < 22);
  if (kids.length) {
    add('qcr', `Qualifying Child Relief (${kids.length} × $4,000)`, kids.length * QCR, 'Children under 16, or older and studying full-time. Parents can share it; here you claim it all.');
    if (p.mother && earned > 0) {
      const wmcr = kids.reduce((t, c) => t + WMCR[Math.min(2, c.order - 1)], 0);
      add('wmcr', 'Working Mother\'s Child Relief', Math.min(wmcr, earned), '$8,000 for the 1st child, $10,000 for the 2nd and $12,000 for each after (children born from 2024).');
    }
  }
  const reliefSum = reliefs.reduce((t, r) => t + r.amount, 0);
  const reliefTotal = Math.min(RELIEF_CAP, reliefSum, assessable);
  const chargeable = Math.max(0, assessable - reliefTotal);
  const { tax: grossTax, bands } = taxOn(chargeable);
  const rebate = Math.min(grossTax, p.rebateLeft || 0);
  const tax = grossTax - rebate;
  return {
    earned, donations: p.donations || 0, donationDeduction: used, donationCarry: left, assessable,
    reliefs, reliefSum, reliefTotal, capped: reliefSum > RELIEF_CAP,
    chargeable, bands, grossTax, rebate, rebateLeft: (p.rebateLeft || 0) - rebate, tax,
  };
}

// What each of your choices and circumstances did, by working the tax out again without it.
// Returns [{ id, label, mine, income (taken off chargeable income), saved (tax) }] for the ones that
// made a difference, and what you'd pay without any of your own choices (top-ups and donations).
export function savings(p) {
  const base = incomeTax(p);
  const without = [
    ['topup', 'Your cash top-ups to your own CPF', true, { topUpRelief: 0 }],
    ['give', 'Your donations to approved charities', true, { donations: 0, donationCarry: [] }],
    ['kids', p.mother ? 'Child reliefs (Qualifying Child and Working Mother\'s Child Relief)' : 'Qualifying Child Relief', false, { children: [], mother: false }],
    ['spouse', 'Spouse Relief', false, { spouseAtHome: false }],
    ['rebate', 'The Parenthood Tax Rebate', false, { rebateLeft: 0 }],
  ];
  const list = without
    .map(([id, label, mine, change]) => {
      const r = incomeTax({ ...p, ...change });
      return { id, label, mine, income: r.chargeable - base.chargeable, saved: r.tax - base.tax };
    })
    .filter((x) => x.income > 0.5 || x.saved > 0.5);
  const noChoices = incomeTax({ ...p, topUpRelief: 0, donations: 0, donationCarry: [] }).tax;
  return { list, noChoices, choicesSaved: noChoices - base.tax };
}

// A plain reason when there's no tax to pay.
export function zeroReason(r) {
  if (r.earned <= 0) return 'You had no income from work, so there is nothing to tax.';
  if (r.chargeable <= RESIDENT_RATES[0][0]) return `After deductions and reliefs your chargeable income is ${dollars(r.chargeable)}. The first ${dollars(RESIDENT_RATES[0][0])} is taxed at 0%, so you owe nothing.`;
  if (r.rebate >= r.grossTax) return `Your tax of ${dollars(r.grossTax)} was fully paid off by the Parenthood Tax Rebate (${dollars(r.rebateLeft)} of it is left for later years).`;
  return '';
}

const dollars = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

// Healthcare: illnesses and accidents, how a hospital bill is split between
// Government subsidies, MediShield Life, a private Integrated Shield Plan (IP),
// MediSave, cash and MediFund, and the premiums for each kind of cover.
// No DOM code here. Figures are 2026 unless noted.

// ---------- MediShield Life ----------

// Annual premiums before subsidies, by age next birthday (MOH, from 1 April 2025, incl. GST).
const MSL_PREMIUMS = [[20, 200], [30, 295], [40, 503], [50, 637], [60, 903], [65, 1131], [70, 1326], [73, 1643], [75, 1816],
  [78, 2027], [80, 2187], [83, 2303], [85, 2616], [90, 2785], [Infinity, 2826]];

export function mslPremium(age) {
  const next = age + 1;
  return MSL_PREMIUMS.find(([max]) => next <= max)[1];
}

// Deductibles per policy year by ward class, age 80 and below / 81 and above (from 1 April 2025).
const DEDUCTIBLE = { C: [2000, 2750], B2: [2500, 3500], B1: [2500, 3500], A: [3500, 4500], private: [3500, 4500] };
export const deductible = (ward, age) => DEDUCTIBLE[ward][age + 1 > 80 ? 1 : 0];

// Co-insurance on the claimable amount: 10% of the first $5,000 (counting the deductible),
// 5% of the next $5,000 and 3% above $10,000.
export function coInsurance(claimable, ded) {
  const band = (from, to, rate) => Math.max(0, Math.min(claimable, to) - Math.max(ded, from)) * rate;
  return band(0, 5000, 0.1) + band(5000, 10000, 0.05) + band(10000, Infinity, 0.03);
}

// Claim limits: ward charges of $830 a day, plus $800 a day for the first two days,
// $5,140 a day in ICU, and a limit for each surgery by its table in the
// Table of Surgical Procedures (TOSP).
const MSL_SURGERY = { '2C': 1120, '3A': 1390, '3B': 1740, '4B': 2370, '5B': 3270, '6B': 3540, '7A': 3900, '7B': 3900 };
export function mslLimit(c) {
  return c.days * 830 + Math.min(c.days, 2) * 800 + (c.icu || 0) * 5140 + (MSL_SURGERY[c.tosp] || 0);
}

// For bills in B1, A and private wards, MediShield Life pays as if you stayed in a
// subsidised ward, so only part of the bill counts (approximate pro-ration).
const PRORATION = { C: 1, B2: 1, B1: 0.55, A: 0.35, private: 0.3 };

// ---------- MediSave withdrawal limits for a hospital stay ----------
// $1,130 a day for the first two days and $400 a day after, plus the surgical limit.
const MEDISAVE_SURGERY = { '2C': 1120, '3A': 1390, '3B': 1740, '4B': 2440, '5B': 2660, '6B': 3610, '7A': 4340, '7B': 4830 };
export function medisaveLimit(c) {
  return Math.min(c.days, 2) * 1130 + Math.max(0, c.days - 2) * 400 + (MEDISAVE_SURGERY[c.tosp] || 0);
}

// ---------- Government subsidies (Class B2 and C wards, Singapore Citizens) ----------
// Means-tested on monthly per capita household income (PCHI), from 1 October 2024.
const SUBSIDY = [[0, 0.8], [2100, 0.8], [2300, 0.75], [2600, 0.7], [3000, 0.65], [3300, 0.6], [3600, 0.55], [Infinity, 0.5]];
export function subsidyRate(pchi, { highValueHome = false } = {}) {
  if (pchi <= 0) return highValueHome ? 0.5 : 0.8; // no income: by the annual value of your home
  return SUBSIDY.find(([max]) => pchi <= max)[1];
}

// ---------- the wards ----------

export const WARDS = {
  C: { label: 'Class C ward', beds: 8, desc: 'an open ward with 8 or more beds and fans', subsidised: true },
  B2: { label: 'Class B2 ward', beds: 6, desc: 'a 6-bed ward with fans', subsidised: true },
  B1: { label: 'Class B1 ward', beds: 4, desc: 'a 4-bed air-conditioned ward with a TV', subsidised: false },
  A: { label: 'Class A ward', beds: 1, desc: 'a single air-conditioned room with your own bathroom', subsidised: false },
  private: { label: 'private hospital room', beds: 1, desc: 'a single room in a private hospital, with a sofa bed for family', subsidised: false },
};
// How the full (unsubsidised Class A) bill compares in other wards.
const WARD_COST = { C: 0.65, B2: 0.75, B1: 0.85, A: 1, private: 1.8 };

// ---------- illnesses and accidents ----------
// `bill` is a typical unsubsidised Class A bill at a public hospital in 2026 (rounded estimates).
export const CONDITIONS = [
  { id: 'dengue', kind: 'minor', icon: '🦟', label: 'dengue fever', days: 4, bill: 4500 },
  { id: 'wrist', kind: 'minor', icon: '🦴', label: 'a broken wrist from a fall', days: 2, tosp: '3A', bill: 9000 },
  { id: 'appendix', kind: 'minor', icon: '🩹', label: 'appendicitis (keyhole surgery)', days: 3, tosp: '4B', bill: 14000 },
  { id: 'kidney', kind: 'minor', icon: '🪨', label: 'kidney stones', days: 2, tosp: '3B', bill: 10000 },
  { id: 'knee', kind: 'minor', icon: '⚽', label: 'a torn knee ligament from sport', days: 2, tosp: '5B', bill: 22000 },
  { id: 'pneumonia', kind: 'minor', icon: '🫁', label: 'pneumonia', days: 6, bill: 11000 },
  { id: 'heart', kind: 'major', icon: '❤️‍🩹', label: 'a heart attack (a stent was put in)', days: 5, icu: 1, tosp: '6B', bill: 38000 },
  { id: 'stroke', kind: 'major', icon: '🧠', label: 'a stroke', days: 12, icu: 2, bill: 45000 },
  { id: 'cancer', kind: 'major', icon: '🎗️', label: 'colorectal cancer (surgery and chemotherapy)', days: 10, icu: 1, tosp: '7A', bill: 95000 },
  { id: 'crash', kind: 'major', icon: '🚑', label: 'a serious road accident', days: 14, icu: 3, tosp: '7B', bill: 80000 },
];

// 1 to 3 health scares in a lifetime, more likely (and more serious) with age.
export function planHealthEvents(fromAge = 21, rnd = Math.random) {
  const n = 1 + Math.floor(rnd() * 3);
  const ages = [];
  for (let i = 0; i < n; i++) {
    // Weight each age by how common hospital stays are at that age.
    const weights = [];
    for (let a = 21; a <= 84; a++) weights.push([a, (a - 15) * (a - 15)]);
    const total = weights.reduce((t, [, w]) => t + w, 0);
    let r = rnd() * total;
    const age = weights.find(([, w]) => (r -= w) <= 0)[0];
    if (age < fromAge) { i--; if (fromAge > 84) break; continue; }
    const major = rnd() < Math.min(0.7, Math.max(0.1, (age - 30) / 60));
    const pool = CONDITIONS.filter((c) => c.kind === (major ? 'major' : 'minor'));
    ages.push({ age, id: pool[Math.floor(rnd() * pool.length)].id });
  }
  return ages.sort((a, b) => a.age - b.age);
}

// ---------- private cover: Integrated Shield Plans ----------
// Typical 2026 premiums, rounded, for the part above MediShield Life (insurers differ).
// Age bands (age next birthday): to 30, 31-40, 41-50, 51-60, 61-65, 66-70, 71-75, 76-80, 81-85, 86+.
const BANDS = [30, 40, 50, 60, 65, 70, 75, 80, 85, Infinity];
export const PLANS = {
  msl: { label: 'MediShield Life only', ward: 'B2', icon: '🛡️', desc: 'Everyone has it. Covers large bills in subsidised B2 and C wards.', extra: BANDS.map(() => 0), rider: null },
  b1: { label: 'Standard plan (B1 ward)', ward: 'B1', icon: '🏥', desc: 'A 4-bed air-conditioned ward in a public hospital.',
    extra: [90, 130, 220, 380, 600, 800, 1100, 1400, 1700, 2000], rider: [100, 150, 250, 450, 700, 1000, 1300, 1700, 2200, 2600] },
  a: { label: 'Class A plan', ward: 'A', icon: '🛏️', desc: 'A single room in a public hospital, and your choice of specialist.',
    extra: [180, 220, 400, 600, 1100, 1600, 2400, 3200, 4000, 4600], rider: [150, 250, 450, 800, 1300, 1800, 2400, 3000, 3600, 4000] },
  private: { label: 'Private hospital plan', ward: 'private', icon: '🏨', desc: 'Any private hospital and doctor.',
    extra: [350, 500, 1100, 1800, 3000, 4100, 6000, 7500, 9000, 10000], rider: [300, 450, 900, 1500, 2400, 3400, 4600, 5800, 7000, 8000] },
};

// MediSave can pay the extra premium of an IP up to the Additional Withdrawal Limit.
export const awl = (age) => (age + 1 <= 40 ? 300 : age + 1 <= 70 ? 600 : 900);

// The year's premiums for a plan, and how much MediSave can pay.
export function premiums(age, planId = 'msl', rider = false) {
  const plan = PLANS[planId];
  const i = BANDS.findIndex((max) => age + 1 <= max);
  const msl = mslPremium(age);
  const extra = plan.extra[i];
  const riderCost = rider && plan.rider ? plan.rider[i] : 0;
  const medisave = msl + Math.min(extra, awl(age));
  return { msl, extra, rider: riderCost, total: msl + extra + riderCost, medisave, cash: msl + extra + riderCost - medisave };
}

// ---------- the bill ----------

// Works out who pays what. `pchi` is monthly per capita household income.
export function billBreakdown(c, { age, plan = 'msl', rider = false, pchi = 0, highValueHome = false, medisave = 0, cash = 0 }) {
  const ward = PLANS[plan].ward;
  const w = WARDS[ward];
  const gross = c.bill * WARD_COST[ward];
  const subsidyPct = w.subsidised ? subsidyRate(pchi, { highValueHome }) : 0;
  const subsidy = gross * subsidyPct;
  const afterSubsidy = gross - subsidy;

  // MediShield Life, on the part of the bill it counts.
  const ded = deductible(ward, age);
  const claimable = Math.min(afterSubsidy * PRORATION[ward], mslLimit(c));
  const msl = claimable > ded ? claimable - ded - coInsurance(claimable, ded) : 0;

  // A Shield plan pays the rest of the bill for its ward class, after the same deductible and 10% co-insurance.
  let ip = 0, riderPaid = 0;
  if (plan !== 'msl') {
    const ipTotal = Math.max(0, afterSubsidy - ded) * 0.9;
    ip = Math.max(0, ipTotal - msl);
    if (rider) {
      // Riders pay the deductible and co-insurance, but you still pay 5% (capped at $3,000).
      const left = afterSubsidy - msl - ip;
      const coPay = Math.min(afterSubsidy * 0.05, 3000);
      riderPaid = Math.max(0, left - coPay);
    }
  }
  const owed = Math.max(0, afterSubsidy - msl - ip - riderPaid);
  const fromMedisave = Math.min(owed, medisaveLimit(c), Math.max(0, medisave));
  let fromCash = owed - fromMedisave;
  // MediFund: a safety net for patients in subsidised wards who still can't pay.
  let medifund = 0;
  if (w.subsidised && fromCash > Math.max(0, cash)) {
    medifund = fromCash - Math.max(0, cash);
    fromCash -= medifund;
  }
  return {
    ward, wardInfo: w, gross, subsidyPct, subsidy, afterSubsidy, deductible: ded, msl, ip, rider: riderPaid,
    owed, fromMedisave, fromCash, medifund, medisaveLimit: medisaveLimit(c),
  };
}

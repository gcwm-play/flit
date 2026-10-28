import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cpf from '../js/cpf.js';
import * as housing from '../js/housing.js';
import * as sim from '../js/sim.js';

const close = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('contributions at 30 on $5,000: 20% employee, 17% employer, OA/SA/MA 23/6/8', () => {
  const c = cpf.monthlyContribution(30, 5000);
  assert.equal(c.total, 1850);
  assert.equal(c.employee, 1000);
  assert.equal(c.employer, 850);
  close(c.oa, 1150);
  close(c.sa, 300);
  close(c.ma, 400);
});

test('wages above the $8,000 ceiling are capped', () => {
  assert.equal(cpf.monthlyContribution(40, 12000).total, Math.round(8000 * 0.37));
});

test('low wages: employer only up to $500, employee phased in to $750', () => {
  const a = cpf.monthlyContribution(17, 400);
  assert.equal(a.employee, 0);
  assert.equal(a.total, 68);
  const b = cpf.monthlyContribution(17, 600);
  assert.equal(b.employee, 60);
  assert.equal(cpf.monthlyContribution(17, 50).total, 0);
});

test('2026 senior rates: 34% at 56, 25% at 62, 16.5% at 67, 12.5% at 72', () => {
  assert.equal(cpf.monthlyContribution(56, 4000).total, 1360);
  assert.equal(cpf.monthlyContribution(62, 4000).total, 1000);
  assert.equal(cpf.monthlyContribution(67, 4000).total, 660);
  assert.equal(cpf.monthlyContribution(72, 4000).total, 500);
});

test('self-employed pay MediSave only', () => {
  const c = cpf.monthlyContribution(30, 5000, { selfEmployed: true });
  assert.equal(c.oa, 0);
  assert.equal(c.sa, 0);
  close(c.ma, 400);
});

test('after 55 the retirement share goes to the RA up to the FRS, then the OA', () => {
  const a = { oa: 0, sa: 0, ma: 0, ra: cpf.RETIREMENT_SUMS.FRS - 100 };
  cpf.deposit(a, 56, { oa: 0, sa: 500, ma: 0 });
  assert.equal(a.ra, cpf.RETIREMENT_SUMS.FRS);
  assert.equal(a.oa, 400);
});

test('MediSave above the Basic Healthcare Sum overflows to the SA', () => {
  const a = { oa: 0, sa: 0, ma: cpf.BASIC_HEALTHCARE_SUM, ra: 0 };
  cpf.deposit(a, 40, { ma: 1000 });
  assert.equal(a.ma, cpf.BASIC_HEALTHCARE_SUM);
  assert.equal(a.sa, 1000);
});

test('a year of interest with extra interest on the first $60k', () => {
  const a = { oa: 30000, sa: 50000, ma: 0, ra: 0 };
  cpf.applyYearlyInterest(a, 40);
  close(a.oa, 30750);
  // 4% of 50k plus 1% extra on 20k (OA) + 40k (SA) = 2,000 + 600
  close(a.sa, 52600);
});

test('from 55, another 1% extra on the first $30k', () => {
  const a = { oa: 0, sa: 0, ma: 0, ra: 100000 };
  cpf.applyYearlyInterest(a, 60);
  close(a.ra, 100000 + 4000 + 600 + 300);
});

test('forming the RA at 55 takes SA then OA up to the FRS', () => {
  const a = { oa: 150000, sa: 120000, ma: 50000, ra: 0 };
  const r = cpf.formRetirementAccount(a, 'FRS');
  assert.equal(a.ra, cpf.RETIREMENT_SUMS.FRS);
  assert.equal(r.fromSa, 120000);
  assert.equal(r.fromOa, cpf.RETIREMENT_SUMS.FRS - 120000);
  assert.equal(a.sa, 0);
  assert.ok(r.metTarget);
  close(r.withdrawable, a.oa);
});

test('without the sum set aside, only $5,000 can be withdrawn at 55', () => {
  const a = { oa: 20000, sa: 50000, ma: 0, ra: 0 };
  const r = cpf.formRetirementAccount(a, 'FRS');
  assert.equal(a.ra, 70000);
  assert.equal(r.withdrawable, 5000);
});

test('CPF LIFE estimate matches the CPF Board figure for the FRS', () => {
  const raAt65 = cpf.RETIREMENT_SUMS.FRS * Math.pow(1.04, 10);
  close(cpf.cpfLifePayout(raAt65, 65), cpf.LIFE_PAYOUT_ESTIMATES.FRS, 40);
});

test('deferring CPF LIFE to 70 pays about 7% more per year in total', () => {
  const at65 = cpf.cpfLifePayout(300000, 65);
  const at70 = cpf.cpfLifePayout(300000 * Math.pow(1.04, 5), 70);
  close(at70 / at65, Math.pow(1.07, 5), 0.01);
});

test("buyer's stamp duty on a $500k flat", () => {
  // 1% of 180k + 2% of 180k + 3% of 140k
  assert.equal(housing.buyersStampDuty(500000), 1800 + 3600 + 4200);
});

test('MSR blocks an HDB loan above 30% of household income', () => {
  const h = housing.HOMES.find((x) => x.id === 'bto4');
  const low = housing.quote(h, { share: 1, grossIncome: 4000, oa: 200000, cash: 100000 });
  assert.equal(low.msrOk, false);
  const high = housing.quote(h, { share: 1, grossIncome: 9000, oa: 200000, cash: 100000 });
  assert.equal(high.msrOk, true);
});

test('selling refunds CPF used plus accrued interest, up to the proceeds', () => {
  const h = housing.HOMES.find((x) => x.id === 'bto3');
  const q = housing.quote(h, { share: 1, grossIncome: 8000, oa: 100000, cash: 50000 });
  const home = housing.newHome(q, 30);
  for (let m = 0; m < 120; m++) housing.payMonth(home, 1e9);
  const b = housing.saleBreakdown(home);
  assert.ok(home.cpfAccrued > 0);
  close(b.refund, Math.min(b.sale - b.loan, home.cpfPrincipal + home.cpfAccrued));
});

test('Silver Housing Bonus: $1 for every $2 topped up, up to $30,000', () => {
  assert.deepEqual(housing.silverHousingBonus(40000), { topUp: 40000, bonus: 20000 });
  assert.deepEqual(housing.silverHousingBonus(200000), { topUp: 60000, bonus: 30000 });
});

test('a whole life runs from 7 to 85 without breaking', () => {
  const s = sim.newGame('Test', { gender: 'female', tone: 2, outfit: 0 });
  // MediSave Grant at birth: 4% a year, plus 1% extra interest paid into the SA.
  close(cpf.cpfTotal(s.cpf), 4000 * Math.pow(1.05, 7), 30);
  s.stats.knowledge = 40;
  s.stats.creativity = 20;
  while (s.age < 21) {
    s.stage = sim.ageStage(s.age);
    sim.advanceYears(s, sim.yearsThisTurn(s), { jobWage: 800 });
  }
  s.stage = 'adult';
  s.education = sim.educationFor(s);
  sim.chooseCareer(s, 'engineer');
  while (s.age < 55) {
    if (s.age >= 27 && !s.home) {
      sim.marry(s, 30000);
      const q = sim.homeQuotes(s).find((x) => x.id === 'bto4');
      if (q.affordable) sim.buyHome(s, 'bto4');
    }
    sim.advanceYears(s, sim.yearsThisTurn(s));
  }
  s.stage = 'senior';
  sim.formRA(s, 'FRS');
  s.retirementLifestyle = 'comfortable';
  s.workMode = 'full';
  while (s.age < 85) {
    if (s.age >= 65 && !s.life) {
      s.workMode = 'retired';
      sim.startCpfLife(s, 65);
    }
    sim.advanceYears(s, sim.yearsThisTurn(s));
  }
  assert.ok(s.home, 'bought a home');
  assert.ok(s.life.monthly > 1000, `CPF LIFE ${s.life.monthly}`);
  for (const v of Object.values(s.cpf)) assert.ok(Number.isFinite(v) && v >= 0);
});

test('event and data modules load', async () => {
  const events = await import('../js/events.js');
  assert.ok(events.PERSONAL_EVENTS.length > 0);
  assert.ok(events.WORLD_EVENTS.length > 0);
});

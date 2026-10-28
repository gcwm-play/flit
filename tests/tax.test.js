import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as tax from '../js/tax.js';
import * as sim from '../js/sim.js';
import * as cpf from '../js/cpf.js';

const close = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('resident rates: cumulative tax at the top of each IRAS band', () => {
  const expected = [[20000, 0], [30000, 200], [40000, 550], [80000, 3350], [120000, 7950], [160000, 13950],
    [200000, 21150], [240000, 28750], [280000, 36550], [320000, 44550], [500000, 84150], [1000000, 199150]];
  for (const [ci, t] of expected) close(tax.taxOn(ci).tax, t, 0.01);
  close(tax.taxOn(1100000).tax, 199150 + 24000, 0.01);
});

test('employee on $6,000 a month at 30: Earned Income, CPF and NSman relief', () => {
  const r = tax.incomeTax({ age: 30, male: true, earned: 72000, cpfRelief: 14400 });
  assert.equal(r.reliefTotal, 1000 + 14400 + 3000);
  assert.equal(r.chargeable, 53600);
  close(r.tax, 550 + 0.07 * 13600, 0.01);
});

test('donations are deducted at 250%, top-up relief stops at $8,000, reliefs cap at $80,000', () => {
  const r = tax.incomeTax({ age: 40, earned: 100000, cpfRelief: 0, topUpRelief: 10000, donations: 1000 });
  assert.equal(r.donationDeduction, 2500);
  assert.equal(r.reliefs.find((x) => x.id === 'topup').amount, 8000);
  const big = tax.incomeTax({ age: 40, mother: true, earned: 300000, cpfRelief: 37740, topUpRelief: 8000, children: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ age: 5, order: i })) });
  assert.equal(big.reliefTotal, 80000);
  assert.ok(big.capped);
});

test('donations above income carry forward', () => {
  const r = tax.incomeTax({ age: 40, earned: 10000, donations: 6000 });
  assert.equal(r.donationDeduction, 10000);
  assert.equal(r.donationCarry[0].amount, 5000);
  const next = tax.incomeTax({ age: 41, earned: 50000, donationCarry: r.donationCarry });
  assert.equal(next.donationDeduction, 5000);
});

test('Working Mother\'s Child Relief and the Parenthood Tax Rebate', () => {
  const r = tax.incomeTax({ age: 32, mother: true, earned: 90000, cpfRelief: 18000, children: [{ age: 2, order: 1 }, { age: 0, order: 2 }], rebateLeft: 15000 });
  assert.equal(r.reliefs.find((x) => x.id === 'wmcr').amount, 18000);
  assert.equal(r.reliefs.find((x) => x.id === 'qcr').amount, 8000);
  assert.equal(r.tax, 0);
  close(r.rebateLeft, 15000 - r.grossTax, 0.01);
});

function adult(age = 30, salary = 6000, gender = 'male') {
  const s = sim.newGame('Tax', { gender, animal: 'cat', outfit: 0 });
  Object.assign(s, { age, stage: 'adult', salary, lifestyle: 'simple', bank: 50000 });
  return s;
}

test('a year of work pays income tax from cash', () => {
  const s = adult();
  const sum = sim.advanceYears(s, 1);
  assert.ok(sum.tax > 1000 && sum.tax < 2000, `tax ${sum.tax}`);
  assert.equal(s.lastTax.tax, sum.tax);
});

test('MediSave top-ups stop at the BHS and the Annual Limit, and get relief', () => {
  const s = adult(40, 8000);
  // Compulsory: 37% of $8,000 x 12 = $35,520, leaving $2,220 under the $37,740 Annual Limit.
  assert.equal(sim.annualLimitRoom(s), cpf.CPF_ANNUAL_LIMIT - 35520);
  const r = sim.topUpCpf(s, 5000, 'ma');
  assert.equal(r.accepted, 2220);
  assert.equal(sim.topUpReliefThisYear(s), 2220);
  assert.equal(sim.topUpRoom(s, 'ma'), 0);
});

test('three-account top-ups split like contributions and get no relief for employees', () => {
  const s = adult(30, 3000);
  const before = { ...s.cpf };
  sim.topUpCpf(s, 3700, 'all');
  close(s.cpf.oa - before.oa, 2300, 0.01);
  close(s.cpf.sa - before.sa, 600, 0.01);
  close(s.cpf.ma - before.ma, 800, 0.01);
  assert.equal(sim.topUpReliefThisYear(s), 0);
});

test('children can only top up their SA, with no tax relief', () => {
  const s = sim.newGame('Kid', { gender: 'female', animal: 'cat', outfit: 0 });
  assert.deepEqual(sim.topUpAccounts(s), ['ret']);
  sim.topUpCpf(s, 500, 'ma');
  assert.equal(sim.topUpReliefThisYear(s), 0);
  assert.ok(s.cpf.sa >= 500);
});

test('giving cuts the tax estimate', () => {
  const s = adult(35, 9000);
  const a = sim.taxEstimate(s).tax;
  const b = sim.taxEstimate(s, { extraDonation: 2000 }).tax;
  close(a - b, 5000 * 0.115, 0.01); // chargeable about $84,800, in the 11.5% band
});

test('self-employed MediSave: nothing to $6,000, half rate to $12,000, phased to $18,000, full rate capped at $96,000', () => {
  assert.equal(cpf.selfEmployedMedisave(30, 6000), 0);
  close(cpf.selfEmployedMedisave(30, 10000), 400, 0.01);
  close(cpf.selfEmployedMedisave(30, 15000), 600 + 0.12 * 3000, 0.01);
  close(cpf.selfEmployedMedisave(30, 18000), 1440, 0.01);
  close(cpf.selfEmployedMedisave(35, 60000), 5400, 0.01);
  close(cpf.selfEmployedMedisave(52, 200000), 10080, 0.01);
  close(cpf.selfEmployedMedisave(67, 50000), 4000, 0.01);
  const c = cpf.monthlyContribution(30, 5000, { selfEmployed: true });
  close(c.ma * 12, 4800, 0.01);
  assert.equal(c.oa + c.sa, 0);
});

test('the tax explainer credits your own top-ups and donations, and says why tax is $0', () => {
  const p = { age: 30, earned: 60000, cpfRelief: 12000, topUpRelief: 8000, donations: 2000 };
  const sv = tax.savings(p);
  const base = tax.incomeTax(p).tax;
  close(sv.noChoices - base, sv.choicesSaved, 0.01);
  assert.ok(sv.list.find((x) => x.id === 'topup').income === 8000);
  const zero = tax.incomeTax({ age: 30, earned: 30000, cpfRelief: 6000, topUpRelief: 8000 });
  assert.equal(zero.tax, 0);
  assert.match(tax.zeroReason(zero), /first \$20,000/);
});

test('men do two years of NS at 18 with an allowance and no CPF, and start work at 23', () => {
  const m = sim.newGame('NS', { gender: 'male', animal: 'cat', outfit: 0 });
  Object.assign(m, { age: 17, stage: 'teen' });
  const cpfBefore = cpf.cpfTotal(m.cpf);
  const sum = sim.advanceYears(m, 2, { jobWage: 1000 });
  assert.equal(sum.nsPay, sim.NS.allowance[18] * 12);
  assert.equal(sum.cpfIn, 3000 * 0.37); // only the age-17 holiday job pays CPF
  assert.ok(cpf.cpfTotal(m.cpf) > cpfBefore);
  assert.equal(sim.firstJobAge(m), 23);
  const f = sim.newGame('F', { gender: 'female', animal: 'cat', outfit: 0 });
  assert.equal(sim.firstJobAge(f), 21);
  Object.assign(m, { age: 21, stage: 'adult' });
  assert.ok(sim.isStudying(m));
  assert.equal(sim.yearsThisTurn(m), 2);
});

test('own job: titles are checked, pay grows at the chosen rate', () => {
  for (const ok of ['Physiotherapist', 'Assistant manager', 'Saltwater fish farmer', 'Data scientist']) assert.equal(sim.checkJobTitle(ok), '', ok);
  for (const bad of ['Sex worker', 's3x worker', 'Escort', 'Drug dealer', 'P1mp', '<b>x</b>', '']) assert.notEqual(sim.checkJobTitle(bad), '', bad);
  const s = adult(30, 3000);
  sim.takeCustomJob(s, { title: 'Product manager', annual: 90000, growth: 0.04 });
  assert.equal(s.salary, 7500);
  assert.equal(sim.careerInfo(s).label, 'Product manager');
  sim.advanceYears(s, 1);
  close(s.salary, 7800, 0.01);
});

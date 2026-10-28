import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cpf from '../js/cpf.js';
import * as housing from '../js/housing.js';
import * as sim from '../js/sim.js';
import * as health from '../js/health.js';
import * as cars from '../js/car.js';

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

test('MSR cuts an HDB loan to 30% of household income (tested at 3%)', () => {
  const h = housing.HOMES.find((x) => x.id === 'bto4');
  const low = housing.quote(h, { share: 1, grossIncome: 3000, oa: 200000, cash: 100000 });
  assert.equal(low.cappedBy, 'MSR');
  close(cpf.monthlyInstalment(low.loan, 0.03, 25), 900, 0.01);
  const high = housing.quote(h, { share: 1, grossIncome: 9000, oa: 200000, cash: 100000 });
  assert.equal(high.cappedBy, null);
  close(high.loan, h.price * 0.75, 0.01);
});

test('a couple on $5,225 a month can buy a 4-room BTO with the EHG', () => {
  const h = housing.HOMES.find((x) => x.id === 'bto4');
  const g = housing.grantsFor(h, 5225);
  assert.equal(g.total, 55000);
  assert.equal(housing.ehg(9500), 0);
  assert.equal(housing.ehg(700, true), 60000);
  assert.equal(housing.ehg(2000, true), 40000);
  const q = housing.quote(h, { share: 0.5, grossIncome: 5225, oa: 44541, cash: 42141, grant: g.total, years: 25 });
  assert.ok(q.affordable);
  assert.equal(q.cappedBy, null);
  close(q.grant, 27500, 0.01);
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
  const s = sim.newGame('Test', { gender: 'female', animal: 'cat', outfit: 0 });
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

test('cash earns the bank savings rate', () => {
  const s = sim.newGame('Cash', { gender: 'male', animal: 'cat', outfit: 0 });
  s.stage = 'adult';
  s.age = 30;
  s.salary = 0;
  s.bank = 100000;
  s.budget = sim.newBudget();
  const sum = sim.advanceYears(s, 1);
  assert.ok(Math.abs(sum.bankInterest - sum.cashEnd * sim.SAVINGS_RATE / (1 + sim.SAVINGS_RATE)) < 1);
  assert.ok(sum.cpfInterest > 0);
  assert.ok(Math.abs(sum.interest - sum.cpfInterest - sum.bankInterest) < 0.01);
});

test('debt stays bounded: credit limits, then a Debt Consolidation Plan', () => {
  const s = sim.newGame('Debt', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 30;
  s.stage = 'adult';
  s.salary = 2500;
  s.education = 'secondary';
  s.lifestyle = 'lavish';
  s.car = cars.newCar(s.age);
  for (let i = 0; i < 6; i++) sim.advanceYears(s, 5);
  assert.ok(s.debt < 12 * 2500 * 2, `debt ${s.debt}`);
  assert.ok(Number.isFinite(s.debt) && s.debt >= 0);
});

test('a Debt Consolidation Plan is paid off with fixed instalments', () => {
  const s = sim.newGame('Dcp', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 30;
  s.stage = 'adult';
  s.salary = 6000;
  s.debt = 80000;
  sim.startDcp(s);
  assert.ok(s.dcp.monthly > 900 && s.dcp.monthly < 1000, `${s.dcp.monthly}`);
  sim.advanceYears(s, 11);
  assert.equal(s.debt, 0);
  assert.equal(s.dcp, null);
});

test('CPFIS limits: keep $20k in the OA, 35% in stocks, SA only in funds', async () => {
  const invest = await import('../js/invest.js');
  const s = sim.newGame('Inv', { gender: 'male', animal: 'cat', outfit: 0 });
  s.age = 30;
  s.cpf.oa = 100000;
  s.cpf.sa = 30000;
  const bank = invest.product('bank');
  const world = invest.product('world');
  assert.equal(invest.maxBuy(s, world, 'oa'), 80000);
  assert.equal(invest.maxBuy(s, bank, 'oa'), 35000);
  assert.equal(invest.allowed(bank, 'sa'), false);
  assert.equal(invest.maxBuy(s, world, 'sa'), 0);
  assert.equal(invest.buy(s, 'bank', 'oa', 50000), 35000);
  assert.equal(s.cpf.oa, 65000);
  assert.equal(invest.maxBuy(s, invest.product('ai'), 'oa'), 0);
  invest.sell(s, 'bank', 'oa', 1e9);
  assert.ok(s.cpf.oa > 65000 * 0 && invest.holdings(s).length === 0);
});

test('RA is formed up to the FRS; BRS needs a pledge; OA can move in up to the ERS', () => {
  const s = sim.newGame('RA', { gender: 'male', animal: 'cat', outfit: 0 });
  s.age = 55;
  s.cpf = { oa: 300000, sa: 150000, ma: 50000, ra: 0 };
  s.home = { kind: 'hdb', leaseLeft: 60, boughtAge: 30 };
  sim.formRA(s);
  assert.equal(s.cpf.ra, cpf.RETIREMENT_SUMS.FRS);
  assert.equal(s.cpf.oa, 300000 - (cpf.RETIREMENT_SUMS.FRS - 150000));
  assert.ok(sim.canPledge(s));
  const moved = sim.transferOaToRa(s, 1e9);
  assert.equal(s.cpf.ra, cpf.RETIREMENT_SUMS.ERS);
  assert.equal(moved, cpf.RETIREMENT_SUMS.ERS - cpf.RETIREMENT_SUMS.FRS);
});

test('top-ups after CPF LIFE starts count the premium towards the ERS and raise payouts', () => {
  const s = sim.newGame('Life', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 66;
  s.cpf.ra = 0;
  s.life = { startAge: 65, plan: 'standard', monthly: 1780, premium: 400000 };
  assert.equal(sim.topUpRoom(s), cpf.RETIREMENT_SUMS.ERS - 400000);
  close(sim.lifePayoutGain(s, 10000), 54.5, 0.5);
});

test('Lease Buyback: explains why a flat with a short lease left is not eligible', () => {
  const s = sim.newGame('LBS', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 75;
  s.home = { kind: 'hdb', leaseLeft: 30, boughtAge: 40, lbsDone: false };
  const r = sim.lbsCheck(s);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /20 years/);
  s.home.leaseLeft = 60;
  assert.equal(sim.lbsCheck(s).ok, true);
});

test('a very high stat opens a matching career switch', () => {
  const s = sim.newGame('Switch', { gender: 'male', animal: 'cat', outfit: 0 });
  s.age = 40;
  s.stage = 'adult';
  s.stats.communication = 52;
  const offer = sim.careerSwitchOffer(s);
  assert.equal(offer.id, 'speaker');
  sim.switchCareer(s, 'speaker');
  assert.equal(s.selfEmployed, true);
  assert.equal(sim.careerInfo(s).id, 'speaker');
});

test('the whole family is the same animal; the spouse is the opposite gender', () => {
  const s = sim.newGame('Frog', { gender: 'male', animal: 'frog', outfit: 1 });
  s.age = 30;
  sim.marry(s, 0);
  sim.haveChild(s);
  assert.equal(s.spouse.animal, 'frog');
  assert.equal(s.spouse.gender, 'female');
  assert.equal(s.children[0].animal, 'frog');
  assert.equal(s.look.tone, undefined);
});

test('job offers: skills unlock better jobs, and a recession lowers what employers pay', () => {
  const s = sim.newGame('Jobs', { gender: 'male', animal: 'dog', outfit: 0 });
  s.age = 30; s.stage = 'adult'; s.education = 'university';
  s.stats.knowledge = 25; s.stats.creativity = 12;
  sim.chooseCareer(s, 'engineer');
  s.careerStartAge = 22;
  const normal = sim.jobOffers(s, 'normal');
  assert.equal(normal.offers.some((o) => o.same && o.id === 'engineer'), true);
  assert.equal(normal.offers.some((o) => o.id === 'teacher'), false); // needs Communication 16
  assert.equal(normal.locked.some((o) => o.id === 'teacher'), true);
  s.stats.communication = 20;
  assert.equal(sim.jobOffers(s, 'normal').offers.some((o) => o.id === 'teacher'), true);
  const avg = (eco) => {
    let t = 0;
    for (let i = 0; i < 200; i++) t += sim.jobOffers(s, eco).offers.find((o) => o.id === 'teacher').pay;
    return t / 200;
  };
  assert.ok(avg('recession') < avg('normal') * 0.93);
  const offer = sim.jobOffers(s, 'normal').offers.find((o) => o.id === 'teacher');
  sim.takeJob(s, offer);
  assert.equal(s.career, 'teacher');
  assert.equal(s.salary, offer.pay);
});

test('spending breakdown adds up to monthly spending', () => {
  const s = sim.newGame('Spend', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 40; s.stage = 'adult'; s.salary = 6000; s.lifestyle = 'comfortable';
  s.car = cars.newCar(s.age);
  s.children = [{ bornAge: 32 }, { bornAge: 35 }];
  const b = sim.spendBreakdown(s);
  assert.equal(b.kidsCount, 2);
  close(b.car, cars.CAR.running + s.car.monthly, 0.01);
  close(sim.monthlySpend(s), b.living + b.car + b.kids + b.groceries + b.homeSpouse - b.allowance, 0.01);
  // Ages 8 and 5: school and preschool, plus groceries, all paid by you (no spouse).
  close(b.kids, sim.childCost(8) + sim.childCost(5), 0.01);
  close(b.groceries, 2 * sim.GROCERIES.child, 0.01);
});

test('a stay-at-home spouse: you pay all shared costs plus their allowance', () => {
  const s = sim.newGame('Fam', { gender: 'male', animal: 'dog', outfit: 0 });
  s.age = 35; s.stage = 'adult'; s.salary = 6000;
  s.spouse = { salary: 5000, home: false };
  s.children = [{ bornAge: 34 }];
  const dual = sim.spendBreakdown(s);
  close(dual.kids, sim.childCost(1) / 2, 0.01);
  close(sim.grossIncome(s), 11000, 0.01);
  s.spouse.home = true; s.spouse.allowance = 600;
  const single = sim.spendBreakdown(s);
  close(single.kids, sim.childCost(1), 0.01);
  close(single.homeSpouse, 600, 0.01);
  close(single.groceries, sim.GROCERIES.child + sim.GROCERIES.spouse, 0.01);
  close(sim.grossIncome(s), 6000, 0.01);
});

test('a self-employed owner paying the home loan from the OA runs the OA dry, then pays cash', () => {
  const s = sim.newGame('Oa', { gender: 'male', animal: 'frog', outfit: 0 });
  s.age = 45; s.stage = 'adult'; s.salary = 7000; s.selfEmployed = true; s.lifestyle = 'simple'; s.career = 'founder2';
  s.cpf.oa = 20000; s.bank = 500000;
  s.home = { id: 'condo', kind: 'private', price: 1500000, loanBalance: 600000, instalment: 3500, rate: 0.03, payWith: 'oa', cpfPrincipal: 0, cpfAccrued: 0, leaseLeft: 99 };
  const sum = sim.advanceYears(s, 1);
  assert.ok(s.cpf.oa < 500, `OA should be (nearly) empty, is ${s.cpf.oa}`); // only the year's interest is left
  close(sum.housingOa, 20000, 600);
  assert.ok(sum.oaRanOut > 20000);
});

test('hospital bills: subsidy, MediShield Life deductible and co-insurance, MediSave limits', () => {
  const c = health.CONDITIONS.find((x) => x.id === 'heart');
  // Co-insurance: 10% of the first $5,000 (counting the deductible), 5% of the next $5,000, 3% above.
  close(health.coInsurance(12000, 2500), 250 + 250 + 60, 0.01);
  const b = health.billBreakdown(c, { age: 50, plan: 'msl', pchi: 2000, medisave: 100000, cash: 100000 });
  assert.equal(b.ward, 'B2');
  assert.equal(b.subsidyPct, 0.8);
  close(b.subsidy + b.msl + b.fromMedisave + b.fromCash + b.medifund, b.gross, 0.01);
  assert.ok(b.fromMedisave <= health.medisaveLimit(c));
  // A private plan with a rider: you still pay 5% co-payment, capped at $3,000.
  const p = health.billBreakdown(c, { age: 50, plan: 'private', rider: true, medisave: 100000, cash: 100000 });
  assert.equal(p.subsidy, 0);
  close(p.fromMedisave + p.fromCash, Math.min(p.gross * 0.05, 3000), 1);
  // MediFund steps in when a subsidised patient can't pay.
  const poor = health.billBreakdown(health.CONDITIONS.find((x) => x.id === 'cancer'), { age: 60, plan: 'msl', pchi: 500, medisave: 0, cash: 0 });
  assert.ok(poor.medifund > 0);
  assert.equal(poor.fromCash, 0);
});

test('health insurance premiums rise with age; MediSave pays MediShield Life plus the AWL', () => {
  const young = health.premiums(30, 'private', true);
  const old = health.premiums(80, 'private', true);
  assert.equal(young.msl, 503); // age next birthday 31
  assert.equal(young.medisave, 503 + 300);
  assert.ok(old.total > 5 * young.total);
  assert.equal(health.premiums(45, 'msl').cash, 0);
});

test('1 to 3 illnesses or accidents a life, from 21 to 84', () => {
  for (let i = 0; i < 50; i++) {
    const plan = health.planHealthEvents(21);
    assert.ok(plan.length >= 1 && plan.length <= 3);
    for (const e of plan) assert.ok(e.age >= 21 && e.age <= 84 && health.CONDITIONS.some((c) => c.id === e.id));
  }
});

test('loan terms: HDB loans to 25 years at 75%; 30 years means a bank loan at 55%', () => {
  const flat = housing.HOMES.find((h) => h.id === 'bto4');
  const q25 = housing.quote(flat, { share: 1, grossIncome: 10000, oa: 100000, cash: 100000, years: 25, age: 30 });
  const q30 = housing.quote(flat, { share: 1, grossIncome: 10000, oa: 100000, cash: 100000, years: 30, age: 30 });
  const q15 = housing.quote(flat, { share: 1, grossIncome: 10000, oa: 100000, cash: 100000, years: 15, age: 30 });
  assert.equal(q25.loanType, 'HDB loan');
  close(q25.loan, flat.price * 0.75, 0.01);
  assert.equal(q30.loanType, 'Bank loan');
  close(q30.loan, flat.price * 0.55, 0.01);
  assert.ok(q15.instalment > q25.instalment);
});

test('loan paid part from CPF, part in cash; selling refunds CPF used plus accrued interest', () => {
  const flat = housing.HOMES.find((h) => h.id === 'bto3');
  const q = housing.quote(flat, { share: 1, grossIncome: 8000, oa: 0, cash: 200000, years: 25, age: 30 });
  const home = housing.newHome(q, 30);
  housing.setOaShare(home, 0.4);
  const m = housing.payMonth(home, 100000);
  close(m.fromOa, q.instalment * 0.4, 0.01);
  close(m.fromCash, q.instalment * 0.6, 0.01);
  for (let i = 0; i < 119; i++) housing.payMonth(home, 100000);
  const b = housing.saleBreakdown(home);
  close(b.principal, q.instalment * 0.4 * 120, 0.5);
  assert.ok(b.accrued > 0);
  close(b.refund, b.principal + b.accrued, 0.01);
});

test('cars: 30% down, a 7-year loan, PARF rebate by age, and almost nothing left when the COE ends', () => {
  const car = cars.newCar(30);
  close(car.down, cars.CAR.price * 0.3, 0.01);
  assert.equal(cars.parfRebate(4), cars.CAR.arf * 0.3);
  close(cars.parfRebate(9.5), cars.CAR.arf * 0.05, 0.01);
  assert.equal(cars.parfRebate(11), 0);
  const early = cars.quote(car, 33);
  const late = cars.quote(car, 40);
  assert.ok(early.value > 80000);
  assert.ok(late.value < 2000);
  for (let i = 0; i < 84; i++) cars.payMonth(car);
  assert.equal(cars.loanLeft(car), 0);
  close(cars.monthlyCost(car), cars.CAR.running, 0.01);
  const s = sim.newGame('Car', { gender: 'male', animal: 'dog', outfit: 0 });
  s.age = 30; s.stage = 'adult'; s.bank = 100000;
  sim.buyCar(s);
  s.age = 33;
  const q = sim.sellCar(s);
  assert.equal(s.car, null);
  close(s.bank, 100000 - 54000 + q.value - q.loan, 1);
});

test('the home loan being paid off is recorded', () => {
  const flat = housing.HOMES.find((h) => h.id === 'bto3');
  const q = housing.quote(flat, { share: 1, grossIncome: 8000, oa: 0, cash: 200000, years: 5, age: 30 });
  const s = sim.newGame('Own', { gender: 'female', animal: 'frog', outfit: 0 });
  s.age = 30; s.stage = 'adult'; s.salary = 8000; s.bank = 500000; s.cpf.oa = 200000;
  s.home = housing.newHome(q, 30);
  sim.advanceYears(s, 6);
  assert.ok(s.home.loanBalance <= 0.01);
  assert.equal(s.home.paidOffAge, 34);
});

test('cash top-ups stop at the FRS before 55, counting SA money invested', () => {
  const s = sim.newGame('T', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 40; s.stage = 'adult';
  s.cpf.sa = cpf.RETIREMENT_SUMS.FRS - 10000;
  assert.equal(sim.topUpRoom(s), 10000);
  s.holdings = [{ id: 'world', src: 'sa', value: 5000, cost: 4000 }];
  assert.equal(sim.topUpRoom(s), 6000);
  const r = sim.topUpCpf(s, 9000);
  assert.equal(r.accepted, 6000);
  assert.equal(sim.topUpRoom(s), 0);
  s.age = 55; // SA closed: top-ups now go to the RA, up to the ERS
  s.cpf.ra = 200000;
  assert.equal(sim.topUpRoom(s), cpf.RETIREMENT_SUMS.ERS - 200000);
});

test('DCA plans buy once a year; old monthly budget plans become yearly DCA plans', () => {
  const s = sim.newGame('Dca', { gender: 'male', animal: 'dog', outfit: 0 });
  s.age = 30; s.stage = 'adult'; s.salary = 6000; s.bank = 100000;
  s.budget = { ...sim.newBudget(), investAmt: 500, investId: 'bond' };
  assert.deepEqual(sim.dcaPlans(s), [{ id: 'bond', src: 'cash', perYear: 6000 }]);
  assert.equal(s.budget.investAmt, 0);
  assert.equal(sim.dcaCashPerYear(s), 6000);
});

test('SG Child Support Package: same Baby Gift for every child, Child Credits from 1 to 16, PSEA pays part of university', () => {
  assert.equal(sim.babySupport(1).cashGift, 10000);
  assert.equal(sim.babySupport(3).cashGift, 10000);
  assert.equal(sim.babySupport(3).medisave, 9000);
  const s = sim.newGame('Kid', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 40; s.stage = 'adult'; s.salary = 6000; s.bank = 100000;
  s.children = [{ bornAge: 35, gender: 'male', animal: 'cat', outfit: 0 }, { bornAge: 23, gender: 'male', animal: 'cat', outfit: 0 }];
  const sum = sim.advanceYears(s, 1);
  assert.equal(sum.childCredits, 2000);
  assert.equal(s.children[1].psea, 10000);
  sim.payUniversity(s, s.children[1], 'cash');
  assert.equal(s.children[1].pseaUsed, 10000);
});

test('a yearly CPF top-up plan stops itself when the SA reaches the FRS', () => {
  const s = sim.newGame('Plan', { gender: 'female', animal: 'cat', outfit: 0 });
  s.age = 40; s.stage = 'adult'; s.salary = 6000; s.bank = 500000;
  s.cpf.sa = cpf.RETIREMENT_SUMS.FRS - 15000;
  s.budget = { ...sim.newBudget(), cpfSelf: 1000 }; // an old monthly plan becomes $12,000 a year
  assert.equal(sim.cpfTopUpPerYear(s), 12000);
  sim.advanceYears(s, 3);
  assert.equal(s.budget.cpfYearly, 0);
  assert.ok(s.cpfPlanStopped && s.cpfPlanStopped.before55);
  assert.equal(sim.topUpRoom(s), 0);
});

test('low wages: the employee share phases in at 3x the age band rate', () => {
  assert.equal(cpf.monthlyContribution(30, 600).employee, 60); // 0.6 x $100
  assert.equal(cpf.monthlyContribution(62, 600).employee, 37); // 0.375 x $100, rounded down
  assert.equal(cpf.monthlyContribution(72, 700).employee, 30); // 0.15 x $200
});

test('MediSave above the BHS goes to the SA, or the OA once the SA is at the FRS', () => {
  const a = { oa: 0, sa: 100, ma: cpf.BASIC_HEALTHCARE_SUM, ra: 0 };
  cpf.deposit(a, 40, { ma: 500 });
  assert.equal(a.sa, 600);
  const b = { oa: 0, sa: cpf.RETIREMENT_SUMS.FRS - 200, ma: cpf.BASIC_HEALTHCARE_SUM, ra: 0 };
  cpf.deposit(b, 40, { ma: 500 });
  assert.equal(b.sa, cpf.RETIREMENT_SUMS.FRS);
  assert.equal(b.oa, 300);
});

test('every holiday has a postcard and a tab, and trips record who went', async () => {
  const { HOLIDAYS, HOLIDAY_GROUPS } = await import('../js/data.js');
  const { postcard } = await import('../js/postcards.js');
  for (const h of HOLIDAYS) {
    assert.ok(postcard(h.id).includes('<svg'), `${h.id} has no postcard`);
    assert.ok(HOLIDAY_GROUPS.some((g) => g.id === h.group), `${h.id} has no tab`);
  }
  const s = sim.newGame('T', { animal: 'cat' });
  s.age = 30; s.stage = 'adult'; s.bank = 50000; s.holidayPlans = [{ id: 'kenya', mode: 'times', left: 1 }];
  sim.advanceYears(s, 1);
  assert.deepEqual(s.trips.at(-1), { age: 30, id: 'kenya', party: 'solo' });
});

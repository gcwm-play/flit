// Random life events. World events change the coming years (and your stats can
// soften them); personal events and cash gifts happen to you alone.
import { rand, pick, FACTS } from './data.js';
import { money, payFromMedisave, coverShortfall, marry, haveChild, spendCash, buyCar } from './sim.js';
import * as cars from './car.js';
import * as invest from './invest.js';

// How much your stats protect you: 0 (none) to 0.8 (mostly), plus hybrid bonuses.
export function resistance(s, keys, hybrids = []) {
  const avg = keys.reduce((t, k) => t + s.stats[k], 0) / keys.length;
  const bonus = hybrids.filter((h) => s.hybrids[h]).length * 0.1;
  return Math.max(0, Math.min(0.8, avg / 50 + bonus));
}

const pct = (r) => `${Math.round(r * 100)}%`;
const statLine = (s, keys) => keys.map((k) => `${k === 'moneySense' ? 'Money Sense' : cap(k)} ${Math.round(s.stats[k])}`).join(', ');
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const working = (s) => (s.stage === 'adult' || (s.stage === 'senior' && s.age < 70 && s.workMode !== 'retired')) && s.salary > 0;

// ---------- world events: rolled before the years pass, they return sim options ----------

export const WORLD_EVENTS = [
  {
    id: 'recession',
    stages: ['adult', 'senior'],
    when: working,
    run(s) {
      const keys = ['career', 'resilience'];
      const r = resistance(s, keys, ['leadership', 'teamwork']);
      const hit = Math.random() > r;
      const months = hit ? Math.round(6 * (1 - r)) + (s.selfEmployed ? 2 : 0) : 0;
      const text = hit
        ? `${s.selfEmployed ? 'Your clients cut back and your business dries up.' : 'Companies are cutting jobs, and yours is one of them: you are retrenched.'} You are out of work for ${months} months while you look for a new job. Your ${statLine(s, keys)} cut the damage by ${pct(r)}. This is why an emergency fund of 6 months' spending matters.`
        : `Companies are cutting jobs, but your ${statLine(s, keys)} kept you in work. Investments still take a knock this year.`;
      return { icon: '📉', title: 'Recession!', text, opts: { noPayMonths: months, market: -1.5, retrenched: hit && months > 0 } };
    },
  },
  {
    id: 'pandemic',
    stages: ['child', 'teen', 'adult', 'senior'],
    run(s) {
      if (s.stage === 'child' || s.stage === 'teen') {
        const r = resistance(s, ['resilience', 'knowledge']);
        const loss = Math.round(3 * (1 - r) * 10) / 10;
        s.stats.communication = Math.max(0, s.stats.communication - loss);
        return {
          icon: '🦠',
          title: 'Pandemic: home-based learning',
          text: `Schools move online and you miss your friends. Communication −${loss}. Resilience and Knowledge help you adapt.`,
        };
      }
      const essential = ['nurse', 'teacher'].includes(s.career);
      const keys = ['health', 'resilience'];
      const r = resistance(s, keys, ['vitality']);
      const months = working(s) && !essential ? Math.round(4 * (1 - r)) : 0;
      s.bank += 600;
      const text = `${essential ? 'As an essential worker you keep working through it.' : months ? `Your income stops for ${months} months.` : 'You adapt and keep working from home.'} ` +
        `The Government sends every adult a $600 support payment (added to your bank). Your ${statLine(s, keys)} kept you ${pct(r)} safer.`;
      return { icon: '🦠', title: 'Global pandemic', text, opts: { noPayMonths: months, market: -0.7 } };
    },
  },
  {
    id: 'crash',
    stages: ['adult', 'senior'],
    when: (s) => invest.total(s) > 1000,
    run(s) {
      const calm = s.stats.moneySense >= 20 || s.hybrids.planner;
      const loss = -invest.shock(s, -2.2);
      if (!calm) invest.sellAll(s);
      return calm
        ? {
            icon: '📊',
            title: 'Stock market crash',
            text: `Share prices plunge and your investments lose ${money(loss)}. Your Money Sense tells you not to panic-sell, so you hold on. Markets often bounce back afterwards.`,
            opts: { market: 0.8 },
          }
        : {
            icon: '📊',
            title: 'Stock market crash',
            text: `Share prices plunge, your investments lose ${money(loss)}, and you panic-sell everything, locking in the loss. CPF-funded investments go back to your CPF. (Raising your Money Sense to 20 helps you stay calm next time.)`,
          };
    },
  },
  {
    id: 'inflation',
    stages: ['adult', 'senior'],
    run(s) {
      const r = resistance(s, ['moneySense'], ['planner']);
      const rise = 0.15 * (1 - r);
      return {
        icon: '🛒',
        title: 'Prices shoot up',
        text: `Inflation spikes: your living costs rise ${pct(rise)} this year. Budgeting skills (Money Sense ${Math.round(s.stats.moneySense)}) help you find cheaper options.`,
        opts: { costFactor: 1 + rise },
      };
    },
  },
  {
    id: 'ai',
    stages: ['adult'],
    when: working,
    run(s) {
      const ready = s.stats.knowledge >= 30 || s.hybrids.innovation || s.stats.career >= 25;
      const change = ready ? 0.08 : -0.1;
      s.salary *= 1 + change;
      return {
        icon: '🤖',
        title: 'AI shakes up jobs',
        text: ready
          ? 'New AI tools change how your industry works. Your skills let you use them well, and your pay rises 8%.'
          : 'New AI tools take over parts of your job and your pay drops 10%. Knowledge, Innovation or Career Skills would help you adapt (try a SkillsFuture course).',
      };
    },
  },
  {
    id: 'familyBudget',
    stages: ['child', 'teen'],
    run(s) {
      const r = resistance(s, ['resilience', 'creativity']);
      return {
        icon: '🧾',
        title: 'Your family tightens its belt',
        text: `A parent's company is cutting costs, so your pocket money is smaller this year. ${r > 0.3 ? 'You find creative, cheap ways to have fun.' : ''}`,
        opts: { allowanceFactor: 0.5 + r / 2 },
      };
    },
  },
];

// ---------- personal events and gifts: happen after the years pass ----------

const gift = (icon, title, text, amount) => ({ icon, title, text, gift: Math.round(amount) });

function wedding(s, cost) {
  marry(s, cost);
  s.joy += cost > 20000 ? 5 : 3;
  return {
    text: `Congratulations! You and your spouse split the ${money(cost)} cost. Your guests give you wedding gifts.`,
    gift: gift('💌', 'Wedding gifts', 'Your share of the gifts from your guests.', (cost > 20000 ? 40000 : 12000) / 2),
  };
}

export const PERSONAL_EVENTS = [
  // Cash gifts
  { id: 'festive', stages: ['child', 'teen'], weight: 3, run: (s) => gift('🧧', 'Festive gift packets!', 'Relatives give you gift packets during the festive season.', s.stage === 'child' ? rand(8, 25) * 10 : rand(15, 40) * 10) },
  { id: 'birthday', stages: ['child', 'teen'], weight: 2, run: (s) => gift('🎂', 'Birthday money', 'Your grandparents give you money for your birthday.', rand(3, 10) * 10) },
  { id: 'edusave', stages: ['teen'], weight: 2, when: (s) => s.stats.knowledge >= 15, run: () => gift('🏅', 'Edusave Merit Bursary', 'Your good results earn you a bursary.', 500) },
  { id: 'contest', stages: ['child', 'teen'], weight: 1, when: (s) => s.stats.creativity >= 10, run: () => gift('🏆', 'You won an art competition!', 'Your creativity pays off with a cash prize.', 200) },
  { id: 'bonus', stages: ['adult'], weight: 3, when: (s) => working(s) && !s.selfEmployed, run: (s) => gift('💰', 'Year-end bonus', 'Your company had a good year.', s.salary * (1 + Math.min(1.5, s.stats.career / 30))) },
  { id: 'sidegig', stages: ['adult'], weight: 1, when: (s) => s.stats.creativity >= 15, run: () => gift('🎨', 'Side gig', 'People pay for your creative work on weekends.', rand(10, 30) * 100) },
  { id: 'luckydraw', stages: ['adult', 'senior'], weight: 1, when: working, run: () => gift('🎟️', 'Lucky draw win', 'You win the lucky draw at a company dinner.', rand(5, 20) * 100) },
  { id: 'kidsgift', stages: ['senior'], weight: 3, run: () => gift('💝', 'A gift from family', 'Your family gives you money as a thank you.', rand(5, 20) * 100) },

  // Family
  {
    id: 'partner',
    stages: ['adult'],
    weight: 10,
    when: (s) => !s.spouse && !s.stayingSingle && s.age >= 24 && s.age <= 42,
    run: () => ({
      icon: '💞',
      title: 'You’ve met someone special',
      text: 'After a few years together, you talk about getting married. Married couples can apply for a BTO flat together, and you would share household costs.',
      fact: FACTS.marriage,
      choices: [
        { label: 'Simple wedding ($15,000)', run: (s) => wedding(s, 15000) },
        { label: 'Big wedding ($50,000)', run: (s) => wedding(s, 50000) },
        { label: 'Stay single for now', run: (s) => { if (s.age >= 35) s.stayingSingle = true; return 'You enjoy your independence. Singles can buy an HDB flat from 35.'; } },
      ],
    }),
  },
  {
    id: 'baby',
    stages: ['adult'],
    weight: 8,
    when: (s) => s.spouse && s.children.length < 3 && s.age <= 42 && !s.noMoreKids && (!s.children.length || s.age - s.children.at(-1).bornAge >= 2),
    run: (s) => ({
      icon: '🍼',
      title: s.children.length ? 'Another baby?' : 'Start a family?',
      text: `A child costs about $550 to $1,000 a month depending on age, plus groceries, until they're grown up${s.spouse && !s.spouse.home ? ' (you pay half)' : ''}. The Government helps through the SG Child Support Package.`,
      fact: FACTS.fertility,
      choices: [
        { label: 'Have a baby', run: (s) => {
          const b = haveChild(s);
          return {
            text: `Congratulations! Under the SG Child Support Package your baby gets a ${money(b.medisave)} MediSave grant${b.medisave > 4000 ? ' (including $5,000 extra for large families)' : ''} and a ${money(b.cdaGrant)} CDA First Step Grant. The Government also matches what you save in their Child Development Account (CDA), up to ${money(b.cdaMatch)}; CDA money can only pay for things like preschool and medical bills. From age 1 to 16 they get ${money(2000)} of Child Credits a year. Joy +4.`,
            gift: gift('👶', 'Baby Gift', 'Part of the SG Child Support Package: cash for every Singapore citizen baby, whatever the birth order, paid in 2 parts within a year of birth. Here you get it all at once. You can spend it on anything.', b.cashGift),
          };
        } },
        { label: s.children.length ? 'No more children' : 'Not now', run: (s) => { if (s.children.length) s.noMoreKids = true; return 'OK. You can decide again later.'; } },
      ],
    }),
  },

  // Health: illnesses and accidents are planned per life (see health.js), not rolled here.
  {
    id: 'parentcare',
    stages: ['adult'],
    weight: 1,
    when: (s) => s.age >= 35,
    run: (s) => ({
      icon: '👵',
      title: 'Your parent is in hospital',
      text: 'The bill after insurance is $6,000. In Singapore you can use your own MediSave to pay for your parents’ hospital stays.',
      choices: [
        { label: 'Pay with my MediSave', run: (s) => { const p = payFromMedisave(s, 6000); return `MediSave pays ${money(p.ma)}${p.cash ? `, cash ${money(p.cash)}` : ''}.`; } },
        { label: 'Pay in cash', run: (s) => { coverShortfall(s, 6000); return 'You pay $6,000 from your savings.'; } },
      ],
    }),
  },

  // Money choices
  {
    id: 'scam',
    stages: ['teen', 'adult', 'senior'],
    weight: 2,
    when: (s) => s.bank > 2000,
    run: (s) => {
      const amount = Math.min(10000, Math.round(s.bank / 2 / 100) * 100);
      return {
        icon: '📲',
        title: '"Guaranteed 30% returns!"',
        text: `Someone online offers a "risk-free" investment that doubles your money. They want ${money(amount)} now.`,
        choices: [
          { label: 'Invest!', run: (s) => {
            if (s.stats.moneySense >= 15) return 'Your Money Sense kicks in: no real investment is "guaranteed" to return 30%. You back out just in time.';
            spendCash(s, amount);
            return `It was a scam and the money is gone. Remember: if it sounds too good to be true, it is. (Check with ScamShield.)`;
          } },
          { label: 'No thanks', run: (s) => { s.stats.moneySense += 1; return 'Smart. Money Sense +1.'; } },
        ],
      };
    },
  },
  {
    id: 'holiday',
    stages: ['adult', 'senior'],
    weight: 2,
    run: (s) => {
      const cost = s.stage === 'senior' ? 6000 : 4000;
      return {
        icon: '✈️',
        title: 'Holiday with friends',
        text: `Your friends are planning a trip to Japan. It costs ${money(cost)}.`,
        choices: [
          { label: 'Go!', run: (s) => { coverShortfall(s, cost); s.joy += 3; return 'Amazing trip! Joy +3. Memories last a lifetime.'; } },
          { label: 'Save the money', run: () => 'You stay home and keep your savings.' },
        ],
      };
    },
  },
  {
    id: 'car',
    stages: ['adult'],
    weight: 1,
    when: (s) => !s.car && s.age >= 28,
    run: (s) => ({
      icon: '🚗',
      title: 'Buy a car?',
      text: `A new car costs about ${money(cars.CAR.price)}, most of it for the 10-year COE. You pay ${money(cars.CAR.price * cars.CAR.downPct)} down, then a loan of about ${money(cars.newCar(s.age).monthly)} a month for 7 years, plus about ${money(cars.CAR.running)} a month for petrol, parking, insurance and road tax. Public transport is much cheaper.`,
      choices: [
        { label: 'Buy the car', run: (s) => { buyCar(s); return `Vroom! Joy +2. You paid ${money(s.car.down)} down, and the car now costs you ${money(cars.monthlyCost(s.car))} a month.`; } },
        { label: 'Stick to MRT and bus', run: () => 'You save about $30,000 a year while the car loan lasts, and $11,000 a year after.' },
      ],
    }),
  },
  {
    id: 'promotion',
    stages: ['adult'],
    weight: 2,
    when: (s) => working(s) && s.stats.career >= 15 && Math.random() < s.stats.career / 60,
    run: (s) => {
      s.salary *= 1.1;
      return { icon: '📈', title: 'Promotion!', text: `Your Career Skills pay off: a 10% raise. Your monthly pay is now ${money(s.salary)}.` };
    },
  },
  {
    id: 'grandkids',
    stages: ['senior'],
    weight: 2,
    run: (s) => {
      s.joy += 2;
      return { icon: '👶', title: 'Family time', text: 'Your family visits for a big reunion dinner. Joy +2.' };
    },
  },
  {
    id: 'lostwallet',
    stages: ['child'],
    weight: 1,
    when: (s) => s.bank > 10,
    run: (s) => {
      // Only what a kid would actually carry; the rest is safe in the piggy bank.
      const lost = Math.min(s.bank, rand(5, 20));
      spendCash(s, lost);
      return { icon: '👛', title: 'Lost your wallet!', text: `You dropped your wallet at the playground with ${money(lost)} of pocket money inside. Luckily you only carry a little each day, and the rest of your savings are safe at home and in the bank.` };
    },
  },
];

export function rollWorldEvent(s) {
  const odds = { child: 0.15, teen: 0.15, adult: 0.3, senior: 0.25 }[s.stage];
  if (Math.random() > odds) return null;
  const options = WORLD_EVENTS.filter((e) => e.stages.includes(s.stage) && (!e.when || e.when(s)));
  return options.length ? pick(options) : null;
}

export function rollPersonalEvent(s) {
  if (Math.random() > 0.6) return null;
  const options = PERSONAL_EVENTS.filter((e) => e.stages.includes(s.stage) && (!e.when || e.when(s)));
  const total = options.reduce((t, e) => t + e.weight, 0);
  let r = Math.random() * total;
  for (const e of options) {
    r -= e.weight;
    if (r <= 0) return !e.chance || Math.random() < e.chance(s) ? e : null;
  }
  return null;
}

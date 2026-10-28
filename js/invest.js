// Investments: fictional companies and funds modelled on real markets, bought
// with cash or with CPF savings under the CPF Investment Scheme (CPFIS).
// Returns are illustrative, not predictions. No DOM code here.
import * as cpf from './cpf.js';

// mean/vol are yearly total returns (price plus dividends). beta is how closely
// the product follows the overall market.
// kind: 'stock' and 'reit' count towards the CPFIS 35% stock limit;
// 'etf' can be bought with the OA only; 'fund' and 'bond' with the OA or SA.
export const PRODUCTS = [
  { id: 'bond', name: 'Red Dot Bond Fund', icon: '🛡️', kind: 'bond', like: 'Singapore Government bonds', mean: 0.03, vol: 0.04, beta: 0.1, risk: 1,
    desc: 'Lends money to the Government. Slow and steady, rarely falls much.' },
  { id: 'telco', name: 'StraitsTel', icon: '📶', kind: 'stock', like: 'a big local telecom company', mean: 0.04, vol: 0.15, beta: 0.6, risk: 2,
    desc: 'Pays steady dividends, but growth is slow as the market is crowded.' },
  { id: 'reit', name: 'Harbourfront REIT', icon: '🏬', kind: 'reit', like: 'Singapore REITs (malls and offices)', mean: 0.06, vol: 0.16, beta: 0.7, risk: 2,
    desc: 'Owns malls and offices and pays out most of the rent. Hurt when interest rates rise.' },
  { id: 'sti', name: 'Merlion 30 Index ETF', icon: '🦁', kind: 'etf', like: 'the Straits Times Index (top 30 SGX companies)', mean: 0.065, vol: 0.15, beta: 0.9, risk: 2,
    desc: 'Buys all 30 of Singapore\'s biggest listed companies at once. Low fees.' },
  { id: 'world', name: 'Global 500 Index Fund', icon: '🌏', kind: 'fund', like: 'the S&P 500 (500 big US companies)', mean: 0.08, vol: 0.16, beta: 1, risk: 3,
    desc: 'Spreads your money over 500 large companies. Falls hard in crashes but has grown over the long run.' },
  { id: 'bank', name: 'Lion City Bank', icon: '🏦', kind: 'stock', like: 'Singapore\'s large local banks', mean: 0.08, vol: 0.2, beta: 0.9, risk: 3,
    desc: 'A big local bank. Good dividends; profits swing with the economy.' },
  { id: 'hawker', name: 'Golden Hawker Group', icon: '🍜', kind: 'stock', like: 'a regional food and drinks chain', mean: 0.05, vol: 0.22, beta: 0.7, risk: 3,
    desc: 'Runs food courts across Asia. People always eat, but rents and costs bite.' },
  { id: 'ai', name: 'Nimbus AI', icon: '🤖', kind: 'stock', like: 'US tech growth stocks (Nasdaq)', mean: 0.12, vol: 0.38, beta: 1.2, risk: 4,
    desc: 'A fast-growing tech company. Can double in a good year or halve in a bad one.' },
  { id: 'biotech', name: 'Equator Biotech', icon: '🧬', kind: 'stock', like: 'small speculative biotech companies', mean: 0.06, vol: 0.5, beta: 0.8, risk: 5, bustChance: 0.06,
    desc: 'Betting on one new drug. A trial success could multiply your money; a failure could wipe most of it out.' },
];

export const RISK_LABELS = ['', 'Very low', 'Medium-low', 'Medium', 'High', 'Very high'];

// CPFIS rules (cpf.gov.sg, 2026).
export const CPFIS = {
  minAge: 18,
  oaKeep: 20000, // the first $20,000 of the OA can't be invested
  saKeep: 40000, // the first $40,000 of the SA can't be invested
  stockShare: 0.35, // at most 35% of investible savings in stocks (and REITs)
};

export const SOURCES = {
  cash: { label: 'Cash', short: 'cash' },
  oa: { label: 'CPF OA (CPFIS-OA)', short: 'OA' },
  sa: { label: 'CPF SA (CPFIS-SA)', short: 'SA' },
};

export const product = (id) => PRODUCTS.find((p) => p.id === id);

export function holdings(s) {
  return (s.holdings ||= []);
}

export function total(s, src) {
  return holdings(s).filter((h) => !src || h.src === src).reduce((t, h) => t + h.value, 0);
}

// Can this product be bought from this source?
export function allowed(p, src) {
  if (src === 'cash') return true;
  if (src === 'oa') return true;
  return p.kind === 'fund' || p.kind === 'bond'; // CPFIS-SA: no shares, REITs or ETFs
}

// The most that can be put into a product from a source right now.
export function maxBuy(s, p, src) {
  if (src === 'cash') return Math.max(0, s.bank);
  if (s.age < CPFIS.minAge) return 0;
  if (src === 'sa') {
    if (s.age >= 55) return 0; // the SA closes at 55
    return Math.max(0, s.cpf.sa - CPFIS.saKeep);
  }
  let room = Math.max(0, s.cpf.oa - CPFIS.oaKeep);
  if (p.kind === 'stock' || p.kind === 'reit') {
    // Investible savings: what's in the OA plus what's already invested from it.
    const investible = s.cpf.oa + costOf(s, 'oa');
    const inStocks = holdings(s).filter((h) => h.src === 'oa' && isStock(h)).reduce((t, h) => t + h.cost, 0);
    room = Math.min(room, Math.max(0, investible * CPFIS.stockShare - inStocks));
  }
  return room;
}

// Why a source can't be used, or '' if it can.
export function blockedReason(s, p, src) {
  if (src === 'cash') return s.bank > 0 ? '' : 'No cash to invest.';
  if (s.age < CPFIS.minAge) return 'CPFIS starts at 18.';
  if (!allowed(p, src)) return 'CPFIS-SA only allows approved unit trusts and bonds, not shares, REITs or ETFs.';
  if (src === 'sa' && s.age >= 55) return 'Your SA closed at 55.';
  if (src === 'sa' && s.cpf.sa <= CPFIS.saKeep) return 'You need more than $40,000 in your SA.';
  if (src === 'oa' && s.cpf.oa <= CPFIS.oaKeep) return 'You need more than $20,000 in your OA.';
  if (maxBuy(s, p, src) <= 0) return 'You have reached the 35% limit for stocks.';
  return '';
}

const isStock = (h) => ['stock', 'reit'].includes(product(h.id).kind);
export const costOf = (s, src) => holdings(s).filter((h) => h.src === src).reduce((t, h) => t + h.cost, 0);

export function buy(s, id, src, amount) {
  const p = product(id);
  const a = Math.min(amount, maxBuy(s, p, src));
  if (a <= 0) return 0;
  if (src === 'cash') s.bank -= a;
  else s.cpf[src] -= a;
  let h = holdings(s).find((x) => x.id === id && x.src === src);
  if (!h) holdings(s).push((h = { id, src, value: 0, cost: 0 }));
  h.value += a;
  h.cost += a;
  return a;
}

// Sells part of a holding. CPF money goes back to the account it came from
// (SA money goes to the RA after 55).
export function sell(s, id, src, amount) {
  const h = holdings(s).find((x) => x.id === id && x.src === src);
  if (!h) return 0;
  const a = Math.min(amount, h.value);
  h.cost *= h.value > 0 ? 1 - a / h.value : 0;
  h.value -= a;
  if (src === 'cash') s.bank += a;
  else if (src === 'sa' && s.age >= 55) s.cpf.ra += a;
  else s.cpf[src] += a;
  if (h.value < 1) s.holdings = holdings(s).filter((x) => x !== h);
  return a;
}

export function sellAll(s) {
  for (const h of holdings(s).slice()) sell(s, h.id, h.src, h.value);
}

// One year of market moves. `market` is how the whole market does, in standard
// deviations (0 = an average year, -2.5 = a crash). Returns the gain or loss.
export function yearPassed(s, market = randn()) {
  let change = 0;
  s.lastReturns = {};
  for (const p of PRODUCTS) {
    let r = p.mean + p.vol * (p.beta * market + Math.sqrt(Math.max(0, 1 - p.beta * p.beta)) * randn());
    if (p.bustChance && Math.random() < p.bustChance) r = -0.75;
    s.lastReturns[p.id] = Math.max(-0.9, r);
  }
  for (const h of holdings(s)) {
    const d = h.value * s.lastReturns[h.id];
    h.value += d;
    change += d;
  }
  return change;
}

// A one-off fall in prices, e.g. a crash.
export function shock(s, market) {
  let change = 0;
  for (const h of holdings(s)) {
    const p = product(h.id);
    const d = h.value * Math.max(-0.9, p.vol * p.beta * market);
    h.value += d;
    change += d;
  }
  return change;
}

// What the same CPF money would have earned left in the account, for comparison.
export function cpfAlternative(src) {
  return src === 'sa' ? cpf.INTEREST.sa : cpf.INTEREST.oa;
}

function randn() {
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

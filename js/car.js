// Owning a car in Singapore: a 10-year COE, a car loan, running costs, and what
// the car is worth when you sell it or its COE runs out. No DOM code here.

// Car types, rounded 2026 prices on the road. Category A COE (small cars, up to 1,600cc
// or 110kW) is about $110,000-120,000; Category B (bigger or more powerful) about $125,000.
// The ARF is the registration fee: a tiered share of the car's open market value, so it is
// much bigger for pricey cars. EVs pay less ARF after the EV rebates.
// MAS caps car loans at 70% of the price if the open market value is $20,000 or less, 60% above.
export const CAR_TYPES = {
  compact: { label: 'Compact hatchback', icon: '🚗', cat: 'A', price: 150000, coe: 112000, arf: 14000, downPct: 0.3, running: 750, joy: 1,
    desc: 'Small and easy to park. Cheapest to run.' },
  sedan: { label: 'Family sedan', icon: '🚙', cat: 'A', price: 180000, coe: 120000, arf: 27000, downPct: 0.3, running: 900, joy: 2,
    desc: 'The most common choice: room for a small family.' },
  ev: { label: 'Electric car', icon: '🔌', cat: 'A', price: 175000, coe: 120000, arf: 18000, downPct: 0.3, running: 650, joy: 2,
    desc: 'Charging costs less than petrol and the road tax is lower.' },
  mpv: { label: '7-seater MPV', icon: '🚐', cat: 'B', price: 260000, coe: 125000, arf: 60000, downPct: 0.4, running: 1200, joy: 2,
    desc: 'Room for the whole family and the grandparents.' },
  luxury: { label: 'Luxury car', icon: '🏎️', cat: 'B', price: 400000, coe: 125000, arf: 170000, downPct: 0.4, running: 1700, joy: 4,
    desc: 'A premium badge with a premium price: the ARF alone is huge.' },
};

// Shared by every type. (`CAR` keeps the family sedan's figures for older code and saves.)
export const CAR = {
  ...CAR_TYPES.sedan,
  loanYears: 7, // the longest car loan allowed
  flatRate: 0.0278, // car loans are quoted as a flat rate a year
  coeYears: 10,
};
export const spec = (car) => CAR_TYPES[(car && car.type) || 'sedan'];

// PARF rebate when a car is scrapped, as a share of the ARF, by its age in years.
// For cars registered from February 2026 (LTA): 30% up to 5 years, 5% less each
// year after, 5% at 9 to 10 years, nothing after 10. Capped at $30,000.
export function parfRebate(years, arf = CAR.arf) {
  const pct = years <= 5 ? 0.3 : years > 10 ? 0 : 0.3 - 0.05 * Math.ceil(years - 5);
  return Math.min(30000, arf * Math.max(0, pct));
}

export function newCar(age, type = 'sedan') {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  const loan = t.price * (1 - t.downPct);
  const months = CAR.loanYears * 12;
  return {
    type: CAR_TYPES[type] ? type : 'sedan',
    boughtAge: age,
    price: t.price,
    down: t.price - loan,
    loan,
    monthly: (loan * (1 + CAR.flatRate * CAR.loanYears)) / months,
    monthsLeft: months,
  };
}

export const carAge = (car, age) => age - car.boughtAge;
export const loanLeft = (car) => (car.loan * car.monthsLeft) / (CAR.loanYears * 12); // principal still owed
export const monthlyCost = (car) => spec(car).running + (car.monthsLeft > 0 ? car.monthly : 0);

// One month of the car loan. Returns the instalment paid.
export function payMonth(car) {
  if (car.monthsLeft <= 0) return 0;
  car.monthsLeft--;
  return car.monthly;
}

// What a dealer would pay: the "paper value" (the unused part of the COE plus the PARF
// rebate) and a little more for the years of driving left. It falls to almost nothing
// as the COE runs out.
export function quote(car, age) {
  const years = Math.min(carAge(car, age), CAR.coeYears); // scrapped when the COE ends
  const left = Math.max(0, CAR.coeYears - years);
  const t = spec(car);
  const coeRebate = (t.coe * left) / CAR.coeYears;
  const parf = parfRebate(Math.max(years, 0.5), t.arf);
  const extra = (t.price - t.coe - t.arf) * (left / CAR.coeYears) * 0.5;
  const value = coeRebate + parf + extra;
  return { years, coeRebate, parf, extra, value, loan: loanLeft(car), net: value - loanLeft(car) };
}

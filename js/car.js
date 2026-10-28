// Owning a car in Singapore: a 10-year COE, a car loan, running costs, and what
// the car is worth when you sell it or its COE runs out. No DOM code here.

// A mass-market (COE Category A) car in 2026, rounded: about $180,000 on the road,
// of which about $120,000 is the COE and $27,000 the Additional Registration Fee (ARF).
export const CAR = {
  price: 180000,
  coe: 120000,
  arf: 27000,
  downPct: 0.3, // MAS: car loans cover at most 70% of the price (60% for pricier cars)
  loanYears: 7, // the longest car loan allowed
  flatRate: 0.0278, // car loans are quoted as a flat rate a year
  running: 900, // petrol, parking, insurance, road tax, servicing and ERP a month
  coeYears: 10,
};

// PARF rebate when a car is scrapped, as a share of the ARF, by its age in years.
// For cars registered from February 2026 (LTA): 30% up to 5 years, 5% less each
// year after, 5% at 9 to 10 years, nothing after 10. Capped at $30,000.
export function parfRebate(years, arf = CAR.arf) {
  const pct = years <= 5 ? 0.3 : years > 10 ? 0 : 0.3 - 0.05 * Math.ceil(years - 5);
  return Math.min(30000, arf * Math.max(0, pct));
}

export function newCar(age) {
  const loan = CAR.price * (1 - CAR.downPct);
  const months = CAR.loanYears * 12;
  return {
    boughtAge: age,
    price: CAR.price,
    down: CAR.price - loan,
    loan,
    monthly: (loan * (1 + CAR.flatRate * CAR.loanYears)) / months,
    monthsLeft: months,
  };
}

export const carAge = (car, age) => age - car.boughtAge;
export const loanLeft = (car) => (car.loan * car.monthsLeft) / (CAR.loanYears * 12); // principal still owed
export const monthlyCost = (car) => CAR.running + (car.monthsLeft > 0 ? car.monthly : 0);

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
  const coeRebate = (CAR.coe * left) / CAR.coeYears;
  const parf = parfRebate(Math.max(years, 0.5));
  const extra = (CAR.price - CAR.coe - CAR.arf) * (left / CAR.coeYears) * 0.5;
  const value = coeRebate + parf + extra;
  return { years, coeRebate, parf, extra, value, loan: loanLeft(car), net: value - loanLeft(car) };
}

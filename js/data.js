// Game content: stages, stats, activities, careers, shop items and quiz questions.

export const STATS = {
  creativity: { label: 'Creativity', icon: '🎨', stage: 'child' },
  fitness: { label: 'Fitness', icon: '🏃', stage: 'child' },
  knowledge: { label: 'Knowledge', icon: '📚', stage: 'child' },
  communication: { label: 'Communication', icon: '💬', stage: 'child' },
  moneySense: { label: 'Money Sense', icon: '🪙', stage: 'teen' },
  resilience: { label: 'Resilience', icon: '🛡️', stage: 'teen' },
  career: { label: 'Career Skills', icon: '💼', stage: 'adult' },
  health: { label: 'Health', icon: '❤️', stage: 'adult' },
};

// Hybrid stats appear when every stat they need reaches the threshold.
// Their value is the lower of the two parents.
export const HYBRID_THRESHOLD = 12;
export const HYBRIDS = {
  leadership: { label: 'Leadership', icon: '🧭', needs: ['communication', 'knowledge'] },
  innovation: { label: 'Innovation', icon: '💡', needs: ['creativity', 'knowledge'] },
  teamwork: { label: 'Teamwork', icon: '🤝', needs: ['fitness', 'communication'] },
  artistry: { label: 'Artistry', icon: '🎭', needs: ['creativity', 'communication'] },
  discipline: { label: 'Discipline', icon: '⏱️', needs: ['fitness', 'knowledge'] },
  enterprise: { label: 'Enterprise', icon: '🚀', needs: ['moneySense', 'creativity'] },
  planner: { label: 'Planner', icon: '📈', needs: ['moneySense', 'knowledge'] },
  vitality: { label: 'Vitality', icon: '🌿', needs: ['health', 'fitness'] },
};

export const STAGES = {
  child: {
    label: 'Child',
    startAge: 7,
    endAge: 13,
    yearsPerTurn: 1,
    yearlyAllowance: 240,
    room: 'bedroom',
    intro: {
      title: 'You already have a CPF account!',
      body: [
        'CPF (Central Provident Fund) is how Singaporeans save for housing, healthcare and retirement.',
        'When you were born, the Government put a $4,000 MediSave Grant for Newborns into your MediSave Account. It has been earning 4% interest a year ever since.',
        'Your parents’ CPF is probably helping to pay for the home you live in right now.',
      ],
    },
  },
  teen: {
    label: 'Teenager',
    startAge: 13,
    endAge: 21,
    yearsPerTurn: 2,
    yearlyAllowance: 600,
    room: 'teenroom',
    intro: {
      title: 'Teen years: your first pay cheque',
      body: [
        'From 13 you can take a weekend part-time job. If you earn more than $50 a month, your employer pays into your CPF too; below $500 a month, you pay nothing in.',
        'CPF has three accounts while you are under 55: the Ordinary Account (OA) for housing and education, the Special Account (SA) for retirement, and MediSave (MA) for healthcare.',
        'New stats unlocked: Money Sense and Resilience.',
      ],
    },
  },
  adult: {
    label: 'Working adult',
    startAge: 21,
    endAge: 55,
    yearsPerTurn: 3,
    room: 'flat',
    intro: {
      title: 'Working life: your big saving years',
      body: [
        'Every month you put 20% of your pay into CPF and your employer adds 17%, on wages up to $8,000 a month.',
        'Interest compounds: the OA earns 2.5% and the SA and MA earn 4%, with an extra 1% on your first $60,000 (only $20,000 of it from the OA).',
        'Big choices, like your home and how you spend, decide how much is left for retirement.',
        'New stats unlocked: Career Skills and Health.',
      ],
    },
  },
  senior: {
    label: 'Senior',
    startAge: 55,
    endAge: 85,
    yearsPerTurn: 5,
    room: 'seniorhome',
    intro: {
      title: 'Turning 55: your Retirement Account',
      body: [
        'At 55 your Special Account closes and a Retirement Account (RA) is created from your SA and OA savings.',
        'Money in your RA will pay you a monthly income for life through CPF LIFE, starting from 65.',
        'For people turning 55 in 2026, the Full Retirement Sum (FRS) is $220,400, which pays about $1,780 a month from 65.',
      ],
    },
  },
};

export const STAGE_ORDER = ['child', 'teen', 'adult', 'senior'];

// Each activity gives `base` points plus up to `bonus` more from the mini game score.
export const ACTIVITIES = {
  child: [
    { id: 'study', label: 'Study harder', icon: '📖', game: 'quiz', quiz: 'child', gains: { knowledge: 1 } },
    { id: 'play', label: 'Play at the playground', icon: '🛝', game: 'tap', gains: { fitness: 1 } },
    { id: 'friends', label: 'Talk with friends', icon: '🗣️', game: 'echo', gains: { communication: 1 } },
    { id: 'create', label: 'Draw and make music', icon: '🖍️', game: 'rhythm', gains: { creativity: 1 } },
  ],
  teen: [
    { id: 'study', label: 'Study for exams', icon: '📝', game: 'quiz', quiz: 'teen', gains: { knowledge: 1 } },
    { id: 'sports', label: 'Sports CCA', icon: '⚽', game: 'tap', gains: { fitness: 1, resilience: 0.5 } },
    { id: 'hangout', label: 'Hang out with friends', icon: '🧋', game: 'echo', gains: { communication: 1 } },
    { id: 'arts', label: 'Band or art club', icon: '🎸', game: 'rhythm', gains: { creativity: 1 } },
    { id: 'job', label: 'Weekend part-time job', icon: '🧾', game: 'quiz', quiz: 'money', minAge: 13, gains: { moneySense: 1, resilience: 0.5 }, job: true },
    { id: 'volunteer', label: 'Volunteer', icon: '🫶', game: 'echo', gains: { resilience: 1, communication: 0.5 } },
  ],
  adult: [
    { id: 'upskill', label: 'SkillsFuture course', icon: '🎓', game: 'quiz', quiz: 'adult', gains: { career: 1, knowledge: 0.5 } },
    { id: 'exercise', label: 'Exercise', icon: '🏋️', game: 'tap', gains: { health: 1, fitness: 0.5 } },
    { id: 'network', label: 'Network', icon: '🤝', game: 'echo', gains: { career: 0.5, communication: 1 } },
    { id: 'hobby', label: 'Creative hobby', icon: '🎹', game: 'rhythm', gains: { creativity: 1, resilience: 0.5 } },
    { id: 'budget', label: 'Review my budget', icon: '🧮', game: 'quiz', quiz: 'cpf', gains: { moneySense: 1 } },
  ],
  senior: [
    { id: 'active', label: 'Stay active', icon: '🚶', game: 'tap', gains: { health: 1, fitness: 0.5 } },
    { id: 'learn', label: 'Learn something new', icon: '📱', game: 'quiz', quiz: 'cpf', gains: { knowledge: 1, moneySense: 0.5 } },
    { id: 'family', label: 'Time with family', icon: '👨‍👩‍👧', game: 'echo', gains: { communication: 1, resilience: 0.5 } },
    { id: 'hobby', label: 'Hobbies', icon: '🪴', game: 'rhythm', gains: { creativity: 1, health: 0.5 } },
  ],
};

// Points gained per activity: base plus up to `bonus` from the mini game.
export const ACTIVITY_BASE = 2;
export const ACTIVITY_BONUS = 4;

export const EDUCATION = {
  university: { label: 'University degree', minKnowledge: 28, pay: 1 },
  poly: { label: 'Polytechnic diploma', minKnowledge: 14, pay: 0.8 },
  jc: { label: 'GCE A-level certificate', minKnowledge: 22, pay: 0.75 },
  ite: { label: 'ITE Nitec', minKnowledge: 0, pay: 0.65 },
};

// After O-levels at 16: junior college (2 years) or polytechnic (3 years) can lead to
// university; ITE leads to work (or a poly diploma later). Knowledge stands in for grades.
export const SCHOOLS = {
  jc: { label: 'Junior college (JC)', icon: '📚', minKnowledge: 22, years: '17 to 18', desc: 'Two years to A-levels, the usual road to university.' },
  poly: { label: 'Polytechnic', icon: '📐', minKnowledge: 14, years: '17 to 19', desc: 'A hands-on diploma: start work after, or go on to university.' },
  ite: { label: 'ITE', icon: '🛠️', minKnowledge: 0, years: '17 to 18', desc: 'Learn a trade for a Nitec and start work sooner.' },
};

// Starting monthly pay (for a degree holder) in today's dollars.
export const CAREERS = [
  // `pay` is the starting pay with a degree; it's lower with a diploma, A-levels or a Nitec.
  { id: 'engineer', label: 'Engineer', icon: '🛠️', pay: 4800, needs: { knowledge: 20 } },
  { id: 'teacher', label: 'Teacher', icon: '🧑‍🏫', pay: 4400, needs: { knowledge: 16, communication: 14 } },
  { id: 'nurse', label: 'Nurse', icon: '🩺', pay: 4000, needs: { fitness: 12, communication: 12 } },
  { id: 'designer', label: 'Designer', icon: '🎨', pay: 3900, needs: { creativity: 18 } },
  { id: 'coach', label: 'Sports coach', icon: '🏅', pay: 3600, needs: { fitness: 18 } },
  { id: 'sales', label: 'Sales executive', icon: '📣', pay: 3600, needs: { communication: 16 } },
  { id: 'founder', label: 'Start my own business', title: 'Business owner', icon: '🚀', pay: 4500, needs: { moneySense: 8, creativity: 12 }, selfEmployed: true },
  { id: 'admin', label: 'Office administrator', icon: '🗂️', pay: 3000, needs: {} },
  // Jobs where skills count more than certificates: the same starting pay for everyone (2026, rounded).
  { id: 'police', label: 'Police officer (SPF)', icon: '👮', pay: 3300, flat: true, oneEmployer: true, needs: { fitness: 12, resilience: 8 } },
  { id: 'technician', label: 'Aircraft technician', icon: '🔧', pay: 2900, flat: true, needs: { knowledge: 10 } },
  { id: 'eceducator', label: 'Preschool teacher', icon: '🧸', pay: 2900, flat: true, needs: { communication: 10, creativity: 6 } },
  { id: 'buscaptain', label: 'Bus captain', icon: '🚌', pay: 2800, flat: true, needs: { resilience: 6 } },
  { id: 'chef', label: 'Cook in a restaurant kitchen', icon: '🍳', pay: 2500, flat: true, needs: { creativity: 8, fitness: 6 } },
  { id: 'logistics', label: 'Logistics coordinator', icon: '📦', pay: 2600, flat: true, needs: { moneySense: 6 } },
  { id: 'security', label: 'Security officer', icon: '🛡️', pay: 2500, flat: true, needs: { fitness: 8 } },
  { id: 'retail', label: 'Retail supervisor', icon: '🛍️', pay: 2400, flat: true, needs: { communication: 8 } },
  { id: 'service', label: 'Customer service officer', icon: '🎧', pay: 2400, flat: true, needs: { communication: 6 } },
  { id: 'hair', label: 'Hairstylist', icon: '✂️', pay: 2200, flat: true, needs: { creativity: 10 } },
];

// Monthly spending (today's dollars, one person, excluding housing and children):
// at least `monthly`, and more as you earn more ("lifestyle creep"), as a share of take-home pay.
export const LIFESTYLES = {
  simple: { label: 'Simple', icon: '🍜', monthly: 1600, share: 0.4, joy: 0, desc: 'Hawker food, public transport, free fun' },
  comfortable: { label: 'Comfortable', icon: '🛋️', monthly: 2200, share: 0.55, joy: 1, desc: 'Eating out, the odd taxi, a gym membership' },
  lavish: { label: 'Lavish', icon: '🥂', monthly: 3500, share: 0.75, joy: 2, desc: 'Fine dining, taxis everywhere, branded goods' },
};

// What a retiree spends a month in each lifestyle (today's dollars).
export const RETIREMENT_LIFESTYLES = {
  simple: { label: 'Simple', monthly: 1500, desc: 'Basic needs, hawker food, public transport' },
  comfortable: { label: 'Comfortable', monthly: 2200, desc: 'Eating out, taxis now and then' },
  lavish: { label: 'Lavish', monthly: 3800, desc: 'Fine dining, taxis, branded goods' },
};

export const HOMES = [
  { id: 'bto3', label: '3-room BTO flat', price: 300000, icon: '🏢', joy: 1 },
  { id: 'bto4', label: '4-room BTO flat', price: 450000, icon: '🏬', joy: 2 },
  { id: 'resale5', label: '5-room resale flat', price: 750000, icon: '🏙️', joy: 3 },
];
export const RENT_MONTHLY = 1400; // renting a room or small flat

// Shop items stay in the room. `perTurn` gives a small stat boost each turn you own it.
export const SHOP = {
  child: [
    { id: 'comics', name: 'Comic books', icon: '📚', price: 20, joy: 1, perTurn: { knowledge: 0.5 } },
    { id: 'ball', name: 'Football', icon: '⚽', price: 25, joy: 1, floor: true, perTurn: { fitness: 0.5 } },
    { id: 'boardgame', name: 'Board game', icon: '🎲', price: 35, joy: 1, perTurn: { communication: 0.5 } },
    { id: 'crayons', name: 'Art set', icon: '🖍️', price: 30, joy: 1, perTurn: { creativity: 0.5 } },
    { id: 'plush', name: 'Teddy bear', icon: '🧸', price: 25, joy: 2 },
    { id: 'fishtank', name: 'Fish tank', icon: '🐠', price: 60, joy: 2, floor: true },
    { id: 'console', name: 'Game console', icon: '🎮', price: 450, joy: 4, floor: true },
  ],
  teen: [
    { id: 'posters', name: 'Posters', icon: '🖼️', price: 30, joy: 1 },
    { id: 'desk', name: 'Study desk lamp', icon: '💡', price: 60, joy: 1, perTurn: { knowledge: 0.5 } },
    { id: 'guitar', name: 'Guitar', icon: '🎸', price: 250, joy: 2, floor: true, perTurn: { creativity: 1 } },
    { id: 'bike', name: 'Bicycle', icon: '🚲', price: 300, joy: 2, floor: true, perTurn: { fitness: 1 } },
    { id: 'headphones', name: 'Headphones', icon: '🎧', price: 180, joy: 2 },
    { id: 'phone', name: 'New smartphone', icon: '📱', price: 1200, joy: 3, perTurn: { communication: 0.5 } },
    { id: 'gamingpc', name: 'Gaming PC', icon: '🖥️', price: 2000, joy: 4, floor: true },
  ],
  adult: [
    { id: 'plants', name: 'House plants', icon: '🪴', price: 80, joy: 1, floor: true },
    { id: 'bookshelf', name: 'Bookshelf', icon: '📚', price: 400, joy: 1, floor: true, perTurn: { knowledge: 1 } },
    { id: 'coffee', name: 'Coffee machine', icon: '☕', price: 600, joy: 2 },
    { id: 'treadmill', name: 'Treadmill', icon: '🏃', price: 1800, joy: 1, floor: true, perTurn: { health: 1 } },
    { id: 'sofa', name: 'Sofa', icon: '🛋️', price: 1500, joy: 2, floor: true },
    { id: 'tv', name: 'Big-screen TV', icon: '📺', price: 2500, joy: 3, floor: true },
    { id: 'piano', name: 'Piano', icon: '🎹', price: 6000, joy: 3, floor: true, perTurn: { creativity: 1 } },
    { id: 'watch', name: 'Luxury watch', icon: '⌚', price: 12000, joy: 3 },
  ],
  senior: [
    { id: 'garden', name: 'Balcony garden', icon: '🌻', price: 100, joy: 2, floor: true, perTurn: { health: 0.5 } },
    { id: 'chess', name: 'Chess table', icon: '♟️', price: 300, joy: 2, floor: true, perTurn: { knowledge: 0.5 } },
    { id: 'tablet', name: 'Tablet', icon: '📲', price: 600, joy: 2, perTurn: { communication: 0.5 } },
    { id: 'karaoke', name: 'Karaoke set', icon: '🎤', price: 900, joy: 3, floor: true },
    { id: 'massage', name: 'Massage chair', icon: '💺', price: 3500, joy: 3, floor: true, perTurn: { health: 0.5 } },
  ],
};

export const QUIZZES = {
  child: () => {
    const a = rand(2, 12), b = rand(2, 12);
    const kind = rand(0, 3);
    if (kind === 0) return mathQ(`${a} + ${b} = ?`, a + b);
    if (kind === 1) return mathQ(`${a + b} − ${b} = ?`, a);
    if (kind === 2) return mathQ(`${a} × ${Math.min(b, 10)} = ?`, a * Math.min(b, 10));
    const p = rand(1, 5), q = rand(1, 4);
    return mathQ(`A snack costs $${p}. How much for ${q}?`, p * q, '$');
  },
  teen: () => {
    const kind = rand(0, 2);
    if (kind === 0) {
      const a = rand(12, 40), b = rand(3, 9);
      return mathQ(`${a} × ${b} = ?`, a * b);
    }
    if (kind === 1) {
      const p = [10, 20, 25, 50][rand(0, 3)], v = rand(2, 9) * 20;
      return mathQ(`${p}% of ${v} = ?`, (p * v) / 100);
    }
    const x = rand(2, 12), m = rand(2, 6), c = rand(1, 20);
    return mathQ(`${m}x + ${c} = ${m * x + c}. x = ?`, x);
  },
  money: () => {
    const kind = rand(0, 1);
    if (kind === 0) {
      const price = rand(3, 18) + [0, 0.5, 0.2, 0.8][rand(0, 3)];
      const paid = price < 10 ? 10 : 20;
      return mathQ(`Customer pays $${paid} for $${price.toFixed(2)}. Change?`, +(paid - price).toFixed(2), '$');
    }
    const hrs = rand(10, 30), rate = rand(9, 12);
    return mathQ(`${hrs} hours at $${rate}/hour = ?`, hrs * rate, '$');
  },
  adult: () => {
    const kind = rand(0, 1);
    if (kind === 0) {
      const pay = rand(30, 70) * 100;
      return mathQ(`You earn $${pay}/month. 20% goes to CPF. Take-home?`, pay * 0.8, '$');
    }
    const s = rand(2, 9) * 1000;
    return mathQ(`$${s} earns 4% interest in a year. Interest?`, s * 0.04, '$');
  },
  cpf: () => pick(CPF_FACTS),
};

const CPF_FACTS = [
  { q: 'Which CPF account is mainly for housing?', choices: ['Ordinary Account', 'MediSave Account', 'Special Account'], answer: 0 },
  { q: 'Which account pays for hospital bills and MediShield Life?', choices: ['Special Account', 'MediSave Account', 'Ordinary Account'], answer: 1 },
  { q: 'At what age is your Retirement Account created?', choices: ['50', '55', '65'], answer: 1 },
  { q: 'From what age can CPF LIFE payouts start?', choices: ['55', '60', '65'], answer: 2 },
  { q: 'Under 55, what does your employer add to your CPF?', choices: ['17% of your pay', '5% of your pay', 'Nothing'], answer: 0 },
  { q: 'The Special Account earns at least…', choices: ['1% a year', '2.5% a year', '4% a year'], answer: 2 },
  { q: 'The Ordinary Account earns at least…', choices: ['2.5% a year', '4% a year', '8% a year'], answer: 0 },
  { q: 'CPF LIFE pays you…', choices: ['A lump sum at 65', 'A monthly income for life', 'Only until age 80'], answer: 1 },
  { q: 'Deferring CPF LIFE payouts past 65 makes each payout…', choices: ['Smaller', 'Bigger', 'The same'], answer: 1 },
  { q: 'Topping up your SA with cash can give you…', choices: ['Tax relief', 'A free flat', 'A higher salary'], answer: 0 },
  { q: 'The 2026 Full Retirement Sum is about…', choices: ['$22,000', '$220,000', '$2.2 million'], answer: 1 },
  { q: 'Credit card debt usually costs about…', choices: ['2.5% a year', '10% a year', '25% or more a year'], answer: 2 },
];

function mathQ(q, answer, unit = '') {
  const fmt = (n) => (unit === '$' ? `$${Number.isInteger(n) ? n : n.toFixed(2)}` : String(n));
  const opts = new Set([answer]);
  let guard = 0;
  while (opts.size < 3 && guard++ < 50) {
    const delta = Math.max(1, Math.round(Math.abs(answer) * 0.15)) * (rand(0, 1) ? 1 : -1) * rand(1, 3);
    const v = unit === '$' && !Number.isInteger(answer) ? +(answer + delta / 2).toFixed(2) : answer + delta;
    if (v >= 0) opts.add(v);
  }
  const list = shuffle([...opts]);
  return { q, choices: list.map(fmt), answer: list.indexOf(answer) };
}

export function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


// Real Singapore figures shown as "Did you know?" notes. Update when new data is out.
export const FACTS = {
  marriage: {
    text: 'In 2024 the median age at first marriage in Singapore was <b>31.1 for grooms</b> and <b>29.6 for brides</b>, up from 30.2 and 28.2 ten years earlier. There were 26,328 marriages that year.',
    source: 'SingStat, Statistics on Marriages and Divorces 2024',
  },
  accruedInterest: {
    text: 'When you sell a home bought with CPF, you refund to your CPF the savings you used <b>plus the interest they would have earned</b> had they stayed there (accrued interest, at the OA rate of 2.5% a year). It isn\'t a penalty: the money goes back into your own CPF for your retirement. If a sale at market value doesn\'t cover it all, you don\'t top up the difference in cash. Making a Voluntary Housing Refund earlier stops the accrued interest from building up.',
    source: 'CPF Board, "Why do I need to pay interest on CPF used for housing after property sale?"',
  },
  healthcare: {
    text: 'Singapore pays for healthcare in layers: <b>Government subsidies</b> of up to 80% in Class B2 and C wards, <b>MediShield Life</b> for large bills (everyone is covered for life), <b>MediSave</b> for the rest, and <b>MediFund</b> as a safety net for those who still can\'t pay. Integrated Shield Plans are optional private insurance for B1, A or private-hospital wards.',
    source: 'Ministry of Health, 2026',
  },
  fertility: {
    text: 'Singapore\'s resident total fertility rate fell to <b>0.87 births per woman</b> in 2025, a record low (0.97 in 2024). About 2.1 is needed for a population to replace itself.',
    source: 'Preliminary 2025 figures, reported February 2026',
  },
  lifeExpectancy: {
    text: 'A Singapore resident born in 2025 can expect to live to <b>83.9</b> on average. Many people will spend 20 years or more in retirement, which is why CPF LIFE pays for as long as you live.',
    source: 'SingStat, Complete Life Tables 2024-2025',
  },
};

// Holidays you can plan from the Holidays panel. Cost is per traveller, return
// flights and a typical stay, in today's dollars.
export const HOLIDAYS = [
  { id: 'jb', name: 'Weekend in Johor Bahru', place: 'Malaysia', icon: '🚗', cost: 250, joy: 1, days: 2, group: 'near' },
  { id: 'cruise', name: 'Cruise to nowhere', place: 'From Marina Bay', icon: '🛳️', cost: 600, joy: 1, days: 3, group: 'near' },
  { id: 'bangkok', name: 'Bangkok', place: 'Thailand', icon: '🛕', cost: 900, joy: 2, days: 4, group: 'near' },
  { id: 'bali', name: 'Bali', place: 'Indonesia', icon: '🏝️', cost: 1200, joy: 2, days: 5, group: 'near' },
  { id: 'seoul', name: 'Seoul', place: 'South Korea', icon: '🏯', cost: 2200, joy: 3, days: 6, group: 'asia' },
  { id: 'tokyo', name: 'Tokyo', place: 'Japan', icon: '🗻', cost: 3000, joy: 3, days: 7, group: 'asia' },
  { id: 'sydney', name: 'Sydney', place: 'Australia', icon: '🦘', cost: 3500, joy: 3, days: 8, group: 'asia' },
  { id: 'maldives', name: 'Maldives water villa', place: 'Maldives', icon: '🐠', cost: 4500, joy: 4, days: 5, group: 'asia' },
  { id: 'nz', name: 'New Zealand road trip', place: 'South Island', icon: '🐑', cost: 5000, joy: 4, days: 10, group: 'asia' },
  { id: 'paris', name: 'Paris', place: 'France', icon: '🗼', cost: 6000, joy: 4, days: 10, group: 'far' },
  { id: 'swiss', name: 'Swiss Alps by train', place: 'Switzerland', icon: '🏔️', cost: 7500, joy: 5, days: 10, group: 'far' },
  { id: 'iceland', name: 'Northern lights', place: 'Iceland', icon: '🌌', cost: 8000, joy: 5, days: 9, group: 'far' },
  { id: 'kenya', name: 'Safari', place: 'Kenya', icon: '🦒', cost: 9000, joy: 5, days: 8, group: 'far' },
  { id: 'antarctica', name: 'Antarctica expedition', place: 'Via Argentina', icon: '🐧', cost: 20000, joy: 6, days: 14, group: 'far' },
];

export const HOLIDAY_GROUPS = [
  { id: 'near', label: 'Short trips' },
  { id: 'asia', label: 'Asia and Oceania' },
  { id: 'far', label: 'Bucket list' },
];

// Career switches offered when a stat (43+) or a hybrid stat (23+) gets very high.
// Pay is a typical monthly figure in Singapore today; self-employed incomes vary a lot.
export const CAREER_SWITCHES = [
  { id: 'speaker', label: 'Professional speaker and corporate trainer', icon: '🎤', stat: 'communication', min: 43, pay: 6500, selfEmployed: true,
    desc: 'Run workshops for companies and speak at conferences. Many trainers get work through SkillsFuture-funded courses.' },
  { id: 'illustrator', label: 'Illustrator and game artist', icon: '🖌️', stat: 'creativity', min: 43, pay: 5200,
    desc: 'Draw for a Singapore games studio or animation house.' },
  { id: 'scientist', label: 'Research scientist at a national research agency', icon: '🔬', stat: 'knowledge', min: 43, pay: 7500,
    desc: 'Work on research at a lab like A*STAR\'s institutes.' },
  { id: 'trainer', label: 'Personal trainer with your own clients', icon: '🏋️', stat: 'fitness', min: 43, pay: 5000, selfEmployed: true,
    desc: 'Train clients at gyms and parks across the island.' },
  { id: 'adviser', label: 'Licensed financial adviser', icon: '📊', stat: 'moneySense', min: 38, pay: 6500,
    desc: 'Help families plan their finances. Part of your pay is commission.' },
  { id: 'scdf', label: 'Emergency responder (SCDF)', icon: '🚒', stat: 'resilience', min: 43, pay: 5200, oneEmployer: true,
    desc: 'Firefighting and rescue: tough, steady and respected.' },
  { id: 'manager', label: 'Department manager', icon: '🗂️', stat: 'career', min: 43, pay: 9000,
    desc: 'Lead a team at a large company.' },
  { id: 'director', label: 'Director at a statutory board', icon: '🏛️', hybrid: 'leadership', min: 23, pay: 10000,
    desc: 'Lead a public agency division that shapes policy.' },
  { id: 'founder2', label: 'Tech start-up founder', icon: '🚀', hybrid: 'innovation', min: 23, pay: 7000, selfEmployed: true,
    desc: 'Build your own app with help from Startup SG grants. Big upside, real risk.' },
  { id: 'performer', label: 'Theatre performer and content creator', icon: '🎭', hybrid: 'artistry', min: 23, pay: 5000, selfEmployed: true,
    desc: 'Perform on local stages and grow an online audience. Arts grants can help.' },
  { id: 'teamlead', label: 'Sports team manager', icon: '🏟️', hybrid: 'teamwork', min: 23, pay: 6000,
    desc: 'Manage a professional or national sports team.' },
  { id: 'officer', label: 'Regular officer in the SAF', icon: '🎖️', hybrid: 'discipline', min: 23, pay: 6800, oneEmployer: true,
    desc: 'A structured career in the Singapore Armed Forces, with good benefits.' },
  { id: 'fnb', label: 'Owner of a food and drinks chain', icon: '🍲', hybrid: 'enterprise', min: 23, pay: 8000, selfEmployed: true,
    desc: 'Grow a hawker stall into a chain of outlets.' },
  { id: 'cfp', label: 'Certified wealth planner', icon: '📈', hybrid: 'planner', min: 23, pay: 8500,
    desc: 'Plan retirement and investments for clients.' },
  // More choices for each strength, so careers vary from life to life.
  { id: 'journalist', label: 'Journalist and news presenter', icon: '📰', stat: 'communication', min: 43, pay: 5600,
    desc: 'Report the news for a newspaper, radio or TV station.' },
  { id: 'hrbp', label: 'Human resources business partner', icon: '🧑‍💼', stat: 'communication', min: 43, pay: 6800,
    desc: 'Hire, train and look after the people in a large company.' },
  { id: 'architect', label: 'Architect', icon: '📐', stat: 'creativity', min: 43, pay: 6200,
    desc: 'Design homes, schools and public spaces, from HDB estates to private projects.' },
  { id: 'ux', label: 'Product designer at a tech company', icon: '📲', stat: 'creativity', min: 43, pay: 6500,
    desc: 'Design the apps people use every day.' },
  { id: 'software', label: 'Software engineer', icon: '💻', stat: 'knowledge', min: 43, pay: 7200,
    desc: 'Build apps and systems for a bank, a tech firm or GovTech.' },
  { id: 'datasci', label: 'Data scientist', icon: '📉', stat: 'knowledge', min: 43, pay: 7600,
    desc: 'Find patterns in data to help a company decide what to do.' },
  { id: 'outdoor', label: 'Outdoor adventure instructor', icon: '🧗', stat: 'fitness', min: 43, pay: 4600,
    desc: 'Lead kayaking, climbing and camps for schools, like Outward Bound Singapore.' },
  { id: 'accountant', label: 'Chartered accountant', icon: '🧾', stat: 'moneySense', min: 38, pay: 6200,
    desc: 'Audit companies and prepare their accounts and taxes.' },
  { id: 'socialworker', label: 'Senior social worker', icon: '🫶', stat: 'resilience', min: 43, pay: 5200,
    desc: 'Support families through hard times at a family service centre.' },
  { id: 'opsmgr', label: 'Operations manager at a logistics firm', icon: '🚢', stat: 'career', min: 43, pay: 8200,
    desc: 'Keep goods moving through Singapore\'s port and warehouses.' },
  { id: 'gm', label: 'General manager of a hotel', icon: '🏨', hybrid: 'leadership', min: 23, pay: 9500,
    desc: 'Run a hotel and its hundreds of staff.' },
  { id: 'pm', label: 'Product manager at a tech company', icon: '🧩', hybrid: 'innovation', min: 23, pay: 8500,
    desc: 'Decide what a team builds next, and why.' },
  { id: 'producer', label: 'Film and video producer', icon: '🎬', hybrid: 'artistry', min: 23, pay: 6000, selfEmployed: true,
    desc: 'Make adverts, short films and series for streaming.' },
  { id: 'events', label: 'Events and festival producer', icon: '🎪', hybrid: 'teamwork', min: 23, pay: 6200,
    desc: 'Put on concerts, sports events and festivals.' },
  { id: 'pilot', label: 'Airline pilot', icon: '✈️', hybrid: 'discipline', min: 23, pay: 9000,
    desc: 'Fly passengers around the region and the world.' },
  { id: 'agent', label: 'Property agent with your own team', icon: '🏘️', hybrid: 'enterprise', min: 23, pay: 7000, selfEmployed: true,
    desc: 'Help families buy and sell homes. Your income is all commission.' },
  { id: 'banker', label: 'Bank relationship manager', icon: '🏦', hybrid: 'planner', min: 23, pay: 8000,
    desc: 'Look after the savings and investments of a bank\'s clients.' },
  { id: 'dietitian', label: 'Community health coach', icon: '🥗', hybrid: 'vitality', min: 23, pay: 5000,
    desc: 'Help people eat well and stay active, with a polyclinic or Health Promotion Board programme.' },
  { id: 'studio', label: 'Owner of a yoga and wellness studio', icon: '🧘', hybrid: 'vitality', min: 23, pay: 5500, selfEmployed: true,
    desc: 'Run your own studio and classes.' },
];

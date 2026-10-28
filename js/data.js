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
        'From 16 you can take a part-time job. If you earn more than $50 a month, your employer pays into your CPF too.',
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
        'Interest compounds: the OA earns 2.5% and the SA and MA earn 4%, with an extra 1% on your first $60,000.',
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
    { id: 'job', label: 'Part-time job', icon: '🧾', game: 'quiz', quiz: 'money', minAge: 16, gains: { moneySense: 1, resilience: 0.5 }, job: true },
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
  university: { label: 'University degree', minKnowledge: 30, pay: 1 },
  poly: { label: 'Polytechnic diploma', minKnowledge: 18, pay: 0.8 },
  ite: { label: 'ITE Nitec', minKnowledge: 0, pay: 0.65 },
};

// Starting monthly pay (for a degree holder) in today's dollars.
export const CAREERS = [
  { id: 'engineer', label: 'Engineer', icon: '🛠️', pay: 4800, needs: { knowledge: 22, creativity: 10 } },
  { id: 'teacher', label: 'Teacher', icon: '🧑‍🏫', pay: 4400, needs: { knowledge: 18, communication: 16 } },
  { id: 'nurse', label: 'Nurse', icon: '🩺', pay: 4000, needs: { fitness: 14, communication: 14 } },
  { id: 'designer', label: 'Designer', icon: '🎨', pay: 3900, needs: { creativity: 20 } },
  { id: 'coach', label: 'Sports coach', icon: '🏅', pay: 3600, needs: { fitness: 20 } },
  { id: 'sales', label: 'Sales executive', icon: '📣', pay: 3600, needs: { communication: 18 } },
  { id: 'founder', label: 'Start my own business', icon: '🚀', pay: 4500, needs: { moneySense: 10, creativity: 14 }, selfEmployed: true },
  { id: 'admin', label: 'Office administrator', icon: '🗂️', pay: 3000, needs: {} },
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
  { id: 'jb', name: 'Weekend in Johor Bahru', place: 'Malaysia', icon: '🚗', cost: 250, joy: 1, days: 2 },
  { id: 'cruise', name: 'Cruise to nowhere', place: 'From Marina Bay', icon: '🛳️', cost: 600, joy: 1, days: 3 },
  { id: 'bangkok', name: 'Bangkok', place: 'Thailand', icon: '🛕', cost: 900, joy: 2, days: 4 },
  { id: 'bali', name: 'Bali', place: 'Indonesia', icon: '🏝️', cost: 1200, joy: 2, days: 5 },
  { id: 'tokyo', name: 'Tokyo', place: 'Japan', icon: '🗻', cost: 3000, joy: 3, days: 7 },
  { id: 'sydney', name: 'Sydney', place: 'Australia', icon: '🦘', cost: 3500, joy: 3, days: 8 },
  { id: 'paris', name: 'Paris', place: 'France', icon: '🗼', cost: 6000, joy: 4, days: 10 },
];

// Career switches offered when a stat (45+) or a hybrid stat (25+) gets very high.
// Pay is a typical monthly figure in Singapore today; self-employed incomes vary a lot.
export const CAREER_SWITCHES = [
  { id: 'speaker', label: 'Professional speaker and corporate trainer', icon: '🎤', stat: 'communication', min: 45, pay: 6500, selfEmployed: true,
    desc: 'Run workshops for companies and speak at conferences. Many trainers get work through SkillsFuture-funded courses.' },
  { id: 'illustrator', label: 'Illustrator and game artist', icon: '🖌️', stat: 'creativity', min: 45, pay: 5200,
    desc: 'Draw for a Singapore games studio or animation house.' },
  { id: 'scientist', label: 'Research scientist at a national research agency', icon: '🔬', stat: 'knowledge', min: 45, pay: 7500,
    desc: 'Work on research at a lab like A*STAR\'s institutes.' },
  { id: 'trainer', label: 'Personal trainer with your own clients', icon: '🏋️', stat: 'fitness', min: 45, pay: 5000, selfEmployed: true,
    desc: 'Train clients at gyms and parks across the island.' },
  { id: 'adviser', label: 'Licensed financial adviser', icon: '📊', stat: 'moneySense', min: 40, pay: 6500,
    desc: 'Help families plan their finances. Part of your pay is commission.' },
  { id: 'scdf', label: 'Emergency responder (civil defence)', icon: '🚒', stat: 'resilience', min: 45, pay: 5200,
    desc: 'Firefighting and rescue: tough, steady and respected.' },
  { id: 'manager', label: 'Department manager', icon: '🗂️', stat: 'career', min: 45, pay: 9000,
    desc: 'Lead a team at a large company.' },
  { id: 'director', label: 'Director at a statutory board', icon: '🏛️', hybrid: 'leadership', min: 25, pay: 10000,
    desc: 'Lead a public agency division that shapes policy.' },
  { id: 'founder2', label: 'Tech start-up founder', icon: '🚀', hybrid: 'innovation', min: 25, pay: 7000, selfEmployed: true,
    desc: 'Build your own app with help from Startup SG grants. Big upside, real risk.' },
  { id: 'performer', label: 'Theatre performer and content creator', icon: '🎭', hybrid: 'artistry', min: 25, pay: 5000, selfEmployed: true,
    desc: 'Perform on local stages and grow an online audience. Arts grants can help.' },
  { id: 'teamlead', label: 'Sports team manager', icon: '🏟️', hybrid: 'teamwork', min: 25, pay: 6000,
    desc: 'Manage a professional or national sports team.' },
  { id: 'officer', label: 'Regular officer in the armed forces', icon: '🎖️', hybrid: 'discipline', min: 25, pay: 6800,
    desc: 'A structured career with good benefits.' },
  { id: 'fnb', label: 'Owner of a food and drinks chain', icon: '🍲', hybrid: 'enterprise', min: 25, pay: 8000, selfEmployed: true,
    desc: 'Grow a hawker stall into a chain of outlets.' },
  { id: 'cfp', label: 'Certified wealth planner', icon: '📈', hybrid: 'planner', min: 25, pay: 8500,
    desc: 'Plan retirement and investments for clients.' },
  { id: 'studio', label: 'Owner of a yoga and wellness studio', icon: '🧘', hybrid: 'vitality', min: 25, pay: 5500, selfEmployed: true,
    desc: 'Run your own studio and classes.' },
];

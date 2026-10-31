// Scams and everyday mishaps that cost real money, for the main game's events and the
// obstacles in simple mode's run mode. No DOM code here.
// The scam types follow the Singapore Police Force's most common scams (job, e-commerce,
// fake friend calls, phishing, investment, government official impersonation, and
// tech support), with amounts scaled to what someone of that age might have.
import { rand, pick } from './data.js';

// `cost(cash)` is what you'd lose, never more than what you have.
const upTo = (lo, hi, share = 0.5) => (cash) => Math.max(0, Math.min(rand(lo, hi), Math.round(Math.max(0, cash) * share)));

export const SCAMS = [
  { id: 'skins', icon: '🎮', minAge: 7, maxAge: 16, title: '"Free game skins! Log in here"', tag: 'Free skins!',
    bait: 'A player in your game chat sends a link for free skins. You just need to log in and pay a small "unlock fee" with a gift card.',
    risky: 'Log in and pay', cost: upTo(10, 50, 0.6),
    lesson: 'Nothing in a game is free from a stranger\'s link. Never log in through links in chat, and never pay with gift cards.' },
  { id: 'tickets', icon: '🎫', minAge: 13, maxAge: 30, title: 'Cheap concert tickets online', tag: 'Cheap tickets!',
    bait: 'Someone on social media is selling concert tickets at half price. They want a bank transfer first, and they\'ll send the tickets after.',
    risky: 'Transfer the money', cost: upTo(80, 300),
    lesson: 'This is an e-commerce scam. Buy only from official sellers, and never pay a stranger before you get the item.' },
  { id: 'jobscam', icon: '💼', minAge: 15, maxAge: 70, title: '"Earn $500 a day from home!"', tag: '$500 a day!',
    bait: 'A message offers easy money for liking videos. After a few small payouts, they ask you to "top up" money to unlock bigger tasks.',
    risky: 'Top up to unlock tasks', cost: (cash) => upTo(cash > 20000 ? 2000 : 100, cash > 20000 ? 15000 : 800)(cash),
    lesson: 'Job scams are Singapore\'s most common scam. A real job never asks you to pay money to earn money.' },
  { id: 'friendcall', icon: '📞', minAge: 15, maxAge: 120, title: '"Hey, guess who? I changed my number"', tag: 'Guess who?',
    bait: 'A message from an "old friend" with a new number. A few days later they urgently need a loan and promise to pay you back next week.',
    risky: 'Lend them the money', cost: upTo(300, 3000),
    lesson: 'This is a fake friend scam. Call your friend on the number you already have before you send any money.' },
  { id: 'phishing', icon: '🏦', minAge: 18, maxAge: 120, title: '"Your bank account is locked. Tap here"', tag: 'Tap this link',
    bait: 'An SMS that looks like it\'s from your bank says your account is locked. The link asks for your login and a one-time password (OTP).',
    risky: 'Tap the link and log in', cost: upTo(1000, 8000),
    lesson: 'Banks in Singapore don\'t send clickable links by SMS. Never share an OTP. Use the bank\'s own app instead.' },
  { id: 'seller', icon: '📦', minAge: 16, maxAge: 120, title: 'A great deal on a second-hand phone', tag: 'Half-price deal!',
    bait: 'A seller online has a nearly new phone for half the shop price. They won\'t meet, and want you to pay by bank transfer.',
    risky: 'Pay by bank transfer', cost: upTo(300, 900),
    lesson: 'Prices that are far too low are a warning sign. Meet in person, or use the platform\'s protected payment.' },
  { id: 'invest', icon: '📈', minAge: 21, maxAge: 120, title: '"Guaranteed 30% returns!"', tag: 'Guaranteed 30%!',
    bait: 'Someone in a chat group shows screenshots of huge profits. They offer a "risk-free" investment that doubles your money.',
    risky: 'Invest', cost: upTo(3000, 20000),
    lesson: 'No real investment is guaranteed to return 30%. Check that the firm is on MAS\'s list of licensed firms.' },
  { id: 'official', icon: '👮', minAge: 21, maxAge: 120, title: 'A call from the "police"', tag: 'Police call',
    bait: 'A caller says they\'re a police officer and your bank account is linked to a crime. To clear your name, you must move your money to a "safe account".',
    risky: 'Move my money', cost: upTo(5000, 30000),
    lesson: 'Government officials will never ask you to transfer money or give bank details over the phone. Hang up and call 1799.' },
  { id: 'techsupport', icon: '💻', minAge: 50, maxAge: 120, title: 'A pop-up says your computer has a virus', tag: 'Virus alert!',
    bait: 'A loud pop-up gives a number to call. The "technician" asks you to install an app so they can fix it, then to log in to your bank to "check".',
    risky: 'Call and let them in', cost: upTo(2000, 15000),
    lesson: 'Real tech support never cold-calls or uses scary pop-ups. Never let a stranger control your computer or phone.' },
];

export const MISHAPS = [
  { id: 'wallet', icon: '👛', minAge: 7, maxAge: 12, title: 'Lost your wallet!', tag: 'Wallet!',
    text: (n) => `You dropped your wallet at the playground with ${n} of pocket money inside.`, cost: upTo(5, 20, 0.8),
    lesson: 'Only carry what you need for the day. The rest is safe at home or in the bank.' },
  { id: 'ezlink', icon: '🚌', minAge: 7, maxAge: 20, title: 'Lost your bus card', tag: 'Bus card!',
    text: (n) => `Your EZ-Link card slipped out of your pocket. A new one and the value on it cost ${n}.`, cost: upTo(10, 25, 0.8),
    lesson: 'Keep cards in one zipped pocket, and don\'t load more value than you need.' },
  { id: 'screen', icon: '📱', minAge: 13, maxAge: 120, title: 'Cracked phone screen', tag: 'Crack!',
    text: (n) => `Your phone slipped and the screen shattered. The repair costs ${n}.`, cost: upTo(150, 350, 0.6),
    lesson: 'A case and a screen protector cost far less than a repair.' },
  { id: 'lostphone', icon: '📵', minAge: 16, maxAge: 120, title: 'Left your phone on the MRT', tag: 'Phone!',
    text: (n) => `Your phone is gone. A replacement costs ${n}.`, cost: upTo(400, 1200, 0.5),
    lesson: 'This is what an emergency fund is for. Turn on "find my phone" too.' },
  { id: 'adultwallet', icon: '💳', minAge: 21, maxAge: 120, title: 'Wallet stolen at a crowded event', tag: 'Pickpocket!',
    text: (n) => `Your wallet was taken. With the cash inside and replacing your cards and IC, it cost ${n}.`, cost: upTo(100, 300, 0.5),
    lesson: 'Report it and freeze your cards straight away, so no one can use them.' },
  { id: 'specs', icon: '👓', minAge: 13, maxAge: 120, title: 'Sat on your glasses', tag: 'Crunch!',
    text: (n) => `Your glasses snapped. New ones cost ${n}.`, cost: upTo(150, 400, 0.5),
    lesson: 'Small accidents happen to everyone. A little savings buffer keeps them from hurting.' },
  { id: 'aircon', icon: '❄️', minAge: 25, maxAge: 120, title: 'The air-con broke down', tag: 'Repairs!',
    text: (n) => `The air-con needs a new compressor. The repair costs ${n}.`, cost: upTo(400, 900, 0.5),
    lesson: 'Homes need repairs. Set aside a little each month for them.' },
];

const fits = (x, age) => age >= x.minAge && age <= x.maxAge;
export const scamsFor = (age) => SCAMS.filter((x) => fits(x, age));
export const mishapsFor = (age) => MISHAPS.filter((x) => fits(x, age));
export const randomScam = (age) => pick(scamsFor(age));
export const randomMishap = (age) => pick(mishapsFor(age));

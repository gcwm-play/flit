# FLIT: Life & CPF

A Singapore life simulator about growing up, making life choices and seeing how they shape your retirement, with CPF at the centre. You play from age 7 to 85. There's no winning or losing: at the end (or whenever you choose to stop), you get a recap of your life and some questions to reflect on.

## Play

It's a static web page with no build step. Serve the folder and open it in a browser:

```sh
npm start            # or: python3 -m http.server 8080
# then open http://localhost:8080
```

Progress is saved in the browser automatically.

## How it plays

- **Four life stages:** child (7 to 12), teenager (13 to 20), working adult (21 to 54) and senior (55 to 85). Each turn covers 1, 2, 3 or 5 years depending on the stage.
- **Each turn** you pick an activity (study, play, talk with friends, create, and later part-time jobs, SkillsFuture courses, networking and more). Then you play a 10 to 20 second mini game (a timed quiz, a tap race, a memory sequence or a rhythm tap). Your score decides how many stat points you gain.
- **Stats:** Creativity, Fitness, Knowledge and Communication from childhood. Money Sense and Resilience unlock as a teenager, and Career Skills and Health as an adult. **Hybrid stats** (Leadership, Innovation, Teamwork, Artistry, Discipline, Enterprise, Planner and Vitality) unlock when both of their parent stats reach 12.
- **Your room** is the background. Things you buy in the shop stay in it, and some boost your stats every turn. Your spouse and children appear in it too.
- **Cash gifts** (festive gift packets, birthday money, bonuses, wedding gifts, the Baby Bonus) let you split the money between your spending fund, bank, investments and a CPF top-up.
- **World events** (recessions, pandemics, market crashes, inflation spikes, AI disruption) affect jobs and savings. The right stats soften the blow.
- **Life choices:** education (from Knowledge), career, lifestyle, marriage, children, buying, upgrading or right-sizing a home, a car, holidays, scams, and paying for your children's university.
- **Retirement:** form your Retirement Account at 55, decide how much to withdraw and whether to keep working, then choose when to start CPF LIFE and which plan.

## CPF and housing rules modelled

All figures are 2026 values from the CPF Board, HDB and MAS. They live in `js/cpf.js` and `js/housing.js` and should be checked every January.

| Area | What the game uses |
| --- | --- |
| Contributions | 2026 rates by age band (37% up to 55, then 34%, 25%, 16.5% and 12.5%), OA/SA/MA allocation, $8,000 Ordinary Wage ceiling, low-wage phase-in, rounding, self-employed MediSave-only |
| Interest | OA 2.5%, SA/MA/RA 4%, extra 1% on the first $60k (OA capped at $20k) and another 1% on the first $30k from 55. Worked out monthly and credited yearly |
| MediSave | $4,000 MediSave Grant for Newborns, 2026 Basic Healthcare Sum cap with overflow, MediShield Life premiums, paying hospital bills (including parents') |
| At 55 | SA closes, RA formed from SA then OA up to BRS (needs a property pledge), FRS or ERS, $5,000 minimum withdrawal |
| CPF LIFE | Payouts from 65 calibrated to the CPF Board's estimates ($950 / $1,780 / $3,440), deferral to 70, Standard / Basic / Escalating plans |
| Top-ups | Retirement Sum Topping-Up (to FRS under 55, ERS from 55), Matched Retirement Savings Scheme |
| Housing | 75% loan limit, HDB 2.6% loan, bank loans with a 5% cash minimum, MSR 30%, TDSR 55% at a 4% stress rate, Buyer's Stamp Duty, paying from OA or cash, CPF refund with 2.5% accrued interest when selling, Voluntary Housing Refund, Lease Buyback Scheme, Silver Housing Bonus |
| Family | Baby Bonus Cash Gift and CDA First Step Grant, CPF Education Scheme (40% of OA, repaid over 12 years) |

**Simplifications:** amounts are in today's dollars with no inflation, so pay growth is "real" growth. There are no bonuses or Additional Wages. Home values change only as the lease runs down. CPF LIFE payouts are estimates. Your spouse's own CPF isn't tracked; each partner pays half of shared costs.

## Code

```
index.html          page shell
css/style.css       pixel-art styling
js/cpf.js           CPF rules (pure functions)
js/housing.js       housing rules (pure functions)
js/sim.js           game state and the month-by-month money simulation
js/events.js        world events, personal events, cash gifts
js/data.js          stages, stats, activities, careers, shop items, quizzes
js/minigames.js     the four mini games
js/main.js          screens, dialogs and game flow
assets/sprites/     character sprites, sliced from assets/character-sheet-source.jpg
tests/              node --test unit tests for the CPF and housing rules
```

Run the tests with `npm test` (Node 18 or later).

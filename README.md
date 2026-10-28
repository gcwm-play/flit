# FLIT: Life & CPF

A Singapore life simulator about growing up, making life choices and seeing how they shape your retirement, with CPF at the centre. You play from age 7 to 85. There's no winning or losing: at the end (or whenever you choose to stop), you get a recap of your life and some questions to reflect on.

## Play

Play it at **https://gcwm-play.github.io/flit/** (the landing page; the game itself is `play.html`).

It's a static site with no build step. To run it locally, serve the folder and open it in a browser:

```sh
npm start            # or: python3 -m http.server 8080
# then open http://localhost:8080 (landing page) or http://localhost:8080/play.html (game)
```

Progress is saved in the browser automatically.

## How it plays

- **Four life stages:** child (7 to 12), teenager (13 to 20), working adult (21 to 54) and senior (55 to 85). Each turn covers 1, 2, 3 or 5 years depending on the stage.
- **Each turn** you pick an activity (study, play, talk with friends, create, and later part-time jobs, SkillsFuture courses, networking and more). One click plays it out: how well it goes is random and decides how many stat points you gain. (The mini games in js/minigames.js are switched off for now.)
- **Stats:** Creativity, Fitness, Knowledge and Communication from childhood. Money Sense and Resilience unlock as a teenager, and Career Skills and Health as an adult. **Hybrid stats** (Leadership, Innovation, Teamwork, Artistry, Discipline, Enterprise, Planner and Vitality) unlock when both of their parent stats reach 12.
- **Your room** is the background. Things you buy in the shop stay in it, and some boost your stats every turn. Your spouse and children appear in it too.
- **Cash gifts** (festive gift packets, birthday money, bonuses, wedding gifts, the SG Child Support Package Baby Gift) let you split the money with sliders between treats, charity, a CPF top-up (your parents do it for you as a child) and your cash savings.
- **Money** is one cash account. It earns a bank savings account's base rate (0.05% a year). Overspending goes on credit cards at 25% a year, up to the Singapore credit limit (12 months of income, 2 if you earn under $30,000). Past 12 months of income, the debt becomes a Debt Consolidation Plan (about 7.5%, 10 years). You can repay from the Money panel.
- **Budget and holidays**: set a yearly CPF top-up (it stops by itself at the FRS, or the ERS from 55), top-ups for your children and yearly investing (DCA); plan trips once, yearly or several times, with pixel postcards in your life recap. The game warns before a turn if you'll spend more than you earn, and the Menu can rewind to an earlier age.
- **Career switches**: a stat of 45+ (or a hybrid of 25+) unlocks a matching Singapore career, e.g. Communication → professional speaker.
- **At 55** the RA is filled to the FRS; you can then move OA savings in up to the ERS, or pledge a flat whose lease reaches age 95 and keep only the BRS.
- **Investing**: nine fictional companies and funds modelled on real markets (STI, S&P 500, S-REITs, bank, telco, tech, biotech, bonds), bought with cash or with CPF under CPFIS rules (keep $20,000 in the OA and $40,000 in the SA, 35% stock limit, SA only in funds and bonds).
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
| Family | SG Child Support Package (from April 2027: $10,000 Baby Gift, CDA First Step Grant and co-matching, Child Credits, PSEA top-up), newborn MediSave Grant, CPF Education Scheme (40% of OA, repaid over 12 years) |

**Simplifications:** amounts are in today's dollars with no inflation, so pay growth is "real" growth. There are no bonuses or Additional Wages. Home values change only as the lease runs down. CPF LIFE payouts are estimates. Your spouse's own CPF isn't tracked; each partner pays half of shared costs.

## Code

```
index.html          landing page (GitHub Pages home)
play.html           the game's page shell
404.html            not-found page for GitHub Pages
assets/landing/     landing page screenshots and og image (drop hero.webp and hero-mobile.webp here for hero art)
.github/workflows/  tests, then deploys the site to GitHub Pages on every push to main
css/style.css       pixel-art styling
js/cpf.js           CPF rules (pure functions)
js/housing.js       housing rules (pure functions)
js/sim.js           game state and the month-by-month money simulation
js/events.js        world events, personal events, cash gifts
js/data.js          stages, stats, activities, careers, shop items, quizzes
js/invest.js        investment products and CPFIS rules
js/postcards.js     pixel postcards for holidays
js/minigames.js     the four mini games (switched off for now)
js/main.js          screens, dialogs and game flow
js/sprites.js       the animal family: walking placeholder pixel art drawn in code (see assets/sprites/README.md)
assets/sprites/     drop-in folder for custom animal and shop-item art
tests/              node --test unit tests for the CPF and housing rules
```

Run the tests with `npm test` (Node 18 or later).

// Short mini games. Each one renders into `el` and resolves with a score from 0 to 1.
import { QUIZZES, shuffle } from './data.js';

const DIFFICULTY = { child: 0, teen: 1, adult: 2, senior: 1 };

export function playMiniGame(kind, el, { stage, quiz, title }) {
  const level = DIFFICULTY[stage] ?? 0;
  el.innerHTML = `<h2 class="mg-title">${title}</h2><div class="mg-body"></div>`;
  const body = el.querySelector('.mg-body');
  const games = { quiz: quizGame, tap: tapGame, echo: echoGame, rhythm: rhythmGame };
  return games[kind](body, { level, quiz });
}

function timerBar(body, seconds) {
  const bar = document.createElement('div');
  bar.className = 'timer';
  bar.innerHTML = '<div class="timer-fill"></div>';
  body.prepend(bar);
  const fill = bar.firstChild;
  fill.style.transitionDuration = `${seconds}s`;
  requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = '0%')));
}

// Quick quiz: as many of 5 questions as you can in the time limit.
function quizGame(body, { quiz }) {
  const total = 5;
  const seconds = 20;
  return new Promise((resolve) => {
    let i = 0, correct = 0, done = false;
    timerBar(body, seconds);
    const area = document.createElement('div');
    body.append(area);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(correct / total);
    };
    const timeout = setTimeout(finish, seconds * 1000);
    const next = () => {
      if (i >= total) return finish();
      const q = QUIZZES[quiz]();
      area.innerHTML = `<p class="mg-hint">Question ${i + 1} of ${total}</p><p class="quiz-q">${q.q}</p><div class="quiz-choices"></div>`;
      const box = area.querySelector('.quiz-choices');
      q.choices.forEach((c, idx) => {
        const b = document.createElement('button');
        b.className = 'btn choice';
        b.textContent = c;
        b.onclick = () => {
          if (done) return;
          const right = idx === q.answer;
          if (right) correct++;
          b.classList.add(right ? 'right' : 'wrong');
          box.children[q.answer].classList.add('right');
          box.querySelectorAll('button').forEach((x) => (x.disabled = true));
          i++;
          setTimeout(next, right ? 350 : 800);
        };
        box.append(b);
      });
    };
    next();
  });
}

// Tap as fast as you can to race across the playground.
function tapGame(body, { level }) {
  const seconds = 6;
  const target = [38, 44, 40][level];
  return new Promise((resolve) => {
    body.innerHTML = `
      <p class="mg-hint">Tap the button (or press Space) as fast as you can!</p>
      <div class="track"><div class="runner">🏃</div><div class="flag">🏁</div></div>
      <button class="btn big tap-btn">TAP!</button>
      <p class="mg-count">Get ready…</p>`;
    const runner = body.querySelector('.runner');
    const count = body.querySelector('.mg-count');
    const btn = body.querySelector('.tap-btn');
    let taps = 0, live = false;
    const tap = () => {
      if (!live) return;
      taps++;
      runner.style.left = `${Math.min(100, (taps / target) * 100) * 0.88}%`;
      count.textContent = `${taps} taps`;
      if (taps >= target) end();
    };
    const key = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tap();
    });
    document.addEventListener('keydown', key);
    let timer;
    const end = () => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      document.removeEventListener('keydown', key);
      btn.disabled = true;
      resolve(Math.min(1, taps / target));
    };
    countdown(count, () => {
      live = true;
      count.textContent = 'GO!';
      timerBar(body, seconds);
      timer = setTimeout(end, seconds * 1000);
    });
  });
}

function countdown(label, then) {
  let n = 3;
  label.textContent = n;
  const t = setInterval(() => {
    n--;
    if (n === 0) {
      clearInterval(t);
      then();
    } else label.textContent = n;
  }, 600);
}

// Remember and repeat the order your friend says things in.
function echoGame(body, { level }) {
  const symbols = shuffle(['😀', '🐱', '🍦', '⚽', '🎈', '🌈']).slice(0, 4);
  const rounds = [3, 4, 5].map((n) => n + (level > 1 ? 1 : 0));
  return new Promise((resolve) => {
    body.innerHTML = `
      <p class="mg-hint">Watch the order, then repeat it.</p>
      <div class="echo-show"></div>
      <div class="echo-pad"></div>
      <p class="mg-count"></p>`;
    const show = body.querySelector('.echo-show');
    const pad = body.querySelector('.echo-pad');
    const status = body.querySelector('.mg-count');
    const buttons = symbols.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'btn echo-btn';
      b.textContent = s;
      b.disabled = true;
      b.onclick = () => press(i);
      pad.append(b);
      return b;
    });
    let round = 0, seq = [], pos = 0;
    const setPad = (on) => buttons.forEach((b) => (b.disabled = !on));
    const play = () => {
      if (round >= rounds.length) return resolve(1);
      seq = Array.from({ length: rounds[round] }, () => Math.floor(Math.random() * symbols.length));
      pos = 0;
      setPad(false);
      status.textContent = `Round ${round + 1} of ${rounds.length}: watch…`;
      let k = 0;
      const step = () => {
        if (k >= seq.length) {
          show.textContent = '❓';
          status.textContent = 'Your turn!';
          setPad(true);
          return;
        }
        show.textContent = symbols[seq[k]];
        show.classList.add('pop');
        setTimeout(() => {
          show.classList.remove('pop');
          show.textContent = '';
          k++;
          setTimeout(step, 180);
        }, 600 - level * 80);
      };
      setTimeout(step, 500);
    };
    const press = (i) => {
      buttons[i].classList.add('flash');
      setTimeout(() => buttons[i].classList.remove('flash'), 150);
      if (i !== seq[pos]) {
        setPad(false);
        show.textContent = '😅';
        status.textContent = 'Oops, wrong order!';
        setTimeout(() => resolve(round / rounds.length + (pos / seq.length) / rounds.length), 900);
        return;
      }
      pos++;
      if (pos === seq.length) {
        round++;
        setPad(false);
        show.textContent = '✅';
        setTimeout(play, 600);
      }
    };
    play();
  });
}

// Tap when the shrinking ring lines up with the target.
function rhythmGame(body, { level }) {
  const beats = 8;
  const beatMs = [1100, 950, 1000][level];
  return new Promise((resolve) => {
    body.innerHTML = `
      <p class="mg-hint">Tap (or press Space) when the ring meets the circle.</p>
      <div class="rhythm"><div class="rhythm-target"></div><div class="rhythm-ring"></div><div class="rhythm-note">🎵</div></div>
      <button class="btn big rhythm-btn">TAP</button>
      <p class="mg-count"></p>`;
    const ring = body.querySelector('.rhythm-ring');
    const note = body.querySelector('.rhythm-note');
    const status = body.querySelector('.mg-count');
    let beat = 0, start = 0, total = 0, tapped = false, raf;
    const scale = (t) => 2.4 - 1.4 * t; // ring shrinks to 1.0 at t = 1
    const frame = (now) => {
      const t = (now - start) / beatMs;
      if (t >= 1.35) {
        if (!tapped) note.textContent = '💤';
        nextBeat(now);
        if (beat > beats) return;
      } else {
        ring.style.transform = `translate(-50%, -50%) scale(${Math.max(0.4, scale(t))})`;
      }
      raf = requestAnimationFrame(frame);
    };
    const nextBeat = (now) => {
      beat++;
      if (beat > beats) return end();
      status.textContent = `Beat ${beat} of ${beats}`;
      start = now;
      tapped = false;
    };
    const tap = () => {
      if (tapped || beat === 0 || beat > beats) return;
      tapped = true;
      const t = (performance.now() - start) / beatMs;
      const off = Math.abs(1 - t);
      const pts = off < 0.08 ? 1 : off < 0.18 ? 0.6 : off < 0.3 ? 0.25 : 0;
      total += pts;
      note.textContent = pts === 1 ? '🌟' : pts >= 0.6 ? '🎵' : pts > 0 ? '🎶' : '❌';
    };
    const key = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      }
    };
    const end = () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', key);
      resolve(total / beats);
    };
    body.querySelector('.rhythm-btn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tap();
    });
    document.addEventListener('keydown', key);
    countdown(status, () => {
      raf = requestAnimationFrame((now) => {
        nextBeat(now);
        frame(now);
      });
    });
  });
}

// "Where your CPF sits": a table shared by the main game and simple mode, so players can
// see that a big CPF total at 65+ is mostly OA money, and that the RA has gone into CPF LIFE.
import { cpfWhere, money } from './sim.js';

export function cpfWhereHtml(s, { title = '🏛️ Where your CPF sits' } = {}) {
  const w = cpfWhere(s);
  const rows = w.rows.filter((r) => r.amount >= 1 || r.label.startsWith('Retirement'));
  return `<div class="cpf-where">
    ${title ? `<h3>${title}</h3>` : ''}
    <table class="summary">
      ${rows.map((r) => `<tr><td>${r.icon} ${r.label}<small class="where-note">${r.note}</small></td><td>${money(r.amount)}</td></tr>`).join('')}
      <tr class="where-total"><td>CPF balance</td><td>${money(w.total)}</td></tr>
    </table>
    ${w.started ? `<p class="where-life">🔒 <b>CPF LIFE premium: ${money(w.premium)}</b>. When your payouts started, your RA savings went into CPF LIFE, so they're no longer in your CPF balance. In return CPF LIFE pays you <b>${money(w.monthly)} a month for as long as you live</b>. You've received ${money(w.paid)} so far. ${w.unpaid >= 1 ? `If you pass away, about ${money(w.unpaid)} of premium not yet paid out would go to your nominees.` : 'That\'s more than your premium, so nothing is left for your nominees, but CPF LIFE keeps paying you for life.'}</p>` : ''}
    ${s.age >= 55 && w.rows[0].amount > 50000 ? `<p class="small">In real life most people have far less in their OA, because it pays for their home loan over 25 to 30 years. Many also withdraw it after 55 to spend in retirement.</p>` : ''}
  </div>`;
}

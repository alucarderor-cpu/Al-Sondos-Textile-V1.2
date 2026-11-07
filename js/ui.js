import { esc, MONTHS } from './util.js';
import { store } from './data.js';

export const table = ({ head, rows, foot = '', cls = '', empty = 'مفيش بيانات في الفترة دي.' }) => {
  const th = head.map((h) => (typeof h === 'string' ? `<th>${esc(h)}</th>` : `<th class="${h.cls || ''}">${esc(h.t)}</th>`)).join('');
  const body = rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="empty-note">${esc(empty)}</td></tr>`;
  return `<div class="scroll"><table class="${cls}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ''}</table></div>`;
};
export const tr = (cells, cls = '') => `<tr class="${cls}">${cells.map((c) => (c && typeof c === 'object' ? `<td class="${c.cls || ''}">${c.h}</td>` : `<td>${c}</td>`)).join('')}</tr>`;

export const card = (title, body, sub = '', id = '') =>
  `<section class="card"${id ? ` id="${id}"` : ''}><h2><span>${esc(title)}</span>${sub ? `<small>${sub}</small>` : ''}</h2>${body}</section>`;

export const kpis = (items) =>
  `<div class="kpis">${items.map((k) => `<div class="kpi"><div class="l">${esc(k.l)}</div><div class="v">${k.v}</div>${k.n ? `<div class="n">${k.n}</div>` : ''}</div>`).join('')}</div>`;

export const field = (id, label, control) => `<div class="f"><label for="${id}">${esc(label)}</label>${control}</div>`;
export const dateInput = (id, value) => `<input type="date" id="${id}" value="${esc(value)}" class="ltr">`;
export const monthSelect = (id, value) => `<select id="${id}">${MONTHS.map((m, i) => `<option value="${i + 1}"${+value === i + 1 ? ' selected' : ''}>${i + 1} - ${m}</option>`).join('')}</select>`;
export const yearSelect = (id, value) => {
  const ys = [...new Set([...store.years, +value])].sort();
  return `<select id="${id}">${ys.map((y) => `<option value="${y}"${+value === y ? ' selected' : ''}>${y}</option>`).join('')}</select>`;
};
export const nameSelect = (id, list, value, all = 'الكل') =>
  `<select id="${id}"><option value="الكل">${esc(all)}</option>${list.map((n) => `<option value="${esc(n)}"${n === value ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
export const controls = (inner) => `<div class="controls">${inner}</div>`;

// بيربط عناصر التحكم بدالة إعادة الرسم. ids: قائمة معرفات
export const bind = (root, ids, fn) => {
  for (const id of ids) root.querySelector('#' + id)?.addEventListener('change', fn);
};
export const val = (root, id) => root.querySelector('#' + id)?.value;

export const rankTable = (list, cols) =>
  table({
    head: ['الترتيب', ...cols.map((c) => c.t)],
    rows: list.map((it, i) => tr([`<b>${i + 1}</b>`, ...cols.map((c) => c.f(it))])),
  });

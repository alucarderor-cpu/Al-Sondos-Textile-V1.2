// رسومات SVG بسيطة. الألوان من متغيرات CSS عشان تتغير مع الثيم واللوجو.
import { esc } from './util.js';

const niceStep = (max) => {
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]) if (max / s <= 6) return s;
  return 20000;
};
const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

export const legend = (items) =>
  `<div class="legend">${items.map((it) => `<span><i style="background:${it.color}"></i>${esc(it.name)}</span>`).join('')}</div>`;

// أعمدة عادية أو متراصة. series: [{name, values, color}]
export const barChart = ({ labels, series, stacked = false, target = null, height = 280, label = '' }) => {
  const W = 760, H = height, L = 46, R = 12, T = 26, B = 36;
  const iw = W - L - R, ih = H - T - B;
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.values[i] || 0), 0) : Math.max(...series.map((s) => s.values[i] || 0))));
  const mx = Math.max(10, ...totals, ...(target ? target.filter(Number.isFinite) : [0]));
  const step = niceStep(mx), top = Math.ceil(mx / step) * step;
  const y = (v) => T + ih - (v / top) * ih;
  const bw = iw / labels.length;
  const groupW = Math.min(52, bw * 0.7);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="direction:ltr">`;
  for (let g = 0; g <= top; g += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
  labels.forEach((lb, i) => {
    const cx = L + bw * i + bw / 2;
    if (stacked) {
      let acc = 0;
      series.forEach((sr, k) => {
        const v = sr.values[i] || 0;
        if (v > 0) {
          s += `<rect x="${cx - groupW / 2}" y="${y(acc + v)}" width="${groupW}" height="${Math.max(0, y(acc) - y(acc + v) - 1)}" fill="${sr.color || SERIES_COLORS[k]}" rx="2"><title>${esc(lb)} - ${esc(sr.name)}: ${v}</title></rect>`;
          acc += v;
        }
      });
    } else {
      const w = groupW / series.length;
      series.forEach((sr, k) => {
        const v = sr.values[i] || 0;
        s += `<rect x="${cx - groupW / 2 + w * k}" y="${y(v)}" width="${w - 1}" height="${Math.max(0, y(0) - y(v))}" fill="${sr.color || SERIES_COLORS[k]}" rx="2"><title>${esc(lb)} - ${esc(sr.name)}: ${v}</title></rect>`;
      });
    }
    if (target && Number.isFinite(target[i]) && target[i] > 0) s += `<line x1="${cx - groupW / 2 - 4}" x2="${cx + groupW / 2 + 4}" y1="${y(target[i])}" y2="${y(target[i])}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3"/>`;
    const topv = totals[i];
    if (topv > 0) s += `<text x="${cx}" y="${y(Math.max(topv, target?.[i] || 0)) - 7}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${topv}</text>`;
    s += `<text x="${cx}" y="${H - 12}" text-anchor="middle" style="fill:var(--ink)">${esc(lb)}</text>`;
  });
  return s + `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)"/></svg>`;
};

export const lineChart = ({ labels, values, height = 260, label = '' }) => {
  const W = 760, H = height, L = 46, R = 16, T = 24, B = 34;
  const iw = W - L - R, ih = H - T - B;
  const pts = values.map((v) => (Number.isFinite(v) ? v : null));
  const mx = Math.max(10, ...pts.filter((v) => v !== null));
  const step = niceStep(mx), top = Math.ceil(mx / step) * step;
  const y = (v) => T + ih - (v / top) * ih;
  const x = (i) => L + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="direction:ltr">`;
  for (let g = 0; g <= top; g += step) s += `<line x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
  const path = pts.map((v, i) => (v === null ? '' : `${i && pts[i - 1] !== null ? 'L' : 'M'}${x(i)},${y(v)}`)).join(' ');
  const first = pts.findIndex((v) => v !== null);
  const lastIdx = pts.length - 1 - [...pts].reverse().findIndex((v) => v !== null);
  if (first >= 0) s += `<path d="${path} L${x(lastIdx)},${y(0)} L${x(first)},${y(0)} Z" fill="var(--s1)" opacity=".12"/>`;
  s += `<path d="${path}" fill="none" stroke="var(--s1)" stroke-width="2.5" stroke-linejoin="round"/>`;
  const every = Math.ceil(labels.length / 16);
  pts.forEach((v, i) => {
    if (v === null) return;
    s += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="var(--s1)"><title>${esc(labels[i])}: ${v}</title></circle>`;
    if (labels.length <= 16) s += `<text x="${x(i)}" y="${y(v) - 9}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${v}</text>`;
  });
  labels.forEach((lb, i) => {
    if (i % every === 0 || i === labels.length - 1) s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" style="fill:var(--ink)">${esc(lb)}</text>`;
  });
  return s + `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)"/></svg>`;
};

// أعمدة أفقية للأسباب
export const hbarChart = ({ items, color = 'var(--s1)', label = '' }) => {
  if (!items.length) return '<p class="empty-note">مفيش بيانات في الفترة دي.</p>';
  const rowH = 30, W = 760, L = 190, R = 50;
  const H = items.length * rowH + 14;
  const mx = Math.max(1, ...items.map((i) => i.value));
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}" style="direction:ltr">`;
  items.forEach((it, i) => {
    const w = ((W - L - R) * it.value) / mx;
    const yy = 6 + i * rowH;
    s += `<text x="${L - 10}" y="${yy + 17}" text-anchor="end" style="fill:var(--ink)">${esc(it.name)}</text>`;
    s += `<rect x="${L}" y="${yy + 3}" width="${Math.max(2, w)}" height="${rowH - 10}" rx="3" fill="${color}"><title>${esc(it.name)}: ${it.value}</title></rect>`;
    s += `<text x="${L + Math.max(2, w) + 8}" y="${yy + 17}" style="fill:var(--ink);font-weight:600">${it.value}</text>`;
  });
  return s + '</svg>';
};

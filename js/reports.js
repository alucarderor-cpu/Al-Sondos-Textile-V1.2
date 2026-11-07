// حسابات التقارير. نفس معادلات ملف الإكسل بالظبط.
import { CONFIG } from './config.js';
import { store } from './data.js';
import { addDays, daysInMonth, isoOf, serialOf, targetOf, MONTHS } from './util.js';

const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
const outOf = (r) => r.out || 0;

export const inDay = (iso) => store.rows.filter((r) => r.iso === iso);
export const inRange = (from, to) => {
  const a = serialOf(from), b = serialOf(to);
  return store.rows.filter((r) => r.s >= a && r.s <= b);
};
export const inMonth = (m, y) => store.rows.filter((r) => r.mo === +m && r.y === +y);
export const inYear = (y) => store.rows.filter((r) => r.y === +y);

export const weekRows = (start) => inRange(start, addDays(start, 6));
export const lastWeekRows = (end) => inRange(addDays(end, -6), end);

const matchWeaver = (r, w) => !w || w === 'الكل' || r.weaver === w;
const matchAssist = (r, a) => !a || a === 'الكل' || r.a1 === a || r.a2 === a;
export const filterRows = (rows, w, a) => rows.filter((r) => matchWeaver(r, w) && matchAssist(r, a));

export const totals = (rows) => {
  const out = sum(rows, outOf);
  const target = sum(rows, (r) => targetOf(r.shift));
  return { out, target, eff: target ? out / target : null, shifts: rows.length };
};

// جدول الماكينات: إجمالي، مستهدف، كفاءة، وإنتاج كل وردية
export const byMachine = (rows) =>
  store.lists.machines.map((m) => {
    const rs = rows.filter((r) => r.machine === m);
    const sh = [1, 2, 3].map((s) => rs.find((r) => r.shift === s) || null);
    const t = totals(rs);
    return { machine: m, ...t, running: rs.filter((r) => outOf(r) > 0).length, sh, rows: rs };
  });

// ترتيب بالإنتاج (للنساجين والمساعدين في التقارير الأسبوعي والشهري والسنوي)
const orderIndex = (list, name) => {
  const i = list.indexOf(name);
  return i < 0 ? -1 : i;
};
export const topByOutput = (rows, kind, n) => {
  const list = kind === 'weaver' ? store.lists.weavers : store.lists.assistants;
  const acc = new Map();
  for (const r of rows) {
    const names = kind === 'weaver' ? [r.weaver] : [r.a1, r.a2];
    for (const nm of names) if (nm) acc.set(nm, (acc.get(nm) || 0) + outOf(r));
  }
  return [...acc.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || orderIndex(list, b[0]) - orderIndex(list, a[0]))
    .slice(0, n)
    .map(([name, out]) => ({ name, out }));
};

// أداء الأفراد: كفاءة = الفعلي ÷ المستهدف حسب الورديات اللي اشتغلها
export const peopleStats = (rows, kind) => {
  const list = kind === 'weaver' ? store.lists.weavers : store.lists.assistants;
  const acc = new Map();
  for (const r of rows) {
    const names = kind === 'weaver' ? [r.weaver] : [r.a1, r.a2];
    for (const nm of names) {
      if (!nm) continue;
      if (!acc.has(nm)) acc.set(nm, { name: nm, out: 0, target: 0, shifts: 0, sh: [0, 0, 0], macs: new Map() });
      const p = acc.get(nm);
      p.out += outOf(r);
      p.target += targetOf(r.shift);
      p.shifts += 1;
      if (r.shift >= 1 && r.shift <= 3) p.sh[r.shift - 1] += 1;
      p.macs.set(r.machine, (p.macs.get(r.machine) || 0) + 1);
    }
  }
  const res = [...acc.values()].map((p) => {
    let best = null, bestN = 0;
    for (const m of store.lists.machines) {
      const c = p.macs.get(m) || 0;
      if (c > bestN) { best = m; bestN = c; }
    }
    return { name: p.name, out: p.out, shifts: p.shifts, sh: p.sh, eff: p.target ? p.out / p.target : 0, avg: p.shifts ? p.out / p.shifts : 0, machine: best, idx: orderIndex(list, p.name) };
  });
  return res.sort((a, b) => b.eff - a.eff || b.idx - a.idx);
};

// عطلات: تكرار الأسباب + جدول الماكينات (uptime)
export const reasonCounts = (rows) => {
  const map = new Map(store.lists.reasons.map((x) => [x, 0]));
  for (const r of rows) if (r.reason) map.set(r.reason, (map.get(r.reason) || 0) + 1);
  return [...map.entries()].map(([reason, count]) => ({ reason, count }));
};
export const downtimeByMachine = (rows) =>
  store.lists.machines.map((m) => {
    const rs = rows.filter((r) => r.machine === m);
    const stopped = rs.filter((r) => r.reason).length;
    const minutes = sum(rs, (r) => r.dt || 0);
    return { machine: m, stopped, shifts: rs.length, minutes, uptime: rs.length ? 1 - minutes / (rs.length * CONFIG.shiftMinutes) : null };
  });
export const stopsByMonth = (y) => MONTHS.map((name, i) => ({ name, count: store.rows.filter((r) => r.y === +y && r.mo === i + 1 && r.reason).length }));

// التبريز / تغيير المطوي
export const tabrizByMachine = (rows) =>
  store.lists.machines.map((m) => {
    const rs = rows.filter((r) => r.machine === m);
    const n = rs.filter((r) => r.tab).length;
    return { machine: m, count: n, shifts: rs.length, share: rs.length ? n / rs.length : 0 };
  });
export const tabrizByMonth = (y) => MONTHS.map((name, i) => ({ name, count: store.rows.filter((r) => r.y === +y && r.mo === i + 1 && r.tab).length }));

// التقرير الشهري والسنوي
export const monthDaily = (m, y, w, a) => {
  const n = daysInMonth(+y, +m);
  const rows = filterRows(inMonth(m, y), w, a);
  return Array.from({ length: n }, (_, i) => ({ day: i + 1, out: sum(rows.filter((r) => r.iso.endsWith('-' + String(i + 1).padStart(2, '0'))), outOf) }));
};
export const yearGrid = (y, w, a) => {
  const rows = filterRows(inYear(y), w, a);
  return store.lists.machines.map((m) => {
    const months = MONTHS.map((_, i) => sum(rows.filter((r) => r.machine === m && r.mo === i + 1), outOf));
    const target = sum(rows.filter((r) => r.machine === m), (r) => targetOf(r.shift));
    return { machine: m, months, total: months.reduce((x, y2) => x + y2, 0), target };
  });
};

export const dayLabel = (iso) => iso;
export { isoOf };

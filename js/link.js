// منطق الربط التلقائي: طلبية العميل ↔ ألوان الماكينة ↔ إنتاج الوردية (بنط) ↔ المتبقي والموعد المتوقع.
import { db } from './db.js';
import { store } from './data.js';
import { orderTotals } from './orderparse.js';
import { addDays, todayIso } from './util.js';

export const normColor = (s) => String(s || '').trim().replace(/ميكس/g, 'مكس').replace(/\s+/g, ' ');
// "بيج * بني" → ['بيج','بني']
export const colorsOf = (colorway) => [...new Set(String(colorway || '').split(/[*×xX]/).map(normColor).filter(Boolean))];

export const machineMatches = (machine, colorway) => {
  const need = colorsOf(colorway);
  if (!need.length || need[0] === 'غير محدد') return false;
  const have = new Set((machine.colors || []).map(normColor));
  return need.every((c) => have.has(c));
};

export const orderById = (id) => db.orders.orders.find((o) => o.id === id);

// كل الفترات اللي اشتغلت فيها الماكينة على طلبية (القديمة + الحالية)
export const segments = (m) => [...(m.history || []), ...(m.assign ? [{ ...m.assign, until: null }] : [])];

// إنتاج ماكينة (بنط) من تاريخ لتاريخ (until مش داخل)
export const producedOn = (machineId, since, until) =>
  store.rows.reduce((s, r) => (r.machine === machineId && r.iso >= since && (!until || r.iso < until) && typeof r.out === 'number' ? s + r.out : s), 0);

// طاقة الماكينة بنط/يوم: متوسط آخر أيام فيها إنتاج، وإلا الافتراضي
export const capacity = (machineId) => {
  const n = db.settings.capacityDays || 14;
  const perDay = new Map();
  for (const r of store.rows) if (r.machine === machineId && typeof r.out === 'number' && r.out > 0) perDay.set(r.iso, (perDay.get(r.iso) || 0) + r.out);
  const days = [...perDay.keys()].sort().slice(-n);
  if (!days.length) return db.settings.buntPerDay || 0;
  return days.reduce((s, d) => s + perDay.get(d), 0) / days.length;
};

export const totalBunt = (o) => {
  if (typeof o.totalBunt === 'number' && o.totalBunt > 0) return o.totalBunt;
  const k = db.settings.m2PerBunt;
  return k ? orderTotals(o).m2 / k : null;
};

// تفاصيل الربط لطلبية واحدة
export const orderStatus = (o) => {
  const tot = orderTotals(o);
  const total = totalBunt(o);
  let produced = 0;
  const machines = [];
  for (const m of db.machines.machines) {
    const segs = segments(m).filter((s) => s.orderId === o.id);
    if (!segs.length) continue;
    const p = segs.reduce((s, g) => s + producedOn(m.id, g.since, g.until), 0);
    produced += p;
    if (m.assign && m.assign.orderId === o.id) machines.push({ id: m.id, design: m.assign.design, since: m.assign.since, produced: p, cap: capacity(m.id) });
  }
  const remaining = total === null ? null : Math.max(total - produced, 0);
  const cap = machines.reduce((s, m) => s + m.cap, 0);
  const days = remaining === null ? null : remaining === 0 ? 0 : cap > 0 ? Math.ceil(remaining / cap) : null;
  return { ...tot, total, produced, remaining, machines, cap, days, eta: days === null ? null : addDays(todayIso(), days), pct: total ? Math.min(produced / total, 1) : null };
};

// اقتراح الماكينات لكل لون في الطلبية (تلقائي من كونفجريشن الألوان)
export const suggestions = (o) => {
  const out = [];
  for (const d of o.designs) {
    for (const l of d.lines) {
      const ms = db.machines.machines.filter((m) => machineMatches(m, l.color)).map((m) => m.id);
      out.push({ design: d.code, color: l.color, machines: ms });
    }
  }
  return out;
};

// ملخص العميل: كل طلباته مع بعض
export const customerSummary = () => {
  const map = new Map();
  for (const o of db.orders.orders) {
    const k = o.customer || 'بدون اسم';
    const s = orderStatus(o);
    const c = map.get(k) || { customer: k, orders: [], pieces: 0, m2: 0, total: 0, unknownTotal: false, produced: 0, machines: new Set(), cap: 0 };
    c.orders.push({ o, s });
    c.pieces += s.pieces; c.m2 += s.m2; c.produced += s.produced;
    if (s.total === null) c.unknownTotal = true; else c.total += s.total;
    s.machines.forEach((m) => { if (!c.machines.has(m.id)) { c.machines.add(m.id); c.cap += m.cap; } });
    map.set(k, c);
  }
  return [...map.values()].map((c) => {
    const known = !c.unknownTotal && c.total > 0;
    const remaining = known ? Math.max(c.total - c.produced, 0) : null;
    const days = remaining === null ? null : remaining === 0 ? 0 : c.cap > 0 ? Math.ceil(remaining / c.cap) : null;
    return { ...c, known, remaining, days, eta: days === null ? null : addDays(todayIso(), days), pct: known ? Math.min(c.produced / c.total, 1) : null };
  }).sort((a, b) => a.customer.localeCompare(b.customer, 'ar'));
};

// تحديث قاعدة التصاميم من طلبية (بيضيف الكود والألوان الجديدة بس)
export const harvestDesigns = (o) => {
  let changed = false;
  for (const d of o.designs) {
    if (!d.code) continue;
    let rec = db.designs.designs.find((x) => x.code.toLowerCase() === d.code.toLowerCase());
    if (!rec) { rec = { code: d.code, name: '', notes: '', colorways: [], orders: [], updatedAt: todayIso() }; db.designs.designs.push(rec); changed = true; }
    for (const l of d.lines) if (l.color && l.color !== 'غير محدد' && !rec.colorways.includes(l.color)) { rec.colorways.push(l.color); changed = true; }
    if (!rec.orders.includes(o.id)) { rec.orders.push(o.id); changed = true; }
    if (changed) rec.updatedAt = todayIso();
  }
  return changed;
};

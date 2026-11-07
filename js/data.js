import { CONFIG } from './config.js';
import { isoOf, serialOf } from './util.js';

const LOG_SHEET = 'سجل الإنتاج';
const LISTS_SHEET = 'قوائم';
const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const keyOf = (iso, machine, shift) => `${iso}_${machine}_${shift}`;

export const store = {
  rows: [],          // كل الصفوف بعد دمج التعديلات اللي لسه ماوصلتش للإكسل
  base: new Map(),   // صفوف ملف الإكسل
  pending: new Map(),// تسجيلات اتبعتت للريبو وماتضافتش للإكسل لسه
  lists: { machines: [], weavers: [], assistants: [], reasons: [] },
  loadedAt: null,
};

const toRow = (o) => {
  const s = serialOf(o.iso);
  const [y, m] = o.iso.split('-').map(Number);
  return { key: keyOf(o.iso, o.machine, o.shift), iso: o.iso, s, y, mo: m, machine: o.machine, shift: o.shift, weaver: o.weaver || '', a1: o.a1 || '', a2: o.a2 || '', out: o.out, note: o.note || '', reason: o.reason || '', dt: o.dt || 0, tab: !!o.tab };
};

const detectRepo = () => {
  let st = {};
  try { st = JSON.parse(localStorage.getItem('sondos_gh') || '{}'); } catch { /* ignore */ }
  let repo = st.repo || (CONFIG.repo ? `${CONFIG.repo.owner}/${CONFIG.repo.repo}` : '');
  if (!repo && /\.github\.io$/.test(location.hostname)) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (seg) repo = `${location.hostname.split('.')[0]}/${seg}`;
  }
  return { repo, token: st.token || '', branch: st.branch || CONFIG.repo?.branch || 'main' };
};

// بيقرأ الملف من GitHub مباشرة (متحدث فورًا بعد الـ Action)، ولو فشل بيرجع للملف المنشور على الموقع
const fetchWorkbook = async () => {
  const g = detectRepo();
  if (g.repo) {
    try {
      const h = { Accept: 'application/vnd.github.raw+json' };
      if (g.token) h.Authorization = `Bearer ${g.token}`;
      const r = await fetch(`https://api.github.com/repos/${g.repo}/contents/${CONFIG.dataFile}?ref=${encodeURIComponent(g.branch)}`, { headers: h, cache: 'no-store' });
      if (r.ok) return await r.arrayBuffer();
    } catch { /* fall back */ }
  }
  const res = await fetch(`${CONFIG.dataFile}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`تعذر تحميل ملف ${CONFIG.dataFile} (${res.status})`);
  return res.arrayBuffer();
};

export const loadWorkbook = async () => {
  const buf = await fetchWorkbook();
  const wb = XLSX.read(buf, { type: 'array', sheets: [LOG_SHEET, LISTS_SHEET], cellFormula: false, cellStyles: false, cellHTML: false, cellNF: false });
  const log = XLSX.utils.sheet_to_json(wb.Sheets[LOG_SHEET], { header: 1, raw: true, defval: null, range: 2 });
  store.base = new Map();
  for (const r of log) {
    const [, b, , d, e, f, g, h, i, j, , , m, , o, p] = r;
    if (typeof b !== 'number' || typeof d !== 'number' || typeof e !== 'number') continue;
    const row = toRow({ iso: isoOf(Math.round(b)), machine: d, shift: e, weaver: clean(f), a1: clean(g), a2: clean(h), out: num(i), note: clean(j), reason: clean(o), dt: num(p) || 0, tab: clean(m) === 'نعم' });
    store.base.set(row.key, [...(store.base.get(row.key) || []), row]); // التكرار بيتحسب زي الإكسل بالظبط
  }
  // قوائم: الماكينات والنساجين والمساعدين من صف 3، وأسباب العطلات من صف 2 (G2)
  const sheet = wb.Sheets[LISTS_SHEET];
  const names = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, range: 2 });
  const reasonsRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, range: 1 });
  const col = (rows, c) => [...new Set(rows.map((r) => r[c]).filter((v) => v !== null && v !== '').map((v) => (typeof v === 'number' ? v : clean(v))))];
  store.lists = {
    machines: col(names, 0).filter((v) => typeof v === 'number'),
    weavers: col(names, 1),
    assistants: col(names, 2),
    reasons: col(reasonsRows, 6),
  };
  store.loadedAt = new Date();
  prunePending();
  merge();
};

const same = (a, b) => a && b && a.out === b.out && a.weaver === b.weaver && a.a1 === b.a1 && a.a2 === b.a2 && a.reason === b.reason && a.note === b.note && a.dt === b.dt;

const prunePending = () => {
  for (const [k, p] of store.pending) {
    const arr = store.base.get(k);
    const b = arr && arr[arr.length - 1];
    if (p.deleted ? !arr : arr.length === 1 && same(p, b)) store.pending.delete(k);
  }
};

export const merge = () => {
  const all = new Map(store.base);
  for (const [k, p] of store.pending) {
    if (p.deleted) all.delete(k);
    else all.set(k, [p]);
  }
  store.rows = [...all.values()].flat().sort((a, b) => a.s - b.s || a.machine - b.machine || a.shift - b.shift);
  store.dates = [...new Set(store.rows.map((r) => r.iso))].sort();
  store.lastDate = store.dates[store.dates.length - 1] || null;
  store.years = [...new Set(store.rows.map((r) => r.y))].sort();
};

export const setPending = (entry) => {
  const row = toRow({ iso: entry.date, machine: +entry.machine, shift: +entry.shift, weaver: entry.weaver, a1: entry.a1, a2: entry.a2, out: entry.output === '' || entry.output == null ? null : +entry.output, note: entry.note, reason: entry.reason, dt: +entry.dt || 0, tab: ['تبريز', 'تغيير مطوي'].includes((entry.reason || '').trim()) });
  if (entry.op === 'delete') row.deleted = true;
  store.pending.set(row.key, row);
  merge();
};

export const clearPending = () => {
  store.pending.clear();
  merge();
};

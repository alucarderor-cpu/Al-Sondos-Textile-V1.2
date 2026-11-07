// قراءة ملف "أمر إنتاج" (xlsx/xlsm) وتحويله لطلبية منظمة. بيعتمد على القيم المخزنة في الخلايا.
// XLSX متاح كمتغير عام (من cdnjs في المتصفح).
const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const sizeM2 = (label, rollLen) => {
  const s = String(label).replace(/\s+/g, '').replace(/×/g, 'x').replace(/[xX]/g, 'x');
  let m = s.match(/^رول(\d+(?:\.\d+)?)$/);
  if (m) return (parseFloat(m[1]) / 100) * rollLen;
  m = s.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (m) return (parseFloat(m[1]) * parseFloat(m[2])) / 10000;
  return 0;
};

const parseDate = (v) => {
  const s = clean(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

export const parseOrderWorkbook = (buf) => {
  const wb = XLSX.read(buf, { type: 'array', cellFormula: false, cellStyles: false });
  const name = wb.SheetNames.find((n) => n.includes('أمر إنتاج')) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  const at = (r, c) => (rows[r - 1] ? rows[r - 1][c - 1] : null); // إحداثيات Excel (صف/عمود من 1)
  const rollLen = isNum(at(2, 20)) ? at(2, 20) : 25;
  const order = {
    customer: clean(at(6, 1)),
    idea: clean(at(6, 6)),
    orderNo: clean(at(6, 11)),
    date: parseDate(at(1, 14)),
    rollLen,
    designs: [],
  };
  let cur = null;
  let sizes = [];
  for (let r = 11; r <= rows.length; r++) {
    const a = clean(at(r, 1));
    const b = clean(at(r, 2));
    if (a.startsWith('التصميم')) {
      cur = { code: a.replace(/^التصميم\s*:?/, '').trim(), lines: [] };
      order.designs.push(cur);
      sizes = [];
      continue;
    }
    if (!cur) continue;
    if (a === 'صورة التصميم') {
      sizes = [];
      for (let c = 3; c <= 12; c++) sizes.push(clean(at(r, c)));
      continue;
    }
    if (b.startsWith('إجمالي')) continue;
    if (!sizes.length) continue;
    const qty = {};
    let any = false;
    sizes.forEach((sz, i) => {
      const q = at(r, 3 + i);
      if (sz && isNum(q) && q > 0) { qty[sz] = (qty[sz] || 0) + q; any = true; }
    });
    if (any) cur.lines.push({ color: b || 'غير محدد', qty, note: clean(at(r, 15)) });
  }
  order.designs = order.designs.filter((d) => d.lines.length);
  return order;
};

export const orderTotals = (o) => {
  let pieces = 0;
  let m2 = 0;
  const bySize = {};
  for (const d of o.designs) {
    for (const l of d.lines) {
      for (const [sz, q] of Object.entries(l.qty)) {
        pieces += q;
        const area = q * sizeM2(sz, o.rollLen);
        m2 += area;
        bySize[sz] = bySize[sz] || { pieces: 0, m2: 0 };
        bySize[sz].pieces += q;
        bySize[sz].m2 += area;
      }
    }
  }
  return { pieces, m2, bySize };
};

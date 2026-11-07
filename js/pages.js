// صفحات التقارير. كل صفحة بتقابل شيت في ملف الإكسل.
import { CONFIG } from './config.js';
import { store } from './data.js';
import * as R from './reports.js';
import { barChart, hbarChart, legend, lineChart } from './charts.js';
import { addDays, dayName, effPill, esc, fmt, MONTHS, pct, todayIso } from './util.js';
import { bind, card, controls, dateInput, field, kpis, monthSelect, nameSelect, rankTable, table, tr, val, yearSelect } from './ui.js';

const last = () => store.lastDate || todayIso();
const lastY = () => +last().slice(0, 4);
const lastM = () => +last().slice(5, 7);
const shiftLegend = legend([1, 2, 3].map((s) => ({ name: `وردية ${s}`, color: `var(--s${s})` })).concat([{ name: 'الإنتاج المستهدف', color: 'transparent' }])).replace('<i style="background:transparent"></i>', '<i class="dash"></i>');

// بيرسم عناصر التحكم مرة واحدة وبيعيد بناء النتيجة مع كل تغيير
const view = (root, { controlsHtml, ids, build }) => {
  root.innerHTML = `${controlsHtml ? controls(controlsHtml) : ''}<div id="out"></div>`;
  const out = root.querySelector('#out');
  const run = () => (out.innerHTML = build((id) => val(root, id)));
  bind(root, ids || [], run);
  run();
};

const machineRows = (list, withShifts) =>
  list.map((m) => {
    const cells = [{ h: `<b>${m.machine}</b>`, cls: 'mac' }, `<b>${fmt(m.out)}</b>`, fmt(m.target) === '—' || !m.target ? '—' : fmt(m.target), effPill(m.target ? m.eff : null)];
    if (withShifts) cells.splice(2, 0, ...m.sh.map((r) => (r ? fmt(r.out || 0) : '—')), m.running);
    return tr(cells);
  });
const tgtOrDash = (n) => (n ? fmt(n) : '—');

const topLists = (rows, n, weaverTitle, assistTitle) => {
  const cols = (unit) => [{ t: 'الاسم', f: (x) => esc(x.name) }, { t: unit, f: (x) => fmt(x.out) }];
  return `<div class="grid2">${card(weaverTitle, rankTable(R.topByOutput(rows, 'weaver', n), cols('الإنتاج')))}${card(assistTitle, rankTable(R.topByOutput(rows, 'assistant', n), cols('الإنتاج')))}</div>`;
};

const machineChart = (list) =>
  barChart({ labels: list.map((m) => m.machine), series: [1, 2, 3].map((s) => ({ name: `وردية ${s}`, color: `var(--s${s})`, values: list.map((m) => m.sh[s - 1]?.out || 0) })), stacked: true, target: list.map((m) => m.target), label: 'الإنتاج حسب الماكينة' }) + shiftLegend;

/* ---------------- التقرير اليومي ---------------- */
const daily = (root) => {
  view(root, {
    controlsHtml: field('d', 'اختار التاريخ', dateInput('d', last())),
    ids: ['d'],
    build: (v) => {
      const d = v('d');
      const rows = R.inDay(d);
      const list = R.byMachine(rows);
      const t = R.totals(rows);
      const head = ['الماكينة', 'إجمالي الإنتاج', 'وردية 1', 'وردية 2', 'وردية 3', 'ورديات شغالة', 'المستهدف', '% الكفاءة'];
      const body = list.map((m) => tr([{ h: `<b>${m.machine}</b>`, cls: 'mac' }, `<b>${fmt(m.out)}</b>`, ...m.sh.map((r) => (r ? fmt(r.out || 0) : '—')), m.running, tgtOrDash(m.target), effPill(m.target ? m.eff : null)]));
      const sh = [1, 2, 3].map((s) => R.totals(rows.filter((r) => r.shift === s)).out);
      const foot = tr(['الإجمالي', fmt(t.out), ...sh.map((n) => fmt(n)), '', fmt(t.target), effPill(t.eff)], 'tot');
      const stops = rows.slice().sort((a, b) => a.machine - b.machine || a.shift - b.shift);
      const dtRows = stops.map((r) => {
        const has = r.reason || r.note || r.dt > 0;
        return tr([{ h: `<b>${r.machine}</b>`, cls: 'mac' }, r.shift, { h: esc(r.weaver), cls: 'l' }, r.out === null ? '—' : fmt(r.out), r.reason ? esc(r.reason) : has ? '<span class="noreason">بدون سبب محدد</span>' : '<span class="muted">لا توجد عطلة</span>', { h: esc(r.note), cls: 'l note' }, r.dt || 0]);
      });
      return (
        `<p class="headline">اليوم: <b>${d ? dayName(d) : ''}</b> <i>|</i> إجمالي إنتاج اليوم: <b>${fmt(t.out)}</b> <i>|</i> % كفاءة اليوم: <b>${pct(t.eff)}</b></p>` +
        kpis([{ l: 'إجمالي إنتاج اليوم', v: fmt(t.out), n: 'بنط' }, { l: 'الإنتاج المستهدف', v: fmt(t.target), n: 'حسب الورديات المسجلة' }, { l: 'كفاءة اليوم', v: pct(t.eff) }, { l: 'ماكينات شغالة', v: `${list.filter((m) => m.out > 0).length} من ${list.length}` }, { l: 'ورديات فيها عطلة', v: stops.filter((r) => r.reason || r.note || r.dt > 0).length, n: `من ${rows.length} وردية مسجلة` }]) +
        card('الإنتاج حسب الماكينة', `<div class="chartbox">${machineChart(list)}</div>`) +
        card('إنتاج الماكينات والورديات', table({ head, rows: body, foot })) +
        card('عطلات الماكينات خلال اليوم', table({ head: ['الماكينة', 'الوردية', { t: 'النساج', cls: 'l' }, 'الإنتاج', 'سبب العطلة', { t: 'تفاصيل / ملاحظات', cls: 'l' }, 'مدة التوقف (دقيقة)'], rows: dtRows, empty: 'مفيش ورديات مسجلة في اليوم ده.' }), `${rows.length} وردية مسجلة`) +
        topLists(rows, 10, 'أفضل النساجين في اليوم', 'أفضل المساعدين في اليوم')
      );
    },
  });
};

/* ---------------- التقرير الأسبوعي ---------------- */
const weekly = (root) => {
  view(root, {
    controlsHtml: field('w', 'بداية الأسبوع', dateInput('w', addDays(last(), -6))),
    ids: ['w'],
    build: (v) => {
      const s = v('w'), e = addDays(s, 6);
      const rows = R.weekRows(s);
      const list = R.byMachine(rows);
      const t = R.totals(rows);
      const days = Array.from({ length: 7 }, (_, i) => {
        const iso = addDays(s, i);
        return { iso, label: `${dayName(iso)} ${iso}`, out: R.totals(R.inDay(iso)).out };
      });
      const foot = tr(['الإجمالي', fmt(t.out), fmt(t.target), effPill(t.eff)], 'tot');
      return (
        `<p class="headline">من <b class="ltr">${s}</b> إلى <b class="ltr">${e}</b> <i>|</i> إجمالي إنتاج الأسبوع: <b>${fmt(t.out)}</b> <i>|</i> % كفاءة الأسبوع: <b>${pct(t.eff)}</b></p>` +
        card('الإنتاج حسب الماكينة خلال الأسبوع', `<div class="chartbox">${machineChart(list)}</div>` + table({ head: ['الماكينة', 'إجمالي الإنتاج', 'الإنتاج المستهدف', '% الكفاءة'], rows: list.map((m) => tr([{ h: `<b>${m.machine}</b>`, cls: 'mac' }, `<b>${fmt(m.out)}</b>`, tgtOrDash(m.target), effPill(m.target ? m.eff : null)])), foot })) +
        card('الاتجاه اليومي خلال الأسبوع', `<div class="chartbox">${barChart({ labels: days.map((d) => d.iso.slice(5)), series: [{ name: 'الإنتاج', values: days.map((d) => d.out), color: 'var(--s1)' }], label: 'الاتجاه اليومي' })}</div>` + table({ head: ['اليوم', 'الإنتاج'], rows: days.map((d) => tr([{ h: d.label, cls: 'ltr' }, fmt(d.out)])) })) +
        topLists(rows, 10, 'أفضل النساجين في الأسبوع', 'أفضل المساعدين في الأسبوع')
      );
    },
  });
};

/* ---------------- التقرير الشهري ---------------- */
const monthly = (root) => {
  view(root, {
    controlsHtml: field('m', 'الشهر', monthSelect('m', lastM())) + field('y', 'السنة', yearSelect('y', lastY())) + field('fw', 'فلترة النساج (اختياري)', nameSelect('fw', store.lists.weavers)) + field('fa', 'فلترة المساعد (اختياري)', nameSelect('fa', store.lists.assistants)),
    ids: ['m', 'y', 'fw', 'fa'],
    build: (v) => {
      const m = +v('m'), y = +v('y'), fw = v('fw'), fa = v('fa');
      const all = R.inMonth(m, y);
      const rows = R.filterRows(all, fw, fa);
      const list = R.byMachine(rows);
      const t = R.totals(rows);
      const days = R.monthDaily(m, y, fw, fa);
      const foot = tr(['الإجمالي', fmt(t.out), fmt(t.target), effPill(t.eff)], 'tot');
      return (
        `<p class="headline">الشهر: <b>${MONTHS[m - 1]} ${y}</b> <i>|</i> إجمالي إنتاج الشهر (بعد الفلترة): <b>${fmt(t.out)}</b> <i>|</i> % كفاءة الشهر: <b>${pct(t.eff)}</b></p>` +
        card('الإنتاج حسب الماكينة خلال الشهر', `<div class="chartbox">${machineChart(list)}</div>` + table({ head: ['الماكينة', 'إجمالي الإنتاج', 'الإنتاج المستهدف', '% الكفاءة'], rows: list.map((x) => tr([{ h: `<b>${x.machine}</b>`, cls: 'mac' }, `<b>${fmt(x.out)}</b>`, tgtOrDash(x.target), effPill(x.target ? x.eff : null)])), foot })) +
        card(`الاتجاه اليومي خلال الشهر (${days.length} يوم)`, `<div class="chartbox">${lineChart({ labels: days.map((d) => d.day), values: days.map((d) => d.out), label: 'الاتجاه اليومي' })}</div>` + table({ head: ['اليوم', 'الإنتاج'], rows: days.map((d) => tr([d.day, fmt(d.out)])), cls: 'compact' })) +
        topLists(all, 10, 'أفضل 10 نساجين في الشهر', 'أفضل 10 مساعدين في الشهر')
      );
    },
  });
};

/* ---------------- التقرير السنوي ---------------- */
const yearly = (root) => {
  view(root, {
    controlsHtml: field('y', 'السنة', yearSelect('y', lastY())) + field('fw', 'فلترة النساج (اختياري)', nameSelect('fw', store.lists.weavers)) + field('fa', 'فلترة المساعد (اختياري)', nameSelect('fa', store.lists.assistants)),
    ids: ['y', 'fw', 'fa'],
    build: (v) => {
      const y = +v('y'), fw = v('fw'), fa = v('fa');
      const grid = R.yearGrid(y, fw, fa);
      const monthTot = MONTHS.map((_, i) => grid.reduce((a, g) => a + g.months[i], 0));
      const total = monthTot.reduce((a, b) => a + b, 0);
      const target = grid.reduce((a, g) => a + g.target, 0);
      const body = grid.map((g) => tr([{ h: `<b>${g.machine}</b>`, cls: 'mac' }, ...g.months.map((n) => fmt(n)), `<b>${fmt(g.total)}</b>`]));
      const foot = tr(['الإجمالي', ...monthTot.map((n) => fmt(n)), fmt(total)], 'tot');
      const rows = R.inYear(y);
      return (
        `<p class="headline">إجمالي إنتاج السنة (بعد الفلترة): <b>${fmt(total)}</b> <i>|</i> % كفاءة السنة: <b>${pct(target ? total / target : null)}</b></p>` +
        card('جدول الإنتاج: الماكينة × الشهر', table({ head: ['الماكينة', ...MONTHS, 'الإجمالي'], rows: body, foot, cls: 'compact' })) +
        card('الاتجاه الشهري لإجمالي الإنتاج (كل الماكينات)', `<div class="chartbox">${barChart({ labels: MONTHS, series: [{ name: 'الإنتاج', values: monthTot, color: 'var(--s1)' }], label: 'الاتجاه الشهري' })}</div>`) +
        card('إنتاج كل ماكينة خلال السنة', `<div class="chartbox">${barChart({ labels: grid.map((g) => g.machine), series: [{ name: 'الإنتاج', values: grid.map((g) => g.total), color: 'var(--s2)' }], target: grid.map((g) => g.target), label: 'إنتاج الماكينات' })}</div>`) +
        topLists(rows, 15, 'أفضل 15 نساج خلال السنة', 'أفضل 15 مساعد خلال السنة')
      );
    },
  });
};

/* ---------------- تحليل العطلات ---------------- */
const downtimeBlock = (rows, extra = '') => {
  const reasons = R.reasonCounts(rows).filter((x) => x.count > 0).sort((a, b) => b.count - a.count);
  const mach = R.downtimeByMachine(rows);
  const totalStops = reasons.reduce((a, b) => a + b.count, 0);
  return (
    kpis([{ l: 'إجمالي التوقفات', v: fmt(totalStops) }, { l: 'دقايق التوقف المسجلة', v: fmt(mach.reduce((a, m) => a + m.minutes, 0)) }, { l: 'أكتر سبب تكرارًا', v: reasons[0] ? esc(reasons[0].reason) : '—', n: reasons[0] ? `${reasons[0].count} مرة` : '' }]) +
    card('أسباب العطلات', `<div class="chartbox">${hbarChart({ items: reasons.map((x) => ({ name: x.reason, value: x.count })), label: 'أسباب العطلات' })}</div>`, 'عدد مرات التكرار') +
    card('التوقفات والكفاءة لكل ماكينة', table({ head: ['الماكينة', 'عدد الورديات المتوقفة', 'إجمالي الورديات', 'إجمالي دقايق التوقف', '% الكفاءة (uptime)'], rows: mach.map((m) => tr([{ h: `<b>${m.machine}</b>`, cls: 'mac' }, m.stopped, m.shifts, fmt(m.minutes), effPill(m.shifts ? m.uptime : null)])) }), 'الكفاءة = 1 − دقايق التوقف ÷ (عدد الورديات × 480)') +
    extra
  );
};
const downtime = (root) => {
  const tabs = ['أسبوعي', 'شهري', 'سنوي'];
  root.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t, i) => `<button type="button" role="tab" data-i="${i}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
  const show = (i) => {
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    const host = root.querySelector('#tab');
    if (i === 0) {
      view(host, { controlsHtml: field('e', 'نهاية الأسبوع', dateInput('e', last())), ids: ['e'], build: (v) => `<p class="headline">من <b class="ltr">${addDays(v('e'), -6)}</b> إلى <b class="ltr">${v('e')}</b></p>` + downtimeBlock(R.lastWeekRows(v('e'))) });
    } else if (i === 1) {
      view(host, { controlsHtml: field('m', 'الشهر', monthSelect('m', lastM())) + field('y', 'السنة', yearSelect('y', lastY())), ids: ['m', 'y'], build: (v) => downtimeBlock(R.inMonth(v('m'), v('y'))) });
    } else {
      view(host, {
        controlsHtml: field('y', 'السنة', yearSelect('y', lastY())),
        ids: ['y'],
        build: (v) => {
          const sm = R.stopsByMonth(v('y'));
          return downtimeBlock(R.inYear(v('y')), card('إجمالي عدد التوقفات شهريًا خلال السنة المختارة', `<div class="chartbox">${barChart({ labels: MONTHS, series: [{ name: 'عدد التوقفات', values: sm.map((x) => x.count), color: 'var(--s2)' }], label: 'التوقفات شهريا' })}</div>`));
        },
      });
    }
  };
  root.querySelector('.tabs').addEventListener('click', (e) => e.target.dataset.i !== undefined && show(+e.target.dataset.i));
  show(0);
};

/* ---------------- داشبورد التبريز ---------------- */
const tabrizBlock = (rows, extra = '') => {
  const list = R.tabrizByMachine(rows);
  const total = list.reduce((a, b) => a + b.count, 0);
  return (
    kpis([{ l: 'عدد مرات التبريز / تغيير المطوي', v: fmt(total) }, { l: 'إجمالي الورديات', v: fmt(rows.length) }, { l: '% من الورديات', v: pct(rows.length ? total / rows.length : null) }]) +
    card('عدد المرات لكل ماكينة', `<div class="chartbox">${barChart({ labels: list.map((m) => m.machine), series: [{ name: 'عدد المرات', values: list.map((m) => m.count), color: 'var(--s2)' }], label: 'التبريز لكل ماكينة' })}</div>` + table({ head: ['الماكينة', 'عدد مرات التبريز/تغيير المطوي', 'إجمالي الورديات', '% من الورديات'], rows: list.map((m) => tr([{ h: `<b>${m.machine}</b>`, cls: 'mac' }, m.count, m.shifts, pct(m.share)])) })) +
    extra
  );
};
const tabriz = (root) => {
  const tabs = ['يومي', 'أسبوعي', 'شهري', 'سنوي'];
  root.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t, i) => `<button type="button" role="tab" data-i="${i}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
  const show = (i) => {
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    const host = root.querySelector('#tab');
    if (i === 0) view(host, { controlsHtml: field('d', 'اختار التاريخ', dateInput('d', last())), ids: ['d'], build: (v) => tabrizBlock(R.inDay(v('d'))) });
    else if (i === 1) view(host, { controlsHtml: field('e', 'نهاية الأسبوع', dateInput('e', last())), ids: ['e'], build: (v) => `<p class="headline">من <b class="ltr">${addDays(v('e'), -6)}</b> إلى <b class="ltr">${v('e')}</b></p>` + tabrizBlock(R.lastWeekRows(v('e'))) });
    else if (i === 2) view(host, { controlsHtml: field('m', 'الشهر', monthSelect('m', lastM())) + field('y', 'السنة', yearSelect('y', lastY())), ids: ['m', 'y'], build: (v) => tabrizBlock(R.inMonth(v('m'), v('y'))) });
    else
      view(host, {
        controlsHtml: field('y', 'السنة', yearSelect('y', lastY())),
        ids: ['y'],
        build: (v) => {
          const tm = R.tabrizByMonth(v('y'));
          return tabrizBlock(R.inYear(v('y')), card('اتجاه عدد مرات التبريز/تغيير المطوي شهريًا خلال السنة', `<div class="chartbox">${barChart({ labels: MONTHS, series: [{ name: 'عدد المرات', values: tm.map((x) => x.count), color: 'var(--s3)' }], label: 'اتجاه التبريز' })}</div>`));
        },
      });
  };
  root.querySelector('.tabs').addEventListener('click', (e) => e.target.dataset.i !== undefined && show(+e.target.dataset.i));
  show(0);
};

/* ---------------- أداء الأفراد (أفضل 10 / الكل) ---------------- */
const peopleCols = [
  { t: 'الاسم', f: (x) => esc(x.name) },
  { t: '% الكفاءة', f: (x) => effPill(x.eff) },
  { t: 'متوسط الإنتاج/وردية', f: (x) => fmt(x.avg, 1) },
  { t: 'إجمالي الإنتاج', f: (x) => fmt(x.out) },
  { t: 'عدد الورديات', f: (x) => x.shifts },
  { t: 'وردية 1', f: (x) => x.sh[0] },
  { t: 'وردية 2', f: (x) => x.sh[1] },
  { t: 'وردية 3', f: (x) => x.sh[2] },
  { t: 'أكتر ماكينة', f: (x) => x.machine ?? '—' },
];
const peopleBlock = (rows, n, label) => {
  const cut = (arr) => (n ? arr.slice(0, n) : arr);
  const w = cut(R.peopleStats(rows, 'weaver')), a = cut(R.peopleStats(rows, 'assistant'));
  const t = n ? `أفضل ${n}` : 'كل';
  return card(`${t} النساجين - ${label} (حسب % الكفاءة)`, rankTable(w, peopleCols)) + card(`${t} المساعدين - ${label} (حسب % الكفاءة)`, rankTable(a, peopleCols));
};
const people = (n) => (root) => {
  const tabs = ['يومي', 'آخر أسبوع', 'شهري', 'سنوي'];
  root.innerHTML = `<p class="note">الكفاءة = الإنتاج الفعلي ÷ المستهدف حسب الورديات اللي اشتغلها كل واحد (وردية 1 = ${CONFIG.targets[1]}، وردية 2 = ${CONFIG.targets[2]}، وردية 3 = ${CONFIG.targets[3]}). أي حد معندوش ورديات في الفترة مش بيظهر.</p><div class="tabs" role="tablist">${tabs.map((t, i) => `<button type="button" role="tab" data-i="${i}" class="${i === 0 ? 'on' : ''}">${t}</button>`).join('')}</div><div id="tab"></div>`;
  const show = (i) => {
    root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', +b.dataset.i === i));
    const host = root.querySelector('#tab');
    if (i === 0) view(host, { controlsHtml: field('d', 'اختار التاريخ', dateInput('d', last())), ids: ['d'], build: (v) => peopleBlock(R.inDay(v('d')), n, 'اليوم') });
    else if (i === 1) view(host, { controlsHtml: field('e', 'نهاية الأسبوع', dateInput('e', last())), ids: ['e'], build: (v) => peopleBlock(R.lastWeekRows(v('e')), n, 'الأسبوع') });
    else if (i === 2) view(host, { controlsHtml: field('m', 'الشهر', monthSelect('m', lastM())) + field('y', 'السنة', yearSelect('y', lastY())), ids: ['m', 'y'], build: (v) => peopleBlock(R.inMonth(v('m'), v('y')), n, 'الشهر') });
    else view(host, { controlsHtml: field('y', 'السنة', yearSelect('y', lastY())), ids: ['y'], build: (v) => peopleBlock(R.inYear(v('y')), n, 'السنة') });
  };
  root.querySelector('.tabs').addEventListener('click', (e) => e.target.dataset.i !== undefined && show(+e.target.dataset.i));
  show(0);
};

/* ---------------- الرئيسية: نظرة عامة ---------------- */
export const overview = (root) => {
  const T = todayIso();
  const y = +T.slice(0, 4), m = +T.slice(5, 7);
  const todayRows = R.inDay(T), wk = R.inRange(addDays(T, -6), T), mo = R.inMonth(m, y), yr = R.inYear(y);
  const lastRows = store.lastDate ? R.inDay(store.lastDate) : [];
  const withOut = store.rows.filter((r) => (r.out || 0) > 0);
  const avgShift = withOut.length ? withOut.reduce((a, r) => a + r.out, 0) / withOut.length : 0;
  const stops = mo.filter((r) => r.reason).length;
  const tab = mo.filter((r) => r.tab).length;
  const eff = mo.length ? 1 - mo.reduce((a, r) => a + (r.dt || 0), 0) / (mo.length * CONFIG.shiftMinutes) : null;
  const mach = store.lists.machines.map((mc) => {
    const rs = store.rows.filter((r) => r.machine === mc);
    const run = rs.filter((r) => (r.out || 0) > 0).length;
    const tot = rs.reduce((a, r) => a + (r.out || 0), 0);
    return { mc, tot, run, avg: run ? tot / run : 0 };
  });
  const monthly = MONTHS.map((_, i) => yr.filter((r) => r.mo === i + 1).reduce((a, r) => a + (r.out || 0), 0));
  const sum = (rs) => rs.reduce((a, r) => a + (r.out || 0), 0);
  root.innerHTML =
    kpis([
      { l: 'إنتاج اليوم', v: fmt(sum(todayRows)), n: T },
      { l: 'آخر يوم مسجل', v: fmt(sum(lastRows)), n: store.lastDate || '' },
      { l: 'إنتاج آخر 7 أيام', v: fmt(sum(wk)) },
      { l: 'إنتاج الشهر الحالي', v: fmt(sum(mo)), n: `${MONTHS[m - 1]} ${y}` },
      { l: 'إنتاج السنة الحالية', v: fmt(sum(yr)), n: String(y) },
      { l: 'عدد أيام التشغيل المسجلة', v: fmt(store.dates.length) },
      { l: 'متوسط الإنتاج/وردية', v: fmt(avgShift, 1) },
      { l: 'توقفات الشهر الحالي', v: fmt(stops) },
      { l: 'تبريز/تغيير مطوي - الشهر الحالي', v: fmt(tab) },
      { l: '% كفاءة التشغيل - الشهر الحالي', v: pct(eff) },
    ]) +
    `<div class="grid2">${card('إجمالي الإنتاج حسب الماكينة', `<div class="chartbox">${barChart({ labels: mach.map((x) => x.mc), series: [{ name: 'الإنتاج', values: mach.map((x) => x.tot), color: 'var(--s1)' }], label: 'إجمالي الإنتاج حسب الماكينة' })}</div>` + table({ head: ['الماكينة', 'إجمالي الإنتاج', 'عدد الورديات الشغالة', 'متوسط/وردية'], rows: mach.map((x) => tr([{ h: `<b>${x.mc}</b>`, cls: 'mac' }, fmt(x.tot), fmt(x.run), fmt(x.avg, 1)])), cls: 'compact' }))}${card(`الاتجاه الشهري للإنتاج (${y})`, `<div class="chartbox">${barChart({ labels: MONTHS.map((n) => n.slice(0, 4)), series: [{ name: 'الإنتاج', values: monthly, color: 'var(--s2)' }], label: 'الاتجاه الشهري' })}</div>` + table({ head: ['الشهر', 'إجمالي الإنتاج'], rows: MONTHS.map((n, i) => tr([n, fmt(monthly[i])])), cls: 'compact' }))}</div>`;
};

export const reportPages = [
  { id: 'daily', title: 'التقرير اليومي', desc: 'إنتاج كل ماكينة وكل وردية في يوم محدد، والعطلات، وأفضل النساجين والمساعدين.', render: daily },
  { id: 'weekly', title: 'التقرير الأسبوعي', desc: 'إنتاج وكفاءة الماكينات خلال أسبوع، مع الاتجاه اليومي وأفضل الأفراد.', render: weekly },
  { id: 'monthly', title: 'التقرير الشهري', desc: 'إنتاج الشهر حسب الماكينة واليوم، مع فلترة بالنساج أو المساعد.', render: monthly },
  { id: 'yearly', title: 'التقرير السنوي', desc: 'جدول الماكينة × الشهر، والاتجاه الشهري، وأفضل 15 نساج ومساعد.', render: yearly },
  { id: 'downtime', title: 'تحليل العطلات', desc: 'أسباب التوقف وتكرارها، وكفاءة التشغيل لكل ماكينة (أسبوعي، شهري، سنوي).', render: downtime },
  { id: 'tabriz', title: 'داشبورد التبريز', desc: 'عدد مرات التبريز وتغيير المطوي لكل ماكينة (يومي، أسبوعي، شهري، سنوي).', render: tabriz },
  { id: 'people', title: 'أداء الأفراد', desc: 'أفضل 10 نساجين ومساعدين حسب % الكفاءة.', render: people(10) },
  { id: 'people-all', title: 'أداء كل الأفراد', desc: 'القائمة الكاملة بكفاءة كل نساج ومساعد في الفترة المختارة.', render: people(0) },
];

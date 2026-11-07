// صفحات الأدمن: تسجيل الإنتاج، سجل الورديات، القوائم، إعدادات GitHub
import { CONFIG } from './config.js';
import { store, setPending, keyOf, loadWorkbook } from './data.js';
import { addDays, dayName, esc, fmt, todayIso } from './util.js';
import { card, field, table, tr } from './ui.js';

const LS = 'sondos_gh';
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
export const ghSettings = () => {
  const s = readJson(LS) || {};
  let repo = s.repo || (CONFIG.repo ? `${CONFIG.repo.owner}/${CONFIG.repo.repo}` : '');
  if (!repo && /\.github\.io$/.test(location.hostname)) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    if (seg) repo = `${location.hostname.split('.')[0]}/${seg}`;
  }
  return { token: s.token || '', repo, branch: s.branch || CONFIG.repo?.branch || 'main' };
};

const toB64 = (str) => { const b = new TextEncoder().encode(str); let s = ''; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
const api = (cfg, path, opt = {}) =>
  fetch(`https://api.github.com/repos/${cfg.repo}${path ? '/' + path : ''}`, { ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) } });

const sendEntry = async (entry) => {
  const cfg = ghSettings();
  if (!cfg.token || !cfg.repo) throw new Error('لازم تضبط رمز GitHub واسم الريبو الأول من صفحة "إعدادات الربط".');
  const name = `${entry.date}_${entry.machine}_${entry.shift}_${Date.now()}.json`;
  const res = await api(cfg, `contents/entries/pending/${name}`, { method: 'PUT', body: JSON.stringify({ message: `entry ${entry.op} ${entry.date} m${entry.machine} s${entry.shift}`, content: toB64(JSON.stringify(entry, null, 1)), branch: cfg.branch }) });
  if (!res.ok) {
    const t = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 || res.status === 403 || res.status === 404 ? `GitHub رفض الطلب (${res.status}). اتأكد من الرمز وصلاحية Contents: Read and write واسم الريبو. ${t.message || ''}` : `خطأ ${res.status}: ${t.message || ''}`);
  }
};

const toast = (root, msg, bad = false) => {
  const el = root.querySelector('#msg');
  if (!el) return;
  el.className = 'msg ' + (bad ? 'bad' : 'ok');
  el.textContent = msg;
  el.scrollIntoView({ block: 'nearest' });
};

const opts = (list, sel, blank) => (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') + list.map((v) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(v)}</option>`).join('');

/* ---------------- تسجيل الإنتاج ---------------- */
export const entryPage = (root) => {
  let pre = null;
  try { pre = JSON.parse(sessionStorage.getItem('sondos_prefill') || 'null'); sessionStorage.removeItem('sondos_prefill'); } catch { /* ignore */ }
  const st = { date: pre?.date || todayIso(), machine: pre?.machine || store.lists.machines[0], shift: pre?.shift || 1 };
  const cfg = ghSettings();
  root.innerHTML =
    (!cfg.token ? `<p class="msg bad">رمز GitHub لسه مش مضبوط. روح <a href="#/settings">إعدادات الربط</a> الأول عشان التسجيل يتحفظ في الملف.</p>` : '') +
    `<form id="f" class="card form" autocomplete="off"><h2><span>تسجيل / تعديل وردية</span><small id="mode"></small></h2>
    <div class="formgrid">
      ${field('date', 'التاريخ', `<input type="date" id="date" class="ltr" required value="${st.date}">`)}
      ${field('machine', 'الماكينة', `<select id="machine">${opts(store.lists.machines, st.machine)}</select>`)}
      ${field('shift', 'الوردية', `<select id="shift">${opts([1, 2, 3], st.shift)}</select>`)}
      ${field('weaver', 'النساج', `<input id="weaver" list="dl-w" required><datalist id="dl-w">${opts(store.lists.weavers)}</datalist>`)}
      ${field('a1', 'المساعد الأول', `<input id="a1" list="dl-a"><datalist id="dl-a">${opts(store.lists.assistants)}</datalist>`)}
      ${field('a2', 'المساعد الثاني', `<input id="a2" list="dl-a">`)}
      ${field('output', 'الإنتاج (قطعة)', `<input type="number" id="output" min="0" step="1" inputmode="numeric">`)}
      ${field('reason', 'سبب العطلة (لو فيه)', `<select id="reason">${opts(store.lists.reasons, '', 'بدون عطلة')}</select>`)}
      ${field('dt', 'مدة التوقف (دقيقة)', `<input type="number" id="dt" min="0" max="${CONFIG.shiftMinutes}" step="1" value="0" inputmode="numeric">`)}
      <div class="f wide"><label for="note">ملاحظات / تفاصيل</label><input id="note"></div>
    </div>
    <div class="actions"><button class="btn primary" type="submit">حفظ في الملف</button><button class="btn danger" type="button" id="del">مسح الوردية دي</button><span id="busy" class="muted"></span></div>
    <div id="msg" class="msg" role="status"></div></form>
    <div id="recent"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const fill = () => {
    const r = store.rows.find((x) => x.key === keyOf($('date').value, +$('machine').value, +$('shift').value));
    $('mode').textContent = r ? `${dayName($('date').value)} - وردية مسجلة، هتتعدل` : `${$('date').value ? dayName($('date').value) : ''} - وردية جديدة`;
    $('weaver').value = r?.weaver || ''; $('a1').value = r?.a1 || ''; $('a2').value = r?.a2 || '';
    $('output').value = r?.out ?? ''; $('reason').value = r?.reason || ''; $('dt').value = r?.dt || 0; $('note').value = r?.note || '';
    $('del').hidden = !r;
  };
  ['date', 'machine', 'shift'].forEach((id) => $(id).addEventListener('change', fill));
  fill();
  const collect = (op) => ({ op, date: $('date').value, machine: +$('machine').value, shift: +$('shift').value, weaver: $('weaver').value.trim(), a1: $('a1').value.trim(), a2: $('a2').value.trim(), output: $('output').value === '' ? '' : +$('output').value, reason: $('reason').value, dt: +$('dt').value || 0, note: $('note').value.trim() });
  const submit = async (entry, okMsg) => {
    $('busy').textContent = 'جاري الإرسال...';
    root.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await sendEntry(entry);
      setPending(entry);
      toast(root, okMsg + ' هيتضاف للملف تلقائيًا خلال حوالي دقيقة.');
      fill();
      renderRecent();
      watch();
    } catch (e) { toast(root, e.message, true); }
    $('busy').textContent = '';
    root.querySelectorAll('button').forEach((b) => (b.disabled = false));
    $('del').hidden = !store.rows.some((x) => x.key === keyOf($('date').value, +$('machine').value, +$('shift').value));
  };
  $('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const en = collect('upsert');
    if (!en.weaver) return toast(root, 'اكتب اسم النساج.', true);
    if (en.output !== '' && en.output < 0) return toast(root, 'الإنتاج لازم يكون رقم موجب.', true);
    submit(en, 'اتحفظت الوردية.');
  });
  $('del').addEventListener('click', () => {
    if (confirm('تمسح الوردية دي من السجل؟')) submit(collect('delete'), 'اتمسحت الوردية.');
  });
  let timer = null;
  const watch = () => {
    clearInterval(timer);
    let n = 0;
    timer = setInterval(async () => {
      if (!root.isConnected || ++n > 45 || !store.pending.size) { clearInterval(timer); if (root.isConnected) { $('busy').textContent = ''; renderRecent(); } return; }
      $('busy').textContent = 'بانتظار تحديث الملف...';
      try { await loadWorkbook(); } catch { /* retry */ }
      renderRecent();
      if (!store.pending.size) { $('busy').textContent = ''; toast(root, 'الوردية اتضافت لملف الإكسل.'); }
    }, 8000);
  };
  const renderRecent = () => {
    const list = [...store.pending.values()];
    $('recent').innerHTML = list.length
      ? card('تسجيلات في الانتظار (لسه ماوصلتش لملف الإكسل)', table({ head: ['التاريخ', 'الماكينة', 'الوردية', 'النساج', 'الإنتاج', 'الحالة'], rows: list.map((r) => tr([{ h: r.iso, cls: 'ltr' }, r.machine, r.shift, r.weaver, r.out === null ? '—' : fmt(r.out), r.deleted ? 'مسح' : 'حفظ'])) }), 'بتختفي لما الملف يتحدث')
      : '';
  };
  renderRecent();
};

/* ---------------- سجل الورديات ---------------- */
export const logPage = (root) => {
  const PAGE = 50;
  let page = 0;
  const from = addDays(store.lastDate || todayIso(), -6), to = store.lastDate || todayIso();
  root.innerHTML = `<div class="controls">${field('from', 'من', `<input type="date" id="from" class="ltr" value="${from}">`)}${field('to', 'إلى', `<input type="date" id="to" class="ltr" value="${to}">`)}${field('mc', 'الماكينة', `<select id="mc"><option value="">الكل</option>${opts(store.lists.machines)}</select>`)}${field('q', 'بحث بالاسم', `<input id="q" placeholder="نساج أو مساعد">`)}</div><div id="out"></div>`;
  const $ = (id) => root.querySelector('#' + id);
  const run = () => {
    const a = $('from').value, b = $('to').value, mc = $('mc').value, q = $('q').value.trim();
    const rows = store.rows.filter((r) => (!a || r.iso >= a) && (!b || r.iso <= b) && (!mc || r.machine === +mc) && (!q || [r.weaver, r.a1, r.a2].some((n) => n.includes(q)))).reverse();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    page = Math.min(page, pages - 1);
    const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
    $('out').innerHTML = card('سجل الورديات', table({ head: ['التاريخ', 'الماكينة', 'الوردية', 'النساج', 'المساعد 1', 'المساعد 2', 'الإنتاج', 'السبب', 'توقف', ''], rows: slice.map((r) => tr([{ h: r.iso, cls: 'ltr' }, r.machine, r.shift, r.weaver, r.a1, r.a2, r.out === null ? '—' : fmt(r.out), r.reason, r.dt || '', `<button class="btn small" data-k="${esc(r.key)}">تعديل</button>`])), empty: 'مفيش ورديات مطابقة.' }), `${fmt(rows.length)} وردية`) +
      (pages > 1 ? `<div class="pager"><button class="btn small" id="prev"${page === 0 ? ' disabled' : ''}>السابق</button><span>صفحة ${page + 1} من ${pages}</span><button class="btn small" id="next"${page >= pages - 1 ? ' disabled' : ''}>التالي</button></div>` : '');
    $('prev')?.addEventListener('click', () => { page--; run(); });
    $('next')?.addEventListener('click', () => { page++; run(); });
    $('out').querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
      const r = store.rows.find((x) => x.key === b.dataset.k);
      sessionStorage.setItem('sondos_prefill', JSON.stringify({ date: r.iso, machine: r.machine, shift: r.shift }));
      location.hash = '#/entry';
    }));
  };
  ['from', 'to', 'mc'].forEach((id) => $(id).addEventListener('change', () => { page = 0; run(); }));
  $('q').addEventListener('input', () => { page = 0; run(); });
  run();
};

/* ---------------- القوائم ---------------- */
export const listsPage = (root) => {
  const col = (title, arr) => card(`${title} (${arr.length})`, `<ul class="chips">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  root.innerHTML = `<p class="note">القوائم دي مقروءة من شيت "قوائم" في ملف الإكسل. لو عايز تضيف نساج أو ماكينة أو سبب عطلة، عدّلها في الملف نفسه وارفعه على GitHub.</p><div class="grid2">${col('الماكينات', store.lists.machines)}${col('أسباب العطلات', store.lists.reasons)}${col('النساجين', store.lists.weavers)}${col('المساعدين', store.lists.assistants)}</div>`;
};

/* ---------------- إعدادات الربط ---------------- */
export const settingsPage = (root) => {
  const c = ghSettings();
  root.innerHTML = `<form id="f" class="card form"><h2><span>ربط الموقع بـ GitHub</span></h2>
  <p class="note">الرمز بيتحفظ في متصفحك إنت بس، ومش بيتكتب في الكود. اعمل Fine-grained token على الريبو ده بس بصلاحية <b>Contents: Read and write</b>.</p>
  <div class="formgrid">${field('repo', 'الريبو (المالك/الاسم)', `<input id="repo" class="ltr" placeholder="owner/repo" value="${esc(c.repo)}">`)}${field('branch', 'الفرع', `<input id="branch" class="ltr" value="${esc(c.branch)}">`)}<div class="f wide"><label for="token">رمز الوصول (Personal Access Token)</label><input id="token" type="password" class="ltr" autocomplete="off" value="${esc(c.token)}" placeholder="github_pat_..."></div></div>
  <div class="actions"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" id="test">اختبار الاتصال</button><button class="btn" type="button" id="reload">تحديث البيانات من الملف</button></div><div id="msg" class="msg" role="status"></div></form>`;
  const $ = (id) => root.querySelector('#' + id);
  const read = () => ({ repo: $('repo').value.trim(), branch: $('branch').value.trim() || 'main', token: $('token').value.trim() });
  $('f').addEventListener('submit', (e) => { e.preventDefault(); localStorage.setItem(LS, JSON.stringify(read())); toast(root, 'اتحفظت الإعدادات.'); });
  $('test').addEventListener('click', async () => {
    const s = read();
    try {
      if (!/^[\w.-]+\/[\w.-]+$/.test(s.repo)) throw new Error('اسم الريبو لازم يكون بالشكل owner/repo، مثال: alucard/sondos-site');
      if (!s.token) throw new Error('الصق رمز الوصول الأول.');
      try { await fetch('https://api.github.com/zen', { cache: 'no-store' }); }
      catch { throw new Error('المتصفح مش قادر يوصل لـ api.github.com أصلًا (حتى من غير الرمز). غالبًا إضافة في المتصفح (مانع إعلانات/خصوصية/VPN) أو الشبكة بتحجبه. جرب نافذة Incognito من غير إضافات، أو شبكة تانية.'); }
      const r = await api(s, '', {}).catch(() => { throw new Error('GitHub متاح لكن طلب الرمز اتمنع. جرب Incognito من غير إضافات.'); });
      const j = await r.json();
      if (!r.ok) throw new Error(r.status === 404 ? 'الريبو مش لاقيه. اتأكد من الاسم (owner/repo) وإن الرمز اتدّى صلاحية على الريبو ده بالذات.' : r.status === 401 ? 'الرمز غلط أو منتهي.' : `${r.status}: ${j.message || ''}`);
      toast(root, j.permissions?.push ? `الاتصال شغال على ${j.full_name} وعندك صلاحية الكتابة.` : `الاتصال شغال لكن الرمز مالوش صلاحية كتابة على ${j.full_name}.`, !j.permissions?.push);
    } catch (e) { toast(root, 'فشل الاتصال: ' + e.message, true); }
  });
  $('reload').addEventListener('click', async () => {
    try { await loadWorkbook(); toast(root, `اتحدثت البيانات. آخر يوم مسجل: ${store.lastDate || '—'}`); } catch (e) { toast(root, e.message, true); }
  });
};

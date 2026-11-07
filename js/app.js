import { CONFIG } from './config.js';
import { loadWorkbook, store } from './data.js';
import { esc, verifyUser, allUsers, ROLES, ROLE_LABELS } from './util.js';
import { db, loadDb, loadUsers } from './db.js';
import { customersPage, ordersPage, machineConfigPage, designsPage, usersPage } from './mgmt.js';
import { overview, reportPages } from './pages.js';
import { entryPage, listsPage, logPage, settingsPage } from './entry.js';

const SK = 'sondos_session';
// min = أقل صلاحية تفتح الصفحة: viewer < editor < admin < owner
const customerPages = [
  { id: 'customers', title: 'العملاء والطلبيات', desc: 'إجمالي القطع والمتر² والبنط لكل عميل، والمنتج والمتبقي وموعد الانتهاء المتوقع.', render: customersPage, icon: '☺', min: 'viewer' },
];
const adminPages = [
  { id: 'entry', title: 'تسجيل الإنتاج اليومي', desc: 'سجّل أو عدّل وردية (ماكينة، نساج، مساعدين، إنتاج، عطلة) وتتحفظ في ملف الإكسل.', render: entryPage, icon: '✎', min: 'editor' },
  { id: 'log', title: 'سجل الورديات', desc: 'كل الورديات المسجلة مع بحث وفلترة وتعديل بضغطة.', render: logPage, icon: '▤', min: 'editor' },
  { id: 'orders', title: 'الطلبيات', desc: 'استيراد أمر الإنتاج، والماكينات المناسبة لكل لون، وتخصيص الماكينة للطلبية.', render: ordersPage, icon: '▣', min: 'editor' },
  { id: 'designs', title: 'قاعدة التصاميم', desc: 'كل التصميمات وألوانها، بتتحدث تلقائيًا من الطلبيات.', render: designsPage, icon: '❖', min: 'editor' },
  { id: 'machines', title: 'كونفجريشن الماكينات', desc: 'الألوان الشغالة على كل ماكينة (101 إلى 110) وتخصيصها للطلبيات.', render: machineConfigPage, icon: '⚒', min: 'admin' },
  { id: 'lists', title: 'القوائم', desc: 'الماكينات والنساجين والمساعدين وأسباب العطلات.', render: listsPage, icon: '☰', min: 'editor' },
  { id: 'users', title: 'المستخدمين', desc: 'إضافة مستخدمين وتحديد صلاحية كل واحد. لمدير النظام بس.', render: usersPage, icon: '♜', min: 'owner' },
  { id: 'settings', title: 'إعدادات الربط', desc: 'رمز GitHub واسم الريبو اللي بيتسجل فيه الإنتاج.', render: settingsPage, icon: '⚙', min: 'admin' },
];
const icons = { daily: '◷', weekly: '▦', monthly: '▥', yearly: '▩', downtime: '⚠', tabriz: '⟲', people: '★', 'people-all': '☷' };
const pages = [...reportPages.map((p) => ({ ...p, icon: icons[p.id], min: 'viewer' })), ...customerPages, ...adminPages.map((p) => ({ ...p, admin: true }))];

const $ = (s) => document.querySelector(s);
const app = $('#app');
let user = null;
let ready = false; // البيانات اتحملت؟ (عشان تغيير الرابط أثناء التحميل ماينفذش الصفحة قبل الأوان)

const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SK) || localStorage.getItem(SK) || 'null'); } catch { return null; } };
const logout = () => { sessionStorage.removeItem(SK); localStorage.removeItem(SK); user = null; ready = false; location.hash = ''; showLogin(); };

const logoHtml = (cls = '') => `<span class="logo ${cls}"><img src="assets/logo.png" alt="" onerror="this.remove()"><b>${esc(CONFIG.shortName.slice(0, 1))}</b></span>`;

const theme = () => {
  const t = localStorage.getItem('sondos_theme');
  if (t) document.documentElement.dataset.theme = t;
};
const toggleTheme = () => {
  const dark = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('sondos_theme', document.documentElement.dataset.theme); } catch { /* ignore */ }
};

/* ---------------- الدخول ---------------- */
const showLogin = () => {
  app.innerHTML = `<main class="login"><form id="lf" class="login-card" autocomplete="on">
    ${logoHtml('big')}<h1>${esc(CONFIG.companyName)}</h1><p class="sub">نظام متابعة الإنتاج</p>
    <label for="u">اسم المستخدم</label><input id="u" name="username" autocomplete="username" required autofocus>
    <label for="p">كلمة المرور</label><input id="p" name="password" type="password" autocomplete="current-password" required>
    <label class="check"><input type="checkbox" id="rm"> تذكرني على الجهاز ده</label>
    <button class="btn primary wide" type="submit">دخول</button><div id="err" class="msg bad" hidden role="alert"></div></form></main>`;
  $('#lf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'جاري التحقق...';
    await loadUsers();
    const res = await verifyUser($('#u').value, $('#p').value).catch(() => null);
    if (!res) {
      const er = $('#err'); er.hidden = false; er.textContent = 'اسم المستخدم أو كلمة المرور غلط.';
      btn.disabled = false; btn.textContent = 'دخول';
      return;
    }
    user = res;
    try { ($('#rm').checked ? localStorage : sessionStorage).setItem(SK, JSON.stringify(res)); } catch { /* ignore */ }
    start();
  });
};

/* ---------------- الإطار والتنقل ---------------- */
const allowed = (p) => (ROLES[user.role] || 0) >= (ROLES[p.min || 'viewer'] || 1);
const visible = () => pages.filter(allowed);

const shell = () => {
  app.innerHTML = `<div class="shell"><header class="top"><button class="menu" id="mb" aria-label="القائمة">☰</button><a class="brand" href="#/">${logoHtml()}<span>${esc(CONFIG.companyName)}</span></a>
    <div class="who"><span class="role">${esc(user.label)}</span><button class="btn small" id="th" title="الوضع الليلي">◐</button><button class="btn small" id="lo">خروج</button></div></header>
    <div class="body"><nav class="side" id="nav" aria-label="الصفحات"><a href="#/" data-id="">الرئيسية</a><div class="grp">التقارير</div>${visible().filter((p) => !p.admin).map((p) => `<a href="#/${p.id}" data-id="${p.id}">${p.title}</a>`).join('')}${visible().some((p) => p.admin) ? `<div class="grp">الإدارة</div>${visible().filter((p) => p.admin).map((p) => `<a href="#/${p.id}" data-id="${p.id}">${p.title}</a>`).join('')}` : ''}</nav>
    <main class="main"><div id="head"></div><div id="view" tabindex="-1"></div></main></div></div>`;
  $('#th').onclick = toggleTheme;
  $('#lo').onclick = logout;
  $('#mb').onclick = () => $('#nav').classList.toggle('open');
};

const cardGrid = (list) => `<div class="cards">${list.map((p) => `<a class="rcard" href="#/${p.id}"><span class="ic">${p.icon || '•'}</span><h3>${esc(p.title)}</h3><p>${esc(p.desc)}</p><span class="go">فتح الصفحة ←</span></a>`).join('')}</div>`;

const route = () => {
  if (!user || !ready) return;
  const id = location.hash.replace(/^#\/?/, '');
  const page = pages.find((p) => p.id === id);
  $('#nav')?.classList.remove('open');
  const view = $('#view'), head = $('#head');
  if (page && !allowed(page)) {
    head.innerHTML = '<h1>مش مسموح</h1>';
    view.innerHTML = '<p class="msg bad">الصفحة دي محتاجة صلاحية أعلى من صلاحية حسابك.</p>';
    return;
  }
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.id === id));
  if (!page) {
    head.innerHTML = `<section class="hero"><h1>أهلًا، ${esc(user.label)}</h1><p>اختار التقرير اللي محتاجه. بيانات الإنتاج متحدثة لحد <b class="ltr">${store.lastDate || '—'}</b>.</p></section>`;
    view.innerHTML = '<div id="ov"></div><h2 class="sec">التقارير</h2>' + cardGrid(visible().filter((p) => !p.admin)) + (visible().some((p) => p.admin) ? '<h2 class="sec">الإدارة</h2>' + cardGrid(visible().filter((p) => p.admin)) : '');
    overview(view.querySelector('#ov'));
    document.title = CONFIG.companyName;
    return;
  }
  head.innerHTML = `<h1>${esc(page.title)}</h1><p class="lede">${esc(page.desc)}</p>`;
  view.innerHTML = '';
  document.title = `${page.title} - ${CONFIG.shortName}`;
  try { page.render(view); } catch (e) { console.error(e); view.innerHTML = `<p class="msg bad">حصل خطأ في عرض الصفحة: ${esc(e.message)}</p>`; }
  scrollTo(0, 0);
};

const start = async () => {
  shell();
  const view = $('#view');
  view.innerHTML = '<p class="loading">جاري تحميل بيانات الإنتاج...</p>';
  try {
    ready = false;
    await Promise.all([loadWorkbook(), loadDb()]);
    ready = true;
    route();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="msg bad">${esc(e.message || 'تعذر تحميل البيانات')}</p><button class="btn" id="rt">إعادة المحاولة</button>`;
    $('#rt').onclick = start;
  }
};

theme();
addEventListener('hashchange', route);
const boot = async () => {
  const saved = getSession();
  if (saved) await loadUsers();
  const known = saved && allUsers().find((u) => u.user === saved.user);
  if (known) { user = { user: known.user, role: known.role, label: known.label }; start(); }
  else showLogin();
};
boot();

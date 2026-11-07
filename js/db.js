// قاعدة بيانات الموقع الجديدة: ملفات JSON جوه فولدر data/ في الريبو.
// القراءة: من GitHub مباشرة (لو متاح) وإلا من الملف المنشور. الكتابة: GitHub Contents API برمز الأدمن.
import { ghSettings } from './entry.js';
import { ext } from './util.js';

export const FILES = {
  orders: 'data/orders.json',
  machines: 'data/machines.json',
  designs: 'data/designs.json',
  users: 'data/users.json',
  settings: 'data/settings.json',
};

export const DEFAULTS = () => ({
  orders: { orders: [] },
  machines: { machines: Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, colors: [], assign: null, history: [], note: '' })) },
  designs: { designs: [] },
  users: { users: [] },
  settings: {
    colors: ['بيج', 'رصاصي', 'تركواز', 'كحلي', 'احمر', 'بني', 'ذهبي', 'مكس'],
    buntPerDay: 109,      // طاقة الماكينة الافتراضية لو مفيش تاريخ إنتاج (36+32+41 مستهدف الورديات)
    m2PerBunt: null,      // معامل تحويل البنط لمتر² (لسه محتاج تأكيد)
    capacityDays: 14,     // آخر كام يوم بنحسب منهم متوسط إنتاج الماكينة
  },
});

export const db = { ...DEFAULTS(), sha: {}, loaded: false };

const b64 = (str) => { const b = new TextEncoder().encode(str); let s = ''; b.forEach((x) => (s += String.fromCharCode(x))); return btoa(s); };
const hdr = (cfg, raw) => ({ Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}), 'X-GitHub-Api-Version': '2022-11-28' });

const readFile = async (name) => {
  const cfg = ghSettings();
  const path = FILES[name];
  if (cfg.repo) {
    try {
      const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, { headers: hdr(cfg, true), cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch { /* نرجع للملف المنشور */ }
  }
  const r = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) return null;
  return r.json();
};

const fill = (name, data) => {
  const d = DEFAULTS()[name];
  db[name] = data && typeof data === 'object' ? { ...d, ...data } : d;
};

// المستخدمين بس (قبل تسجيل الدخول)
export const loadUsers = async () => {
  try { fill('users', await readFile('users')); } catch { fill('users', null); }
  ext.users = db.users.users || [];
};

export const loadDb = async () => {
  await Promise.all(Object.keys(FILES).map(async (n) => { try { fill(n, await readFile(n)); } catch { fill(n, null); } }));
  ext.users = db.users.users || [];
  db.loaded = true;
};

const need = () => {
  const cfg = ghSettings();
  if (!cfg.token || !cfg.repo) throw new Error('لازم تضبط رمز GitHub واسم الريبو الأول من صفحة "إعدادات الربط".');
  return cfg;
};

const currentSha = async (cfg, path) => {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, { headers: hdr(cfg), cache: 'no-store' });
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(`GitHub رفض الطلب (${r.status}). اتأكد من الرمز وصلاحية Contents: Read and write.`);
  return (await r.json()).sha;
};

// بيحفظ db[name] في الريبو. لو حد غيّر الملف في نفس اللحظة بيحاول مرة تانية بآخر نسخة.
export const saveDb = async (name, message) => {
  const cfg = need();
  const path = FILES[name];
  const content = b64(JSON.stringify(db[name], null, 1));
  for (let attempt = 0; attempt < 2; attempt++) {
    const sha = await currentSha(cfg, path);
    const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${path}`, {
      method: 'PUT',
      headers: hdr(cfg),
      body: JSON.stringify({ message: message || `update ${name}`, content, branch: cfg.branch, ...(sha ? { sha } : {}) }),
    });
    if (res.ok) return;
    if (res.status !== 409 && res.status !== 422) {
      const t = await res.json().catch(() => ({}));
      throw new Error(`فشل الحفظ (${res.status}): ${t.message || ''}`);
    }
  }
  throw new Error('فشل الحفظ بسبب تعديل متزامن على نفس الملف. حدّث الصفحة وجرب تاني.');
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

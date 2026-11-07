import { CONFIG } from './config.js';

export const MONTHS = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
export const DAYS = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : (x * 100).toFixed(d) + '%');

const EPOCH = Date.UTC(1899, 11, 30);
export const serialOf = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000);
};
export const isoOf = (serial) => new Date(EPOCH + serial * 86400000).toISOString().slice(0, 10);
export const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso, n) => isoOf(serialOf(iso) + n);
export const dayName = (iso) => DAYS[(new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7];
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const targetOf = (shift) => CONFIG.targets[shift] || 0;

export const effClass = (e) => (e === null || !Number.isFinite(e) ? 'none' : e >= 0.85 ? 'good' : e >= 0.6 ? 'warn' : 'bad');
export const effPill = (e) => `<span class="pill ${effClass(e)}">${pct(e)}</span>`;

const hex2bytes = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const bytes2hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

// مستخدمين إضافيين بيتحملوا من data/users.json. مستخدمين config.js (الأساسيين) ليهم الأولوية دايمًا.
export const ext = { users: [] };
export const allUsers = () => [...CONFIG.users, ...ext.users.filter((x) => !CONFIG.users.some((c) => c.user.toLowerCase() === x.user.toLowerCase()))];
export const ROLES = { viewer: 1, editor: 2, admin: 3, owner: 4 };
export const ROLE_LABELS = { viewer: 'عرض فقط', editor: 'مسجّل بيانات', admin: 'أدمن', owner: 'مدير النظام' };
const nameKey = (s) => String(s).trim().toLowerCase();

export const makeHash = async (password, saltHex) => {
  const salt = saltHex ? hex2bytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: CONFIG.iterations, hash: 'SHA-256' }, key, 256);
  return { salt: bytes2hex(salt), hash: bytes2hex(bits) };
};

export const verifyUser = async (username, password) => {
  const u = allUsers().find((x) => nameKey(x.user) === nameKey(username));
  const salt = hex2bytes(u ? u.salt : '00'.repeat(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: CONFIG.iterations, hash: 'SHA-256' }, key, 256);
  const ok = bytes2hex(bits) === (u ? u.hash : '');
  return ok ? { user: u.user, role: u.role, label: u.label } : null;
};

export const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};

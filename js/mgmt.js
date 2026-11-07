// صفحات النظام الجديد: العملاء، الطلبيات، كونفجريشن الماكينات، قاعدة التصاميم، المستخدمين
import { CONFIG } from './config.js';
import { db, saveDb, uid } from './db.js';
import { esc, fmt, pct, todayIso, makeHash, ROLE_LABELS } from './util.js';
import { card, field, table, tr, kpis } from './ui.js';
import { parseOrderWorkbook, orderTotals } from './orderparse.js';
import { customerSummary, harvestDesigns, machineMatches, orderStatus, orderById, producedOn, capacity } from './link.js';

const msg = (root, text, bad = false) => {
  const el = root.querySelector('#msg');
  if (!el) return;
  el.className = 'msg ' + (bad ? 'bad' : 'ok');
  el.textContent = text;
  el.scrollIntoView({ block: 'nearest' });
};
const run = async (root, fn, ok) => {
  try { await fn(); msg(root, ok); } catch (e) { msg(root, e.message || String(e), true); }
};
const fmt1 = (n) => fmt(n, 1);
const orderLabel = (o) => `${o.customer || '—'} · طلب ${o.orderNo || '—'}${o.idea ? ' · ' + o.idea : ''}`;

/* ---------------- ملخص العملاء ---------------- */
export const customersPage = (root) => {
  const list = customerSummary();
  const k = db.settings;
  const note = k.m2PerBunt || db.orders.orders.some((o) => o.totalBunt)
    ? ''
    : '<p class="note">إجمالي البنط والمتبقي والأيام بتظهر بعد ما تحدد معامل تحويل البنط لمتر² (من صفحة كونفجريشن الماكينات) أو تكتب إجمالي البنط لكل طلبية.</p>';
  const rows = list.map((c) => tr([
    `<b>${esc(c.customer)}</b>`, c.orders.length, fmt(c.pieces), fmt1(c.m2),
    c.known ? fmt(c.total) : '—', fmt(c.produced), c.known ? fmt(c.remaining) : '—',
    c.pct === null ? '—' : pct(c.pct, 0), [...c.machines].join('، ') || '—',
    c.days === null ? '—' : c.days === 0 ? 'خلصت' : `${c.days} يوم`, c.eta ? `<span class="ltr">${c.eta}</span>` : '—',
  ]));
  const det = list.map((c) => `<details class="card"><summary><b>${esc(c.customer)}</b> <span class="muted">· ${c.orders.length} طلبية</span></summary>${table({
    head: ['الطلبية', 'قطع', 'م²', 'بنط (إجمالي)', 'منتج', 'متبقي', 'ماكينات'],
    rows: c.orders.map(({ o, s }) => tr([esc(orderLabel(o)), fmt(s.pieces), fmt1(s.m2), s.total === null ? '—' : fmt(s.total), fmt(s.produced), s.remaining === null ? '—' : fmt(s.remaining), s.machines.map((m) => m.id).join('، ') || '—'])),
  })}</details>`).join('');
  root.innerHTML = note + kpis([
    { l: 'عدد العملاء', v: fmt(list.length) }, { l: 'عدد الطلبيات', v: fmt(db.orders.orders.length) },
    { l: 'إجمالي القطع', v: fmt(list.reduce((s, c) => s + c.pieces, 0)) }, { l: 'إجمالي م²', v: fmt(list.reduce((s, c) => s + c.m2, 0)) },
  ]) + card('العملاء', table({
    head: ['العميل', 'طلبيات', 'قطع', 'م²', 'إجمالي البنط', 'بنط منتج', 'متبقي بنط', '% إنجاز', 'الماكينات', 'الوقت المتبقي', 'موعد التسليم المتوقع'],
    rows, empty: 'لسه مفيش طلبيات. ادخل صفحة الطلبيات واستورد أمر إنتاج.',
  })) + det;
};

/* ---------------- الطلبيات ---------------- */
export const assign = (machineId, orderId, design, since) => {
  const m = db.machines.machines.find((x) => x.id === machineId);
  if (!m) throw new Error('الماكينة مش موجودة');
  if (m.assign) m.history = [...(m.history || []), { ...m.assign, until: since }];
  m.assign = { orderId, design, since };
};

export const ordersPage = (root) => {
  const H = location.hash;
  let pending = null;
  const draw = () => {
    if (location.hash !== H) return;
    const importCard = card('استيراد أمر إنتاج', `<p class="note">اختار ملف أمر الإنتاج (Excel). الموقع بيقرا العميل والتصميمات والألوان والكميات ويحسب القطع والمتر² زي الملف بالظبط.</p>
      <div class="actions"><input type="file" id="file" accept=".xlsx,.xlsm,.xls"></div><div id="prev"></div>`);
    const list = db.orders.orders.map((o) => {
      const s = orderStatus(o);
      const sug = o.designs.flatMap((d) => d.lines.map((l) => {
        const ms = db.machines.machines.filter((m) => machineMatches(m, l.color));
        const sizes = Object.entries(l.qty).map(([z, q]) => `${esc(z)}: ${q}`).join('، ');
        const chips = ms.length ? ms.map((m) => `<button class="chip-btn" data-as="${o.id}|${esc(d.code)}|${m.id}" title="${m.assign ? 'شغالة حاليًا على طلبية تانية' : 'فاضية'}">${m.id}${m.assign ? ' ⏳' : ''}</button>`).join('') : '<span class="muted">مفيش ماكينة عليها الألوان دي (اضبطها من كونفجريشن الماكينات)</span>';
        return `<tr><td>${esc(d.code)}</td><td>${esc(l.color)}</td><td>${sizes}</td><td>${chips}</td></tr>`;
      })).join('');
      return `<details class="card" data-o="${o.id}"><summary><b>${esc(orderLabel(o))}</b> <span class="muted">· ${fmt(s.pieces)} قطعة · ${fmt1(s.m2)} م²${s.machines.length ? ' · ماكينات: ' + s.machines.map((m) => m.id).join('، ') : ''}</span></summary>
        <div class="scroll"><table><thead><tr><th>التصميم</th><th>اللون</th><th>الكميات</th><th>الماكينات المناسبة (اضغط للتخصيص)</th></tr></thead><tbody>${sug}</tbody></table></div>
        <div class="actions"><label>إجمالي البنط للطلبية <input type="number" min="0" step="any" class="ltr tb" value="${o.totalBunt ?? ''}" placeholder="${s.total === null ? 'اختياري' : fmt(s.total)}"></label>
        <button class="btn" data-sv="${o.id}">حفظ</button><button class="btn danger" data-del="${o.id}">حذف الطلبية</button></div></details>`;
    }).join('');
    root.innerHTML = importCard + card(`الطلبيات (${db.orders.orders.length})`, list || '<p class="empty-note">لسه مفيش طلبيات.</p>') + '<div id="msg" class="msg" role="status"></div>';
    bind();
  };

  const preview = (o) => {
    const t = orderTotals(o);
    const dup = db.orders.orders.find((x) => x.customer === o.customer && x.orderNo === o.orderNo && x.date === o.date);
    root.querySelector('#prev').innerHTML = `<div class="card"><h3>${esc(orderLabel(o))}</h3>
      <p>${o.designs.length} تصميم · ${fmt(t.pieces)} قطعة · ${fmt1(t.m2)} م² · طول الرول ${o.rollLen} م${o.date ? ' · تاريخ ' + o.date : ''}</p>
      ${table({ head: ['التصميم', 'ألوان', 'قطع'], rows: o.designs.map((d) => tr([esc(d.code || '—'), d.lines.length, fmt(d.lines.reduce((s, l) => s + Object.values(l.qty).reduce((a, b) => a + b, 0), 0))])) })}
      ${dup ? '<p class="msg bad">فيه طلبية بنفس العميل والرقم والتاريخ. الحفظ هيستبدلها.</p>' : ''}
      <div class="actions"><button class="btn primary" id="saveo">حفظ الطلبية</button></div></div>`;
    root.querySelector('#saveo').onclick = () => run(root, async () => {
      if (!o.customer) throw new Error('اسم العميل فاضي في الملف (الخلية A6).');
      if (dup) { o.id = dup.id; o.totalBunt = dup.totalBunt; db.orders.orders = db.orders.orders.map((x) => (x.id === dup.id ? o : x)); }
      else { o.id = uid(); db.orders.orders.push(o); }
      const changed = harvestDesigns(o);
      await saveDb('orders', `order ${o.customer} ${o.orderNo}`);
      if (changed) await saveDb('designs', `designs from order ${o.orderNo}`);
      pending = null; draw();
    }, 'اتحفظت الطلبية وتحدثت قاعدة التصاميم.');
  };

  const bind = () => {
    root.querySelector('#file').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        pending = parseOrderWorkbook(await f.arrayBuffer());
        if (!pending.designs.length) throw new Error('مالقيتش تصميمات بكميات في الملف. اتأكد إنه ملف أمر الإنتاج.');
        preview(pending);
      } catch (err) { root.querySelector('#prev').innerHTML = `<p class="msg bad">${esc(err.message)}</p>`; }
    };
    root.querySelectorAll('[data-as]').forEach((b) => {
      b.onclick = () => run(root, async () => {
        const [oid, code, mid] = b.dataset.as.split('|');
        assign(+mid, oid, code, todayIso());
        await saveDb('machines', `assign m${mid} -> ${code}`);
        draw();
      }, 'اتخصصت الماكينة، والإنتاج من النهاردة بيتحسب على الطلبية.');
    });
    root.querySelectorAll('[data-sv]').forEach((b) => {
      b.onclick = () => run(root, async () => {
        const o = orderById(b.dataset.sv);
        const v = parseFloat(b.closest('details').querySelector('.tb').value);
        o.totalBunt = Number.isFinite(v) && v > 0 ? v : null;
        await saveDb('orders', `bunt total ${o.orderNo}`);
        draw();
      }, 'اتحفظ.');
    });
    root.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        if (!confirm('تمسح الطلبية دي؟')) return;
        run(root, async () => {
          db.orders.orders = db.orders.orders.filter((x) => x.id !== b.dataset.del);
          await saveDb('orders', 'delete order');
          draw();
        }, 'اتمسحت.');
      };
    });
  };
  draw();
};

/* ---------------- كونفجريشن الماكينات ---------------- */
export const machineConfigPage = (root) => {
  const H = location.hash;
  const draw = () => {
    if (location.hash !== H) return;
    const colors = db.settings.colors;
    const bunt = db.settings.m2PerBunt;
    const settingsCard = card('إعدادات عامة', `<div class="formgrid">
      ${field('cap', 'طاقة افتراضية (بنط/يوم) لو مفيش تاريخ إنتاج', `<input id="cap" type="number" min="1" class="ltr" value="${db.settings.buntPerDay ?? ''}">`)}
      ${field('m2b', 'معامل التحويل: كام م² في البنط الواحد (لسه محتاج تأكيد)', `<input id="m2b" type="number" min="0" step="any" class="ltr" value="${bunt ?? ''}" placeholder="سيبه فاضي لحد التأكيد">`)}
      ${field('newc', 'إضافة لون جديد للقائمة', `<input id="newc" placeholder="مثال: اخضر">`)}</div>
      <div class="actions"><button class="btn" id="addc">إضافة اللون</button><button class="btn primary" id="saveset">حفظ الإعدادات</button></div>`);
    const cards = db.machines.machines.map((m) => {
      const o = m.assign ? orderById(m.assign.orderId) : null;
      const chips = colors.map((c) => `<label class="cchip"><input type="checkbox" data-c="${m.id}|${esc(c)}"${(m.colors || []).includes(c) ? ' checked' : ''}> ${esc(c)}</label>`).join('');
      const cur = o ? `<p>شغالة على: <b>${esc(orderLabel(o))}</b> · تصميم <b>${esc(m.assign.design)}</b> · من <span class="ltr">${m.assign.since}</span> · إنتاج: <b>${fmt(producedOn(m.id, m.assign.since))}</b> بنط · طاقتها ≈ ${fmt(capacity(m.id))} بنط/يوم <button class="btn small" data-end="${m.id}">إنهاء التخصيص</button></p>` : '<p class="muted">فاضية (مفيش طلبية متخصصة).</p>';
      const oopts = db.orders.orders.map((x) => `<option value="${x.id}">${esc(orderLabel(x))}</option>`).join('');
      return `<section class="card mc" data-m="${m.id}"><h2><span>ماكينة ${m.id}</span></h2>
        <div class="chips2">${chips}</div>${cur}
        <div class="actions"><select class="so"><option value="">اختار طلبية...</option>${oopts}</select><select class="sd"><option value="">التصميم</option></select><input type="date" class="since ltr" value="${todayIso()}"><button class="btn" data-go="${m.id}">تخصيص</button></div></section>`;
    }).join('');
    root.innerHTML = '<p class="note">حدد الألوان اللي شغالة على كل ماكينة. بعد كده أي طلبية فيها الألوان دي بيطلعلها الماكينات المناسبة تلقائيًا، وبتخصص الماكينة بضغطة، والإنتاج المسجل للماكينة بيتحسب على الطلبية لحد ما تنهي التخصيص.</p>' + settingsCard + cards + '<div class="actions"><button class="btn primary" id="savem">حفظ ألوان الماكينات</button></div><div id="msg" class="msg" role="status"></div>';
    bind();
  };
  const bind = () => {
    const $ = (s) => root.querySelector(s);
    $('#addc').onclick = () => {
      const c = $('#newc').value.trim();
      if (!c) return;
      if (!db.settings.colors.includes(c)) db.settings.colors.push(c);
      draw();
    };
    $('#saveset').onclick = () => run(root, async () => {
      const cap = parseFloat($('#cap').value);
      const k = parseFloat($('#m2b').value);
      db.settings.buntPerDay = Number.isFinite(cap) && cap > 0 ? cap : 109;
      db.settings.m2PerBunt = Number.isFinite(k) && k > 0 ? k : null;
      await saveDb('settings', 'settings');
    }, 'اتحفظت الإعدادات.');
    root.querySelectorAll('[data-c]').forEach((cb) => {
      cb.onchange = () => {
        const [id, c] = cb.dataset.c.split('|');
        const m = db.machines.machines.find((x) => x.id === +id);
        m.colors = cb.checked ? [...new Set([...(m.colors || []), c])] : (m.colors || []).filter((x) => x !== c);
      };
    });
    $('#savem').onclick = () => run(root, async () => { await saveDb('machines', 'machine colors'); await saveDb('settings', 'colors list'); }, 'اتحفظ كونفجريشن الماكينات.');
    root.querySelectorAll('.mc').forEach((card_) => {
      const so = card_.querySelector('.so');
      const sd = card_.querySelector('.sd');
      so.onchange = () => {
        const o = orderById(so.value);
        sd.innerHTML = '<option value="">التصميم</option>' + (o ? o.designs.map((d) => `<option>${esc(d.code)}</option>`).join('') : '');
      };
    });
    root.querySelectorAll('[data-go]').forEach((b) => {
      b.onclick = () => run(root, async () => {
        const c = b.closest('.mc');
        const oid = c.querySelector('.so').value;
        const code = c.querySelector('.sd').value;
        const since = c.querySelector('.since').value;
        if (!oid || !code || !since) throw new Error('اختار الطلبية والتصميم والتاريخ.');
        assign(+b.dataset.go, oid, code, since);
        await saveDb('machines', `assign m${b.dataset.go}`);
        draw();
      }, 'اتخصصت.');
    });
    root.querySelectorAll('[data-end]').forEach((b) => {
      b.onclick = () => run(root, async () => {
        const m = db.machines.machines.find((x) => x.id === +b.dataset.end);
        m.history = [...(m.history || []), { ...m.assign, until: todayIso() }];
        m.assign = null;
        await saveDb('machines', `end assign m${m.id}`);
        draw();
      }, 'اتنهى التخصيص.');
    });
  };
  draw();
};

/* ---------------- قاعدة التصاميم ---------------- */
export const designsPage = (root) => {
  const H = location.hash;
  const draw = (q = '') => {
    if (location.hash !== H) return;
    const list = db.designs.designs.filter((d) => !q || (d.code + ' ' + d.name).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.code.localeCompare(b.code));
    const rows = list.map((d) => tr([
      `<b class="ltr">${esc(d.code)}</b>`,
      `<input class="nm" data-code="${esc(d.code)}" value="${esc(d.name || '')}" placeholder="اسم / ملاحظة">`,
      esc(d.colorways.join(' | ')) || '—', d.orders.length, `<span class="ltr">${d.updatedAt || ''}</span>`,
    ]));
    root.innerHTML = card(`قاعدة التصاميم (${db.designs.designs.length})`, `<p class="note">التصميمات بتتضاف تلقائيًا من أي طلبية بتتسجل، مع ألوانها. تقدر تسمي التصميم أو تضيف ملاحظة.</p>
      <div class="actions"><input id="q" placeholder="بحث بالكود" value="${esc(q)}"><button class="btn" id="resync">تحديث من كل الطلبيات</button><button class="btn primary" id="sv">حفظ</button></div>` + table({ head: ['الكود', 'الاسم / ملاحظة', 'الألوان المسجلة', 'عدد الطلبيات', 'آخر تحديث'], rows, empty: 'لسه مفيش تصميمات.' })) + '<div id="msg" class="msg" role="status"></div>';
    root.querySelector('#q').oninput = (e) => draw(e.target.value);
    root.querySelector('#q').focus();
    root.querySelector('#q').setSelectionRange(q.length, q.length);
    root.querySelectorAll('.nm').forEach((i) => { i.onchange = () => { db.designs.designs.find((d) => d.code === i.dataset.code).name = i.value.trim(); }; });
    root.querySelector('#resync').onclick = () => run(root, async () => { db.orders.orders.forEach(harvestDesigns); await saveDb('designs', 'resync designs'); draw(q); }, 'اتحدثت القاعدة من كل الطلبيات.');
    root.querySelector('#sv').onclick = () => run(root, () => saveDb('designs', 'designs'), 'اتحفظت قاعدة التصاميم.');
  };
  draw();
};

/* ---------------- المستخدمين ---------------- */
export const usersPage = (root) => {
  const H = location.hash;
  const draw = () => {
    if (location.hash !== H) return;
    const fixed = CONFIG.users.map((u) => tr([esc(u.user), esc(u.label), ROLE_LABELS[u.role] || u.role, '<span class="muted">أساسي (من الكود، مش بيتعدل من هنا)</span>']));
    const dyn = db.users.users.map((u, i) => tr([esc(u.user), esc(u.label || ''),
      `<select data-r="${i}">${['viewer', 'editor', 'admin'].map((r) => `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LABELS[r]}</option>`).join('')}</select>`,
      `<button class="btn small" data-pw="${i}">كلمة سر جديدة</button> <button class="btn small danger" data-rm="${i}">حذف</button>`]));
    root.innerHTML = card('المستخدمين', `<p class="note">مدير النظام (Alucard) له كل الصلاحيات دايمًا. الصلاحيات: <b>عرض فقط</b> للتقارير والعملاء، <b>مسجّل بيانات</b> يضيف إنتاج وطلبيات وتصاميم، <b>أدمن</b> كمان كونفجريشن الماكينات وإعدادات الربط. إدارة المستخدمين لمدير النظام بس.</p>` + table({ head: ['المستخدم', 'الاسم المعروض', 'الصلاحية', ''], rows: [...fixed, ...dyn] })) +
      card('إضافة مستخدم', `<div class="formgrid">${field('nu', 'اسم المستخدم', '<input id="nu" class="ltr" autocomplete="off">')}${field('nl', 'الاسم المعروض', '<input id="nl">')}${field('nr', 'الصلاحية', `<select id="nr">${['viewer', 'editor', 'admin'].map((r) => `<option value="${r}">${ROLE_LABELS[r]}</option>`).join('')}</select>`)}${field('np', 'كلمة المرور (8 حروف على الأقل)', '<input id="np" type="password" class="ltr" autocomplete="new-password">')}</div>
      <div class="actions"><button class="btn primary" id="add">إضافة</button></div>`) + '<div id="msg" class="msg" role="status"></div>';
    const $ = (s) => root.querySelector(s);
    $('#add').onclick = () => run(root, async () => {
      const user = $('#nu').value.trim();
      const pw = $('#np').value;
      if (!/^[\w.\-]{3,}$/.test(user)) throw new Error('اسم المستخدم حروف إنجليزي وأرقام (3 على الأقل).');
      if (pw.length < 8) throw new Error('كلمة المرور أقل من 8 حروف.');
      if ([...CONFIG.users, ...db.users.users].some((u) => u.user.toLowerCase() === user.toLowerCase())) throw new Error('اسم المستخدم موجود.');
      db.users.users.push({ user, label: $('#nl').value.trim() || user, role: $('#nr').value, ...(await makeHash(pw)) });
      await saveDb('users', `add user ${user}`);
      draw();
    }, 'اتضاف المستخدم.');
    root.querySelectorAll('[data-r]').forEach((s) => { s.onchange = () => run(root, async () => { db.users.users[+s.dataset.r].role = s.value; await saveDb('users', 'role'); }, 'اتغيرت الصلاحية.'); });
    root.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { if (!confirm('تحذف المستخدم؟')) return; run(root, async () => { db.users.users.splice(+b.dataset.rm, 1); await saveDb('users', 'remove user'); draw(); }, 'اتحذف.'); }; });
    root.querySelectorAll('[data-pw]').forEach((b) => {
      b.onclick = () => {
        const pw = prompt('كلمة المرور الجديدة (8 حروف على الأقل):');
        if (pw === null) return;
        run(root, async () => {
          if (pw.length < 8) throw new Error('كلمة المرور أقل من 8 حروف.');
          Object.assign(db.users.users[+b.dataset.pw], await makeHash(pw));
          await saveDb('users', 'password');
        }, 'اتغيرت كلمة المرور.');
      };
    });
  };
  draw();
};

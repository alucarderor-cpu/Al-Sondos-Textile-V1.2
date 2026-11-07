#!/usr/bin/env python3
"""Apply pending form entries (entries/pending/*.json) to the 'سجل الإنتاج' sheet of production.xlsx.

Edits the sheet XML in place, so charts, formulas, formatting and the other sheets stay untouched.
Usage: python scripts/append_entries.py production.xlsx entries/pending
"""
import sys, os, json, zipfile, shutil, datetime, re
from lxml import etree

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
SHEET_NAME = 'سجل الإنتاج'
FIRST, LAST = 3, 6500
TABRIZ = {'تبريز', 'تغيير مطوي'}
q = lambda t: '{%s}%s' % (NS, t)


def serial(iso):
    d = datetime.date.fromisoformat(iso)
    return (d - datetime.date(1899, 12, 30)).days


def col_idx(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n


def sheet_path(z):
    wb = etree.fromstring(z.read('xl/workbook.xml'))
    rid = None
    for s in wb.iter(q('sheet')):
        if s.get('name') == SHEET_NAME:
            rid = s.get('{%s}id' % RNS)
    rels = etree.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    for r in rels:
        if r.get('Id') == rid:
            t = r.get('Target')
            return t.lstrip('/') if t.startswith('/') else 'xl/' + t
    raise SystemExit('sheet not found: ' + SHEET_NAME)


def get_cell(row, col, create_style=None):
    ref = '%s%s' % (col, row.get('r'))
    for c in row.findall(q('c')):
        if c.get('r') == ref:
            return c
    c = etree.Element(q('c'))
    c.set('r', ref)
    if create_style:
        c.set('s', create_style)
    # keep cells ordered by column
    placed = False
    for i, other in enumerate(row.findall(q('c'))):
        if col_idx(other.get('r')) > col_idx(ref):
            other.addprevious(c)
            placed = True
            break
    if not placed:
        row.append(c)
    return c


def clear(c):
    for ch in list(c):
        c.remove(ch)
    if 't' in c.attrib:
        del c.attrib['t']


def put(row, col, value, style=None):
    c = get_cell(row, col, style)
    clear(c)
    if value is None or value == '':
        return
    if isinstance(value, (int, float)):
        v = etree.SubElement(c, q('v'))
        v.text = repr(value) if isinstance(value, float) and not float(value).is_integer() else str(int(value))
    else:
        c.set('t', 'inlineStr')
        is_ = etree.SubElement(c, q('is'))
        t = etree.SubElement(is_, q('t'))
        t.text = str(value)
        if str(value) != str(value).strip():
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def num(c, strings):
    v = c.find(q('v'))
    if v is None or v.text in (None, ''):
        return None
    if c.get('t') in ('s', 'str', 'inlineStr'):
        return None
    try:
        return float(v.text)
    except ValueError:
        return None


def main(xlsx, pending):
    files = sorted(f for f in os.listdir(pending) if f.endswith('.json')) if os.path.isdir(pending) else []
    if not files:
        print('no pending entries')
        return
    entries = []
    for f in files:
        with open(os.path.join(pending, f), encoding='utf8') as fh:
            entries.append((f, json.load(fh)))

    z = zipfile.ZipFile(xlsx)
    path = sheet_path(z)
    root = etree.fromstring(z.read(path))
    data = root.find(q('sheetData'))
    rows = {int(r.get('r')): r for r in data.findall(q('row'))}

    index, last_used = {}, FIRST - 1
    for n in sorted(rows):
        if n < FIRST:
            continue
        r = rows[n]
        cells = {re.match(r'[A-Z]+', c.get('r')).group(0): c for c in r.findall(q('c'))}
        b, d, e = (num(cells[k], None) if k in cells else None for k in 'BDE')
        if b is not None and d is not None and e is not None:
            index[(int(b), int(d), int(e))] = n
            last_used = max(last_used, n)

    applied = 0
    for fname, en in entries:
        k = (serial(en['date']), int(en['machine']), int(en['shift']))
        n = index.get(k)
        if en.get('op') == 'delete':
            if n:
                r = rows[n]
                for col in 'BDEFGHIJMOP':
                    put(r, col, None)
                del index[k]
                applied += 1
            continue
        if not n:
            n = last_used + 1
            if n > LAST:
                raise SystemExit('log sheet is full (row %d)' % LAST)
            last_used = n
            index[k] = n
        r = rows[n]
        reason = (en.get('reason') or '').strip()
        put(r, 'B', k[0])
        put(r, 'D', k[1])
        put(r, 'E', k[2])
        put(r, 'F', (en.get('weaver') or '').strip())
        put(r, 'G', (en.get('a1') or '').strip())
        put(r, 'H', (en.get('a2') or '').strip())
        out = en.get('output')
        put(r, 'I', None if out in (None, '') else float(out) if float(out) % 1 else int(out))
        put(r, 'J', (en.get('note') or '').strip())
        put(r, 'M', 'نعم' if reason in TABRIZ else 'لا')
        put(r, 'O', reason, '17')
        dt = en.get('dt')
        put(r, 'P', int(dt) if dt not in (None, '', 0, '0') else None, '7')
        # widen row spans if a cell was added past the declared span
        sp = r.get('spans')
        if sp:
            a, b2 = sp.split(':')
            r.set('spans', '%s:%d' % (a, max(int(b2), 16)))
        applied += 1

    new_sheet = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    wbxml = z.read('xl/workbook.xml').decode('utf8')
    if 'fullCalcOnLoad' not in wbxml:
        wbxml = re.sub(r'<calcPr([^>]*?)/>', r'<calcPr\1 fullCalcOnLoad="1"/>', wbxml, count=1)

    tmp = xlsx + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out_z:
        for item in z.infolist():
            if item.filename == path:
                out_z.writestr(item, new_sheet)
            elif item.filename == 'xl/workbook.xml':
                out_z.writestr(item, wbxml.encode('utf8'))
            else:
                out_z.writestr(item, z.read(item.filename))
    z.close()
    shutil.move(tmp, xlsx)
    for f, _ in entries:
        os.remove(os.path.join(pending, f))
    print('applied %d entries' % applied)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])

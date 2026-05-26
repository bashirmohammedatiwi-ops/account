const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');

pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Cairo'));
pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Roboto'));

const COMPANY_NAME = 'شركة ديما الحياة';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');

const STYLES = {
  title: { fontSize: 11, bold: true, color: '#0f172a' },
  sub: { fontSize: 8, color: '#64748b' },
  th: { fontSize: 7.5, bold: true, color: '#ffffff' },
  td: { fontSize: 7.5, color: '#0f172a' },
  meta: { fontSize: 7.5, color: '#475569' },
  metaVal: { fontSize: 8, bold: true, color: '#0f172a' },
  foot: { fontSize: 7.5, bold: true }
};

function getLogoDataUrl() {
  if (!fs.existsSync(LOGO_PATH)) return null;
  return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
}

function fmtNum(v, digits = 0) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (digits === 0 && Math.abs(n - Math.round(n)) < 0.00001) {
    return Math.round(n).toLocaleString('en-US');
  }
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function fmtMoney(v) {
  return fmtNum(v, 2);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function compactGrid() {
  return {
    hLineWidth: () => 0.4,
    vLineWidth: () => 0.4,
    hLineColor: () => '#cbd5e1',
    vLineColor: () => '#cbd5e1',
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 1.5,
    paddingBottom: () => 1.5
  };
}

function th(text, color = '#334155') {
  return {
    text,
    style: 'th',
    fillColor: color,
    alignment: 'center',
    margin: [1, 3, 1, 3]
  };
}

function td(value, align = 'center', fill) {
  return {
    text: String(value ?? '—'),
    style: 'td',
    alignment: align,
    fillColor: fill || null,
    margin: [1, 2, 1, 2]
  };
}

function rowCells(values, rowIndex, alignments = []) {
  return values.map((value, i) => td(
    value,
    alignments[i] || 'center',
    rowIndex % 2 === 0 ? '#fafafa' : '#ffffff'
  ));
}

function compactHeader(title, subtitle, rightStack) {
  const logo = getLogoDataUrl();
  const left = logo
    ? { image: logo, width: 36, margin: [0, 0, 6, 0] }
    : { text: '' };
  const center = {
    stack: [
      { text: COMPANY_NAME, style: 'title' },
      { text: title, style: 'sub', margin: [0, 1, 0, 0] },
      subtitle ? { text: subtitle, style: 'sub' } : null
    ].filter(Boolean),
    alignment: 'right'
  };
  const right = {
    stack: rightStack,
    alignment: 'left'
  };

  if (logo) {
    return {
      table: { widths: [42, '*', 110], body: [[left, center, right]] },
      layout: 'noBorders',
      margin: [0, 0, 0, 4]
    };
  }
  return {
    table: { widths: ['*', 110], body: [[center, right]] },
    layout: 'noBorders',
    margin: [0, 0, 0, 4]
  };
}

function metaStrip(cells) {
  const pairs = cells.map(([label, value]) => ({
    stack: [
      { text: label, style: 'meta' },
      { text: value || '—', style: 'metaVal' }
    ]
  }));
  return {
    table: {
      widths: pairs.map(() => '*'),
      body: [pairs]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => '#cbd5e1',
      vLineColor: () => '#cbd5e1',
      fillColor: () => '#f8fafc',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 3,
      paddingBottom: () => 3
    },
    margin: [0, 0, 0, 4]
  };
}

function pdfFooter() {
  return (currentPage, pageCount) => ({
    columns: [
      { text: fmtDate(new Date()), alignment: 'right', fontSize: 7, color: '#94a3b8' },
      { text: `${currentPage}/${pageCount}`, alignment: 'left', fontSize: 7, color: '#94a3b8' }
    ],
    margin: [18, 0, 18, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 8 },
    pageSize: 'A4',
    pageMargins: [18, 16, 18, 24],
    styles: STYLES,
    footer: pdfFooter(),
    content
  };
}

async function createPdfBuffer(docDefinition) {
  try {
    const pdf = pdfmake.createPdf(docDefinition);
    const buffer = await pdf.getBuffer();
    if (!buffer || !buffer.length) throw new Error('ملف PDF فارغ');
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } catch (err) {
    throw new Error(err?.message || 'فشل إنشاء PDF');
  }
}

async function buildStatementPdf(stmt, meta = {}) {
  const acc = stmt.account || {};
  const lines = stmt.lines || [];
  const summary = stmt.summary || {};
  const debtAmount = Number(stmt.finalBalance ?? acc.bal ?? 0) < 0
    ? fmtNum(Math.abs(Number(stmt.finalBalance ?? acc.bal ?? 0)))
    : '0';
  const openingBal = Number(stmt.openingBalance ?? 0);
  const subtitle = meta.sinceLastMatch && (stmt.lastMatch?.date || acc.fixDate)
    ? `منذ ${fmtDate(stmt.lastMatch?.date || acc.fixDate)}${openingBal ? ` · مرحّل ${fmtNum(Math.abs(openingBal))}` : ''}`
    : '';

  const tableBody = [
    [th('#'), th('التاريخ'), th('البيان', '#334155'), th('مدين', '#991b1b'), th('دائن', '#047857'), th('الرصيد', '#1d4ed8')],
    ...lines.map((row, i) => rowCells([
      row.isOpening ? '∗' : i + 1,
      fmtDate(row.date),
      row.description || '—',
      row.debit ? fmtNum(row.debit) : '—',
      row.credit ? fmtNum(row.credit) : '—',
      fmtNum(row.balance)
    ], i, ['center', 'center', 'right', 'center', 'center', 'center']))
  ];

  if (lines.length) {
    tableBody.push([
      { text: 'الإجمالي', colSpan: 3, style: 'foot', alignment: 'right', fillColor: '#f1f5f9', margin: [2, 3, 2, 3] },
      {}, {},
      td(fmtNum(stmt.totalDebit), 'center', '#fef2f2'),
      td(fmtNum(stmt.totalCredit), 'center', '#ecfdf5'),
      td(debtAmount, 'center', '#eff6ff')
    ]);
  }

  const doc = baseDoc([
    compactHeader('كشف حساب', subtitle, [
      { text: `حساب ${acc.num || '—'}`, style: 'metaVal', alignment: 'left' },
      { text: acc.name1 || '—', style: 'meta', alignment: 'left' }
    ]),
    metaStrip([
      ['الشجرة', meta.treeLabel || '—'],
      ['مدين', fmtNum(stmt.totalDebit)],
      ['دائن', fmtNum(stmt.totalCredit)],
      ['الديون', debtAmount]
    ]),
    {
      table: {
        headerRows: 1,
        widths: [16, 42, '*', 42, 42, 46],
        body: tableBody,
        dontBreakRows: true
      },
      layout: compactGrid()
    },
    {
      text: `${summary.label || 'الرصيد'}: ${fmtNum(summary.amount)}`,
      alignment: 'left',
      fontSize: 8,
      bold: true,
      color: '#0f766e',
      margin: [0, 4, 0, 0]
    }
  ]);

  return createPdfBuffer(doc);
}

async function buildInvoicePdf(data) {
  const inv = data.invoice || {};
  const lines = data.lines || [];
  const qtySum = lines.reduce((s, line) => s + Number(line.quant || 0), 0);

  const tableBody = [
    [th('#'), th('مادة'), th('الاسم', '#334155'), th('كم', '#0f766e'), th('هد', '#0f766e'), th('سعر', '#1d4ed8'), th('إجمالي', '#1d4ed8')],
    ...lines.map((line, i) => rowCells([
      i + 1,
      line.matNum || line.mat || '—',
      line.matName || '—',
      fmtNum(line.quant, 2),
      fmtNum(line.bonus, 2),
      fmtMoney(line.price),
      fmtMoney(line.lineTotal)
    ], i, ['center', 'center', 'right', 'center', 'center', 'center', 'center']))
  ];

  if (lines.length) {
    tableBody.push([
      { text: 'إجمالي الفاتورة', colSpan: 6, style: 'foot', alignment: 'right', fillColor: '#f8fafc', margin: [2, 3, 2, 3] },
      {}, {}, {}, {}, {},
      td(fmtMoney(inv.total), 'center', '#f8fafc')
    ]);
    tableBody.push([
      { text: 'الحسومات', colSpan: 6, style: 'foot', alignment: 'right', fillColor: '#fff7ed', margin: [2, 3, 2, 3] },
      {}, {}, {}, {}, {},
      td(fmtMoney(inv.discount), 'center', '#fff7ed')
    ]);
    tableBody.push([
      { text: 'الصافي للدفع', colSpan: 6, style: 'foot', alignment: 'right', fillColor: '#ecfdf5', margin: [2, 3, 2, 3] },
      {}, {}, {}, {}, {},
      td(fmtMoney(inv.netPay), 'center', '#ecfdf5')
    ]);
  }

  const doc = baseDoc([
    compactHeader(inv.kindLabel || 'فاتورة مبيعات', `رقم ${inv.num || '—'} · ${fmtDate(inv.date)}`, [
      { text: inv.accountName || '—', style: 'metaVal', alignment: 'left' },
      { text: inv.accountNum ? `حساب ${inv.accountNum}` : '—', style: 'meta', alignment: 'left' }
    ]),
    metaStrip([
      ['البنود', String(lines.length)],
      ['الكمية', fmtNum(qtySum, 2)]
    ]),
    {
      table: {
        headerRows: 1,
        widths: [14, 34, '*', 24, 24, 38, 42],
        body: tableBody,
        dontBreakRows: true
      },
      layout: compactGrid()
    }
  ]);

  return createPdfBuffer(doc);
}

module.exports = {
  buildStatementPdf,
  buildInvoicePdf,
  COMPANY_NAME
};

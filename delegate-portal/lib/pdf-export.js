const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');

pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Cairo'));
pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Roboto'));

const COMPANY_NAME = 'شركة ديما الحياة';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');

const COLORS = {
  header: '#1e3a5f',
  headerAlt: '#0f766e',
  debit: '#991b1b',
  credit: '#047857',
  balance: '#1d4ed8',
  qty: '#0f766e',
  price: '#1d4ed8',
  zebra: '#f8fafc',
  border: '#cbd5e1',
  accent: '#0f766e'
};

const STYLES = {
  title: { fontSize: 12, bold: true, color: '#0f172a' },
  sub: { fontSize: 8, color: '#64748b' },
  th: { fontSize: 7, bold: true, color: '#ffffff' },
  td: { fontSize: 6.5, color: '#0f172a' },
  meta: { fontSize: 7, color: '#64748b' },
  metaVal: { fontSize: 7.5, bold: true, color: '#0f172a' },
  foot: { fontSize: 7, bold: true, color: '#0f172a' },
  banner: { fontSize: 9, bold: true, color: '#ffffff' },
  invType: { fontSize: 10, bold: true, color: COLORS.headerAlt },
  invClient: { fontSize: 8.5, bold: true, color: '#0f172a' },
  tdBarcode: { fontSize: 6, font: 'Roboto', color: '#0f172a' },
  tdName: { fontSize: 6.5, color: '#0f172a' }
};

/** عروض الأعمدة من اليسار إلى اليمين في PDF (مطابق لعرض الويب dir=rtl) */
const INV_WIDTHS = [38, 34, 22, 26, '*', 64, 11];

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
    hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.55 : 0.2),
    vLineWidth: () => 0.2,
    hLineColor: (i) => (i <= 1 ? COLORS.header : COLORS.border),
    vLineColor: () => COLORS.border,
    paddingLeft: () => 2,
    paddingRight: () => 2,
    paddingTop: () => 0.8,
    paddingBottom: () => 0.8
  };
}

function th(text, color = COLORS.header) {
  return {
    text,
    style: 'th',
    fillColor: color,
    alignment: 'center',
    margin: [1, 2, 1, 2]
  };
}

function td(value, align = 'center', fill) {
  return {
    text: String(value ?? '—'),
    style: 'td',
    alignment: align,
    fillColor: fill || null,
    margin: [1, 1, 1, 1]
  };
}

/** صف جدول من اليمين إلى اليسار: أول عمود = يمين (م) */
function stmtHeaderRow() {
  return [
    th('م'),
    th('التاريخ'),
    th('البيان', COLORS.headerAlt),
    th('مدين', COLORS.debit),
    th('دائن', COLORS.credit),
    th('رصيد الحساب', COLORS.balance)
  ];
}

function invBarcode(line) {
  const code = String(line.matNum || line.mat || '').trim();
  return code.replace(/\s+/g, '') || '—';
}

/**
 * ترتيب الويب (dir=rtl): م → الباركود → … → المبلغ (من اليمين).
 * pdfmake يرسم الجدول يسار→يمين، لذا نعكس ترتيب الخلايا ليطابق الويب.
 */
function invHeaderRow() {
  return [
    th('المبلغ', COLORS.price),
    th('سعر الوحدة', COLORS.price),
    th('هدية', COLORS.qty),
    th('الكمية', COLORS.qty),
    th('اسم المادة', COLORS.headerAlt),
    th('الباركود', COLORS.header),
    th('م')
  ];
}

function tdBarcode(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdBarcode',
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [2, 2, 2, 2]
  };
}

function tdName(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdName',
    alignment: 'right',
    fillColor: fill || null,
    margin: [2, 2, 2, 2]
  };
}

function invLineRow(line, rowIndex) {
  const fill = rowIndex % 2 === 0 ? COLORS.zebra : '#ffffff';
  return [
    td(fmtInvPrice(line.lineTotal), 'center', fill),
    td(fmtInvPrice(line.price), 'center', fill),
    td(fmtQtyInt(line.bonus), 'center', fill),
    td(fmtQtyInt(line.quant), 'center', fill),
    tdName(line.matName || '—', fill),
    tdBarcode(invBarcode(line), fill),
    td(String(rowIndex + 1), 'center', fill)
  ];
}

function invSumRow(label, value, fill) {
  return [
    footLabel(label, 6, fill),
    {},
    {},
    {},
    {},
    {},
    td(value, 'center', fill)
  ];
}

function invoicePdfHeader(inv) {
  const logo = getLogoDataUrl();
  const title = inv.kindLabel || 'فاتورة مبيعات';
  const center = {
    stack: [
      { text: COMPANY_NAME, style: 'title', alignment: 'right' },
      { text: title, style: 'invType', alignment: 'right', margin: [0, 2, 0, 0] },
      { text: `رقم ${inv.num || '—'}  ·  ${fmtDate(inv.date)}`, style: 'sub', alignment: 'right' }
    ]
  };
  const client = {
    stack: [
      { text: inv.accountName || '—', style: 'invClient', alignment: 'left' },
      inv.accountNum
        ? { text: `حساب ${inv.accountNum}`, style: 'meta', alignment: 'left', margin: [0, 2, 0, 0] }
        : null
    ].filter(Boolean)
  };
  if (logo) {
    return {
      table: { widths: [40, '*', 115], body: [[{ image: logo, width: 36, margin: [0, 2, 0, 0] }, center, client]] },
      layout: 'noBorders',
      margin: [0, 0, 0, 4]
    };
  }
  return {
    table: { widths: ['*', 115], body: [[center, client]] },
    layout: 'noBorders',
    margin: [0, 0, 0, 4]
  };
}

function invoiceMetaStrip(inv, lines, qtySum) {
  return metaStrip([
    ['عدد البنود', String(lines.length)],
    ['إجمالي الكمية', fmtNum(Math.round(qtySum), 0)],
    ['إجمالي الفاتورة', fmtInvPrice(inv.total)],
    ['الصافي للدفع', fmtInvPrice(inv.netPay)]
  ]);
}

function fmtQtyInt(v) {
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '—';
  return fmtNum(Math.round(n), 0);
}

/** أسعار الفاتورة PDF بدون كسور عشرية */
function fmtInvPrice(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return fmtNum(Math.round(n), 0);
}

function dataRow(values, rowIndex, alignments = []) {
  const fill = rowIndex % 2 === 0 ? COLORS.zebra : '#ffffff';
  return values.map((value, i) => td(value, alignments[i] || 'center', fill));
}

function footLabel(text, colSpan, fill = '#e2e8f0') {
  return { text, style: 'foot', alignment: 'right', fillColor: fill, colSpan, margin: [2, 2, 2, 2] };
}

function docBanner(title, accent = COLORS.accent) {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: title, style: 'banner', fillColor: accent, alignment: 'center', margin: [0, 3, 0, 3] }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 3]
  };
}

function compactHeader(title, subtitle, rightStack) {
  const logo = getLogoDataUrl();
  const left = logo ? { image: logo, width: 32, margin: [0, 0, 4, 0] } : { text: '' };
  const center = {
    stack: [
      { text: COMPANY_NAME, style: 'title' },
      { text: title, style: 'sub', margin: [0, 1, 0, 0] },
      subtitle ? { text: subtitle, style: 'sub' } : null
    ].filter(Boolean),
    alignment: 'right'
  };
  const right = { stack: rightStack, alignment: 'left' };

  if (logo) {
    return {
      table: { widths: [36, '*', 108], body: [[left, center, right]] },
      layout: 'noBorders',
      margin: [0, 0, 0, 3]
    };
  }
  return {
    table: { widths: ['*', 108], body: [[center, right]] },
    layout: 'noBorders',
    margin: [0, 0, 0, 3]
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
    table: { widths: pairs.map(() => '*'), body: [pairs] },
    layout: {
      hLineWidth: () => 0.35,
      vLineWidth: () => 0.35,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      fillColor: () => '#f1f5f9',
      paddingLeft: () => 3,
      paddingRight: () => 3,
      paddingTop: () => 2,
      paddingBottom: () => 2
    },
    margin: [0, 0, 0, 3]
  };
}

function pdfFooter() {
  return (currentPage, pageCount) => ({
    columns: [
      { text: fmtDate(new Date()), alignment: 'right', fontSize: 6.5, color: '#94a3b8' },
      { text: `${currentPage} / ${pageCount}`, alignment: 'left', fontSize: 6.5, color: '#94a3b8' }
    ],
    margin: [14, 0, 14, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 7 },
    pageSize: 'A4',
    pageMargins: [14, 12, 14, 22],
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
    stmtHeaderRow(),
    ...lines.map((row, i) => dataRow([
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
      footLabel('إجمالي الحركات', 3),
      {},
      {},
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
    docBanner('كشف حساب — تفاصيل الحركات', COLORS.header),
    metaStrip([
      ['الشجرة', meta.treeLabel || '—'],
      ['إجمالي مدين', fmtNum(stmt.totalDebit)],
      ['إجمالي دائن', fmtNum(stmt.totalCredit)],
      ['الديون', debtAmount]
    ]),
    {
      table: {
        headerRows: 1,
        widths: [14, 42, '*', 38, 38, 48],
        body: tableBody,
        dontBreakRows: false
      },
      layout: compactGrid()
    },
    {
      text: `${summary.label || 'الرصيد النهائي'}: ${fmtNum(summary.amount)}`,
      alignment: 'right',
      fontSize: 8,
      bold: true,
      color: COLORS.accent,
      margin: [0, 3, 0, 0]
    }
  ]);

  return createPdfBuffer(doc);
}

async function buildInvoicePdf(data) {
  const inv = data.invoice || {};
  const lines = data.lines || [];
  const qtySum = lines.reduce((s, line) => s + Number(line.quant || 0), 0);

  const tableBody = [
    invHeaderRow(),
    ...lines.map((line, i) => invLineRow(line, i))
  ];

  if (lines.length) {
    tableBody.push(invSumRow('إجمالي الفاتورة', fmtInvPrice(inv.total), '#f8fafc'));
    tableBody.push(invSumRow('الحسومات', fmtInvPrice(inv.discount), '#fff7ed'));
    tableBody.push(invSumRow('الصافي للدفع', fmtInvPrice(inv.netPay), '#ecfdf5'));
  }

  const doc = baseDoc([
    invoicePdfHeader(inv),
    docBanner(inv.kindLabel || 'فاتورة مبيعات', COLORS.headerAlt),
    invoiceMetaStrip(inv, lines, qtySum),
    {
      table: {
        headerRows: 1,
        widths: INV_WIDTHS,
        body: tableBody,
        dontBreakRows: false
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

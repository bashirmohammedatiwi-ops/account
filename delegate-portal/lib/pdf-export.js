const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { resolveInvoiceTotals } = require('./invoices');

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
  tdName: { fontSize: 6.5, color: '#0f172a' },
  tdMoney: { fontSize: 7, font: 'Roboto', bold: true, color: '#0f172a' },
  invMetaLbl: { fontSize: 6.5, color: '#475569', alignment: 'center' },
  invMetaVal: { fontSize: 8.5, font: 'Roboto', bold: true, color: '#0f172a', alignment: 'center' },
  invSection: { fontSize: 8.5, bold: true, color: '#1e3a5f' }
};

/** عرض الجدول: المبلغ يسار ← … ← م يمين */
const INV_WIDTHS = [54, 42, 26, 30, '*', 74, 16];

const INV_META_ACCENTS = ['#e2e8f0', '#dbeafe', '#fef3c7', '#d1fae5'];

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

function tdMoney(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdMoney',
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [3, 3, 3, 3]
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

/** يسار: المبلغ … يمين: م (م | الباركود | … من اليمين للقارئ) */
function invHeaderRow() {
  return [
    thInv('المبلغ', COLORS.price),
    thInv('سعر الوحدة', COLORS.price),
    thInv('هدية', COLORS.qty),
    thInv('الكمية', COLORS.qty),
    thInv('اسم المادة', COLORS.headerAlt),
    thInv('الباركود', COLORS.header),
    thInv('م', '#475569')
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
    tdMoney(fmtInvPrice(line.lineTotal), fill),
    tdMoney(fmtInvPrice(line.price), fill),
    td(fmtQtyInt(line.bonus), 'center', fill),
    td(fmtQtyInt(line.quant), 'center', fill),
    tdName(line.matName || '—', fill),
    tdBarcode(invBarcode(line), fill),
    td(String(rowIndex + 1), 'center', fill)
  ];
}

function invTableLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.65;
      if (node && i === node.table.body.length) return 0.45;
      return 0.15;
    },
    vLineWidth: () => 0.15,
    hLineColor: (i) => (i <= 1 ? COLORS.header : COLORS.border),
    vLineColor: () => COLORS.border,
    paddingLeft: () => 3,
    paddingRight: () => 3,
    paddingTop: () => 1.2,
    paddingBottom: () => 1.2
  };
}

function thInv(text, color = COLORS.header) {
  return {
    text,
    style: 'th',
    fontSize: 7.5,
    bold: true,
    color: '#ffffff',
    fillColor: color,
    alignment: 'center',
    margin: [2, 4, 2, 4]
  };
}

function invoicePdfHeader(inv) {
  const logo = getLogoDataUrl();
  const title = inv.kindLabel || 'فاتورة مبيعات';

  const accent = {
    canvas: [{ type: 'rect', x: 0, y: 0, w: 562, h: 4, color: COLORS.headerAlt }],
    margin: [0, 0, 0, 0]
  };

  const headerInner = {
    table: {
      widths: [118, '*', 48],
      body: [[
        {
          stack: [
            { text: title, fontSize: 8.5, bold: true, color: COLORS.headerAlt, alignment: 'right' },
            { text: `رقم ${inv.num || '—'}`, fontSize: 12, bold: true, color: COLORS.header, alignment: 'right', margin: [0, 4, 0, 0] },
            { text: fmtDate(inv.date), fontSize: 7.5, color: '#64748b', alignment: 'right' }
          ],
          margin: [10, 11, 10, 11]
        },
        {
          stack: [
            { text: COMPANY_NAME, fontSize: 13, bold: true, color: COLORS.header, alignment: 'center' },
            { text: 'وثيقة مبيعات', fontSize: 7, color: '#94a3b8', alignment: 'center', margin: [0, 3, 0, 0] }
          ],
          margin: [8, 12, 8, 12]
        },
        logo
          ? { image: logo, width: 40, alignment: 'center', margin: [4, 10, 4, 10] }
          : { text: '' }
      ]]
    },
    layout: 'noBorders'
  };

  const headerFrame = {
    table: { widths: ['*'], body: [[headerInner]] },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      fillColor: () => '#ffffff'
    }
  };

  const client = {
    table: {
      widths: [5, '*'],
      body: [[
        { text: '', fillColor: COLORS.headerAlt },
        {
          fillColor: '#f8fafc',
          stack: [
            { text: 'العميل', fontSize: 7, color: '#64748b', alignment: 'right' },
            { text: inv.accountName || '—', fontSize: 9.5, bold: true, color: '#0f172a', alignment: 'right', margin: [0, 3, 0, 0] }
          ],
          margin: [10, 9, 10, 9]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border
    }
  };

  return {
    stack: [accent, headerFrame, client],
    margin: [0, 0, 0, 6]
  };
}

function invoiceMetaGrid(inv, lines, qtySum) {
  const rows = [
    ['عدد البنود', String(lines.length)],
    ['إجمالي الكمية', fmtNum(Math.round(qtySum), 0)],
    ['إجمالي الفاتورة', fmtInvPrice(inv.total)],
    ['الصافي للدفع', fmtInvPrice(inv.netPay)]
  ];
  return {
    table: {
      widths: rows.map(() => '*'),
      body: [
        rows.map(([label], i) => ({
          text: label,
          style: 'invMetaLbl',
          fillColor: INV_META_ACCENTS[i],
          margin: [3, 5, 3, 2]
        })),
        rows.map(([, val], i) => ({
          text: val,
          style: 'invMetaVal',
          fillColor: '#ffffff',
          color: i === 3 ? '#047857' : '#0f172a',
          margin: [3, 2, 3, 6]
        }))
      ]
    },
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border
    },
    margin: [0, 0, 0, 5]
  };
}

function invoiceSectionTitle(text) {
  return {
    text,
    style: 'invSection',
    alignment: 'right',
    margin: [0, 2, 0, 3]
  };
}

function invoiceTotalsPanel(inv) {
  const row = (label, value, fill, highlight = false) => [
    {
      text: label,
      fontSize: 7.5,
      bold: true,
      alignment: 'right',
      fillColor: fill,
      color: '#334155',
      margin: [10, 6, 6, 6]
    },
    {
      text: value,
      font: 'Roboto',
      fontSize: highlight ? 9 : 7.5,
      bold: true,
      alignment: 'center',
      fillColor: fill,
      color: highlight ? '#047857' : '#0f172a',
      noWrap: true,
      margin: [6, 6, 10, 6]
    }
  ];

  const panel = {
    table: {
      widths: ['*', 64],
      body: [
        row('إجمالي الفاتورة', fmtInvPrice(inv.total), '#ffffff'),
        row('الحسومات', fmtInvPrice(inv.discount), '#fff7ed'),
        row('الصافي للدفع', fmtInvPrice(inv.netPay), '#d1fae5', true)
      ]
    },
    layout: {
      hLineWidth: (i) => (i === 0 ? 0.55 : 0.35),
      vLineWidth: () => 0.35,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border
    }
  };

  return {
    columns: [
      panel,
      { width: '*', text: '' }
    ],
    margin: [0, 6, 0, 0]
  };
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
      { text: acc.name1 || '—', style: 'metaVal', alignment: 'left' }
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
  const lines = data.lines || [];
  const invRaw = data.invoice || {};
  const totals = resolveInvoiceTotals(
    { total: invRaw.total, discount: invRaw.discount, payment: invRaw.payment },
    lines
  );
  const inv = { ...invRaw, ...totals };
  const qtySum = lines.reduce((s, line) => s + Number(line.quant || 0), 0);

  const tableBody = [
    invHeaderRow(),
    ...lines.map((line, i) => invLineRow(line, i))
  ];

  const doc = baseDoc([
    invoicePdfHeader(inv),
    invoiceMetaGrid(inv, lines, qtySum),
    invoiceSectionTitle('تفاصيل البنود'),
    {
      table: {
        headerRows: 1,
        widths: INV_WIDTHS,
        body: tableBody,
        dontBreakRows: false
      },
      layout: invTableLayout()
    },
    ...(lines.length ? [invoiceTotalsPanel(inv)] : [])
  ]);

  return createPdfBuffer(doc);
}

module.exports = {
  buildStatementPdf,
  buildInvoicePdf,
  COMPANY_NAME
};

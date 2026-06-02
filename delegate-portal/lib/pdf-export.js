const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { resolveInvoiceTotals } = require('./invoices');
const { resolveDebtDisplayAmount } = require('./statement-utils');

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

/** عرض الجدول (pdfmake-rtl: أول عمود يمين): م يمين ← … ← المبلغ يسار */
const INV_WIDTHS = [16, 74, '*', 30, 26, 42, 54];

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

/** عرض الجدول (pdfmake-rtl): يسار رصيد ← … ← يمين م */
const STMT_WIDTHS = [52, 42, 42, '*', 40, 14];

function thStmt(text, fill = COLORS.header) {
  return {
    text,
    fontSize: 7,
    bold: true,
    color: '#ffffff',
    fillColor: fill,
    alignment: 'center',
    margin: [2, 5, 2, 5]
  };
}

function stmtHeaderRow() {
  return [
    thStmt('رصيد الحساب', COLORS.balance),
    thStmt('دائن', COLORS.credit),
    thStmt('مدين', COLORS.debit),
    thStmt('البيان', COLORS.header),
    thStmt('التاريخ', COLORS.header),
    thStmt('م', '#64748b')
  ];
}

function stmtTableLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.5;
      if (node && i === node.table.body.length) return 0.5;
      return 0.12;
    },
    vLineWidth: () => 0.12,
    hLineColor: () => '#e2e8f0',
    vLineColor: () => '#e2e8f0',
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 2,
    paddingBottom: () => 2
  };
}

function stmtLineRow(row, rowIndex) {
  let fill = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
  if (row.isOpening) fill = '#f0f9ff';
  else if (row.isReconciliation) fill = '#f0fdf4';
  const idx = row.isOpening ? '∗' : String(rowIndex + 1);
  return [
    tdMoney(fmtNum(row.balance), fill),
    tdMoney(row.credit ? fmtNum(row.credit) : '—', fill),
    tdMoney(row.debit ? fmtNum(row.debit) : '—', fill),
    td(row.description || '—', 'right', fill),
    td(fmtDate(row.date), 'center', fill),
    td(idx, 'center', fill)
  ];
}

function stmtTotalsTableRow(stmt) {
  const bal = Number(stmt.finalBalance ?? stmt.account?.bal ?? 0);
  return [
    tdMoney(fmtNum(Math.abs(bal)), '#eff6ff'),
    tdMoney(fmtNum(stmt.totalCredit), '#ecfdf5'),
    tdMoney(fmtNum(stmt.totalDebit), '#fef2f2'),
    {
      text: 'الإجمالي',
      bold: true,
      fontSize: 7,
      alignment: 'right',
      fillColor: '#f1f5f9',
      colSpan: 3,
      margin: [4, 5, 4, 5]
    },
    {},
    {}
  ];
}

function stmtKpiCell(label, value, accent) {
  return {
    stack: [
      { text: label, fontSize: 6.5, color: '#64748b', alignment: 'center', margin: [0, 0, 0, 2] },
      { text: value, font: 'Roboto', fontSize: 9, bold: true, color: accent || '#0f172a', alignment: 'center' }
    ],
    margin: [6, 8, 6, 8]
  };
}

function statementPdfHeader(acc, periodNote) {
  const logo = getLogoDataUrl();
  const metaLine = [periodNote, acc.address || ''].filter(Boolean).join(' · ');

  const left = logo
    ? { image: logo, width: 36, alignment: 'left', margin: [8, 10, 0, 10] }
    : { text: '', width: 36 };

  const center = {
    stack: [
      { text: COMPANY_NAME, fontSize: 12, bold: true, color: COLORS.header, alignment: 'center' },
      { text: 'كشف حساب', fontSize: 8, color: '#64748b', alignment: 'center', margin: [0, 2, 0, 0] }
    ],
    margin: [0, 12, 0, 12]
  };

  const right = {
    stack: [
      { text: acc.name1 || '—', fontSize: 10, bold: true, color: '#0f172a', alignment: 'right' },
      metaLine
        ? { text: metaLine, fontSize: 6.5, color: '#64748b', alignment: 'right', margin: [0, 3, 0, 0] }
        : null
    ].filter(Boolean),
    margin: [0, 10, 10, 10]
  };

  return {
    table: {
      widths: [44, '*', '*'],
      body: [[
        left,
        center,
        right
      ]]
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => '#ffffff'
    },
    margin: [0, 0, 0, 8]
  };
}

function statementSummaryBar(stmt, debtAmount) {
  const bal = Number(stmt.finalBalance ?? stmt.account?.bal ?? 0);
  return {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        stmtKpiCell('إجمالي مدين', fmtNum(stmt.totalDebit), '#b91c1c'),
        stmtKpiCell('إجمالي دائن', fmtNum(stmt.totalCredit), '#047857'),
        stmtKpiCell('الديون', debtAmount, '#b91c1c'),
        stmtKpiCell('رصيد الحساب', fmtNum(Math.abs(bal)), '#1d4ed8')
      ]]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => '#e2e8f0',
      vLineColor: () => '#e2e8f0',
      fillColor: () => '#fafafa'
    },
    margin: [0, 0, 0, 10]
  };
}

function invBarcode(line) {
  const code = String(line.matNum || line.mat || '').trim();
  return code.replace(/\s+/g, '') || '—';
}

/** يمين: م … يسار: المبلغ (ترتيب المصفوفة لـ pdfmake-rtl) */
function invHeaderRow() {
  return [
    thInv('م', '#475569'),
    thInv('الباركود', COLORS.header),
    thInv('اسم المادة', COLORS.headerAlt),
    thInv('الكمية', COLORS.qty),
    thInv('هدية', COLORS.qty),
    thInv('سعر الوحدة', COLORS.price),
    thInv('المبلغ', COLORS.price)
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
    td(String(rowIndex + 1), 'center', fill),
    tdBarcode(invBarcode(line), fill),
    tdName(line.matName || '—', fill),
    td(fmtQtyInt(line.quant), 'center', fill),
    td(fmtQtyInt(line.bonus), 'center', fill),
    tdMoney(fmtInvPrice(line.price), fill),
    tdMoney(fmtInvPrice(line.lineTotal), fill)
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
  const debtAmount = fmtNum(
    Number(stmt.debtAmount) || resolveDebtDisplayAmount({
      finalBalance: stmt.finalBalance,
      lines: stmt.lines,
      totalDebit: stmt.totalDebit,
      totalCredit: stmt.totalCredit,
      sinceLastMatch: meta.sinceLastMatch ?? stmt.sinceLastMatch,
      account: acc
    })
  );
  const openingBal = Number(stmt.openingBalance ?? 0);
  const sinceMatch = meta.sinceLastMatch ?? stmt.sinceLastMatch;
  const periodParts = [];
  if (sinceMatch && (stmt.lastMatch?.date || acc.fixDate)) {
    periodParts.push(`منذ ${fmtDate(stmt.lastMatch?.date || acc.fixDate)}`);
  }
  if (sinceMatch && openingBal) {
    periodParts.push(`مرحّل ${fmtNum(Math.abs(openingBal))}`);
  }
  const periodNote = periodParts.join(' · ');

  const tableBody = [stmtHeaderRow(), ...lines.map((row, i) => stmtLineRow(row, i))];
  if (lines.length) {
    tableBody.push(stmtTotalsTableRow(stmt));
  }

  const doc = baseDoc([
    {
      canvas: [{ type: 'rect', x: 0, y: 0, w: 562, h: 3, color: COLORS.headerAlt }],
      margin: [0, 0, 0, 6]
    },
    statementPdfHeader(acc, periodNote),
    statementSummaryBar(stmt, debtAmount),
    {
      table: {
        headerRows: 1,
        widths: STMT_WIDTHS,
        body: tableBody,
        dontBreakRows: false
      },
      layout: stmtTableLayout()
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

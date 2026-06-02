const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { resolveInvoiceTotals } = require('./invoices');
const { resolveDebtDisplayAmount } = require('./statement-utils');

pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Cairo'));
pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Roboto'));

const COMPANY_NAME = 'شركة ديما الحياة';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');

const C = {
  text: '#111111',
  muted: '#333333',
  primary: '#0f766e',
  primaryDark: '#115e59',
  primaryLight: '#ecfdf5',
  headerBg: '#1e3a5f',
  headerText: '#ffffff',
  border: '#cbd5e1',
  zebra: '#f8fafc',
  panel: '#f1f5f9',
  debit: '#991b1b',
  credit: '#047857',
  net: '#0f766e'
};

const STYLES = {
  title: { fontSize: 13, bold: true, color: C.text },
  sub: { fontSize: 8.5, bold: true, color: C.primaryDark },
  th: { fontSize: 8, bold: true, color: C.headerText },
  td: { fontSize: 8, bold: true, color: C.text },
  tdDate: { fontSize: 8, font: 'Roboto', bold: true, color: C.text },
  tdBarcode: { fontSize: 7.5, font: 'Roboto', bold: true, color: C.text },
  tdName: { fontSize: 8, bold: true, color: C.text },
  tdMoney: { fontSize: 8.5, font: 'Roboto', bold: true, color: C.text },
  invMetaLbl: { fontSize: 7.5, bold: true, color: C.muted, alignment: 'center' },
  invMetaVal: { fontSize: 9, font: 'Roboto', bold: true, color: C.text, alignment: 'center' },
  invSection: { fontSize: 9, bold: true, color: C.primaryDark }
};

const INV_WIDTHS = [16, 74, '*', 30, 26, 42, 54];
const STMT_WIDTHS = [52, 42, 42, '*', 40, 14];

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

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(String(v).replace(' 00:00:00', ''));
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function accentBar() {
  return {
    canvas: [{ type: 'rect', x: 0, y: 0, w: 562, h: 5, color: C.primary }],
    margin: [0, 0, 0, 0]
  };
}

function tableLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.55;
      if (node && i === node.table.body.length) return 0.55;
      return 0.2;
    },
    vLineWidth: () => 0.2,
    hLineColor: () => C.border,
    vLineColor: () => C.border,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 3,
    paddingBottom: () => 3
  };
}

function th(text) {
  return {
    text,
    style: 'th',
    fillColor: C.headerBg,
    alignment: 'center',
    margin: [2, 5, 2, 5]
  };
}

function td(value, align = 'center', fill, style = 'td') {
  return {
    text: String(value ?? '—'),
    style,
    alignment: align,
    fillColor: fill || null,
    margin: [2, 3, 2, 3]
  };
}

function tdDate(value, fill) {
  return td(fmtDate(value), 'center', fill, 'tdDate');
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

function rowFill(rowIndex, highlight) {
  if (highlight) return C.primaryLight;
  return rowIndex % 2 === 0 ? '#ffffff' : C.zebra;
}

function badge(text, fill = C.primary) {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text,
        fontSize: 8,
        bold: true,
        color: '#ffffff',
        alignment: 'center',
        fillColor: fill,
        margin: [8, 6, 8, 6]
      }]]
    },
    layout: 'noBorders'
  };
}

function infoStrip(label, value) {
  return {
    table: {
      widths: [4, '*'],
      body: [[
        { text: '', fillColor: C.primary },
        {
          fillColor: C.panel,
          stack: [
            { text: label, fontSize: 7.5, bold: true, color: C.muted, alignment: 'right' },
            { text: value, fontSize: 10, bold: true, color: C.text, alignment: 'right', margin: [0, 3, 0, 0] }
          ],
          margin: [10, 8, 10, 8]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => C.border,
      vLineColor: () => C.border
    }
  };
}

function pdfTopHeader(docLabel, badgeText, leftStack, infoLabel, infoValue) {
  const logo = getLogoDataUrl();
  const logoCell = logo
    ? { image: logo, width: 42, alignment: 'center', margin: [6, 10, 6, 10] }
    : { text: '', width: 42 };

  const headerRow = {
    table: {
      widths: [52, '*', 108],
      body: [[
        logoCell,
        {
          stack: [
            { text: COMPANY_NAME, style: 'title', alignment: 'center' },
            { text: docLabel, style: 'sub', alignment: 'center', margin: [0, 3, 0, 0] }
          ],
          margin: [0, 12, 0, 12]
        },
        {
          stack: [
            badge(badgeText),
            { stack: leftStack, margin: [0, 6, 0, 0] }
          ],
          margin: [6, 8, 8, 8]
        }
      ]]
    },
    layout: 'noBorders'
  };

  return {
    stack: [
      accentBar(),
      {
        table: { widths: ['*'], body: [[headerRow]] },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => C.border,
          vLineColor: () => C.border,
          fillColor: () => '#ffffff'
        },
        margin: [0, 0, 0, 6]
      },
      infoStrip(infoLabel, infoValue),
      { text: '', margin: [0, 0, 0, 4] }
    ]
  };
}

function kpiCell(label, value, accent = C.text) {
  return {
    stack: [
      { text: label, fontSize: 7.5, bold: true, color: C.muted, alignment: 'center', margin: [0, 0, 0, 3] },
      { text: value, font: 'Roboto', fontSize: 10, bold: true, color: accent, alignment: 'center' }
    ],
    margin: [6, 9, 6, 9]
  };
}

function summaryBar(cells) {
  return {
    table: {
      widths: cells.map(() => '*'),
      body: [cells]
    },
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      fillColor: () => '#ffffff'
    },
    margin: [0, 0, 0, 8]
  };
}

function stmtHeaderRow() {
  return [
    th('رصيد الحساب'),
    th('دائن'),
    th('مدين'),
    th('البيان'),
    th('التاريخ'),
    th('م')
  ];
}

function stmtLineRow(row, rowIndex) {
  const fill = rowFill(rowIndex, row.isOpening || row.isReconciliation);
  const idx = row.isOpening ? '∗' : String(rowIndex + 1);
  return [
    tdMoney(fmtNum(row.balance), fill),
    tdMoney(row.credit ? fmtNum(row.credit) : '—', fill),
    tdMoney(row.debit ? fmtNum(row.debit) : '—', fill),
    td(row.description || '—', 'right', fill),
    tdDate(row.date, fill),
    td(idx, 'center', fill)
  ];
}

function stmtTotalsTableRow(stmt) {
  const bal = Number(stmt.finalBalance ?? stmt.account?.bal ?? 0);
  return [
    tdMoney(fmtNum(Math.abs(bal)), C.panel),
    tdMoney(fmtNum(stmt.totalCredit), C.panel),
    tdMoney(fmtNum(stmt.totalDebit), C.panel),
    {
      text: 'الإجمالي',
      bold: true,
      fontSize: 8.5,
      color: C.text,
      alignment: 'right',
      fillColor: C.panel,
      colSpan: 3,
      margin: [4, 6, 4, 6]
    },
    {},
    {}
  ];
}

function statementPdfHeader(acc, periodNote) {
  const metaLine = [periodNote, acc.address || ''].filter(Boolean).join(' · ');
  const badgeText = acc.num ? `حساب ${acc.num}` : 'كشف حساب';
  const leftStack = [
    metaLine
      ? { text: metaLine, fontSize: 7.5, bold: true, color: C.muted, alignment: 'right' }
      : null
  ].filter(Boolean);

  return pdfTopHeader(
    'كشف حساب',
    badgeText,
    leftStack,
    'اسم الحساب',
    acc.name1 || '—'
  );
}

function invBarcode(line) {
  const code = String(line.matNum || line.mat || '').trim();
  return code.replace(/\s+/g, '') || '—';
}

function invHeaderRow() {
  return [
    th('م'),
    th('الباركود'),
    th('اسم المادة'),
    th('الكمية'),
    th('هدية'),
    th('سعر الوحدة'),
    th('المبلغ')
  ];
}

function tdBarcode(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdBarcode',
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [2, 3, 2, 3]
  };
}

function tdName(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdName',
    alignment: 'right',
    fillColor: fill || null,
    margin: [2, 3, 2, 3]
  };
}

function invLineRow(line, rowIndex) {
  const fill = rowFill(rowIndex);
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

function invoicePdfHeader(inv) {
  const title = inv.kindLabel || 'فاتورة مبيعات';
  const leftStack = [
    { text: fmtDate(inv.date), fontSize: 8, font: 'Roboto', bold: true, color: C.text, alignment: 'right' }
  ];

  return pdfTopHeader(
    title,
    `رقم ${inv.num || '—'}`,
    leftStack,
    'العميل',
    inv.accountName || '—'
  );
}

function invoiceMetaGrid(inv, lines, qtySum) {
  const rows = [
    ['عدد البنود', String(lines.length), C.panel],
    ['إجمالي الكمية', fmtNum(Math.round(qtySum), 0), C.panel],
    ['إجمالي الفاتورة', fmtInvPrice(inv.total), C.primaryLight],
    ['الصافي للدفع', fmtInvPrice(inv.netPay), '#d1fae5']
  ];
  return {
    table: {
      widths: rows.map(() => '*'),
      body: [
        rows.map(([label, , fill]) => ({
          text: label,
          style: 'invMetaLbl',
          fillColor: fill,
          margin: [3, 6, 3, 2]
        })),
        rows.map(([, val, fill]) => ({
          text: val,
          style: 'invMetaVal',
          fillColor: fill,
          margin: [3, 2, 3, 7]
        }))
      ]
    },
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => C.border,
      vLineColor: () => C.border
    },
    margin: [0, 0, 0, 6]
  };
}

function invoiceSectionTitle(text) {
  return {
    text,
    style: 'invSection',
    alignment: 'right',
    margin: [0, 2, 0, 4]
  };
}

function invoiceTotalsPanel(inv) {
  const row = (label, value, fill, valueColor = C.text) => [
    {
      text: label,
      fontSize: 8,
      bold: true,
      alignment: 'right',
      fillColor: fill,
      color: C.text,
      margin: [10, 7, 6, 7]
    },
    {
      text: value,
      font: 'Roboto',
      fontSize: 9,
      bold: true,
      alignment: 'center',
      fillColor: fill,
      color: valueColor,
      noWrap: true,
      margin: [6, 7, 10, 7]
    }
  ];

  const panel = {
    table: {
      widths: ['*', 68],
      body: [
        row('إجمالي الفاتورة', fmtInvPrice(inv.total), '#ffffff'),
        row('الحسومات', fmtInvPrice(inv.discount), '#fff7ed', C.debit),
        row('الصافي للدفع', fmtInvPrice(inv.netPay), C.primaryLight, C.net)
      ]
    },
    layout: {
      hLineWidth: () => 0.45,
      vLineWidth: () => 0.45,
      hLineColor: () => C.border,
      vLineColor: () => C.border
    }
  };

  return {
    columns: [panel, { width: '*', text: '' }],
    margin: [0, 8, 0, 0]
  };
}

function fmtQtyInt(v) {
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '—';
  return fmtNum(Math.round(n), 0);
}

function fmtInvPrice(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return fmtNum(Math.round(n), 0);
}

function pdfFooter() {
  return (currentPage, pageCount) => ({
    columns: [
      { text: fmtDate(new Date()), font: 'Roboto', alignment: 'right', fontSize: 7.5, bold: true, color: C.muted },
      { text: `${currentPage} / ${pageCount}`, font: 'Roboto', alignment: 'left', fontSize: 7.5, bold: true, color: C.muted }
    ],
    margin: [14, 0, 14, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 8, bold: true, color: C.text },
    pageSize: 'A4',
    pageMargins: [14, 14, 14, 24],
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
  const bal = Number(stmt.finalBalance ?? acc.bal ?? 0);

  const tableBody = [stmtHeaderRow(), ...lines.map((row, i) => stmtLineRow(row, i))];
  if (lines.length) {
    tableBody.push(stmtTotalsTableRow(stmt));
  }

  const doc = baseDoc([
    statementPdfHeader(acc, periodNote),
    summaryBar([
      kpiCell('إجمالي مدين', fmtNum(stmt.totalDebit), C.debit),
      kpiCell('إجمالي دائن', fmtNum(stmt.totalCredit), C.credit),
      kpiCell('الديون', debtAmount, C.debit),
      kpiCell('رصيد الحساب', fmtNum(Math.abs(bal)), C.primaryDark)
    ]),
    {
      table: {
        headerRows: 1,
        widths: STMT_WIDTHS,
        body: tableBody,
        dontBreakRows: false
      },
      layout: tableLayout()
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
      layout: tableLayout()
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

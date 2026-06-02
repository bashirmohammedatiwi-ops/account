const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { resolveInvoiceTotals } = require('./invoices');
const { resolveDebtDisplayAmount } = require('./statement-utils');

pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Cairo'));
pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Roboto'));

const COMPANY_NAME = 'شركة ديما الحياة';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');

/** لوحة ألوان موحّدة — بسيطة وواضحة */
const C = {
  text: '#111111',
  muted: '#444444',
  headerBg: '#333333',
  headerText: '#ffffff',
  border: '#cccccc',
  zebra: '#f5f5f5',
  panel: '#f5f5f5'
};

const STYLES = {
  title: { fontSize: 12, bold: true, color: C.text },
  sub: { fontSize: 8, color: C.muted },
  th: { fontSize: 7.5, bold: true, color: C.headerText },
  td: { fontSize: 7.5, color: C.text },
  meta: { fontSize: 7.5, color: C.muted },
  metaVal: { fontSize: 8, bold: true, color: C.text },
  foot: { fontSize: 7.5, bold: true, color: C.text },
  tdBarcode: { fontSize: 7, font: 'Roboto', color: C.text },
  tdName: { fontSize: 7.5, color: C.text },
  tdMoney: { fontSize: 8, font: 'Roboto', bold: true, color: C.text },
  invMetaLbl: { fontSize: 7, color: C.muted, alignment: 'center' },
  invMetaVal: { fontSize: 8.5, font: 'Roboto', bold: true, color: C.text, alignment: 'center' },
  invSection: { fontSize: 8.5, bold: true, color: C.text }
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

function tableLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.5;
      if (node && i === node.table.body.length) return 0.5;
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
    margin: [2, 4, 2, 4]
  };
}

function td(value, align = 'center', fill) {
  return {
    text: String(value ?? '—'),
    style: 'td',
    alignment: align,
    fillColor: fill || null,
    margin: [2, 2, 2, 2]
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

function rowFill(rowIndex, highlight) {
  if (highlight) return C.zebra;
  return rowIndex % 2 === 0 ? '#ffffff' : C.zebra;
}

function kpiCell(label, value) {
  return {
    stack: [
      { text: label, fontSize: 7, color: C.muted, alignment: 'center', margin: [0, 0, 0, 2] },
      { text: value, font: 'Roboto', fontSize: 9, bold: true, color: C.text, alignment: 'center' }
    ],
    margin: [6, 8, 6, 8]
  };
}

function summaryBar(cells) {
  return {
    table: {
      widths: cells.map(() => '*'),
      body: [cells]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      fillColor: () => C.panel
    },
    margin: [0, 0, 0, 8]
  };
}

function docHeader(title, rightStack, centerSub) {
  const logo = getLogoDataUrl();
  const left = logo
    ? { image: logo, width: 36, alignment: 'left', margin: [8, 10, 0, 10] }
    : { text: '', width: 36 };

  const center = {
    stack: [
      { text: COMPANY_NAME, style: 'title', alignment: 'center' },
      { text: title, style: 'sub', alignment: 'center', margin: [0, 2, 0, 0] },
      centerSub ? { text: centerSub, fontSize: 7, color: C.muted, alignment: 'center', margin: [0, 2, 0, 0] } : null
    ].filter(Boolean),
    margin: [0, 10, 0, 10]
  };

  const right = {
    stack: rightStack,
    margin: [0, 10, 10, 10]
  };

  return {
    table: { widths: [44, '*', '*'], body: [[left, center, right]] },
    layout: 'noBorders',
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
    td(fmtDate(row.date), 'center', fill),
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
      fontSize: 7.5,
      color: C.text,
      alignment: 'right',
      fillColor: C.panel,
      colSpan: 3,
      margin: [4, 5, 4, 5]
    },
    {},
    {}
  ];
}

function statementPdfHeader(acc, periodNote) {
  const metaLine = [periodNote, acc.address || ''].filter(Boolean).join(' · ');
  return docHeader('كشف حساب', [
    { text: acc.name1 || '—', fontSize: 10, bold: true, color: C.text, alignment: 'right' },
    metaLine
      ? { text: metaLine, fontSize: 7, color: C.muted, alignment: 'right', margin: [0, 3, 0, 0] }
      : null
  ].filter(Boolean));
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
  const logo = getLogoDataUrl();
  const headerInner = {
    table: {
      widths: [118, '*', 48],
      body: [[
        {
          stack: [
            { text: title, fontSize: 9, bold: true, color: C.text, alignment: 'right' },
            { text: `رقم ${inv.num || '—'}`, fontSize: 12, bold: true, color: C.text, alignment: 'right', margin: [0, 4, 0, 0] },
            { text: fmtDate(inv.date), fontSize: 7.5, color: C.muted, alignment: 'right' }
          ],
          margin: [10, 11, 10, 11]
        },
        {
          stack: [
            { text: COMPANY_NAME, style: 'title', alignment: 'center' },
            { text: 'وثيقة مبيعات', style: 'sub', alignment: 'center', margin: [0, 3, 0, 0] }
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

  const client = {
    table: {
      widths: ['*'],
      body: [[{
        fillColor: C.panel,
        stack: [
          { text: 'العميل', fontSize: 7, color: C.muted, alignment: 'right' },
          { text: inv.accountName || '—', fontSize: 9.5, bold: true, color: C.text, alignment: 'right', margin: [0, 3, 0, 0] }
        ],
        margin: [10, 9, 10, 9]
      }]]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => C.border,
      vLineColor: () => C.border
    }
  };

  return {
    stack: [
      {
        table: { widths: ['*'], body: [[headerInner]] },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => C.border,
          vLineColor: () => C.border,
          fillColor: () => '#ffffff'
        }
      },
      client
    ],
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
        rows.map(([label]) => ({
          text: label,
          style: 'invMetaLbl',
          fillColor: C.panel,
          margin: [3, 5, 3, 2]
        })),
        rows.map(([, val]) => ({
          text: val,
          style: 'invMetaVal',
          fillColor: '#ffffff',
          margin: [3, 2, 3, 6]
        }))
      ]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => C.border,
      vLineColor: () => C.border
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
  const row = (label, value, bold = false) => [
    {
      text: label,
      fontSize: 7.5,
      bold: true,
      alignment: 'right',
      fillColor: C.panel,
      color: C.text,
      margin: [10, 6, 6, 6]
    },
    {
      text: value,
      font: 'Roboto',
      fontSize: bold ? 9 : 8,
      bold: true,
      alignment: 'center',
      fillColor: C.panel,
      color: C.text,
      noWrap: true,
      margin: [6, 6, 10, 6]
    }
  ];

  const panel = {
    table: {
      widths: ['*', 64],
      body: [
        row('إجمالي الفاتورة', fmtInvPrice(inv.total)),
        row('الحسومات', fmtInvPrice(inv.discount)),
        row('الصافي للدفع', fmtInvPrice(inv.netPay), true)
      ]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => C.border,
      vLineColor: () => C.border
    }
  };

  return {
    columns: [panel, { width: '*', text: '' }],
    margin: [0, 6, 0, 0]
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
      { text: fmtDate(new Date()), alignment: 'right', fontSize: 7, color: C.muted },
      { text: `${currentPage} / ${pageCount}`, alignment: 'left', fontSize: 7, color: C.muted }
    ],
    margin: [14, 0, 14, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 7.5, color: C.text },
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
  const bal = Number(stmt.finalBalance ?? acc.bal ?? 0);

  const tableBody = [stmtHeaderRow(), ...lines.map((row, i) => stmtLineRow(row, i))];
  if (lines.length) {
    tableBody.push(stmtTotalsTableRow(stmt));
  }

  const doc = baseDoc([
    statementPdfHeader(acc, periodNote),
    summaryBar([
      kpiCell('إجمالي مدين', fmtNum(stmt.totalDebit)),
      kpiCell('إجمالي دائن', fmtNum(stmt.totalCredit)),
      kpiCell('الديون', debtAmount),
      kpiCell('رصيد الحساب', fmtNum(Math.abs(bal)))
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

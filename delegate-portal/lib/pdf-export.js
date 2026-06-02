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
  title: { fontSize: 11, bold: true, color: C.text },
  sub: { fontSize: 7.5, bold: true, color: C.primaryDark },
  th: { fontSize: 7, bold: true, color: C.headerText },
  td: { fontSize: 7, bold: true, color: C.text },
  tdDate: { fontSize: 7, font: 'Roboto', bold: true, color: C.text },
  tdBarcode: { fontSize: 6.5, font: 'Roboto', bold: true, color: C.text },
  tdName: { fontSize: 7, bold: true, color: C.text },
  tdMoney: { fontSize: 7.5, font: 'Roboto', bold: true, color: C.text },
  metaLbl: { fontSize: 6.5, bold: true, color: C.muted, alignment: 'center' },
  metaVal: { fontSize: 8, font: 'Roboto', bold: true, color: C.text, alignment: 'center' }
};

/** pdfmake-rtl: أول عمود = يمين. م دائماً أول عنصر */
const STMT_WIDTHS = [11, 36, '*', 36, 36, 44];
const INV_WIDTHS = [11, 58, '*', 22, 20, 34, 42];

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

function compactTableLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.45;
      if (node && i === node.table.body.length) return 0.45;
      return 0.12;
    },
    vLineWidth: () => 0.12,
    hLineColor: () => C.border,
    vLineColor: () => C.border,
    paddingLeft: () => 2,
    paddingRight: () => 2,
    paddingTop: () => 1,
    paddingBottom: () => 1
  };
}

function th(text) {
  return {
    text,
    style: 'th',
    fillColor: C.headerBg,
    alignment: 'center',
    margin: [1, 3, 1, 3]
  };
}

function td(value, align = 'center', fill, style = 'td') {
  return {
    text: String(value ?? '—'),
    style,
    alignment: align,
    fillColor: fill || null,
    margin: [1, 1.5, 1, 1.5]
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
    margin: [1, 2, 1, 2]
  };
}

function rowFill(rowIndex, highlight) {
  if (highlight) return C.primaryLight;
  return rowIndex % 2 === 0 ? '#ffffff' : C.zebra;
}

function pdfTopHeader({ docLabel, badgeText, sideLines, infoLabel, infoValue, stats }) {
  const logo = getLogoDataUrl();
  const logoCell = logo
    ? { image: logo, width: 34, alignment: 'center', margin: [4, 6, 4, 6] }
    : { text: '', width: 34 };

  const badgeCell = {
    table: {
      widths: ['*'],
      body: [[{
        text: badgeText,
        fontSize: 7.5,
        bold: true,
        color: '#ffffff',
        alignment: 'center',
        fillColor: C.primary,
        margin: [6, 5, 6, 5]
      }]]
    },
    layout: 'noBorders'
  };

  const mainHeader = {
    table: {
      widths: [40, '*', 96],
      body: [[
        logoCell,
        {
          stack: [
            { text: COMPANY_NAME, style: 'title', alignment: 'center' },
            { text: docLabel, style: 'sub', alignment: 'center', margin: [0, 2, 0, 0] }
          ],
          margin: [0, 7, 0, 7]
        },
        {
          stack: [
            badgeCell,
            ...(sideLines || []).map((line) => ({
              ...line,
              margin: [0, 3, 0, 0]
            }))
          ],
          margin: [4, 6, 6, 6]
        }
      ]]
    },
    layout: 'noBorders'
  };

  const infoRow = {
    table: {
      widths: ['*', ...(stats || []).map(() => '*')],
      body: [[
        {
          fillColor: C.panel,
          stack: [
            { text: infoLabel, fontSize: 6.5, bold: true, color: C.muted, alignment: 'right' },
            { text: infoValue, fontSize: 9, bold: true, color: C.text, alignment: 'right', margin: [0, 2, 0, 0] }
          ],
          margin: [8, 6, 8, 6]
        },
        ...(stats || []).map(([label, value, accent]) => ({
          fillColor: '#ffffff',
          stack: [
            { text: label, style: 'metaLbl', margin: [0, 0, 0, 2] },
            { text: value, style: 'metaVal', color: accent || C.text }
          ],
          margin: [4, 5, 4, 5]
        }))
      ]]
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
        canvas: [{ type: 'rect', x: 0, y: 0, w: 575, h: 3, color: C.primary }],
        margin: [0, 0, 0, 0]
      },
      {
        table: { widths: ['*'], body: [[mainHeader]] },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => C.border,
          vLineColor: () => C.border,
          fillColor: () => '#ffffff'
        },
        margin: [0, 0, 0, 4]
      },
      infoRow
    ],
    margin: [0, 0, 0, 5]
  };
}

function stmtHeaderRow() {
  return [
    th('م'),
    th('التاريخ'),
    th('البيان'),
    th('مدين'),
    th('دائن'),
    th('رصيد')
  ];
}

function stmtLineRow(row, rowIndex) {
  const fill = rowFill(rowIndex, row.isOpening || row.isReconciliation);
  const idx = row.isOpening ? '∗' : String(rowIndex + 1);
  return [
    td(idx, 'center', fill),
    tdDate(row.date, fill),
    td(row.description || '—', 'right', fill),
    tdMoney(row.debit ? fmtNum(row.debit) : '—', fill),
    tdMoney(row.credit ? fmtNum(row.credit) : '—', fill),
    tdMoney(fmtNum(row.balance), fill)
  ];
}

function stmtTotalsTableRow(stmt) {
  const bal = Number(stmt.finalBalance ?? stmt.account?.bal ?? 0);
  return [
    {
      text: 'الإجمالي',
      bold: true,
      fontSize: 7.5,
      color: C.text,
      alignment: 'right',
      fillColor: C.panel,
      colSpan: 3,
      margin: [2, 4, 2, 4]
    },
    {},
    {},
    tdMoney(fmtNum(stmt.totalDebit), C.panel),
    tdMoney(fmtNum(stmt.totalCredit), C.panel),
    tdMoney(fmtNum(Math.abs(bal)), C.panel)
  ];
}

function statementPdfHeader(acc, periodNote, stats) {
  const metaLine = [periodNote, acc.address || ''].filter(Boolean).join(' · ');
  const sideLines = metaLine
    ? [{ text: metaLine, fontSize: 6.5, bold: true, color: C.muted, alignment: 'right' }]
    : [];

  return pdfTopHeader({
    docLabel: 'كشف حساب',
    badgeText: acc.num ? `حساب ${acc.num}` : 'كشف حساب',
    sideLines,
    infoLabel: 'اسم الحساب',
    infoValue: acc.name1 || '—',
    stats
  });
}

function invBarcode(line) {
  const code = String(line.matNum || line.mat || '').trim();
  return code.replace(/\s+/g, '') || '—';
}

function invHeaderRow() {
  return [
    th('م'),
    th('باركود'),
    th('المادة'),
    th('كم'),
    th('هد'),
    th('سعر'),
    th('مبلغ')
  ];
}

function tdBarcode(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdBarcode',
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [1, 1.5, 1, 1.5]
  };
}

function tdName(value, fill) {
  return {
    text: String(value ?? '—'),
    style: 'tdName',
    alignment: 'right',
    fillColor: fill || null,
    margin: [1, 1.5, 1, 1.5]
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

function invTotalsRows(inv) {
  const foot = (label, value, fill) => [
    {
      text: label,
      bold: true,
      fontSize: 7,
      color: C.text,
      alignment: 'right',
      fillColor: fill,
      colSpan: 6,
      margin: [2, 4, 2, 4]
    },
    {}, {}, {}, {}, {},
    tdMoney(value, fill)
  ];
  return [
    foot('إجمالي الفاتورة', fmtInvPrice(inv.total), '#ffffff'),
    foot('الحسومات', fmtInvPrice(inv.discount), '#fff7ed'),
    foot('الصافي للدفع', fmtInvPrice(inv.netPay), C.primaryLight)
  ];
}

function invoicePdfHeader(inv, lines, qtySum) {
  const title = inv.kindLabel || 'فاتورة مبيعات';
  return pdfTopHeader({
    docLabel: title,
    badgeText: `رقم ${inv.num || '—'}`,
    sideLines: [
      { text: fmtDate(inv.date), fontSize: 7, font: 'Roboto', bold: true, color: C.text, alignment: 'right' }
    ],
    infoLabel: 'العميل',
    infoValue: inv.accountName || '—',
    stats: [
      ['بنود', String(lines.length), C.text],
      ['كمية', fmtNum(Math.round(qtySum), 0), C.text],
      ['إجمالي', fmtInvPrice(inv.total), C.primaryDark],
      ['صافي', fmtInvPrice(inv.netPay), C.net]
    ]
  });
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
      { text: fmtDate(new Date()), font: 'Roboto', alignment: 'right', fontSize: 7, bold: true, color: C.muted },
      { text: `${currentPage}/${pageCount}`, font: 'Roboto', alignment: 'left', fontSize: 7, bold: true, color: C.muted }
    ],
    margin: [10, 0, 10, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 7, bold: true, color: C.text },
    pageSize: 'A4',
    pageMargins: [10, 8, 10, 18],
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
    statementPdfHeader(acc, periodNote, [
      ['مدين', fmtNum(stmt.totalDebit), C.debit],
      ['دائن', fmtNum(stmt.totalCredit), C.credit],
      ['ديون', debtAmount, C.debit],
      ['رصيد', fmtNum(Math.abs(bal)), C.primaryDark]
    ]),
    {
      table: {
        headerRows: 1,
        widths: STMT_WIDTHS,
        body: tableBody,
        dontBreakRows: false
      },
      layout: compactTableLayout()
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
  if (lines.length) {
    tableBody.push(...invTotalsRows(inv));
  }

  const doc = baseDoc([
    invoicePdfHeader(inv, lines, qtySum),
    {
      table: {
        headerRows: 1,
        widths: INV_WIDTHS,
        body: tableBody,
        dontBreakRows: false
      },
      layout: compactTableLayout()
    }
  ]);

  return createPdfBuffer(doc);
}

module.exports = {
  buildStatementPdf,
  buildInvoicePdf,
  COMPANY_NAME
};

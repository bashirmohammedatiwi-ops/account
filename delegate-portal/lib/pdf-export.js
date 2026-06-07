const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { resolveInvoiceTotals } = require('./invoices');
const { resolveDebtDisplayAmount, formatRunningBalance } = require('./statement-utils');

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
  title: { fontSize: 12, bold: true, color: C.text },
  sub: { fontSize: 8.5, bold: true, color: C.primaryDark },
  th: { fontSize: 7, bold: true, color: C.headerText },
  td: { fontSize: 7, bold: true, color: C.text },
  tdDate: { fontSize: 7, font: 'Roboto', bold: true, color: C.text },
  tdBarcode: { fontSize: 6.5, font: 'Roboto', bold: true, color: C.text },
  tdName: { fontSize: 7, bold: true, color: C.text },
  tdMoney: { fontSize: 7.5, font: 'Roboto', bold: true, color: C.text },
  boxLbl: { fontSize: 7, bold: true, color: '#ffffff' },
  boxVal: { fontSize: 8.5, font: 'Roboto', bold: true, color: C.text },
  boxSub: { fontSize: 7, bold: true, color: C.muted }
};

/** pdfmake-rtl يعكس الأعمدة: أول عنصر = يسار، آخر عنصر = يمين */
const STMT_WIDTHS = [44, 34, 34, '*', 48, 11];
const INV_WIDTHS = [42, 34, 20, 22, '*', 58, 11];

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

function th(text, fill = C.headerBg) {
  return {
    text,
    style: 'th',
    fillColor: fill,
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
  return {
    text: fmtDate(value),
    style: 'tdDate',
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [1, 1.5, 1, 1.5]
  };
}

function tdMoney(value, fill, color) {
  const hasVal = value && value !== '—';
  return {
    text: String(value ?? '—'),
    style: 'tdMoney',
    color: color || (hasVal ? C.text : C.muted),
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

function boxLayout() {
  return {
    hLineWidth: () => 0.45,
    vLineWidth: () => 0.45,
    hLineColor: () => C.border,
    vLineColor: () => C.border
  };
}

function pdfTopHeader({ docLabel, badgeText, sideNote, infoLabel, infoValue, infoExtra, stats }) {
  const logo = getLogoDataUrl();
  const logoCell = logo
    ? { image: logo, width: 32, alignment: 'center', margin: [4, 5, 4, 5] }
    : { text: '' };

  const nameLine = [infoValue, infoExtra].filter(Boolean).join(' · ');
  const statRows = stats || [];

  const headerBlock = {
    table: {
      widths: [38, '*', 98],
      body: [[
        logoCell,
        {
          stack: [
            { text: COMPANY_NAME, style: 'title', alignment: 'center' },
            {
              text: docLabel,
              fontSize: 8,
              bold: true,
              color: '#ffffff',
              alignment: 'center',
              fillColor: C.primaryDark,
              margin: [10, 2, 10, 2]
            }
          ],
          margin: [0, 5, 0, 4]
        },
        {
          stack: [
            {
              text: badgeText,
              fontSize: 8,
              bold: true,
              color: '#ffffff',
              alignment: 'center',
              fillColor: C.primary,
              margin: [6, 4, 6, 4]
            },
            ...(sideNote
              ? [{ text: sideNote, fontSize: 7, bold: true, color: C.muted, alignment: 'right', margin: [0, 3, 0, 0] }]
              : [])
          ],
          margin: [4, 5, 6, 5]
        }
      ]]
    },
    layout: boxLayout()
  };

  const accountBlock = {
    table: {
      widths: [72, '*'],
      body: [[
        {
          text: infoLabel,
          fontSize: 7,
          bold: true,
          color: '#ffffff',
          alignment: 'right',
          fillColor: C.primary,
          margin: [6, 4, 6, 4]
        },
        {
          text: nameLine || '—',
          fontSize: 8.5,
          bold: true,
          color: C.text,
          alignment: 'right',
          fillColor: C.panel,
          margin: [6, 4, 6, 4]
        }
      ]]
    },
    layout: boxLayout()
  };

  const statsBlock = statRows.length
    ? {
      table: {
        widths: statRows.map(() => '*'),
        body: [
          statRows.map(([label, , , labelBg]) => ({
            text: label,
            style: 'boxLbl',
            alignment: 'center',
            fillColor: labelBg || C.headerBg,
            margin: [2, 3, 2, 3]
          })),
          statRows.map(([, value, accent]) => ({
            text: value,
            style: 'boxVal',
            color: accent || C.text,
            alignment: 'center',
            fillColor: '#ffffff',
            margin: [2, 4, 2, 5]
          }))
        ]
      },
      layout: boxLayout(),
      margin: [0, 4, 0, 0]
    }
    : null;

  return {
    stack: [
      {
        canvas: [{ type: 'rect', x: 0, y: 0, w: 575, h: 3, color: C.primary }],
        margin: [0, 0, 0, 0]
      },
      headerBlock,
      accountBlock,
      statsBlock
    ].filter(Boolean),
    margin: [0, 0, 0, 5]
  };
}

function stmtHeaderRow() {
  return [
    th('رصيد'),
    th('دائن', C.credit),
    th('مدين', C.debit),
    th('البيان'),
    th('التاريخ'),
    th('م')
  ];
}

function stmtLineRow(row, rowIndex) {
  const fill = rowFill(rowIndex, row.isOpening || row.isReconciliation);
  const idx = row.isOpening ? '∗' : String(rowIndex + 1);
  const balText = row.isOpening ? '' : formatRunningBalance(row.balance);
  const dateText = row.isOpening ? '' : fmtDate(row.date);
  return [
    tdMoney(balText || '—', fill),
    tdMoney(row.credit ? fmtNum(row.credit) : '—', fill, row.credit ? C.credit : null),
    tdMoney(row.debit ? fmtNum(row.debit) : '—', fill, row.debit ? C.debit : null),
    td(row.description || '—', 'right', fill),
    tdDate(dateText, fill),
    td(idx, 'center', fill)
  ];
}

function emptyCell() {
  return { text: '' };
}

function stmtTotalsTableRow(stmt) {
  const summary = stmt.summary || {};
  return [
    tdMoney('', C.panel),
    tdMoney(fmtNum(stmt.totalCredit), C.panel, C.credit),
    tdMoney(fmtNum(stmt.totalDebit), C.panel, C.debit),
    {
      text: 'المجموع',
      bold: true,
      fontSize: 7.5,
      color: C.text,
      alignment: 'right',
      fillColor: C.panel,
      colSpan: 3,
      margin: [2, 4, 2, 4]
    },
    emptyCell(),
    emptyCell()
  ];
}

function stmtFinalTableRow(stmt) {
  const summary = stmt.summary || {};
  const debitAmt = summary.side === 'debit' ? fmtNum(summary.amount) : '—';
  const creditAmt = summary.side === 'credit' ? fmtNum(summary.amount) : '—';
  return [
    tdMoney('', C.panel),
    tdMoney(creditAmt, C.panel, summary.side === 'credit' ? C.credit : null),
    tdMoney(debitAmt, C.panel, summary.side === 'debit' ? C.debit : null),
    {
      text: summary.label || '—',
      bold: true,
      fontSize: 7.5,
      color: C.text,
      alignment: 'right',
      fillColor: C.primaryLight,
      colSpan: 3,
      margin: [2, 4, 2, 4]
    },
    emptyCell(),
    emptyCell()
  ];
}

function statementPdfHeader(acc, periodNote, stats) {
  return pdfTopHeader({
    docLabel: 'كشف حساب',
    badgeText: acc.num ? `حساب ${acc.num}` : 'كشف حساب',
    sideNote: periodNote || null,
    infoLabel: 'اسم الحساب',
    infoValue: acc.name1 || '—',
    infoExtra: acc.address || null,
    stats
  });
}

function invBarcode(line) {
  const code = String(line.matNum || line.mat || '').trim();
  return code.replace(/\s+/g, '') || '—';
}

function invHeaderRow() {
  return [
    th('المبلغ'),
    th('سعر'),
    th('هد'),
    th('كم'),
    th('المادة'),
    th('باركود'),
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
    tdMoney(fmtInvPrice(line.lineTotal), fill),
    tdMoney(fmtInvPrice(line.price), fill),
    td(fmtQtyInt(line.bonus), 'center', fill),
    td(fmtQtyInt(line.quant), 'center', fill),
    tdName(line.matName || '—', fill),
    tdBarcode(invBarcode(line), fill),
    td(String(rowIndex + 1), 'center', fill)
  ];
}

function invTotalsRows(inv) {
  const foot = (label, value, fill) => [
    tdMoney(value, fill),
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
    emptyCell(),
    emptyCell(),
    emptyCell(),
    emptyCell(),
    emptyCell()
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
    sideNote: fmtDate(inv.date),
    infoLabel: 'العميل',
    infoValue: inv.accountName || '—',
    infoExtra: inv.accountNum ? `حساب ${inv.accountNum}` : null,
    stats: [
      ['البنود', String(lines.length), C.text],
      ['الكمية', fmtNum(Math.round(qtySum), 0), C.text],
      ['الإجمالي', fmtInvPrice(inv.total), C.primaryDark],
      ['الصافي', fmtInvPrice(inv.netPay), C.net]
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
    tableBody.push(stmtFinalTableRow(stmt));
  }

  const doc = baseDoc([
    statementPdfHeader(acc, periodNote, [
      ['مدين', fmtNum(stmt.totalDebit), C.debit, C.debit],
      ['دائن', fmtNum(stmt.totalCredit), C.credit, C.credit],
      ['ديون', debtAmount, C.debit, C.debit],
      ['رصيد', fmtNum(Math.abs(bal)), C.primaryDark, C.headerBg]
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

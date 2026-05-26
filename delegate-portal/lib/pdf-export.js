const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');

pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Cairo'));
pdfmake.addFonts(require('@digicole/pdfmake-rtl/fonts/Roboto'));

const COMPANY_NAME = 'شركة ديما الحياة';
const LOGO_PATH = path.join(__dirname, '..', 'public', 'm', 'assets', 'logo.png');

const STYLES = {
  companyTitle: { fontSize: 18, bold: true, color: '#0f766e' },
  companySub: { fontSize: 10, color: '#64748b', margin: [0, 2, 0, 0] },
  docTitle: { fontSize: 15, bold: true, color: '#0f172a', margin: [0, 8, 0, 8] },
  metaLabel: { fontSize: 9, color: '#64748b' },
  metaValue: { fontSize: 11, bold: true, color: '#0f172a' },
  tableHeader: { bold: true, fontSize: 10 },
  totalLabel: { bold: true, fontSize: 10 },
  totalValue: { bold: true, fontSize: 11, color: '#0f766e' }
};

function getLogoDataUrl() {
  if (!fs.existsSync(LOGO_PATH)) return null;
  return `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`;
}

function fmtNum(v, digits = 0) {
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
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

function buildHeaderBlock() {
  const logo = getLogoDataUrl();
  return {
    table: {
      widths: logo ? [72, '*'] : ['*'],
      body: [[
        logo
          ? { image: logo, width: 64, margin: [0, 2, 8, 0] }
          : { text: '' },
        {
          stack: [
            { text: COMPANY_NAME, style: 'companyTitle' },
            { text: 'نظام كشوف حسابات المندوبين', style: 'companySub' }
          ],
          alignment: 'right'
        }
      ]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10]
  };
}

function headerCell(text, color = '#0f766e') {
  return {
    text,
    style: 'tableHeader',
    fillColor: color,
    color: '#ffffff',
    alignment: 'center',
    margin: [3, 7, 3, 7]
  };
}

function bodyCells(values, rowIndex, alignments = []) {
  return values.map((value, i) => ({
    text: String(value ?? '—'),
    fillColor: rowIndex % 2 === 0 ? '#f8fafc' : '#ffffff',
    alignment: alignments[i] || 'center',
    margin: [4, 6, 4, 6],
    fontSize: 9
  }));
}

function gridLayout() {
  return {
    hLineWidth: () => 0.6,
    vLineWidth: () => 0.6,
    hLineColor: () => '#cbd5e1',
    vLineColor: () => '#cbd5e1',
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 2,
    paddingBottom: () => 2
  };
}

function metaBox(rows) {
  return {
    table: {
      widths: rows[0].map(() => '*'),
      body: rows
    },
    layout: {
      fillColor: () => '#ecfdf5',
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => '#99f6e4',
      vLineColor: () => '#99f6e4',
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6
    },
    margin: [0, 0, 0, 12]
  };
}

function metaStack(label, value) {
  return {
    stack: [
      { text: label, style: 'metaLabel' },
      { text: value || '—', style: 'metaValue' }
    ]
  };
}

function pdfFooter() {
  return (currentPage, pageCount) => ({
    columns: [
      {
        text: `تاريخ التصدير: ${fmtDate(new Date())}`,
        alignment: 'right',
        fontSize: 8,
        color: '#94a3b8'
      },
      {
        text: `صفحة ${currentPage} / ${pageCount}`,
        alignment: 'left',
        fontSize: 8,
        color: '#94a3b8'
      }
    ],
    margin: [28, 0, 28, 0]
  });
}

function baseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 10 },
    pageSize: 'A4',
    pageMargins: [28, 28, 28, 36],
    styles: STYLES,
    footer: pdfFooter(),
    content
  };
}

async function createPdfBuffer(docDefinition) {
  const pdf = pdfmake.createPdf(docDefinition);
  return pdf.getBuffer();
}

async function buildStatementPdf(stmt, meta = {}) {
  const acc = stmt.account || {};
  const lines = stmt.lines || [];
  const summary = stmt.summary || {};
  const tableBody = [
    [
      headerCell('#', '#115e59'),
      headerCell('التاريخ', '#115e59'),
      headerCell('مدين', '#b91c1c'),
      headerCell('دائن', '#047857'),
      headerCell('البيان', '#115e59'),
      headerCell('الرصيد', '#1d4ed8')
    ],
    ...lines.map((row, i) => bodyCells([
      i + 1,
      fmtDate(row.date),
      row.debit ? fmtNum(row.debit) : '—',
      row.credit ? fmtNum(row.credit) : '—',
      row.description || '—',
      fmtNum(row.balance)
    ], i, ['center', 'center', 'center', 'center', 'right', 'center']))
  ];

  const debtAmount = Number(stmt.finalBalance ?? acc.bal ?? 0) < 0
    ? fmtNum(Math.abs(Number(stmt.finalBalance ?? acc.bal ?? 0)))
    : '0';

  const doc = baseDoc([
    buildHeaderBlock(),
    { text: 'كشف حساب', style: 'docTitle', alignment: 'center' },
    ...(meta.sinceLastMatch && stmt.lastMatch?.date
      ? [{
        text: `حركات بعد آخر مطابقة — ${fmtDate(stmt.lastMatch.date)}`,
        fontSize: 10,
        color: '#64748b',
        alignment: 'center',
        margin: [0, 0, 0, 6]
      }]
      : []),
    metaBox([[
      metaStack('رقم الحساب', acc.num),
      metaStack('اسم الزبون', acc.name1),
      metaStack('الشجرة', meta.treeLabel || '—'),
      metaStack('الديون', debtAmount)
    ]]),
    {
      table: {
        headerRows: 1,
        widths: [22, 54, 48, 48, '*', 52],
        body: tableBody
      },
      layout: gridLayout()
    },
    {
      table: {
        widths: ['*', '*', '*', '*'],
        body: [[
          {
            text: `إجمالي مدين\n${fmtNum(stmt.totalDebit)}`,
            style: 'totalLabel',
            fillColor: '#fef2f2',
            color: '#b91c1c',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          },
          {
            text: `إجمالي دائن\n${fmtNum(stmt.totalCredit)}`,
            style: 'totalLabel',
            fillColor: '#ecfdf5',
            color: '#047857',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          },
          {
            text: `${summary.label || 'الرصيد'}\n`,
            style: 'totalLabel',
            fillColor: '#eff6ff',
            color: '#1d4ed8',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          },
          {
            text: fmtNum(summary.amount),
            style: 'totalValue',
            fillColor: '#eff6ff',
            alignment: 'center',
            margin: [4, 10, 4, 10]
          }
        ]]
      },
      layout: 'noBorders',
      margin: [0, 10, 0, 0]
    }
  ]);

  return createPdfBuffer(doc);
}

async function buildInvoicePdf(data) {
  const inv = data.invoice || {};
  const lines = data.lines || [];
  const tableBody = [
    [
      headerCell('رقم المادة', '#115e59'),
      headerCell('اسم المادة', '#115e59'),
      headerCell('كمية', '#0f766e'),
      headerCell('هدايا', '#0f766e'),
      headerCell('السعر', '#1d4ed8'),
      headerCell('الإجمالي', '#1d4ed8')
    ],
    ...lines.map((line, i) => bodyCells([
      line.matNum || line.mat || '—',
      line.matName || '—',
      fmtNum(line.quant, 2),
      fmtNum(line.bonus, 2),
      fmtMoney(line.price),
      fmtMoney(line.lineTotal)
    ], i, ['center', 'right', 'center', 'center', 'center', 'center']))
  ];

  const doc = baseDoc([
    buildHeaderBlock(),
    { text: inv.kindLabel || 'فاتورة مبيعات', style: 'docTitle', alignment: 'center' },
    metaBox([[
      metaStack('رقم الفاتورة', inv.num),
      metaStack('التاريخ', fmtDate(inv.date)),
      metaStack('اسم الزبون', inv.accountName),
      metaStack('رقم الحساب', inv.accountNum)
    ]]),
    {
      table: {
        headerRows: 1,
        widths: [54, '*', 38, 38, 48, 54],
        body: tableBody
      },
      layout: gridLayout()
    },
    {
      table: {
        widths: ['*', '*', '*'],
        body: [[
          {
            text: `قيمة الفاتورة\n${fmtMoney(inv.total)}`,
            style: 'totalLabel',
            fillColor: '#f8fafc',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          },
          {
            text: `حسميات\n${fmtMoney(inv.discount)}`,
            style: 'totalLabel',
            fillColor: '#fff7ed',
            color: '#c2410c',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          },
          {
            text: `الصافي للدفع\n${fmtMoney(inv.netPay)}`,
            style: 'totalValue',
            fillColor: '#ecfdf5',
            alignment: 'center',
            margin: [4, 8, 4, 8]
          }
        ]]
      },
      layout: 'noBorders',
      margin: [0, 10, 0, 0]
    }
  ]);

  return createPdfBuffer(doc);
}

module.exports = {
  buildStatementPdf,
  buildInvoicePdf,
  COMPANY_NAME
};

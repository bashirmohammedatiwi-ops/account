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
  tdName: { fontSize: 6.5, color: '#0f172a' },
  tdMoney: { fontSize: 7, font: 'Roboto', bold: true, color: '#0f172a' },
  invMetaLbl: { fontSize: 6.5, color: '#64748b', alignment: 'center' },
  invMetaVal: { fontSize: 8, font: 'Roboto', bold: true, color: '#0f172a', alignment: 'center' }
};

/** عرض الجدول: المبلغ يسار ← … ← م يمين */
const INV_WIDTHS = [52, 40, 24, 28, '*', 72, 14];

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

/** من اليمين: م → الباركود → اسم المادة → … → المبلغ (مطابق للويب) */
function invHeaderRow() {
  return [
    th('م'),
    th('الباركود', COLORS.header),
    th('اسم المادة', COLORS.headerAlt),
    th('الكمية', COLORS.qty),
    th('هدية', COLORS.qty),
    th('سعر الوحدة', COLORS.price),
    th('المبلغ', COLORS.price)
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

function invEmpty(fill) {
  return { text: '', fillColor: fill || null };
}

/** التسمية يميناً (colSpan 6) والقيمة في عمود المبلغ يساراً */
function invSumRow(label, value, fill) {
  return [
    footLabel(label, 6, fill),
    invEmpty(fill),
    invEmpty(fill),
    invEmpty(fill),
    invEmpty(fill),
    invEmpty(fill),
    tdMoney(value, fill)
  ];
}

function invoicePdfHeader(inv) {
  const logo = getLogoDataUrl();
  const title = inv.kindLabel || 'فاتورة مبيعات';
  const logoCell = logo
    ? { image: logo, width: 40, alignment: 'center', margin: [4, 4, 4, 4] }
    : { text: '' };

  const titleBand = {
    table: {
      widths: [44, '*', 100],
      body: [[
        logoCell,
        {
          stack: [
            { text: COMPANY_NAME, fontSize: 12, bold: true, color: '#ffffff', alignment: 'center' },
            { text: title, fontSize: 9.5, bold: true, color: '#ccfbf1', alignment: 'center', margin: [0, 3, 0, 0] }
          ],
          fillColor: COLORS.headerAlt,
          margin: [6, 7, 6, 7]
        },
        {
          stack: [
            { text: `رقم ${inv.num || '—'}`, fontSize: 10, bold: true, color: '#ffffff', alignment: 'center' },
            { text: fmtDate(inv.date), fontSize: 7.5, color: '#e2e8f0', alignment: 'center', margin: [0, 3, 0, 0] }
          ],
          fillColor: '#0d5c56',
          margin: [4, 7, 4, 7]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    }
  };

  const clientBand = {
    table: {
      widths: ['*'],
      body: [[{
        columns: [
          {
            width: '*',
            stack: [
              { text: 'العميل', fontSize: 7, color: '#64748b', alignment: 'right', margin: [0, 0, 0, 2] },
              { text: inv.accountName || '—', style: 'invClient', alignment: 'right' },
              inv.accountNum
                ? { text: `حساب ${inv.accountNum}`, fontSize: 7, color: '#64748b', alignment: 'right', margin: [0, 2, 0, 0] }
                : null
            ].filter(Boolean)
          }
        ],
        fillColor: '#f1f5f9',
        margin: [8, 7, 8, 7]
      }]]
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border
    },
    margin: [0, 0, 0, 0]
  };

  return {
    stack: [titleBand, clientBand],
    margin: [0, 0, 0, 5]
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
          fillColor: '#e2e8f0',
          margin: [2, 4, 2, 2]
        })),
        rows.map(([, val]) => ({
          text: val,
          style: 'invMetaVal',
          fillColor: '#ffffff',
          margin: [2, 2, 2, 5]
        }))
      ]
    },
    layout: {
      hLineWidth: () => 0.4,
      vLineWidth: () => 0.4,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border
    },
    margin: [0, 0, 0, 4]
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
    invoiceMetaGrid(inv, lines, qtySum),
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

const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');
const { formatRunningBalance } = require('./statement-utils');

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
  boxSub: { fontSize: 7, bold: true, color: C.muted },
  srTh: { fontSize: 9.5, bold: true, color: '#ffffff' },
  srTd: { fontSize: 9, bold: true, color: '#0f172a' },
  srName: { fontSize: 9, bold: true, color: '#0f172a' },
  srMoney: { fontSize: 10, font: 'Roboto', bold: true, color: '#0f172a' },
  srDate: { fontSize: 8.5, font: 'Roboto', bold: true, color: '#1e293b' },
  srCode: { fontSize: 8.5, font: 'Roboto', bold: true, color: '#334155' },
  srTotalMoney: { fontSize: 12, font: 'Roboto', bold: true, color: '#dc2626' },
  srTotalQty: { fontSize: 11, font: 'Roboto', bold: true, color: '#dc2626' }
};

const SR = {
  headBg: '#334155',
  headText: '#ffffff',
  grid: '#e2e8f0',
  zebra: '#f8fafc',
  total: '#ecfdf5',
  text: '#1e293b'
};

const SALES = {
  ink: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
  lineStrong: '#64748b',
  surface: '#f1f5f9',
  head: '#1e3a5f',
  headAlt: '#0f766e',
  headText: '#ffffff',
  accent: '#0f766e',
  accentLight: '#d1fae5',
  debit: '#dc2626',
  debitLight: '#fef2f2',
  credit: '#15803d',
  creditLight: '#ecfdf5',
  giftLight: '#fef9c3',
  zebra: '#f8fafc',
  total: '#ffffff',
  totalLabel: '#1e293b',
  summary: '#fff7ed',
  summarySales: '#ecfdf5',
  summaryReturns: '#fef2f2',
  summaryGifts: '#fffbeb',
  qty: '#2563eb'
};

const STMT = {
  ink: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
  lineStrong: '#64748b',
  surface: '#f1f5f9',
  head: '#1e3a5f',
  headText: '#ffffff',
  accent: '#0f766e',
  debit: '#dc2626',
  credit: '#15803d',
  opening: '#f0fdfa',
  zebra: '#f8fafc',
  total: '#ffffff',
  final: '#ffffff'
};
/** pdfmake-rtl: العمود الأول = يمين الجدول، الأخير = يسار */
// كشف حساب — يمين→يسار: مدين، دائن، البيان، التاريخ، رصيد الحساب
const STMT_WIDTHS = [56, 56, '*', 50, 62];
const INV_WIDTHS = [42, 34, 20, 22, '*', 58, 11];

let logoDataUrlCache;
function getLogoDataUrl() {
  if (logoDataUrlCache !== undefined) return logoDataUrlCache;
  logoDataUrlCache = fs.existsSync(LOGO_PATH)
    ? `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
    : null;
  return logoDataUrlCache;
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

function pdfTopHeader({ docLabel, badgeText, sideNote, infoLabel, infoValue, infoExtra, stats, bannerWidth = 575 }) {
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
        canvas: [{ type: 'rect', x: 0, y: 0, w: bannerWidth, h: 3, color: C.primary }],
        margin: [0, 0, 0, 0]
      },
      headerBlock,
      accountBlock,
      statsBlock
    ].filter(Boolean),
    margin: [0, 0, 0, 5]
  };
}

function stmtLayout() {
  return stmtTableLayout();
}

function stmtTableLayout() {
  return {
    hLineWidth: (i, node) => {
      const n = node?.table?.body?.length || 0;
      if (i === 0 || i === 1) return 0.65;
      if (n > 3 && i === n - 2) return 1.25;
      if (n > 2 && i === n - 1) return 0.9;
      if (node && i === n) return 0.7;
      return 0.2;
    },
    vLineWidth: () => 0.2,
    hLineColor: (i, node) => {
      const n = node?.table?.body?.length || 0;
      if (n > 3 && i === n - 2) return STMT.debit;
      return STMT.line;
    },
    vLineColor: () => STMT.line,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 5,
    paddingBottom: () => 5
  };
}

function stmtTh(text) {
  return {
    text,
    bold: true,
    fontSize: 9,
    color: STMT.headText,
    fillColor: STMT.head,
    alignment: 'center',
    margin: [3, 7, 3, 7]
  };
}

function stmtTdMoney(value, fill, color) {
  const empty = !value || value === '—';
  return {
    text: String(value ?? '—'),
    font: 'Roboto',
    fontSize: empty ? 9 : 10,
    bold: true,
    color: color || (empty ? STMT.muted : STMT.ink),
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [2, 5, 2, 5]
  };
}

function stmtRowFill(rowIndex, highlight) {
  if (highlight) return STMT.opening;
  return rowIndex % 2 === 0 ? '#ffffff' : STMT.zebra;
}

function stmtHeaderRow() {
  return [
    stmtTh('مدين'),
    stmtTh('دائن'),
    stmtTh('البيان'),
    stmtTh('التاريخ'),
    stmtTh('رصيد الحساب')
  ];
}

function stmtLineRow(row, rowIndex) {
  const fill = stmtRowFill(rowIndex, row.isOpening || row.isReconciliation);
  const balText = formatRunningBalance(row.balance) || '—';
  const dateText = row.isOpening ? '' : fmtDate(row.date);
  const descBold = row.isOpening || row.isReconciliation;
  return [
    stmtTdMoney(row.debit ? fmtNum(row.debit) : '—', fill, row.debit ? STMT.debit : null),
    stmtTdMoney(row.credit ? fmtNum(row.credit) : '—', fill, row.credit ? STMT.credit : null),
    {
      text: String(row.description || '—'),
      fontSize: 9,
      bold: descBold,
      color: STMT.ink,
      alignment: 'right',
      fillColor: fill || null,
      margin: [5, 5, 5, 5]
    },
    {
      text: dateText,
      font: 'Roboto',
      fontSize: 9,
      bold: true,
      color: STMT.muted,
      alignment: 'center',
      fillColor: fill || null,
      noWrap: true,
      margin: [2, 5, 2, 5]
    },
    stmtTdMoney(balText, fill, STMT.accent)
  ];
}

function emptyCell() {
  return { text: '' };
}

function stmtTotalsTableRow(stmt) {
  const fill = STMT.total;
  return [
    stmtTdMoney(fmtNum(stmt.totalDebit), fill, STMT.debit),
    stmtTdMoney(fmtNum(stmt.totalCredit), fill, STMT.credit),
    {
      text: 'المجموع',
      bold: true,
      fontSize: 10,
      color: STMT.ink,
      alignment: 'right',
      fillColor: fill,
      colSpan: 2,
      margin: [5, 6, 5, 6]
    },
    emptyCell(),
    stmtTdMoney(formatRunningBalance(stmt.finalBalance) || '—', fill, STMT.ink)
  ];
}

function stmtFinalTableRow(stmt) {
  const summary = stmt.summary || {};
  const fill = STMT.final;
  const debitAmt = summary.side === 'debit' ? fmtNum(summary.amount) : '—';
  const creditAmt = summary.side === 'credit' ? fmtNum(summary.amount) : '—';
  const sideColor = summary.side === 'debit' ? STMT.debit : (summary.side === 'credit' ? STMT.credit : STMT.accent);
  return [
    stmtTdMoney(debitAmt, fill, summary.side === 'debit' ? STMT.debit : null),
    stmtTdMoney(creditAmt, fill, summary.side === 'credit' ? STMT.credit : null),
    {
      text: summary.label || 'الرصيد النهائي',
      bold: true,
      fontSize: 10,
      color: STMT.ink,
      alignment: 'right',
      fillColor: fill,
      colSpan: 2,
      margin: [5, 7, 5, 7]
    },
    emptyCell(),
    stmtTdMoney(formatRunningBalance(stmt.finalBalance) || '—', fill, sideColor)
  ];
}

function stmtStatPill(label, value, accent) {
  return {
    stack: [
      { text: label, fontSize: 7.5, bold: true, color: STMT.muted, alignment: 'center' },
      {
        text: value,
        font: 'Roboto',
        bold: true,
        fontSize: 11,
        color: accent || STMT.ink,
        alignment: 'center',
        margin: [0, 4, 0, 0]
      }
    ],
    fillColor: '#ffffff',
    margin: [5, 8, 5, 8]
  };
}

function statementPdfHeader(acc, periodNote, stats, index = 1, total = 1) {
  const logo = getLogoDataUrl();
  const statRows = stats || [];
  const accountNum = acc.num ? String(acc.num) : '—';
  const accountName = acc.name1 ? String(acc.name1) : '';

  const headerBand = {
    table: {
      widths: ['*', logo ? 44 : 0],
      body: [[
        {
          stack: [
            { text: COMPANY_NAME, fontSize: 8.5, bold: true, color: '#cbd5e1', alignment: 'right' },
            {
              text: 'كشف حساب — صندوق',
              fontSize: 14,
              bold: true,
              color: STMT.headText,
              alignment: 'right',
              margin: [0, 3, 0, 0]
            }
          ],
          fillColor: STMT.head,
          margin: [14, 11, 14, 11]
        },
        logo
          ? { image: logo, width: 30, alignment: 'center', margin: [6, 10, 10, 10], fillColor: STMT.head }
          : { text: '', border: [false, false, false, false] }
      ]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 0]
  };

  const accountCard = {
    table: {
      widths: ['*', total > 1 ? 52 : 0],
      body: [[
        {
          stack: [
            {
              text: [
                { text: 'حساب ', fontSize: 9, bold: true, color: STMT.muted },
                { text: accountNum, fontSize: 11, bold: true, color: STMT.ink }
              ],
              alignment: 'right'
            },
            ...(accountName
              ? [{ text: accountName, fontSize: 10.5, bold: true, color: STMT.ink, alignment: 'right', margin: [0, 4, 0, 0] }]
              : []),
            ...(periodNote
              ? [{ text: periodNote, fontSize: 8.5, bold: true, color: STMT.muted, alignment: 'right', margin: [0, 5, 0, 0] }]
              : [])
          ],
          fillColor: STMT.surface,
          margin: [12, 10, 12, 10]
        },
        total > 1
          ? {
            stack: [
              { text: 'صفحة', fontSize: 7.5, bold: true, color: STMT.muted, alignment: 'center' },
              { text: `${index}/${total}`, font: 'Roboto', fontSize: 11, bold: true, color: STMT.accent, alignment: 'center', margin: [0, 3, 0, 0] }
            ],
            fillColor: STMT.surface,
            margin: [6, 10, 10, 10]
          }
          : { text: '', border: [false, false, false, false] }
      ]]
    },
    layout: {
      hLineWidth: () => 0.55,
      vLineWidth: () => 0.55,
      hLineColor: () => STMT.lineStrong,
      vLineColor: () => STMT.lineStrong
    },
    margin: [0, 0, 0, 8]
  };

  const statsBlock = statRows.length
    ? {
      table: {
        widths: statRows.map(() => '*'),
        body: [statRows.map(([label, value, accent]) => stmtStatPill(label, value, accent))]
      },
      layout: {
        hLineWidth: () => 0.55,
        vLineWidth: () => 0.55,
        hLineColor: () => STMT.lineStrong,
        vLineColor: () => STMT.lineStrong
      },
      margin: [0, 0, 0, 12]
    }
    : null;

  return {
    stack: [headerBand, accountCard, statsBlock].filter(Boolean),
    margin: [0, 0, 0, 6]
  };
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

function baseDoc(content, options = {}) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 7, bold: true, color: C.text },
    pageSize: 'A4',
    pageOrientation: options.orientation || 'portrait',
    pageMargins: options.pageMargins || [10, 8, 10, 18],
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

function stmtPdfFooter() {
  return (currentPage, pageCount) => ({
    columns: [
      { text: COMPANY_NAME, fontSize: 8, bold: true, color: STMT.muted, alignment: 'right' },
      { text: `${currentPage} / ${pageCount}`, font: 'Roboto', fontSize: 8, bold: true, color: STMT.muted, alignment: 'left' }
    ],
    margin: [12, 0, 12, 0]
  });
}

function statementBaseDoc(content) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 9, bold: true, color: STMT.ink },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [14, 14, 14, 24],
    footer: stmtPdfFooter(),
    content
  };
}

function statementBlock(stmt, meta = {}) {
  const acc = stmt.account || {};
  const lines = stmt.lines || [];
  const openingBal = Number(stmt.openingBalance ?? 0);
  const periodParts = [];
  const periodStart = stmt.periodStart || meta.period?.dateFrom;
  const periodEnd = stmt.periodEnd || meta.period?.dateTo;
  if (periodStart && periodEnd) periodParts.push(`الفترة: ${fmtDate(periodStart)} → ${fmtDate(periodEnd)}`);
  else if (periodStart) periodParts.push(`من ${fmtDate(periodStart)}`);
  else if (periodEnd) periodParts.push(`إلى ${fmtDate(periodEnd)}`);
  if (openingBal) periodParts.push(`رصيد مدور ${fmtNum(Math.abs(openingBal))}`);
  const periodNote = periodParts.join('   ·   ');
  const bal = Number(stmt.finalBalance ?? acc.bal ?? 0);
  const moveCount = lines.filter((l) => !l.isOpening).length;
  const index = meta.index || 1;
  const total = meta.total || 1;

  const tableBody = lines.length
    ? (() => {
      const body = [stmtHeaderRow(), ...lines.map((row, i) => stmtLineRow(row, i))];
      body.push(stmtTotalsTableRow(stmt));
      body.push(stmtFinalTableRow(stmt));
      return body;
    })()
    : null;

  return {
    stack: [
      statementPdfHeader(acc, periodNote, [
        ['إجمالي مدين', fmtNum(stmt.totalDebit), STMT.debit],
        ['إجمالي دائن', fmtNum(stmt.totalCredit), STMT.credit],
        ['عدد الحركات', String(moveCount), STMT.ink],
        ['رصيد الحساب', fmtNum(Math.abs(bal)), STMT.accent]
      ], index, total),
      tableBody
        ? {
          table: {
            headerRows: 1,
            widths: STMT_WIDTHS,
            body: tableBody,
            dontBreakRows: false
          },
          layout: stmtTableLayout()
        }
        : {
          text: 'لا توجد حركات لهذا الحساب في الفترة المحددة',
          fontSize: 10,
          bold: true,
          color: STMT.muted,
          alignment: 'center',
          margin: [0, 16, 0, 0]
        }
    ],
    pageBreak: meta.pageBreak || undefined
  };
}

function statementContent(stmt, meta = {}) {
  return [statementBlock(stmt, meta)];
}

async function buildStatementPdf(stmt, meta = {}) {
  return createPdfBuffer(statementBaseDoc(statementContent(stmt, meta)));
}

/** Multi-account statements — each fund/box on its own page, in selection order. */
async function buildAccountStatementsPdf(statements = [], meta = {}) {
  const list = (statements || []).filter(Boolean);
  if (!list.length) {
    return createPdfBuffer(statementBaseDoc([
      { text: 'لا توجد حسابات', fontSize: 10, color: STMT.muted, alignment: 'center', margin: [0, 20, 0, 0] }
    ]));
  }
  const total = list.length;
  const content = list.map((stmt, idx) => statementBlock(stmt, {
    ...meta,
    index: idx + 1,
    total,
    pageBreak: idx > 0 ? 'before' : undefined
  }));
  return createPdfBuffer(statementBaseDoc(content));
}

async function buildInvoicePdf(data) {
  const { resolveInvoiceTotals } = require('./invoices');
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

function orderToExportData(order) {
  const lines = (order.lines || []).map((l) => ({
    matName: l.matName || '—',
    matNum: l.barcode || '',
    mat: l.barcode || '',
    quant: Number(l.quant || 0),
    bonus: Number(l.bonus || 0),
    price: Number(l.unitPrice || 0),
    lineTotal: Number(l.lineTotal || 0)
      || Math.round(Number(l.quant || 0) * Number(l.unitPrice || 0))
  }));
  const metaBits = [
    order.agentName ? `المندوب: ${order.agentName}` : '',
    order.catalogBranchName ? `الفرع: ${order.catalogBranchName}` : '',
    order.notes || ''
  ].filter(Boolean);

  return {
    invoice: {
      num: order.orderNo || '—',
      date: order.submittedAt || order.createdAt || '',
      accountName: order.customerName || '—',
      accountNum: order.customerNum || '',
      kindLabel: 'فاتورة طلب مندوب',
      total: Number(order.totalAmount || 0),
      discount: 0,
      payment: Number(order.totalAmount || 0),
      remarks: metaBits.join(' · ')
    },
    lines
  };
}

async function buildOrderPdf(order) {
  return buildInvoicePdf(orderToExportData(order));
}

/**
 * Columns mirror the Edari detail report (RTL). pdfmake-rtl reverses order:
 * first array element renders on the LEFT, last on the RIGHT.
 * Visual order right→left: التاريخ، الفرع، النوع، المستخدم، رقم المادة،
 * رقم الباركود، اسم المادة، الكمية، السعر الإجمالي، سعر الوحدة، البائع.
 */
// A4 عمودي — يمين←يسار: التاريخ، الباركود، المادة، الكمية، السعر، الإجمالي
// pdfmake-rtl: أول عنصر = يسار، آخر عنصر = يمين
const SALES_RPT_WIDTHS = [82, 66, 46, '*', 92, 64];

function srLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.55;
      if (node && i === node.table.body.length) return 0.55;
      return 0.2;
    },
    vLineWidth: () => 0.2,
    hLineColor: () => SALES.line,
    vLineColor: () => SALES.line,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 4,
    paddingBottom: () => 4
  };
}

/** تخطيط جدول تفاصيل الشجرة — خط أحمر واضح قبل صف الإجمالي */
function srTreeTableLayout() {
  return {
    hLineWidth: (i, node) => {
      const n = node?.table?.body?.length || 0;
      if (i === 0 || i === 1) return 0.65;
      if (n > 2 && i === n - 1) return 1.4;
      if (node && i === n) return 0.75;
      return 0.18;
    },
    vLineWidth: () => 0.18,
    hLineColor: (i, node) => {
      const n = node?.table?.body?.length || 0;
      if (n > 2 && i === n - 1) return SALES.debit;
      return SALES.line;
    },
    vLineColor: () => SALES.line,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 4,
    paddingBottom: () => 4
  };
}

function srSummaryLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.65;
      if (node && i === node.table.body.length) return 0.85;
      return 0.22;
    },
    vLineWidth: () => 0.22,
    hLineColor: (i, node) => {
      if (node && i === node.table.body.length) return SALES.lineStrong;
      return SALES.line;
    },
    vLineColor: () => SALES.line,
    paddingLeft: () => 6,
    paddingRight: () => 6,
    paddingTop: () => 5,
    paddingBottom: () => 5
  };
}

/** تخطيط أنيق للملخص الإجمالي — خطوط خفيفة */
function srGrandSummaryLayout() {
  return {
    hLineWidth: (i, node) => {
      if (i === 0 || i === 1) return 0.5;
      if (node && i === node.table.body.length) return 0.55;
      return 0.12;
    },
    vLineWidth: () => 0,
    hLineColor: () => SALES.line,
    vLineColor: () => SALES.line,
    paddingLeft: () => 8,
    paddingRight: () => 8,
    paddingTop: () => 6,
    paddingBottom: () => 6
  };
}

function srTh(text, fill = SALES.head) {
  return {
    text,
    bold: true,
    fontSize: 9,
    color: SALES.headText,
    alignment: 'center',
    fillColor: fill,
    margin: [3, 6, 3, 6]
  };
}

function srCell(value, style, align, fill, color) {
  return {
    text: value === '' || value == null ? '' : String(value),
    style,
    alignment: align || 'center',
    fillColor: fill || null,
    color: color || undefined,
    margin: [2, 2.5, 2, 2.5]
  };
}

const SR_TREES_WIDTHS = [82, 62, 62, '*'];
const SR_GRAND_WIDTHS = [88, 68, '*'];

function srSummaryCountCell(value, fill) {
  return {
    text: String(value ?? '0'),
    font: 'Roboto',
    fontSize: 10,
    bold: true,
    color: SALES.qty,
    alignment: 'center',
    fillColor: fill || null,
    margin: [2, 3, 2, 3]
  };
}

function srSummaryTreeHeaderCells() {
  return [
    srTh('المبلغ الإجمالي'),
    srTh('إجمالي الهدايا'),
    srTh('العدد (مبيعات)'),
    srTh('الشجرة')
  ];
}

/** رأس ملخص مبسّط — يسار←يمين: المبلغ · العدد · البند */
function srGrandSummaryHeaderCells() {
  return [
    srTh('المبلغ', '#334155'),
    srTh('العدد', '#334155'),
    srTh('البند', '#334155')
  ];
}

/** صف ملخص إجمالي — بدون عمود الهدايا */
function srGrandSummaryDataCells(label, qty, amount, fill, amountColor) {
  return [
    srMoneyCell(fmtSummaryAmount(amount), fill, amountColor || SALES.debit),
    srSummaryCountCell(fmtSummaryQty(qty), fill),
    {
      text: label,
      bold: true,
      fontSize: 9.5,
      color: SALES.ink,
      alignment: 'right',
      fillColor: fill,
      margin: [8, 7, 8, 7]
    }
  ];
}

/** صف شجرة — يسار←يمين: المبلغ · الهدايا · العدد · الشجرة (الاسم يمين) */
function srSummaryTreeCells(title, qty, bonus, amount, fill) {
  return [
    srMoneyCell(fmtSummaryAmount(amount), fill, SALES.debit),
    srCell(fmtSummaryQty(bonus), 'srTd', 'center', fill),
    srSummaryCountCell(fmtSummaryQty(qty), fill),
    { text: title, style: 'srName', alignment: 'right', fillColor: fill, margin: [6, 6, 6, 6] }
  ];
}

function salesRptHeaderRow() {
  return [
    srTh('الإجمالي'),
    srTh('السعر'),
    srTh('الكمية'),
    srTh('المادة'),
    srTh('الباركود'),
    srTh('التاريخ')
  ];
}

function srMoneyCell(value, fill, color) {
  return { text: value, style: 'srMoney', color: color || undefined, alignment: 'center', noWrap: true, fillColor: fill || null, margin: [2, 3.5, 2, 3.5] };
}

const SR_GIFT_FILL = '#fef9c3';
const SR_RETURN_FILL = '#fee2e2';
const SR_GIFT_TEXT = '#92400e';
const SR_RETURN_TEXT = '#b91c1c';

function salesRptLineRow(line, rowIndex) {
  // هدية = أصفر، مردود = أحمر، غير ذلك = تخطيط متناوب
  const isGift = !!line.isGift;
  const isReturn = !isGift && !!line.isReturn;
  const fill = isGift ? SR_GIFT_FILL : (isReturn ? SR_RETURN_FILL : (rowIndex % 2 === 0 ? '#ffffff' : SR.zebra));
  const txt = isGift ? SR_GIFT_TEXT : (isReturn ? SR_RETURN_TEXT : null);
  const barcode = String(line.barcode || '').replace(/\s+/g, '') || '—';
  return [
    srMoneyCell(fmtInvPrice(line.lineTotal), fill, txt || undefined),
    srMoneyCell(fmtInvPrice(line.unitPrice), fill, txt || undefined),
    srCell(fmtQtyInt(line.quant), 'srTd', 'center', fill, txt),
    srCell(line.matName || '—', 'srName', 'right', fill, txt),
    srCell(barcode, 'srCode', 'center', fill, txt),
    { text: fmtDate(line.date), style: 'srDate', color: txt || undefined, alignment: 'center', noWrap: true, fillColor: fill, margin: [2, 3.5, 2, 3.5] }
  ];
}

// صف عنوان الشجرة — شريط أنيق يتكرر أعلى كل صفحة
function salesRptTreeTitleRow(treeTitle, lineCount) {
  const countText = lineCount != null ? `   ·   ${lineCount} حركة` : '';
  return [
    {
      text: [
        { text: 'شجرة: ', color: '#99f6e4', bold: true, fontSize: 9 },
        { text: treeTitle, color: '#ffffff', bold: true, fontSize: 11 },
        { text: countText, color: '#e2e8f0', fontSize: 8.5 }
      ],
      colSpan: 6,
      fillColor: SALES.head,
      alignment: 'right',
      margin: [12, 8, 12, 8]
    },
    emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()
  ];
}

// دليل ألوان: هدية · مردود · إجمالي الشجرة
function salesRptLegendChip(label, fill, textColor, borderColor) {
  return {
    table: {
      widths: ['*', 18],
      body: [[
        {
          text: label,
          bold: true,
          fontSize: 9,
          color: textColor,
          alignment: 'right',
          fillColor: '#ffffff',
          margin: [10, 8, 4, 8]
        },
        {
          text: '',
          fillColor: fill,
          margin: [0, 5, 0, 5]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => borderColor,
      vLineColor: () => borderColor,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    }
  };
}

function salesRptLegend() {
  const chips = [
    salesRptLegendChip('هدية', SR_GIFT_FILL, SR_GIFT_TEXT, '#fbbf24'),
    salesRptLegendChip('مردود', SR_RETURN_FILL, SR_RETURN_TEXT, '#f87171'),
    salesRptLegendChip('إجمالي الشجرة', '#ffffff', SALES.debit, SALES.debit)
  ];

  return {
    table: {
      widths: ['*'],
      body: [
        [{
          text: 'دليل الألوان',
          bold: true,
          fontSize: 10,
          color: SALES.ink,
          alignment: 'right',
          fillColor: SALES.surface,
          margin: [12, 8, 12, 6]
        }],
        [{
          columns: [
            { width: '*', stack: [chips[0]] },
            { width: 10, text: '' },
            { width: '*', stack: [chips[1]] },
            { width: 10, text: '' },
            { width: '*', stack: [chips[2]] }
          ],
          fillColor: SALES.surface,
          margin: [10, 0, 10, 10]
        }]
      ]
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.65 : 0),
      vLineWidth: () => 0.65,
      hLineColor: () => SALES.lineStrong,
      vLineColor: () => SALES.lineStrong,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    },
    margin: [0, 0, 0, 12]
  };
}

function salesTreeSeparator() {
  return {
    stack: [
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 567, y2: 0, lineWidth: 1.2, lineColor: SALES.lineStrong }],
        margin: [0, 6, 0, 0]
      },
      {
        table: {
          widths: ['*'],
          body: [[{ text: '', fillColor: SALES.surface, margin: [0, 2, 0, 2] }]]
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 0]
      }
    ],
    margin: [0, 10, 0, 12]
  };
}

// كتلة شجرة مستقلة: عنوان + رأس أعمدة (يتكرران بالصفحات) + الحركات + إجمالي، مع مسافة أسفلها
function salesRptTreeBlock(section) {
  const tree = section.tree || {};
  const lines = section.lines || [];
  const summary = section.summary || {};
  const treeTitle = [tree.num, tree.name1].filter(Boolean).join(' — ') || tree.seq || '—';

  const body = [
    salesRptTreeTitleRow(treeTitle, lines.length),
    salesRptHeaderRow()
  ];

  if (!lines.length) {
    body.push(salesRptNoticeRow('لا توجد حركات في هذه الفترة'));
  } else {
    lines.forEach((line, i) => body.push(salesRptLineRow(line, i)));
    body.push(salesRptTreeTotalsRow(summary));
  }

  return {
    table: {
      headerRows: 2,
      widths: SALES_RPT_WIDTHS,
      body,
      dontBreakRows: false
    },
    layout: srTreeTableLayout(),
    margin: [0, 0, 0, 6]
  };
}

function salesRptNoticeRow(text) {
  return [
    {
      text,
      colSpan: 6,
      fontSize: 8.5,
      bold: true,
      color: C.muted,
      alignment: 'center',
      fillColor: '#ffffff',
      margin: [4, 6, 4, 6]
    },
    emptyCell(), emptyCell(), emptyCell(), emptyCell(), emptyCell()
  ];
}

const SR_TOTAL_FILL = '#ffffff';

function salesRptTreeTotalsRow(summary) {
  const fill = SR_TOTAL_FILL;
  const red = SALES.debit;
  const moneyTotal = {
    text: fmtInvPrice(summary.netAmount),
    style: 'srTotalMoney',
    color: red,
    alignment: 'center',
    noWrap: true,
    fillColor: fill,
    margin: [2, 7, 2, 7]
  };
  const qtyTotal = {
    text: fmtNum(summary.qtySum || 0, 0),
    style: 'srTotalQty',
    color: red,
    alignment: 'center',
    noWrap: true,
    fillColor: fill,
    margin: [2, 7, 2, 7]
  };
  return [
    moneyTotal,
    { text: '', fillColor: fill },
    qtyTotal,
    {
      text: 'إجمالي الشجرة',
      bold: true,
      fontSize: 10.5,
      color: SALES.totalLabel,
      alignment: 'right',
      fillColor: fill,
      colSpan: 3,
      margin: [6, 7, 6, 7]
    },
    emptyCell(),
    emptyCell()
  ];
}


function fmtSummaryQty(v) {
  return fmtNum(Math.round(Number(v) || 0), 0);
}

function fmtSummaryBonus(v) {
  return fmtNum(Number(v) || 0, 2);
}

function fmtSummaryAmount(v) {
  return fmtNum(Math.round(Number(v) || 0), 0);
}

function aggregateReportCategories(report) {
  const empty = () => ({ qty: 0, bonus: 0, amount: 0 });
  // الملخص الإجمالي = كل مواد الفروع المحددة (مطابق للإداري)، وإلا مجموع الشجرات المختارة
  const sysCats = report.systemSummary?.categories;
  if (sysCats?.sales) return sysCats;
  const cats = report.grandSummary?.categories;
  if (cats?.sales) return cats;

  const out = { sales: empty(), gifts: empty(), returns: empty() };
  for (const section of report.sections || []) {
    for (const line of section.lines || []) {
      const quant = Number(line.quant || 0);
      const bonus = Number(line.bonus || 0);
      const price = Number(line.unitPrice || line.price || 0);
      const lineTotal = Math.abs(Number(line.lineTotal || 0));

      if (line.isReturn) {
        out.returns.qty += quant;
        out.returns.bonus += bonus;
        out.returns.amount += lineTotal;
      } else if (quant > 0) {
        out.sales.qty += quant;
        out.sales.bonus += bonus;
        out.sales.amount += Number(line.lineTotal || 0);
      } else if (bonus > 0) {
        out.gifts.bonus += bonus;
        out.gifts.amount += lineTotal || Math.round(bonus * price);
      }
    }
  }
  return out;
}

function salesStatPill(label, value, accent) {
  return {
    stack: [
      { text: label, fontSize: 7.5, bold: true, color: SALES.muted, alignment: 'center' },
      {
        text: value,
        font: 'Roboto',
        bold: true,
        fontSize: 11,
        color: accent || SALES.ink,
        alignment: 'center',
        margin: [0, 4, 0, 0]
      }
    ],
    fillColor: '#ffffff',
    margin: [6, 8, 6, 8]
  };
}

function salesReportPdfHeader(report) {
  const logo = getLogoDataUrl();
  const period = report.period || {};
  const periodText = period.dateFrom && period.dateTo
    ? `الفترة: ${fmtDate(period.dateFrom)} → ${fmtDate(period.dateTo)}`
    : '';
  const filterBits = [];
  if (report.filters?.includeSales !== false) filterBits.push('مبيعات');
  if (report.filters?.includeReturns !== false) filterBits.push('مرتجعات');
  if (report.filters?.onlyGifts) filterBits.push('هدايا فقط');
  const branchCount = (report.filters?.branches || []).length;
  const filterText = filterBits.join(' · ') || 'جميع الحركات';
  const metaBits = [filterText];
  if (branchCount) metaBits.push(`${branchCount} فرع`);
  metaBits.push(`${report.sections?.length || 0} شجرة`);
  const cats = aggregateReportCategories(report);

  const headerBand = {
    table: {
      widths: ['*', logo ? 44 : 0],
      body: [[
        {
          stack: [
            { text: COMPANY_NAME, fontSize: 8.5, bold: true, color: '#cbd5e1', alignment: 'right' },
            {
              text: 'تقرير مبيعات — شجرات المواد',
              fontSize: 14,
              bold: true,
              color: SALES.headText,
              alignment: 'right',
              margin: [0, 3, 0, 0]
            }
          ],
          fillColor: SALES.head,
          margin: [14, 11, 14, 11]
        },
        logo
          ? { image: logo, width: 30, alignment: 'center', margin: [6, 10, 10, 10], fillColor: SALES.head }
          : { text: '', border: [false, false, false, false] }
      ]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 0]
  };

  const infoStrip = {
    table: {
      widths: ['*'],
      body: [[
        {
          stack: [
            ...(periodText ? [{ text: periodText, fontSize: 9, bold: true, color: SALES.muted, alignment: 'right' }] : []),
            { text: metaBits.join('   ·   '), fontSize: 8.5, bold: true, color: SALES.muted, alignment: 'right', margin: [0, 3, 0, 0] }
          ],
          fillColor: SALES.surface,
          margin: [12, 9, 12, 9]
        }
      ]]
    },
    layout: {
      hLineWidth: () => 0.55,
      vLineWidth: () => 0.55,
      hLineColor: () => SALES.lineStrong,
      vLineColor: () => SALES.lineStrong
    },
    margin: [0, 0, 0, 10]
  };

  const statsBlock = {
    table: {
      widths: ['*', '*', '*', '*'],
      body: [[
        salesStatPill('مبيعات', fmtSummaryAmount(cats.sales?.amount || 0), SALES.debit),
        salesStatPill('هدايا', fmtSummaryQty(cats.gifts?.bonus || 0), '#b45309'),
        salesStatPill('مردود', fmtSummaryAmount(cats.returns?.amount || 0), SALES.credit),
        salesStatPill('صافي', fmtSummaryAmount(
          Number(cats.sales?.amount || 0) - Number(cats.returns?.amount || 0)
        ), SALES.headAlt)
      ]]
    },
    layout: {
      hLineWidth: () => 0.55,
      vLineWidth: () => 0.55,
      hLineColor: () => SALES.lineStrong,
      vLineColor: () => SALES.lineStrong
    },
    margin: [0, 0, 0, 14]
  };

  return { stack: [headerBand, infoStrip, statsBlock] };
}

function treeSummaryMetrics(section) {
  const tree = section.tree || {};
  const summary = section.summary || {};
  const cats = summary.categories || {};
  const title = [tree.num, tree.name1].filter(Boolean).join(' — ') || tree.seq || '—';
  return {
    title,
    salesQty: Number(cats.sales?.qty ?? summary.qtySum ?? 0),
    giftsBonus: Number(cats.gifts?.bonus ?? summary.bonusSum ?? 0),
    amount: Number(cats.sales?.amount ?? summary.salesAmount ?? summary.netAmount ?? 0)
  };
}

function salesGrandSummaryBlock(report) {
  const cats = aggregateReportCategories(report);

  const body = [
    srGrandSummaryHeaderCells(),
    srGrandSummaryDataCells('مبيعات', cats.sales?.qty, cats.sales?.amount, SALES.summarySales, SALES.debit),
    srGrandSummaryDataCells('هدايا', cats.gifts?.bonus, cats.gifts?.amount, SALES.summaryGifts, '#b45309'),
    srGrandSummaryDataCells('مردود', cats.returns?.qty, cats.returns?.amount, SALES.summaryReturns, SALES.credit)
  ];

  return {
    stack: [
      {
        text: 'الملخص الإجمالي',
        bold: true,
        fontSize: 11,
        color: SALES.head,
        alignment: 'right',
        margin: [0, 0, 0, 5]
      },
      {
        table: {
          headerRows: 1,
          widths: SR_GRAND_WIDTHS,
          body,
          dontBreakRows: true
        },
        layout: srGrandSummaryLayout()
      }
    ],
    margin: [0, 0, 0, 14]
  };
}

/** جدول ملخص الشجرات المحددة — قبل تفاصيل كل شجرة */
function salesTreesSummaryBlock(report) {
  const sections = report.sections || [];
  if (!sections.length) return null;

  const rows = sections.map((s) => treeSummaryMetrics(s));
  const totals = rows.reduce(
    (acc, r) => {
      acc.salesQty += r.salesQty;
      acc.giftsBonus += r.giftsBonus;
      acc.amount += r.amount;
      return acc;
    },
    { salesQty: 0, giftsBonus: 0, amount: 0 }
  );

  const headerRow = srSummaryTreeHeaderCells();

  const body = [headerRow];
  rows.forEach((r, i) => {
    const fill = i % 2 === 0 ? '#ffffff' : SALES.zebra;
    body.push(srSummaryTreeCells(r.title, r.salesQty, r.giftsBonus, r.amount, fill));
  });

  body.push([
    srMoneyCell(fmtSummaryAmount(totals.amount), SALES.total, SALES.debit),
    srCell(fmtSummaryQty(totals.giftsBonus), 'srTd', 'center', SALES.total),
    srSummaryCountCell(fmtSummaryQty(totals.salesQty), SALES.total),
    {
      text: 'المجموع',
      bold: true,
      fontSize: 10.5,
      color: SALES.totalLabel,
      alignment: 'right',
      fillColor: SALES.total,
      margin: [6, 7, 6, 7]
    }
  ]);

  return {
    stack: [
      {
        text: 'ملخص الشجرات المحددة',
        bold: true,
        fontSize: 11.5,
        color: SALES.ink,
        alignment: 'right',
        margin: [0, 0, 0, 6]
      },
      {
        table: {
          headerRows: 1,
          widths: SR_TREES_WIDTHS,
          body,
          dontBreakRows: true
        },
        layout: srSummaryLayout()
      }
    ],
    margin: [0, 0, 0, 16]
  };
}

async function buildTreeSalesReportPdf(report) {
  const content = [
    salesReportPdfHeader(report),
    salesGrandSummaryBlock(report),
    salesTreesSummaryBlock(report),
    salesRptLegend()
  ].filter(Boolean);

  const sections = report.sections || [];
  if (sections.length) {
    content.push({
      text: 'تفاصيل الشجرات',
      bold: true,
      fontSize: 12,
      color: SALES.head,
      alignment: 'right',
      margin: [0, 4, 0, 10]
    });
  }

  sections.forEach((section, index) => {
    if (index > 0) content.push(salesTreeSeparator());
    content.push(salesRptTreeBlock(section));
  });

  return createPdfBuffer({
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 8, bold: false, color: SALES.ink },
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [14, 14, 14, 22],
    styles: STYLES,
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: COMPANY_NAME, fontSize: 7, color: SALES.muted, alignment: 'right' },
        { text: `${currentPage} / ${pageCount}`, font: 'Roboto', fontSize: 7, color: SALES.muted, alignment: 'left' }
      ],
      margin: [12, 0, 12, 0]
    }),
    content
  });
}

module.exports = {
  buildStatementPdf,
  buildAccountStatementsPdf,
  buildInvoicePdf,
  buildOrderPdf,
  buildTreeSalesReportPdf,
  orderToExportData,
  COMPANY_NAME
};

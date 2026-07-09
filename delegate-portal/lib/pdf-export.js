const fs = require('fs');
const path = require('path');
const pdfmake = require('@digicole/pdfmake-rtl');

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
  srTh: { fontSize: 11.5, bold: true, color: '#ffffff' },
  srTd: { fontSize: 11, bold: true, color: '#0f172a' },
  srName: { fontSize: 11, bold: true, color: '#0f172a' },
  srMoney: { fontSize: 12, font: 'Roboto', bold: true, color: '#0f172a' },
  srDate: { fontSize: 10, font: 'Roboto', bold: true, color: '#1e293b' },
  srCode: { fontSize: 10, font: 'Roboto', bold: true, color: '#334155' },
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
  head: '#115e59',
  headText: '#ffffff',
  accent: '#0f766e',
  debit: '#dc2626',
  credit: '#15803d',
  opening: '#f0fdfa',
  zebra: '#f8fafc',
  total: '#f0fdfa',
  final: '#ecfdf5'
};
/**
 * ترتيب الكتابة في المصفوفة (قبل عكس pdfmake-rtl):
 * مدين → دائن → البيان → التاريخ
 * مع rtl:true على الجدول يُعكس مرة واحدة دائماً → مدين يمين
 */
const STMT_WIDTHS = [82, 82, '*', 72];
const STMT_COL_COUNT = 4;
/** أحجام خطوط كشف الصناديق — أوضح للقراءة والطباعة */
const STMT_FONT = {
  th: 13,
  money: 16,
  moneyEmpty: 12,
  desc: 15,
  date: 13,
  totalMoney: 17,
  totalLabel: 16,
  title: 15,
  period: 13,
  notice: 13
};
/** Cairo-Bold أوضح من Roboto-Medium للنصوص والأرقام */
const STMT_TEXT_FONT = 'Cairo';
const STMT_PAGE_WIDTH = 595.28;
const STMT_PAGE_HEIGHT = 841.89;
/** pdfmake حد أقصى تقريبي لارتفاع الصفحة (نقطة) */
const STMT_MAX_PAGE_HEIGHT = 14000;
const STMT_RED = '#dc2626';
const INV_WIDTHS = [42, 34, 20, 22, '*', 58, 11];

let logoImageCache;
function getLogoImage() {
  if (logoImageCache !== undefined) return logoImageCache;
  const abs = path.resolve(LOGO_PATH);
  logoImageCache = fs.existsSync(abs) ? abs : null;
  return logoImageCache;
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
  const { parseEdariDate } = require('./statement-utils');
  const d = parseEdariDate(String(v).replace(' 00:00:00', ''));
  if (!d || Number.isNaN(d.getTime())) return String(v).slice(0, 10);
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
  const logo = getLogoImage();
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
      if (i === 0) return 0;
      if (i === 1) return 0.55;
      if (i === n) return 2;
      return 0.15;
    },
    vLineWidth: () => 0.15,
    hLineColor: (i, node) => {
      const n = node?.table?.body?.length || 0;
      if (i === n) return STMT_RED;
      if (i === 1) return STMT.lineStrong;
      return STMT.line;
    },
    vLineColor: () => STMT.line,
    paddingLeft: () => 5,
    paddingRight: () => 5,
    paddingTop: () => 5,
    paddingBottom: () => 5
  };
}

function stmtTh(text, opts = {}) {
  return {
    text,
    font: STMT_TEXT_FONT,
    bold: true,
    fontSize: opts.fontSize || STMT_FONT.th,
    color: opts.color || STMT.headText,
    fillColor: opts.fill || STMT.head,
    alignment: 'center',
    margin: [4, 8, 4, 8]
  };
}

function stmtTdMoney(value, fill, color, opts = {}) {
  const empty = !value || value === '—';
  const fontSize = opts.fontSize || (empty ? STMT_FONT.moneyEmpty : STMT_FONT.money);
  return {
    text: String(value ?? '—'),
    font: STMT_TEXT_FONT,
    fontSize,
    bold: true,
    color: color || (empty ? STMT.muted : STMT.ink),
    alignment: 'center',
    fillColor: fill || null,
    noWrap: true,
    margin: [4, 9, 4, 9]
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
    stmtTh('التاريخ')
  ];
}

function stmtTdDesc(text, fill, opts = {}) {
  const cell = {
    text: String(text ?? '—'),
    font: STMT_TEXT_FONT,
    fontSize: opts.fontSize || STMT_FONT.desc,
    bold: true,
    color: STMT.ink,
    alignment: 'right',
    fillColor: fill || null,
    margin: opts.margin || [8, 10, 8, 10]
  };
  if (opts.colSpan) cell.colSpan = opts.colSpan;
  return cell;
}

function stmtLineRow(row, rowIndex) {
  const fill = stmtRowFill(rowIndex, row.isOpening || row.isReconciliation);
  const dateText = row.isOpening ? '' : fmtDate(row.date);
  return [
    stmtTdMoney(row.debit ? fmtNum(row.debit) : '—', fill, row.debit ? STMT.debit : null),
    stmtTdMoney(row.credit ? fmtNum(row.credit) : '—', fill, row.credit ? STMT.ink : null),
    stmtTdDesc(row.description || '—', fill),
    {
      text: dateText,
      font: STMT_TEXT_FONT,
      fontSize: STMT_FONT.date,
      bold: true,
      color: STMT.muted,
      alignment: 'center',
      fillColor: fill || null,
      noWrap: true,
      margin: [4, 7, 4, 7]
    }
  ];
}

function emptyCell() {
  return { text: '' };
}

function stmtTotalsTableRow(stmt) {
  const fill = STMT.total;
  return [
    stmtTdMoney(fmtNum(stmt.totalDebit), fill, STMT.debit, { fontSize: STMT_FONT.totalMoney }),
    stmtTdMoney(fmtNum(stmt.totalCredit), fill, STMT.ink, { fontSize: STMT_FONT.totalMoney }),
    stmtTdDesc('المجموع', fill, { fontSize: STMT_FONT.totalLabel, colSpan: 2, margin: [8, 11, 8, 11] }),
    emptyCell()
  ];
}

function stmtFinalTableRow(stmt) {
  const summary = stmt.summary || {};
  const fill = STMT.final;
  const debitAmt = summary.side === 'debit' ? fmtNum(summary.amount) : '—';
  const creditAmt = summary.side === 'credit' ? fmtNum(summary.amount) : '—';
  return [
    stmtTdMoney(debitAmt, fill, summary.side === 'debit' ? STMT.debit : null, { fontSize: STMT_FONT.totalMoney }),
    stmtTdMoney(creditAmt, fill, summary.side === 'credit' ? STMT.ink : null, { fontSize: STMT_FONT.totalMoney }),
    stmtTdDesc(summary.label || 'الرصيد النهائي', fill, { fontSize: STMT_FONT.totalLabel, colSpan: 2, margin: [8, 11, 8, 11] }),
    emptyCell()
  ];
}

function stmtPeriodText(stmt, meta = {}) {
  const periodStart = stmt.periodStart || meta.period?.dateFrom;
  const periodEnd = stmt.periodEnd || meta.period?.dateTo;
  const start = periodStart ? fmtDate(periodStart) : null;
  const end = periodEnd ? fmtDate(periodEnd) : null;
  if (start && end) return start === end ? start : `${start}  →  ${end}`;
  if (start) return `من ${start}`;
  if (end) return `إلى ${end}`;
  return fmtDate(new Date());
}

function stmtSpanRow(text, opts = {}) {
  const pad = STMT_COL_COUNT - 1;
  return [
    {
      text,
      font: STMT_TEXT_FONT,
      colSpan: STMT_COL_COUNT,
      bold: opts.bold !== false,
      fontSize: opts.fontSize || 13,
      color: opts.color || STMT.headText,
      fillColor: opts.fill || STMT.head,
      alignment: 'center',
      margin: opts.margin || [10, 9, 10, 9]
    },
    ...Array(pad).fill(null).map(() => emptyCell())
  ];
}

/** صف عنوان الصندوق + الفترة — شريط أخضر واحد، نص في الوسط */
function stmtBoxTitleRow(acc, periodText) {
  const num = acc.num ? String(acc.num) : '—';
  const name = acc.name1 ? String(acc.name1).trim() : '';
  const title = name ? `${num} — ${name}` : num;
  const label = periodText ? `${title}   ·   ${periodText}` : title;
  return stmtSpanRow(label, {
    fontSize: STMT_FONT.title,
    margin: [10, 8, 10, 8]
  });
}

/** فاصل رفيع بين صناديق متعددة داخل جدول واحد */
function stmtAccountGapRow() {
  const pad = STMT_COL_COUNT - 1;
  return [
    {
      colSpan: STMT_COL_COUNT,
      canvas: [{
        type: 'line',
        x1: 20,
        y1: 3,
        x2: STMT_PAGE_WIDTH - 48,
        y2: 3,
        lineWidth: 1.5,
        lineColor: STMT_RED
      }],
      margin: [0, 4, 0, 2]
    },
    ...Array(pad).fill(null).map(() => emptyCell())
  ];
}

/** صفوف جدول كشف حساب واحد (بدون غلاف) */
function statementTableBody(stmt, meta = {}) {
  const acc = stmt.account || {};
  const lines = stmt.lines || [];
  const periodText = stmtPeriodText(stmt, meta);

  if (lines.length) {
    return [
      stmtBoxTitleRow(acc, periodText),
      stmtHeaderRow(),
      ...lines.map((row, i) => stmtLineRow(row, i)),
      stmtTotalsTableRow(stmt),
      stmtFinalTableRow(stmt)
    ];
  }

  return [
    stmtBoxTitleRow(acc, periodText),
    stmtHeaderRow(),
    stmtSpanRow('لا توجد حركات لهذا الحساب في الفترة المحددة', {
      fontSize: STMT_FONT.notice,
      bold: true,
      color: STMT.muted,
      fill: '#ffffff',
      margin: [0, 10, 0, 10]
    }),
    stmtTotalsTableRow(stmt),
    stmtFinalTableRow(stmt)
  ];
}

/** غلاف جدول كشف الحساب — rtl:true يفرض معالجة موحّدة لكل الصناديق */
function stmtTableBlock(body, opts = {}) {
  return {
    rtl: true,
    table: {
      rtl: true,
      headerRows: opts.headerRows ?? 2,
      widths: STMT_WIDTHS,
      body,
      dontBreakRows: opts.dontBreakRows !== false
    },
    layout: stmtTableLayout()
  };
}

function stmtRedDivider() {
  return {
    canvas: [{
      type: 'line',
      x1: 14,
      y1: 0,
      x2: STMT_PAGE_WIDTH - 28,
      y2: 0,
      lineWidth: 2,
      lineColor: STMT_RED
    }],
    margin: [0, 14, 0, 6]
  };
}

function statementBlockContent(stmt, meta = {}) {
  return stmtTableBlock(statementTableBody(stmt, meta));
}

function estimateStatementsPageHeight(statements) {
  const margins = 28;
  const footer = 16;
  let body = 0;
  for (let i = 0; i < statements.length; i += 1) {
    if (i > 0) body += 8;
    const lineCount = Math.max(statements[i].lines?.length || 0, 1);
    body += 44 + 36 + lineCount * 43 + 38 + 42;
  }
  return Math.min(Math.ceil((margins + footer + body) * 1.55) + 80, STMT_MAX_PAGE_HEIGHT);
}

function stmtDocFooterRow() {
  return stmtSpanRow(COMPANY_NAME, {
    fontSize: 7,
    bold: true,
    color: STMT.muted,
    fill: '#ffffff',
    margin: [0, 4, 0, 0]
  });
}

function statementsContinuousDoc(statements, meta = {}) {
  const list = (statements || []).filter(Boolean);
  if (!list.length) {
    return {
      rtl: true,
      pageSize: { width: STMT_PAGE_WIDTH, height: STMT_PAGE_HEIGHT },
      pageMargins: [14, 14, 14, 14],
      content: [{
        text: 'لا توجد حسابات',
        fontSize: 10,
        color: STMT.muted,
        alignment: 'center',
        margin: [0, 20, 0, 0]
      }]
    };
  }

  const tableBody = [];
  list.forEach((stmt, i) => {
    if (i > 0) tableBody.push(stmtAccountGapRow());
    tableBody.push(...statementTableBody(stmt, meta));
  });
  tableBody.push(stmtDocFooterRow());

  const pageHeight = estimateStatementsPageHeight(list);
  const tall = Math.max(pageHeight, STMT_PAGE_WIDTH + 80);

  return {
    rtl: true,
    defaultStyle: { font: STMT_TEXT_FONT, fontSize: 9, bold: true, color: STMT.ink },
    // pdfmake-rtl يعكس width/height — نمرّرها معكوسة للحصول على صفحة عمودية طويلة
    pageSize: { width: tall, height: STMT_PAGE_WIDTH },
    pageOrientation: 'portrait',
    pageMargins: [14, 14, 14, 14],
    content: [stmtTableBlock(tableBody, { dontBreakRows: true, headerRows: 0 })]
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

async function buildStatementPdf(stmt, meta = {}) {
  if (!stmt) {
    return createPdfBuffer(statementsContinuousDoc([], meta));
  }
  return createPdfBuffer(statementsContinuousDoc([stmt], meta));
}

/** Multi-account statements — one continuous page, single table, tight gaps. */
async function buildAccountStatementsPdf(statements = [], meta = {}) {
  const list = (statements || []).filter(Boolean);
  return createPdfBuffer(statementsContinuousDoc(list, meta));
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

function srSimpleGridLayout() {
  return {
    hLineWidth: () => 0.55,
    vLineWidth: () => 0.55,
    hLineColor: () => SALES.line,
    vLineColor: () => SALES.line,
    paddingLeft: () => 8,
    paddingRight: () => 8,
    paddingTop: () => 8,
    paddingBottom: () => 8
  };
}

/** تخطيط أنيق للملخص الإجمالي — خطوط خفيفة */
function srGrandSummaryLayout() {
  return srSimpleGridLayout();
}

function srTh(text, fill = '#475569') {
  return {
    text,
    bold: true,
    fontSize: 10.5,
    color: '#ffffff',
    alignment: 'center',
    fillColor: fill,
    margin: [4, 8, 4, 8]
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

const SR_TREES_WIDTHS = [132, 96, 104, '*'];
const SR_GRAND_WIDTHS = [142, 104, '*'];

function srSummaryAmountCell(value, fill, isTotal = false) {
  return {
    text: String(value ?? '0'),
    font: 'Roboto',
    fontSize: isTotal ? 28 : 24,
    bold: true,
    color: SALES.ink,
    alignment: 'center',
    noWrap: true,
    fillColor: fill || null,
    margin: [4, 14, 4, 14]
  };
}

function srSummaryQtyCell(value, fill, isTotal = false) {
  return {
    text: String(value ?? '0'),
    font: 'Roboto',
    fontSize: isTotal ? 28 : 24,
    bold: true,
    color: SALES.debit,
    alignment: 'center',
    noWrap: true,
    fillColor: fill || null,
    margin: [4, 14, 4, 14]
  };
}

function srSummaryCountCell(value, fill) {
  return srSummaryQtyCell(value, fill, false);
}

function srSummaryTh(text, fill = '#334155') {
  return {
    text,
    bold: true,
    fontSize: 13.5,
    color: '#ffffff',
    alignment: 'center',
    fillColor: fill,
    margin: [4, 10, 4, 10]
  };
}

function srSummaryTreeHeaderCells() {
  return [
    srSummaryTh('المبلغ الإجمالي'),
    srSummaryTh('إجمالي الهدايا'),
    srSummaryTh('العدد (مبيعات)'),
    srSummaryTh('الشجرة')
  ];
}

function srGrandTh(text) {
  return {
    text,
    bold: true,
    fontSize: 14,
    color: '#ffffff',
    alignment: 'center',
    fillColor: '#334155',
    margin: [6, 11, 6, 11]
  };
}

/** رأس ملخص مبسّط — يسار←يمين: المبلغ · العدد · البند */
function srGrandSummaryHeaderCells() {
  return [
    srGrandTh('المبلغ'),
    srGrandTh('العدد'),
    srGrandTh('البند')
  ];
}

/** صف ملخص إجمالي — بدون عمود الهدايا */
function srGrandSummaryDataCells(label, qty, amount, fill) {
  return [
    {
      text: fmtSummaryAmount(amount),
      font: 'Roboto',
      bold: true,
      fontSize: 20,
      color: SALES.ink,
      alignment: 'center',
      noWrap: true,
      fillColor: fill,
      margin: [6, 14, 6, 14]
    },
    {
      text: fmtSummaryQty(qty),
      font: 'Roboto',
      bold: true,
      fontSize: 20,
      color: SALES.ink,
      alignment: 'center',
      noWrap: true,
      fillColor: fill,
      margin: [6, 14, 6, 14]
    },
    {
      text: label,
      bold: true,
      fontSize: 16,
      color: SALES.ink,
      alignment: 'right',
      fillColor: fill,
      margin: [12, 14, 12, 14]
    }
  ];
}

function srGrandSummaryNetRow(netAmount) {
  const fill = '#e2e8f0';
  return [
    {
      text: fmtSummaryAmount(netAmount),
      font: 'Roboto',
      bold: true,
      fontSize: 22,
      color: SALES.ink,
      alignment: 'center',
      noWrap: true,
      fillColor: fill,
      margin: [6, 16, 6, 16]
    },
    {
      text: '—',
      font: 'Roboto',
      bold: true,
      fontSize: 18,
      color: SALES.muted,
      alignment: 'center',
      fillColor: fill,
      margin: [6, 16, 6, 16]
    },
    {
      text: 'صافي',
      bold: true,
      fontSize: 20,
      color: SALES.ink,
      alignment: 'right',
      fillColor: fill,
      margin: [12, 18, 12, 18]
    }
  ];
}

/** صف شجرة — يسار←يمين: المبلغ · الهدايا · العدد · الشجرة (الاسم يمين) */
function srSummaryTreeCells(title, qty, bonus, amount, fill) {
  return [
    srSummaryAmountCell(fmtSummaryAmount(amount), fill),
    {
      text: fmtSummaryQty(bonus),
      font: 'Roboto',
      fontSize: 22,
      bold: true,
      color: SALES.ink,
      alignment: 'center',
      fillColor: fill,
      margin: [4, 14, 4, 14]
    },
    srSummaryQtyCell(fmtSummaryQty(qty), fill),
    {
      text: title,
      bold: true,
      fontSize: 16,
      color: SALES.ink,
      alignment: 'right',
      fillColor: fill,
      margin: [10, 13, 10, 13]
    }
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

function salesDetailsDivider() {
  return {
    stack: [
      {
        canvas: [
          { type: 'line', x1: 0, y1: 0, x2: 567, y2: 0, lineWidth: 2.2, lineColor: SALES.head },
          { type: 'line', x1: 0, y1: 5, x2: 567, y2: 5, lineWidth: 0.6, lineColor: SALES.lineStrong }
        ],
        margin: [0, 4, 0, 0]
      },
      {
        table: {
          widths: ['*'],
          body: [[{
            text: ' ',
            fillColor: '#f1f5f9',
            margin: [0, 10, 0, 10]
          }]]
        },
        layout: 'noBorders'
      }
    ],
    margin: [0, 10, 0, 6]
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

const SALES_PAGE_WIDTH = 595.28;
const SALES_KPI_PAGE_MARGINS = 28;
const SALES_KPI_CONTENT_WIDTH = SALES_PAGE_WIDTH - SALES_KPI_PAGE_MARGINS;
const KPI_CARD_GAP = 6;
const KPI_CARD_WIDTH = Math.floor((SALES_KPI_CONTENT_WIDTH - KPI_CARD_GAP * 3) / 4);
const KPI_CARD = {
  width: KPI_CARD_WIDTH,
  height: 102,
  radius: 12,
  padH: 13,
  padV: 13,
  labelSize: 12,
  valueSize: 20,
  subSize: 10,
  labelColor: '#f1f5f9',
  subColor: '#e2e8f0',
};
const KPI_COLORS = {
  sales: '#0f766e',
  gifts: '#c2410c',
  returns: '#be123c',
  net: '#0f172a',
};

function reportLineCount(report) {
  const grand = report.grandSummary?.lineCount;
  if (grand != null) return Number(grand) || 0;
  return (report.sections || []).reduce((n, s) => n + (s.lines?.length || 0), 0);
}

function salesKpiGapCell() {
  return { text: '', border: [false, false, false, false] };
}

function salesKpiCardCell({ label, value, sub, color }) {
  const w = KPI_CARD.width;
  const h = KPI_CARD.height;
  return {
    stack: [
      {
        canvas: [{
          type: 'rect',
          x: 0,
          y: 0,
          w,
          h,
          r: KPI_CARD.radius,
          color,
        }],
      },
      {
        stack: [
          {
            text: label,
            fontSize: KPI_CARD.labelSize,
            bold: true,
            color: KPI_CARD.labelColor,
            alignment: 'right',
            lineHeight: 1.1,
          },
          {
            text: value,
            font: 'Roboto',
            bold: true,
            fontSize: KPI_CARD.valueSize,
            color: '#ffffff',
            alignment: 'right',
            lineHeight: 1,
            characterSpacing: -0.15,
            margin: [0, 9, 0, 0],
          },
          {
            text: sub,
            fontSize: KPI_CARD.subSize,
            color: KPI_CARD.subColor,
            alignment: 'right',
            lineHeight: 1.15,
            margin: [0, 7, 0, 0],
          },
        ],
        margin: [KPI_CARD.padH, -h + KPI_CARD.padV, KPI_CARD.padH, 0],
      },
    ],
    border: [false, false, false, false],
  };
}

function salesKpiTableLayout() {
  return {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function salesKpiStatsBlock(report, cats) {
  const net = Number(cats.sales?.amount || 0) - Number(cats.returns?.amount || 0);
  const lineCount = reportLineCount(report);
  const treeCount = (report.sections || []).length;

  const items = [
    {
      label: 'صافي المبيعات',
      value: fmtSummaryAmount(net),
      sub: `${lineCount} بند · ${treeCount} شجرة`,
      color: KPI_COLORS.net,
    },
    {
      label: 'مردود',
      value: fmtSummaryAmount(cats.returns?.amount || 0),
      sub: `العدد ${fmtSummaryQty(cats.returns?.qty || 0)}`,
      color: KPI_COLORS.returns,
    },
    {
      label: 'هدايا',
      value: fmtSummaryAmount(cats.gifts?.amount || 0),
      sub: `العدد ${fmtSummaryQty(cats.gifts?.bonus || 0)}`,
      color: KPI_COLORS.gifts,
    },
    {
      label: 'مبيعات',
      value: fmtSummaryAmount(cats.sales?.amount || 0),
      sub: `العدد ${fmtSummaryQty(cats.sales?.qty || 0)}`,
      color: KPI_COLORS.sales,
    },
  ];

  const row = [];
  items.forEach((item, index) => {
    if (index > 0) row.push(salesKpiGapCell());
    row.push(salesKpiCardCell(item));
  });

  const w = KPI_CARD.width;
  const g = KPI_CARD_GAP;
  const widths = [w, g, w, g, w, g, w];

  return {
    table: {
      widths,
      heights: [KPI_CARD.height],
      body: [row],
    },
    layout: salesKpiTableLayout(),
    margin: [0, 4, 0, 20],
  };
}

function salesOverviewSection(report) {
  const cats = aggregateReportCategories(report);
  const netAmount = Number(cats.sales?.amount || 0) - Number(cats.returns?.amount || 0);

  const tableBody = [
    srGrandSummaryHeaderCells(),
    srGrandSummaryDataCells('مبيعات', cats.sales?.qty, cats.sales?.amount, '#ffffff'),
    srGrandSummaryDataCells('هدايا', cats.gifts?.bonus, cats.gifts?.amount, SALES.zebra),
    srGrandSummaryDataCells('مردود', cats.returns?.qty, cats.returns?.amount, '#ffffff'),
    srGrandSummaryNetRow(netAmount)
  ];

  return {
    stack: [
      salesKpiStatsBlock(report, cats),
      {
        text: 'الملخص الإجمالي',
        bold: true,
        fontSize: 18,
        color: SALES.ink,
        alignment: 'right',
        margin: [0, 2, 0, 10]
      },
      {
        table: {
          headerRows: 1,
          widths: SR_GRAND_WIDTHS,
          body: tableBody,
          dontBreakRows: true
        },
        layout: srGrandSummaryLayout()
      }
    ],
    margin: [0, 0, 0, 16]
  };
}

function salesReportPdfHeader(report, options = {}) {
  const logo = getLogoImage();
  const period = report.period || {};
  const periodText = period.dateFrom && period.dateTo
    ? `${fmtDate(period.dateFrom)}  —  ${fmtDate(period.dateTo)}`
    : '';
  const reportTitle = options.summaryOnly
    ? 'تقرير مبيعات — ملخص شجرات المواد'
    : 'تقرير مبيعات — شجرات المواد';
  const headerBand = {
    table: {
      widths: ['*', logo ? 44 : 0],
      body: [[
        {
          stack: [
            { text: COMPANY_NAME, fontSize: 8.5, bold: true, color: '#cbd5e1', alignment: 'right' },
            {
              text: reportTitle,
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

  const infoStrip = periodText ? {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: 'الفترة', fontSize: 10, bold: true, color: SALES.muted, alignment: 'center', margin: [0, 0, 0, 5] },
          { text: periodText, fontSize: 15, bold: true, color: SALES.head, alignment: 'center' }
        ],
        fillColor: '#f8fafc',
        margin: [12, 10, 12, 10]
      }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 14]
  } : null;

  return { stack: [headerBand, ...(infoStrip ? [infoStrip] : [])], margin: [0, 0, 0, 0] };
}

/** رأس مختصر يتكرر أعلى الصفحات التالية عند انقسام التقرير */
function salesReportContinuationHeader(report, options = {}) {
  const period = report.period || {};
  const periodText = period.dateFrom && period.dateTo
    ? `${fmtDate(period.dateFrom)} — ${fmtDate(period.dateTo)}`
    : '';
  const kind = options.summaryOnly ? 'ملخص شجرات المواد' : 'تفاصيل شجرات المواد';
  return {
    table: {
      widths: ['*'],
      body: [[{
        stack: [
          { text: COMPANY_NAME, fontSize: 8, bold: true, color: '#cbd5e1', alignment: 'right' },
          {
            text: [kind, periodText ? ` · ${periodText}` : ''].join(''),
            fontSize: 9,
            bold: true,
            color: '#ffffff',
            alignment: 'right',
            margin: [0, 2, 0, 0]
          }
        ],
        fillColor: SALES.head,
        margin: [12, 8, 12, 8]
      }]]
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 8]
  };
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
  return salesOverviewSection(report);
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
    srSummaryAmountCell(fmtSummaryAmount(totals.amount), SALES.total, true),
    {
      text: fmtSummaryQty(totals.giftsBonus),
      font: 'Roboto',
      fontSize: 20,
      bold: true,
      color: SALES.ink,
      alignment: 'center',
      fillColor: SALES.total,
      margin: [4, 16, 4, 16]
    },
    srSummaryQtyCell(fmtSummaryQty(totals.salesQty), SALES.total, true),
    {
      text: 'المجموع',
      bold: true,
      fontSize: 19,
      color: SALES.totalLabel,
      alignment: 'right',
      fillColor: SALES.total,
      margin: [10, 14, 10, 14]
    }
  ]);

  return {
    stack: [
      {
        text: 'ملخص الشجرات المحددة',
        bold: true,
        fontSize: 19,
        color: SALES.ink,
        alignment: 'right',
        margin: [0, 0, 0, 10]
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

const SALES_PAGE_HEIGHT = 841.89;
/** pdfmake حد أقصى تقريبي لارتفاع الصفحة (نقطة) */
const SALES_MAX_PAGE_HEIGHT = 14000;

function estimateSalesReportHeight(report) {
  const sections = report.sections || [];
  const margins = 64;
  const footer = 24;
  let body = 0;
  body += 110; // رأس + شريط الفترة
  body += 340; // بطاقات KPI
  body += 300; // الملخص الإجمالي
  if (sections.length) body += 70 + sections.length * 54 + 64; // ملخص الشجرات
  if (sections.length) body += 44; // فاصل + عنوان التفاصيل
  sections.forEach((section, index) => {
    if (index > 0) body += 22;
    body += 56; // عنوان الشجرة + رأس الأعمدة
    const lineCount = section.lines?.length || 0;
    body += Math.max(lineCount, 1) * 30;
    if (lineCount) body += 34;
    body += 14;
  });
  return Math.min(
    Math.ceil((margins + footer + body) * 1.55 + 160),
    SALES_MAX_PAGE_HEIGHT
  );
}

function estimateSalesReportSummaryHeight(report) {
  const sections = report.sections || [];
  const margins = 64;
  const footer = 24;
  let body = 110 + 320 + 300;
  if (sections.length) body += 70 + sections.length * 54 + 64;
  return Math.min(
    Math.ceil((margins + footer + body) * 1.55 + 160),
    SALES_MAX_PAGE_HEIGHT
  );
}

function buildSalesReportContent(report, options = {}) {
  const preamble = [
    salesReportPdfHeader(report, options),
    salesGrandSummaryBlock(report),
    salesTreesSummaryBlock(report)
  ].filter(Boolean);

  const content = preamble.length
    ? [{ unbreakable: true, stack: preamble, margin: [0, 0, 0, 0] }]
    : [];

  if (options.summaryOnly) return content;

  const sections = report.sections || [];
  if (sections.length) {
    content.push(salesDetailsDivider());
    content.push({
      text: 'تفاصيل الشجرات',
      bold: true,
      fontSize: 14,
      color: SALES.head,
      alignment: 'right',
      margin: [0, 0, 0, 12]
    });
  }

  sections.forEach((section, index) => {
    if (index > 0) content.push(salesTreeSeparator());
    content.push(salesRptTreeBlock(section));
  });

  return content;
}

function salesReportDocDefinition(content, pageSize, report, options = {}) {
  return {
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 8, bold: false, color: SALES.ink },
    pageSize,
    pageOrientation: 'portrait',
    pageMargins: [14, 42, 14, 26],
    styles: STYLES,
    header: (currentPage) => (
      currentPage > 1 ? salesReportContinuationHeader(report, options) : null
    ),
    footer: () => ({
      text: COMPANY_NAME,
      fontSize: 7,
      color: SALES.muted,
      alignment: 'center',
      margin: [12, 0, 12, 0]
    }),
    content
  };
}

async function createSingleLongPagePdf(report, options = {}) {
  const content = buildSalesReportContent(report, options);
  const pageHeight = options.summaryOnly
    ? estimateSalesReportSummaryHeight(report)
    : estimateSalesReportHeight(report);
  const tall = Math.max(pageHeight, SALES_PAGE_HEIGHT + 120);
  // pdfmake-rtl يعكس width/height — نمرّرها معكوسة للحصول على صفحة عمودية طويلة (مثل كشف الحساب)
  return createPdfBuffer(salesReportDocDefinition(content, {
    width: tall,
    height: SALES_PAGE_WIDTH
  }, report, options));
}

async function buildTreeSalesReportPdf(report) {
  return createSingleLongPagePdf(report);
}

async function buildTreeSalesReportSummaryPdf(report) {
  return createSingleLongPagePdf(report, { summaryOnly: true });
}

module.exports = {
  buildStatementPdf,
  buildAccountStatementsPdf,
  buildInvoicePdf,
  buildOrderPdf,
  buildTreeSalesReportPdf,
  buildTreeSalesReportSummaryPdf,
  orderToExportData,
  COMPANY_NAME
};

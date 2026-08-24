const db = require('./db');

const SETTING_KEY = 'delivery_receipt_print_template';

const FIELD_LABELS = {
  company: 'اسم الشركة',
  title: 'عنوان الوصل',
  deliveryNo: 'رقم الوصل',
  date: 'التاريخ',
  agent: 'المندوب',
  customer: 'الزبون',
  customerNum: 'رقم حساب الزبون',
  tree: 'الشجرة',
  amount: 'المبلغ',
  notes: 'ملاحظات'
};

const DEFAULT_TEMPLATE = {
  paperChars: 32,
  footerBlankLines: 3,
  lines: [
    { type: 'separator', char: '=', size: 2 },
    { type: 'field', field: 'company', align: 'center', size: 2, prefix: '', suffix: '' },
    { type: 'field', field: 'title', align: 'center', size: 2, prefix: '', suffix: '' },
    { type: 'separator', char: '=', size: 2 },
    { type: 'field', field: 'deliveryNo', align: 'left', size: 1, prefix: 'رقم: ', suffix: '' },
    { type: 'field', field: 'date', align: 'left', size: 1, prefix: 'التاريخ: ', suffix: '' },
    { type: 'field', field: 'agent', align: 'left', size: 1, prefix: 'المندوب: ', suffix: '' },
    { type: 'field', field: 'customer', align: 'left', size: 1, prefix: 'الزبون: ', suffix: '' },
    { type: 'field', field: 'amount', align: 'left', size: 2, prefix: 'المبلغ: ', suffix: '' },
    { type: 'separator', char: '-', size: 1 },
    { type: 'text', text: 'وصلني منكم المبلغ المذكور', align: 'center', size: 1 },
    { type: 'text', text: 'أعلاه نقداً / شيكاً', align: 'center', size: 1 },
    { type: 'field', field: 'notes', align: 'center', size: 1, prefix: '', suffix: '', hideIfEmpty: true },
    { type: 'separator', char: '=', size: 2 },
    { type: 'field', field: 'footer', align: 'center', size: 1, prefix: '', suffix: '' },
    { type: 'separator', char: '=', size: 2 }
  ],
  sample: {
    company: 'Edari',
    title: 'وصل استلام مبلغ',
    footer: 'شكراً لتعاملكم'
  }
};

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? String(row.value || '') : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value ?? ''));
}

function normalizeLine(line) {
  const type = String(line?.type || 'text');
  if (type === 'separator') {
    return {
      type: 'separator',
      char: String(line.char || '=').slice(0, 1) || '=',
      size: Number(line.size) === 2 ? 2 : 1
    };
  }
  if (type === 'blank') {
    return { type: 'blank', count: Math.min(Math.max(Number(line.count) || 1, 1), 5) };
  }
  if (type === 'field') {
    const field = String(line.field || 'title');
    if (!FIELD_LABELS[field] && field !== 'footer') return null;
    return {
      type: 'field',
      field,
      align: line.align === 'center' ? 'center' : 'left',
      size: Number(line.size) === 2 ? 2 : 1,
      prefix: String(line.prefix ?? ''),
      suffix: String(line.suffix ?? ''),
      hideIfEmpty: Boolean(line.hideIfEmpty)
    };
  }
  return {
    type: 'text',
    text: String(line.text || ''),
    align: line.align === 'center' ? 'center' : 'left',
    size: Number(line.size) === 2 ? 2 : 1
  };
}

function normalizeTemplate(raw) {
  const base = { ...DEFAULT_TEMPLATE };
  if (!raw || typeof raw !== 'object') return base;
  const lines = Array.isArray(raw.lines) ? raw.lines.map(normalizeLine).filter(Boolean) : base.lines;
  return {
    paperChars: Math.min(Math.max(Number(raw.paperChars) || 32, 24), 48),
    footerBlankLines: Math.min(Math.max(Number(raw.footerBlankLines) || 3, 0), 8),
    lines: lines.length ? lines : base.lines,
    sample: {
      company: String(raw.sample?.company || base.sample.company),
      title: String(raw.sample?.title || base.sample.title),
      footer: String(raw.sample?.footer || base.sample.footer)
    }
  };
}

function getDeliveryReceiptPrintTemplate() {
  try {
    const raw = JSON.parse(getSetting(SETTING_KEY, ''));
    return normalizeTemplate(raw);
  } catch {
    return normalizeTemplate(null);
  }
}

function saveDeliveryReceiptPrintTemplate(payload) {
  const template = normalizeTemplate(payload);
  setSetting(SETTING_KEY, JSON.stringify(template));
  return template;
}

function padLine(text, width, align) {
  const t = String(text ?? '');
  if (t.length >= width) return t.slice(0, width);
  if (align === 'center') {
    const left = Math.floor((width - t.length) / 2);
    return `${' '.repeat(left)}${t}`;
  }
  return t;
}

function repeatChar(char, width) {
  const c = String(char || '=').slice(0, 1) || '=';
  return c.repeat(width);
}

function fmtMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0';
  return `${Math.round(n).toLocaleString('en-US')} IQD`;
}

function resolveFieldValue(field, ctx) {
  switch (field) {
    case 'company':
      return ctx.company || 'Edari';
    case 'title':
      return ctx.title || 'وصل استلام مبلغ';
    case 'footer':
      return ctx.footer || 'شكراً لتعاملكم';
    case 'deliveryNo':
      return ctx.deliveryNo || '—';
    case 'date':
      return ctx.date || '—';
    case 'agent':
      return ctx.agent || 'مندوب';
    case 'customer':
      return ctx.customer || '—';
    case 'customerNum':
      return ctx.customerNum || '';
    case 'tree':
      return ctx.tree || '';
    case 'amount':
      return fmtMoney(ctx.amount);
    case 'notes':
      return String(ctx.notes || '').trim();
    default:
      return '';
  }
}

/**
 * Returns array of { text, size } for thermal printer.
 */
function buildDeliveryReceiptPrintLines(receipt, agentName, template = null) {
  const tpl = normalizeTemplate(template || getDeliveryReceiptPrintTemplate());
  const width = tpl.paperChars;
  const ctx = {
    company: tpl.sample.company,
    title: tpl.sample.title,
    footer: tpl.sample.footer,
    deliveryNo: receipt.deliveryNo || receipt.delivery_no || '',
    date: receipt.receiptDate || receipt.receipt_date || receipt.createdAt || receipt.created_at || '',
    agent: agentName?.trim() || receipt.agentName || receipt.agent_name || 'مندوب',
    customer: receipt.customerName || receipt.customer_name || '—',
    customerNum: receipt.customerNum || receipt.customer_num || '',
    tree: receipt.treeName || receipt.tree_name || '',
    amount: receipt.amount,
    notes: receipt.notes || ''
  };

  const out = [];
  for (const line of tpl.lines) {
    if (line.type === 'separator') {
      out.push({ text: repeatChar(line.char, width), size: line.size });
      continue;
    }
    if (line.type === 'blank') {
      for (let i = 0; i < line.count; i += 1) out.push({ text: '', size: 1 });
      continue;
    }
    if (line.type === 'text') {
      const text = padLine(line.text, width, line.align);
      if (text.trim()) out.push({ text, size: line.size });
      continue;
    }
    if (line.type === 'field') {
      const value = resolveFieldValue(line.field, ctx);
      if (line.hideIfEmpty && !value) continue;
      const composed = `${line.prefix || ''}${value}${line.suffix || ''}`;
      out.push({ text: padLine(composed, width, line.align), size: line.size });
    }
  }
  for (let i = 0; i < tpl.footerBlankLines; i += 1) {
    out.push({ text: '', size: 1 });
  }
  return out;
}

function previewSampleLines(template) {
  const sampleReceipt = {
    deliveryNo: 'WR-20260824-0001',
    receiptDate: new Date().toISOString().slice(0, 10),
    agentName: 'مندوب تجريبي',
    customerName: 'محل الأمين / بغداد',
    customerNum: '1201042',
    treeName: 'شجرة بغداد',
    amount: 250000,
    notes: 'دفعة شهرية'
  };
  return buildDeliveryReceiptPrintLines(sampleReceipt, 'مندوب تجريبي', template);
}

module.exports = {
  FIELD_LABELS,
  DEFAULT_TEMPLATE,
  getDeliveryReceiptPrintTemplate,
  saveDeliveryReceiptPrintTemplate,
  buildDeliveryReceiptPrintLines,
  previewSampleLines
};

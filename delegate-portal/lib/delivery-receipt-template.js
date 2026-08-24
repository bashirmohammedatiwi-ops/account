const fs = require('fs');
const path = require('path');

const db = require('./db');

const SETTING_KEY = 'delivery_receipt_print_template';
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));

const FIELD_LABELS = {
  deliveryNo: 'رقم الوصل',
  date: 'التاريخ',
  agent: 'المندوب',
  customer: 'الزبون',
  customerNum: 'رقم حساب الزبون',
  tree: 'الشجرة',
  amount: 'المبلغ',
  notes: 'ملاحظات'
};

function cleanLegalText(text) {
  return String(text || '').replace(/\s*\/\s*شيكاً/g, '').replace(/شيكاً/g, '').trim();
}

function cleanNotes(text) {
  return String(text || '').trim().replace(/دفعة\s*شهرية/g, '').trim();
}

const DEFAULT_TEMPLATE = {
  version: 2,
  paperMm: 58,
  footerBlankLines: 4,
  branding: {
    showLogo: true,
    logoUrl: '',
    logoWidth: 200,
    legalName: 'شركة التوزيع',
    legalNameFont: 32,
    companyName: 'Edari',
    companyFont: 16,
    title: 'وصل قبض',
    titleFont: 26,
    footer: 'شكراً لتعاملكم — نتشرف بخدمتكم',
    footerFont: 16
  },
  typography: {
    bodyFont: 17,
    labelFont: 15,
    amountFont: 36,
    legalFont: 15
  },
  content: {
    showLegalName: true,
    showCompany: true,
    showTitle: true,
    showDeliveryNo: true,
    showDate: true,
    showAgent: true,
    showCustomer: true,
    showCustomerNum: true,
    showTree: false,
    showNotes: true,
    legalText: 'وصلني منكم المبلغ المذكور أعلاه نقداً',
    dividerStyle: 'light'
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

function clampNum(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function ensureUploadDir(sub) {
  const dir = path.join(UPLOAD_ROOT, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeTemplate(raw) {
  if (!raw || typeof raw !== 'object' || Number(raw.version) < 2) {
    const base = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
    if (raw?.sample) {
      base.branding.companyName = String(raw.sample.company || base.branding.companyName);
      base.branding.title = String(raw.sample.title || base.branding.title);
      base.branding.footer = String(raw.sample.footer || base.branding.footer);
    }
    if (raw?.footerBlankLines != null) base.footerBlankLines = clampNum(raw.footerBlankLines, 0, 8, 4);
    return base;
  }

  const b = raw.branding || {};
  const t = raw.typography || {};
  const c = raw.content || {};

  return {
    version: 2,
    paperMm: 58,
    footerBlankLines: clampNum(raw.footerBlankLines, 0, 8, 4),
    branding: {
      showLogo: Boolean(b.showLogo),
      logoUrl: String(b.logoUrl || ''),
      logoWidth: clampNum(b.logoWidth, 80, 320, 180),
      legalName: String(b.legalName || DEFAULT_TEMPLATE.branding.legalName),
      legalNameFont: clampNum(b.legalNameFont, 14, 42, 30),
      companyName: String(b.companyName || DEFAULT_TEMPLATE.branding.companyName),
      companyFont: clampNum(b.companyFont, 12, 28, 17),
      title: String(b.title || DEFAULT_TEMPLATE.branding.title),
      titleFont: clampNum(b.titleFont, 14, 36, 24),
      footer: String(b.footer || DEFAULT_TEMPLATE.branding.footer),
      footerFont: clampNum(b.footerFont, 12, 28, 17)
    },
    typography: {
      bodyFont: clampNum(t.bodyFont, 12, 28, 18),
      labelFont: clampNum(t.labelFont, 12, 24, 16),
      amountFont: clampNum(t.amountFont, 18, 40, 30),
      legalFont: clampNum(t.legalFont, 12, 24, 17)
    },
    content: {
      showLegalName: Boolean(c.showLegalName ?? true),
      showCompany: Boolean(c.showCompany ?? true),
      showTitle: Boolean(c.showTitle ?? true),
      showDeliveryNo: Boolean(c.showDeliveryNo ?? true),
      showDate: Boolean(c.showDate ?? true),
      showAgent: Boolean(c.showAgent ?? true),
      showCustomer: Boolean(c.showCustomer ?? true),
      showCustomerNum: Boolean(c.showCustomerNum ?? true),
      showTree: Boolean(c.showTree ?? false),
      showNotes: Boolean(c.showNotes ?? true),
      legalText: cleanLegalText(c.legalText || DEFAULT_TEMPLATE.content.legalText),
      dividerStyle: c.dividerStyle === 'solid' ? 'solid' : 'light'
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

function saveThermalLogo(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error('صيغة الصورة غير صالحة');

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 2MB');

  ensureUploadDir('thermal');
  const rel = `thermal/receipt-logo.${ext}`;
  const full = path.join(UPLOAD_ROOT, rel);
  fs.writeFileSync(full, buf);

  const template = getDeliveryReceiptPrintTemplate();
  template.branding.logoUrl = `/uploads/${rel}`;
  template.branding.showLogo = true;
  setSetting(SETTING_KEY, JSON.stringify(template));
  return { template, logoUrl: template.branding.logoUrl };
}

function deleteThermalLogo() {
  const template = getDeliveryReceiptPrintTemplate();
  const url = template.branding.logoUrl || '';
  const rel = url.replace(/^\/uploads\//, '');
  if (rel) {
    const full = path.join(UPLOAD_ROOT, rel);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
  template.branding.logoUrl = '';
  template.branding.showLogo = false;
  setSetting(SETTING_KEY, JSON.stringify(template));
  return template;
}

function fmtMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0 IQD';
  return `${Math.round(n).toLocaleString('en-US')} IQD`;
}

function receiptContext(receipt, agentName, template) {
  return {
    deliveryNo: receipt.deliveryNo || receipt.delivery_no || '—',
    date: receipt.receiptDate || receipt.receipt_date || receipt.createdAt || receipt.created_at || '—',
    agent: agentName?.trim() || receipt.agentName || receipt.agent_name || 'مندوب',
    customer: receipt.customerName || receipt.customer_name || '—',
    customerNum: receipt.customerNum || receipt.customer_num || '',
    tree: receipt.treeName || receipt.tree_name || '',
    amount: fmtMoney(receipt.amount),
    notes: cleanNotes(receipt.notes)
  };
}

function dividerChar(style) {
  return style === 'solid' ? '━' : '─';
}

function heavyDividerChar(style) {
  return style === 'solid' ? '━' : '═';
}

function pushDivider(blocks, char) {
  blocks.push({ type: 'divider', char });
}

function pushDoubleDivider(blocks, char) {
  blocks.push({ type: 'doubleDivider', char });
}

/**
 * يُرجع قائمة blocks للطباعة الحرارية (تطبيق المندوب).
 * الأنواع: logo, text, divider, doubleDivider, ribbon, blank, row, amountBox, legalBox
 */
function buildDeliveryReceiptPrintBlocks(receipt, agentName, template = null) {
  const tpl = normalizeTemplate(template || getDeliveryReceiptPrintTemplate());
  const b = tpl.branding;
  const t = tpl.typography;
  const c = tpl.content;
  const ctx = receiptContext(receipt, agentName, tpl);
  const div = dividerChar(c.dividerStyle);
  const heavy = heavyDividerChar(c.dividerStyle);
  const blocks = [];

  if (b.showLogo && b.logoUrl) {
    blocks.push({ type: 'logo', url: b.logoUrl, maxWidth: b.logoWidth });
    blocks.push({ type: 'blank', count: 1 });
  }

  if (c.showLegalName && b.legalName.trim()) {
    blocks.push({
      type: 'text',
      text: b.legalName.trim(),
      fontSize: b.legalNameFont,
      align: 'center',
      bold: true
    });
  }

  if (c.showCompany && b.companyName.trim()) {
    blocks.push({
      type: 'text',
      text: b.companyName.trim(),
      fontSize: b.companyFont,
      align: 'center',
      bold: false,
      muted: true
    });
  }

  pushDoubleDivider(blocks, heavy);

  if (c.showTitle && b.title.trim()) {
    blocks.push({
      type: 'ribbon',
      text: b.title.trim(),
      fontSize: b.titleFont,
      char: div
    });
  }

  blocks.push({ type: 'blank', count: 1 });

  const metaRows = [];
  if (c.showDeliveryNo) metaRows.push({ label: 'رقم الوصل', value: ctx.deliveryNo });
  if (c.showDate) metaRows.push({ label: 'التاريخ', value: ctx.date });
  if (c.showAgent) metaRows.push({ label: 'المندوب', value: ctx.agent });

  for (const row of metaRows) {
    blocks.push({
      type: 'row',
      label: row.label,
      value: row.value,
      labelFont: t.labelFont,
      valueFont: t.bodyFont
    });
  }

  const hasCustomerBlock = c.showCustomer || (c.showCustomerNum && ctx.customerNum) || (c.showTree && ctx.tree);
  if (metaRows.length && hasCustomerBlock) {
    pushDivider(blocks, div);
  }

  if (c.showCustomer) {
    blocks.push({
      type: 'row',
      label: 'الزبون',
      value: ctx.customer,
      labelFont: t.labelFont,
      valueFont: Math.min(t.bodyFont + 3, 28),
      emphasis: true
    });
  }
  if (c.showCustomerNum && ctx.customerNum) {
    blocks.push({
      type: 'row',
      label: 'رقم الحساب',
      value: ctx.customerNum,
      labelFont: t.labelFont,
      valueFont: t.bodyFont
    });
  }
  if (c.showTree && ctx.tree) {
    blocks.push({
      type: 'row',
      label: 'الشجرة',
      value: ctx.tree,
      labelFont: t.labelFont,
      valueFont: t.bodyFont
    });
  }

  pushDoubleDivider(blocks, heavy);

  blocks.push({
    type: 'amountBox',
    label: 'المبلغ المستلم',
    value: ctx.amount,
    fontSize: t.amountFont,
    char: heavy
  });

  blocks.push({ type: 'blank', count: 1 });

  if (c.legalText.trim()) {
    blocks.push({
      type: 'legalBox',
      text: c.legalText.trim(),
      fontSize: t.legalFont,
      char: div
    });
  }

  if (c.showNotes && ctx.notes) {
    blocks.push({
      type: 'text',
      text: ctx.notes,
      fontSize: t.bodyFont,
      align: 'center',
      bold: false,
      italic: true
    });
  }

  pushDoubleDivider(blocks, div);

  if (b.footer.trim()) {
    blocks.push({
      type: 'text',
      text: b.footer.trim(),
      fontSize: b.footerFont,
      align: 'center',
      bold: false
    });
  }

  return {
    blocks,
    footerBlankLines: tpl.footerBlankLines,
    paperMm: tpl.paperMm
  };
}

function previewSampleBlocks(template) {
  const sampleReceipt = {
    deliveryNo: 'WR-20260824-0001',
    receiptDate: new Date().toISOString().slice(0, 10),
    customerName: 'محل الأمين / بغداد',
    customerNum: '1201042',
    treeName: 'شجرة بغداد',
    amount: 250000,
    notes: ''
  };
  return buildDeliveryReceiptPrintBlocks(sampleReceipt, 'مندوب تجريبي', template);
}

/** توافق مع الطباعة النصية القديمة */
function buildDeliveryReceiptPrintLines(receipt, agentName, template = null) {
  const { blocks, footerBlankLines } = buildDeliveryReceiptPrintBlocks(receipt, agentName, template);
  const out = [];
  for (const block of blocks) {
    if (block.type === 'text') {
      out.push({ text: block.text, size: block.fontSize >= 24 ? 2 : 1, fontSize: block.fontSize, align: block.align, bold: block.bold });
    } else if (block.type === 'divider') {
      out.push({ text: String(block.char || '─').repeat(32), size: 1 });
    } else if (block.type === 'doubleDivider') {
      const ch = String(block.char || '═');
      out.push({ text: ch.repeat(32), size: 1 });
      out.push({ text: ch.repeat(32), size: 1 });
    } else if (block.type === 'ribbon') {
      const ch = String(block.char || '─');
      out.push({ text: ch.repeat(32), size: 1 });
      out.push({ text: block.text, size: block.fontSize >= 24 ? 2 : 1, fontSize: block.fontSize, align: 'center', bold: true });
      out.push({ text: ch.repeat(32), size: 1 });
    } else if (block.type === 'row') {
      out.push({ text: `${block.label}: ${block.value}`, size: 1, fontSize: block.valueFont, align: 'left' });
    } else if (block.type === 'amount' || block.type === 'amountBox') {
      const ch = String(block.char || '═');
      if (block.type === 'amountBox') {
        out.push({ text: ch.repeat(32), size: 1 });
      }
      if (block.label) out.push({ text: block.label, size: 1, fontSize: 14, align: 'center' });
      out.push({ text: block.value, size: 2, fontSize: block.fontSize, align: 'center', bold: true });
      if (block.type === 'amountBox') {
        out.push({ text: ch.repeat(32), size: 1 });
      }
    } else if (block.type === 'legalBox') {
      const ch = String(block.char || '─');
      out.push({ text: ch.repeat(32), size: 1 });
      out.push({ text: block.text, size: 1, fontSize: block.fontSize, align: 'center' });
      out.push({ text: ch.repeat(32), size: 1 });
    } else if (block.type === 'blank') {
      for (let i = 0; i < (block.count || 1); i += 1) out.push({ text: '', size: 1 });
    }
  }
  for (let i = 0; i < footerBlankLines; i += 1) out.push({ text: '', size: 1 });
  return out;
}

function previewSampleLines(template) {
  return buildDeliveryReceiptPrintLines(
    {
      deliveryNo: 'WR-20260824-0001',
      receiptDate: new Date().toISOString().slice(0, 10),
      customerName: 'محل الأمين / بغداد',
      customerNum: '1201042',
      treeName: 'شجرة بغداد',
      amount: 250000,
      notes: ''
    },
    'مندوب تجريبي',
    template
  );
}

module.exports = {
  FIELD_LABELS,
  DEFAULT_TEMPLATE,
  getDeliveryReceiptPrintTemplate,
  saveDeliveryReceiptPrintTemplate,
  saveThermalLogo,
  deleteThermalLogo,
  buildDeliveryReceiptPrintBlocks,
  buildDeliveryReceiptPrintLines,
  previewSampleBlocks,
  previewSampleLines
};

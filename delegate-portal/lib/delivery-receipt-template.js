const fs = require('fs');
const path = require('path');

const db = require('./db');

const SETTING_KEY = 'delivery_receipt_print_template';
const TEMPLATE_FILE_NAME = 'delivery-receipt-print-template.json';
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const DATA_DIR = path.resolve(
  path.dirname(process.env.DATABASE_PATH || path.join(__dirname, '..', 'data'))
);
const TEMPLATE_FILE_PATH = path.join(DATA_DIR, TEMPLATE_FILE_NAME);

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
  paperMm: 80,
  footerBlankLines: 4,
  branding: {
    showLogo: true,
    logoUrl: '',
    logoWidth: 240,
    legalName: 'شركة التوزيع',
    legalNameFont: 34,
    companyName: 'Edari',
    companyFont: 15,
    title: 'وصل قبض',
    titleFont: 28,
    footer: '★ شكراً لتعاملكم — نتشرف بخدمتكم ★',
    footerFont: 15
  },
  typography: {
    bodyFont: 18,
    labelFont: 14,
    amountFont: 42,
    legalFont: 14
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

function readTemplateFileRaw() {
  try {
    if (!fs.existsSync(TEMPLATE_FILE_PATH)) return null;
    const text = fs.readFileSync(TEMPLATE_FILE_PATH, 'utf8').trim();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn('[thermal-template] read file failed:', err.message);
    return null;
  }
}

function writeTemplateFile(template) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const json = JSON.stringify(template);
    const tmp = `${TEMPLATE_FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, TEMPLATE_FILE_PATH);
  } catch (err) {
    console.warn('[thermal-template] write file failed:', err.message);
  }
}

function readStoredTemplateRaw() {
  const dbVal = getSetting(SETTING_KEY, '').trim();
  if (dbVal) {
    try {
      return JSON.parse(dbVal);
    } catch (err) {
      console.warn('[thermal-template] invalid DB JSON:', err.message);
    }
  }

  const fromFile = readTemplateFileRaw();
  if (fromFile) {
    try {
      const normalized = normalizeTemplate(fromFile);
      setSetting(SETTING_KEY, JSON.stringify(normalized));
      console.log('[thermal-template] restored from file backup');
      return fromFile;
    } catch (err) {
      console.warn('[thermal-template] file restore failed:', err.message);
    }
  }

  return null;
}

function persistTemplate(template) {
  const normalized = normalizeTemplate(template);
  const json = JSON.stringify(normalized);
  setSetting(SETTING_KEY, json);
  writeTemplateFile(normalized);
  return normalized;
}

/** يُزامن ملف النسخة الاحتياطية مع DB عند التشغيل (بعد تحديث السيرفر). */
function syncTemplatePersistence() {
  const dbVal = getSetting(SETTING_KEY, '').trim();
  if (dbVal) {
    if (!fs.existsSync(TEMPLATE_FILE_PATH)) {
      try {
        const normalized = normalizeTemplate(JSON.parse(dbVal));
        writeTemplateFile(normalized);
        console.log('[thermal-template] file backup created from database');
      } catch (_) {}
    }
    return;
  }

  const fromFile = readTemplateFileRaw();
  if (fromFile) {
    try {
      const normalized = normalizeTemplate(fromFile);
      setSetting(SETTING_KEY, JSON.stringify(normalized));
      console.log('[thermal-template] database restored from file backup');
    } catch (err) {
      console.warn('[thermal-template] startup restore failed:', err.message);
    }
  }
}

function normalizePaperMm(n) {
  const v = Number(n);
  return v === 58 ? 58 : 80;
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
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
  }

  if (Number(raw.version) < 2) {
    const base = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
    const legacyBranding = raw.branding || raw.sample || {};
    const legacyContent = raw.content || {};
    if (legacyBranding.company || legacyBranding.companyName) {
      base.branding.companyName = String(legacyBranding.companyName || legacyBranding.company || base.branding.companyName);
    }
    if (legacyBranding.title) base.branding.title = String(legacyBranding.title);
    if (legacyBranding.footer) base.branding.footer = String(legacyBranding.footer);
    if (legacyBranding.legalName) base.branding.legalName = String(legacyBranding.legalName);
    if (legacyBranding.logoUrl) base.branding.logoUrl = String(legacyBranding.logoUrl);
    if (legacyContent.legalText) base.content.legalText = cleanLegalText(legacyContent.legalText);
    if (raw.footerBlankLines != null) base.footerBlankLines = clampNum(raw.footerBlankLines, 0, 8, 4);
    return base;
  }

  const b = raw.branding || {};
  const t = raw.typography || {};
  const c = raw.content || {};

  return {
    version: 2,
    paperMm: normalizePaperMm(raw.paperMm),
    footerBlankLines: clampNum(raw.footerBlankLines, 0, 8, 4),
    branding: {
      showLogo: Boolean(b.showLogo),
      logoUrl: String(b.logoUrl || ''),
      logoWidth: clampNum(b.logoWidth, 80, 400, 240),
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
  return normalizeTemplate(readStoredTemplateRaw());
}

function saveDeliveryReceiptPrintTemplate(payload) {
  return persistTemplate(payload);
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
  persistTemplate(template);
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
  return persistTemplate(template);
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
 * الأنواع: logo, text, divider, doubleDivider, ribbon, titleBadge, ornament,
 * blank, row, metaStart, metaEnd, customerBox, amountBox, legalBox, notesBox
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

  blocks.push({ type: 'ornament', char: '✦', repeat: 3 });

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
    const subText = c.showDeliveryNo ? `رقم الوصل: ${ctx.deliveryNo}` : '';
    blocks.push({
      type: 'titleBadge',
      text: b.title.trim(),
      subText,
      fontSize: b.titleFont,
      subFontSize: t.labelFont,
      char: heavy
    });
  }

  blocks.push({ type: 'blank', count: 1 });

  const metaRows = [];
  if (c.showDate) metaRows.push({ label: 'التاريخ', value: ctx.date });
  if (c.showAgent) metaRows.push({ label: 'المندوب', value: ctx.agent });
  if (c.showDeliveryNo && !c.showTitle) {
    metaRows.unshift({ label: 'رقم الوصل', value: ctx.deliveryNo });
  }

  if (metaRows.length) {
    blocks.push({ type: 'metaStart' });
    for (const row of metaRows) {
      blocks.push({
        type: 'row',
        label: row.label,
        value: row.value,
        labelFont: t.labelFont,
        valueFont: t.bodyFont
      });
    }
    blocks.push({ type: 'metaEnd' });
  }

  if (c.showCustomer && ctx.customer && ctx.customer !== '—') {
    blocks.push({
      type: 'customerBox',
      label: 'الزبون',
      value: ctx.customer,
      labelFont: t.labelFont,
      valueFont: Math.min(t.bodyFont + 6, 34),
      char: div
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
    label: 'المبلغ المستلم (نقداً)',
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
      type: 'notesBox',
      label: 'ملاحظات',
      text: ctx.notes,
      labelFont: t.labelFont,
      fontSize: t.bodyFont
    });
  }

  pushDivider(blocks, div);

  if (b.footer.trim()) {
    blocks.push({
      type: 'text',
      text: b.footer.trim(),
      fontSize: b.footerFont,
      align: 'center',
      bold: false
    });
  }

  blocks.push({ type: 'ornament', char: '✦', repeat: 3 });

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
    } else if (block.type === 'ribbon' || block.type === 'titleBadge') {
      const ch = String(block.char || '─');
      out.push({ text: ch.repeat(32), size: 1 });
      out.push({ text: block.text, size: block.fontSize >= 24 ? 2 : 1, fontSize: block.fontSize, align: 'center', bold: true });
      if (block.subText) out.push({ text: block.subText, size: 1, fontSize: block.subFontSize || 14, align: 'center' });
      out.push({ text: ch.repeat(32), size: 1 });
    } else if (block.type === 'ornament') {
      const ch = String(block.char || '✦');
      const n = block.repeat || 3;
      out.push({ text: Array(n).fill(ch).join('  '), size: 1, align: 'center' });
    } else if (block.type === 'metaStart' || block.type === 'metaEnd') {
      /* preview grouping only */
    } else if (block.type === 'customerBox') {
      const ch = String(block.char || '─');
      out.push({ text: ch.repeat(32), size: 1 });
      out.push({ text: block.label, size: 1, fontSize: block.labelFont || 14, align: 'right' });
      out.push({ text: block.value, size: 2, fontSize: block.valueFont || 20, align: 'right', bold: true });
      out.push({ text: ch.repeat(32), size: 1 });
    } else if (block.type === 'notesBox') {
      out.push({ text: block.label || 'ملاحظات', size: 1, fontSize: block.labelFont || 14, align: 'center' });
      out.push({ text: block.text, size: 1, fontSize: block.fontSize || 16, align: 'center' });
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
  previewSampleLines,
  syncTemplatePersistence
};

syncTemplatePersistence();

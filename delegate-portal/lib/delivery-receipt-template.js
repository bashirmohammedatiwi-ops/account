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
const TEMPLATE_UPLOAD_BACKUP_PATH = path.join(UPLOAD_ROOT, 'thermal', 'print-template-backup.json');

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
    logoWidth: 200,
    legalName: 'شركة التوزيع',
    legalNameFont: 32,
    companyName: 'Edari',
    companyFont: 17,
    title: 'وصل قبض',
    titleFont: 26,
    footer: 'شكراً لتعاملكم — نتشرف بخدمتكم',
    footerFont: 17
  },
  typography: {
    bodyFont: 18,
    labelFont: 16,
    amountFont: 36,
    legalFont: 17
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

function readUploadBackupRaw() {
  try {
    if (!fs.existsSync(TEMPLATE_UPLOAD_BACKUP_PATH)) return null;
    const text = fs.readFileSync(TEMPLATE_UPLOAD_BACKUP_PATH, 'utf8').trim();
    if (!text) return null;
    return JSON.parse(text);
  } catch (err) {
    console.warn('[thermal-template] upload backup read failed:', err.message);
    return null;
  }
}

function writeUploadBackup(template) {
  try {
    ensureUploadDir('thermal');
    const json = JSON.stringify(template);
    const tmp = `${TEMPLATE_UPLOAD_BACKUP_PATH}.tmp`;
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, TEMPLATE_UPLOAD_BACKUP_PATH);
  } catch (err) {
    console.warn('[thermal-template] upload backup write failed:', err.message);
  }
}

function readDbTemplateRaw() {
  const dbVal = getSetting(SETTING_KEY, '').trim();
  if (!dbVal) return null;
  try {
    return JSON.parse(dbVal);
  } catch (err) {
    console.warn('[thermal-template] invalid DB JSON:', err.message);
    return null;
  }
}

function isDefaultishTemplate(raw) {
  try {
    if (!raw || typeof raw !== 'object') return true;
    if (raw.customized) return false;
    if (raw.branding?.logoUrl) return false;
    const t = normalizeTemplate(raw);
    const d = DEFAULT_TEMPLATE;
    return (
      t.branding.legalName === d.branding.legalName &&
      t.branding.companyName === d.branding.companyName &&
      t.branding.title === d.branding.title &&
      t.branding.footer === d.branding.footer
    );
  } catch {
    return true;
  }
}

function templateRank(raw) {
  if (!raw || typeof raw !== 'object') return -1;
  let rank = 0;
  if (raw.customized) rank += 1_000_000_000_000;
  if (raw.branding?.logoUrl) rank += 100_000_000_000;
  if (!isDefaultishTemplate(raw)) rank += 50_000_000_000;
  if (raw.updatedAt) {
    const ts = Date.parse(raw.updatedAt);
    if (Number.isFinite(ts)) rank += ts;
  }
  return rank;
}

function loadBestTemplateRaw() {
  const candidates = [
    { source: 'database', raw: readDbTemplateRaw() },
    { source: 'data-file', raw: readTemplateFileRaw() },
    { source: 'upload-backup', raw: readUploadBackupRaw() }
  ].filter((c) => c.raw);

  if (!candidates.length) return null;

  candidates.sort((a, b) => templateRank(b.raw) - templateRank(a.raw));
  const winner = candidates[0];
  if (winner.source !== 'database') {
    console.log(`[thermal-template] loaded template from ${winner.source}`);
  }
  return winner.raw;
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
  return loadBestTemplateRaw();
}

function persistTemplate(template) {
  const withMeta = {
    ...template,
    customized: true,
    updatedAt: new Date().toISOString()
  };
  const normalized = normalizeTemplate(withMeta);
  const json = JSON.stringify(normalized);
  setSetting(SETTING_KEY, json);
  writeTemplateFile(normalized);
  writeUploadBackup(normalized);
  return normalized;
}

/** يُزامن كل نسخ القالب عند التشغيل — يختار الأحدث/المخصص ولا يعود للافتراضي. */
function syncTemplatePersistence() {
  const raw = loadBestTemplateRaw();
  if (!raw) {
    console.log('[thermal-template] no saved template yet');
    return;
  }

  const normalized = normalizeTemplate({
    ...raw,
    customized: raw.customized || !isDefaultishTemplate(raw),
    updatedAt: raw.updatedAt || new Date().toISOString()
  });
  const json = JSON.stringify(normalized);
  setSetting(SETTING_KEY, json);
  writeTemplateFile(normalized);
  writeUploadBackup(normalized);
  console.log('[thermal-template] synced template to database + data file + upload backup');
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
      showLogo: Boolean(b.showLogo ?? DEFAULT_TEMPLATE.branding.showLogo),
      logoUrl: String(b.logoUrl || ''),
      logoWidth: clampNum(b.logoWidth, 80, 400, 200),
      legalName: String(b.legalName || DEFAULT_TEMPLATE.branding.legalName),
      legalNameFont: clampNum(b.legalNameFont, 14, 42, 32),
      companyName: String(b.companyName || DEFAULT_TEMPLATE.branding.companyName),
      companyFont: clampNum(b.companyFont, 12, 28, 17),
      title: String(b.title || DEFAULT_TEMPLATE.branding.title),
      titleFont: clampNum(b.titleFont, 14, 36, 26),
      footer: String(b.footer || DEFAULT_TEMPLATE.branding.footer),
      footerFont: clampNum(b.footerFont, 12, 28, 17)
    },
    typography: {
      bodyFont: clampNum(t.bodyFont, 12, 28, 18),
      labelFont: clampNum(t.labelFont, 12, 24, 16),
      amountFont: clampNum(t.amountFont, 18, 48, 36),
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
  const raw = readStoredTemplateRaw();
  return normalizeTemplate(raw || DEFAULT_TEMPLATE);
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
 * الأنواع: logo, text, title, hero, caption, rule, spacer, pair, amount
 */
function buildDeliveryReceiptPrintBlocks(receipt, agentName, template = null) {
  const tpl = normalizeTemplate(template || getDeliveryReceiptPrintTemplate());
  const b = tpl.branding;
  const t = tpl.typography;
  const c = tpl.content;
  const ctx = receiptContext(receipt, agentName, tpl);
  const blocks = [];

  if (b.showLogo && b.logoUrl) {
    blocks.push({ type: 'logo', url: b.logoUrl, maxWidth: b.logoWidth });
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
      muted: true
    });
  }

  blocks.push({ type: 'spacer', count: 1 });

  if (c.showTitle && b.title.trim()) {
    blocks.push({
      type: 'title',
      text: b.title.trim(),
      fontSize: b.titleFont,
      align: 'center',
      bold: true
    });
  }

  if (c.showDeliveryNo) {
    blocks.push({
      type: 'receiptId',
      text: ctx.deliveryNo,
      fontSize: t.labelFont
    });
  }

  blocks.push({ type: 'rule' });

  if (c.showDate) {
    blocks.push({ type: 'pair', label: 'التاريخ', value: ctx.date, labelFont: t.labelFont, valueFont: t.bodyFont });
  }
  if (c.showAgent) {
    blocks.push({ type: 'pair', label: 'المندوب', value: ctx.agent, labelFont: t.labelFont, valueFont: t.bodyFont });
  }

  if (c.showCustomer && ctx.customer && ctx.customer !== '—') {
    blocks.push({ type: 'spacer', count: 1 });
    blocks.push({ type: 'text', text: 'الزبون', fontSize: t.labelFont, align: 'right', muted: true });
    blocks.push({
      type: 'hero',
      text: ctx.customer,
      fontSize: Math.min(t.bodyFont + 8, 32),
      align: 'right',
      bold: true
    });
  }

  if (c.showCustomerNum && ctx.customerNum) {
    blocks.push({ type: 'pair', label: 'رقم الحساب', value: ctx.customerNum, labelFont: t.labelFont, valueFont: t.bodyFont });
  }
  if (c.showTree && ctx.tree) {
    blocks.push({ type: 'pair', label: 'الشجرة', value: ctx.tree, labelFont: t.labelFont, valueFont: t.bodyFont });
  }

  blocks.push({ type: 'rule' });

  blocks.push({ type: 'text', text: 'المبلغ المستلم', fontSize: t.labelFont, align: 'center', muted: true });
  blocks.push({ type: 'amount', value: ctx.amount, fontSize: t.amountFont });

  blocks.push({ type: 'spacer', count: 1 });

  if (c.legalText.trim()) {
    blocks.push({
      type: 'caption',
      text: c.legalText.trim(),
      fontSize: t.legalFont,
      align: 'center',
      muted: true
    });
  }

  if (c.showNotes && ctx.notes) {
    blocks.push({
      type: 'text',
      text: `ملاحظات: ${ctx.notes}`,
      fontSize: t.bodyFont,
      align: 'center',
      italic: true
    });
  }

  blocks.push({ type: 'spacer', count: 2 });

  if (b.footer.trim()) {
    blocks.push({
      type: 'text',
      text: b.footer.trim(),
      fontSize: b.footerFont,
      align: 'center',
      muted: true
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
    if (block.type === 'text' || block.type === 'title' || block.type === 'hero' || block.type === 'caption') {
      out.push({ text: block.text, size: block.fontSize >= 24 ? 2 : 1, fontSize: block.fontSize, align: block.align, bold: block.bold });
    } else if (block.type === 'rule') {
      out.push({ text: '────────────────────────', size: 1 });
    } else if (block.type === 'spacer' || block.type === 'blank') {
      for (let i = 0; i < (block.count || 1); i += 1) out.push({ text: '', size: 1 });
    } else if (block.type === 'pair') {
      out.push({ text: `${block.label}    ${block.value}`, size: 1, fontSize: block.valueFont, align: 'left' });
    } else if (block.type === 'amount') {
      out.push({ text: block.value, size: 2, fontSize: block.fontSize, align: 'center', bold: true });
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

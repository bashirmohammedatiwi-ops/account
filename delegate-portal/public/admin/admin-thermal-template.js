/* Admin: thermal receipt designer v2 */

const thermalTplAdmin = {
  template: null,
  defaults: null,
  preview: null,
  hydrating: false
};

const THERMAL_LOCAL_KEY = 'edari_thermal_print_template_v2';

function saveThermalLocalBackup(template) {
  try {
    localStorage.setItem(
      THERMAL_LOCAL_KEY,
      JSON.stringify({ template, updatedAt: new Date().toISOString(), customized: true })
    );
  } catch (_) {}
}

function readThermalLocalBackup() {
  try {
    const raw = localStorage.getItem(THERMAL_LOCAL_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isDefaultishThermalTemplate(t) {
  if (!t || t.customized) return false;
  if (t.branding?.logoUrl) return false;
  const b = t.branding || {};
  return (
    (b.legalName || '') === 'شركة التوزيع' &&
    (b.companyName || '') === 'Edari' &&
    (b.title || '') === 'وصل قبض'
  );
}

function pickThermalTemplate(serverTemplate, localPack) {
  if (!localPack?.template) return serverTemplate;
  if (!serverTemplate) return localPack.template;
  if (localPack.customized && isDefaultishThermalTemplate(serverTemplate)) return localPack.template;
  const localTs = Date.parse(localPack.updatedAt || '') || 0;
  const serverTs = Date.parse(serverTemplate.updatedAt || '') || 0;
  if (localPack.customized && localTs > serverTs) return localPack.template;
  return serverTemplate;
}

function thermalFromForm() {
  const t = thermalTplAdmin.template || {};
  const b = t.branding || {};
  const ty = t.typography || {};
  const c = t.content || {};
  const num = (id, fallback) => Number(document.getElementById(id)?.value) || fallback;
  const chk = (id, fallback) => document.getElementById(id)?.checked ?? fallback;
  const txt = (id, fallback) => document.getElementById(id)?.value?.trim() ?? fallback;

  return {
    version: 2,
    paperMm: Number(document.getElementById('thermalPaperMm')?.value) === 58 ? 58 : 80,
    footerBlankLines: Math.min(8, Math.max(0, num('thermalFooterBlanks', 4))),
    branding: {
      showLogo: chk('thermalShowLogo', true),
      logoUrl: b.logoUrl || '',
      logoWidth: num('thermalLogoWidth', 180),
      legalName: txt('thermalLegalName', b.legalName || ''),
      legalNameFont: num('thermalLegalNameFont', 30),
      companyName: txt('thermalCompanyName', b.companyName || ''),
      companyFont: num('thermalCompanyFont', 17),
      title: txt('thermalTitle', b.title || ''),
      titleFont: num('thermalTitleFont', 24),
      footer: txt('thermalFooter', b.footer || ''),
      footerFont: num('thermalFooterFont', 17)
    },
    typography: {
      bodyFont: num('thermalBodyFont', 18),
      labelFont: num('thermalLabelFont', 16),
      amountFont: num('thermalAmountFont', 30),
      legalFont: num('thermalLegalFont', 17)
    },
    content: {
      showLegalName: true,
      showCompany: true,
      showTitle: true,
      showDeliveryNo: chk('thermalShowDeliveryNo', true),
      showDate: chk('thermalShowDate', true),
      showAgent: chk('thermalShowAgent', true),
      showCustomer: chk('thermalShowCustomer', true),
      showCustomerNum: chk('thermalShowCustomerNum', true),
      showTree: chk('thermalShowTree', false),
      showNotes: chk('thermalShowNotes', true),
      legalText: txt('thermalLegalText', ''),
      dividerStyle: document.getElementById('thermalDividerStyle')?.value === 'solid' ? 'solid' : 'light'
    }
  };
}

function fillThermalForm(template) {
  thermalTplAdmin.hydrating = true;
  const t = template || {};
  const b = t.branding || {};
  const ty = t.typography || {};
  const c = t.content || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };
  const setRange = (id, outId, v) => {
    set(id, v);
    const out = document.getElementById(outId);
    if (out) out.textContent = String(v);
  };

  setChk('thermalShowLogo', b.showLogo);
  setRange('thermalLogoWidth', 'thermalLogoWidthOut', b.logoWidth || 180);
  set('thermalLegalName', b.legalName || '');
  setRange('thermalLegalNameFont', 'thermalLegalNameFontOut', b.legalNameFont || 30);
  set('thermalCompanyName', b.companyName || '');
  setRange('thermalCompanyFont', 'thermalCompanyFontOut', b.companyFont || 17);
  set('thermalTitle', b.title || '');
  setRange('thermalTitleFont', 'thermalTitleFontOut', b.titleFont || 24);
  set('thermalFooter', b.footer || '');
  setRange('thermalFooterFont', 'thermalFooterFontOut', b.footerFont || 17);
  set('thermalFooterBlanks', t.footerBlankLines ?? 4);
  set('thermalLegalText', c.legalText || '');
  setRange('thermalBodyFont', 'thermalBodyFontOut', ty.bodyFont || 18);
  setRange('thermalLabelFont', 'thermalLabelFontOut', ty.labelFont || 16);
  setRange('thermalAmountFont', 'thermalAmountFontOut', ty.amountFont || 30);
  setRange('thermalLegalFont', 'thermalLegalFontOut', ty.legalFont || 17);
  setChk('thermalShowDeliveryNo', c.showDeliveryNo);
  setChk('thermalShowDate', c.showDate);
  setChk('thermalShowAgent', c.showAgent);
  setChk('thermalShowCustomer', c.showCustomer);
  setChk('thermalShowCustomerNum', c.showCustomerNum);
  setChk('thermalShowTree', c.showTree);
  setChk('thermalShowNotes', c.showNotes);
  set('thermalPaperMm', t.paperMm ?? 80);
  set('thermalDividerStyle', c.dividerStyle || 'light');
  updateLogoPreview(b.logoUrl);
  thermalTplAdmin.hydrating = false;
}

function updateLogoPreview(url) {
  const box = document.getElementById('thermalLogoPreview');
  if (!box) return;
  if (url) {
    box.innerHTML = `<img src="${esc(url)}" alt="شعار">`;
  } else {
    box.innerHTML = '<span class="muted">لا يوجد شعار</span>';
  }
}

function tpPaperPx(paperMm) {
  return Math.round(Number(paperMm || 80) * 3.7795275591);
}

function tpScale(size, paperMm) {
  const paperPx = tpPaperPx(paperMm);
  const factor = paperPx / 576;
  return Math.max(9, Math.round((size || 16) * factor));
}

function renderThermalPreview() {
  const box = document.getElementById('thermalPreviewPaper');
  if (!box) return;
  const preview = thermalTplAdmin.preview;
  const paperMm = thermalTplAdmin.template?.paperMm ?? 80;
  box.classList.remove('tp-paper-58', 'tp-paper-80');
  box.classList.add(Number(paperMm) === 58 ? 'tp-paper-58' : 'tp-paper-80');
  if (!preview?.blocks) {
    box.innerHTML = '<p class="muted">لا معاينة</p>';
    return;
  }

  const parts = [];
  let headerOpen = false;
  let customerOpen = false;
  let amountOpen = false;

  const openHeader = () => {
    if (!headerOpen) {
      parts.push('<div class="tp-header-cluster">');
      headerOpen = true;
    }
  };

  const closeHeader = () => {
    if (headerOpen) {
      parts.push('</div>');
      headerOpen = false;
    }
  };

  const closeCustomer = () => {
    if (customerOpen) {
      parts.push('</div>');
      customerOpen = false;
    }
  };

  const closeAmount = () => {
    if (amountOpen) {
      parts.push('</div>');
      amountOpen = false;
    }
  };

  for (const block of preview.blocks) {
    if (block.type === 'logo') {
      openHeader();
      if (block.url) parts.push(`<div class="tp-logo"><img src="${esc(block.url)}" alt="logo"></div>`);
      continue;
    }

    if (block.type === 'text' && block.bold && !block.muted) {
      openHeader();
      parts.push(`<div class="tp-brand" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'text' && block.muted && headerOpen) {
      parts.push(`<div class="tp-brand-sub tp-muted" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'title') {
      closeHeader();
      parts.push(`<div class="tp-doc-title" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'receiptId') {
      parts.push(`<div class="tp-receipt-id" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'rule' || block.type === 'divider' || block.type === 'doubleDivider') {
      closeHeader();
      closeCustomer();
      closeAmount();
      parts.push('<div class="tp-rule"></div>');
      continue;
    }

    if (block.type === 'dashedRule') {
      closeHeader();
      closeCustomer();
      closeAmount();
      parts.push('<div class="tp-rule tp-rule-dashed"></div>');
      continue;
    }

    if (block.type === 'signature') {
      parts.push(`<div class="tp-sign"><span class="tp-sign-line"></span><span>${esc(block.label || 'توقيع المستلم')}</span></div>`);
      continue;
    }

    if (block.type === 'spacer' || block.type === 'blank') {
      const n = Math.min(4, block.count || 1);
      parts.push(`<div class="tp-spacer" style="height:${n * 5}px"></div>`);
      continue;
    }

    if (block.type === 'pair' || block.type === 'row') {
      parts.push(
        `<div class="tp-pair"><span class="tp-pair-label" style="font-size:${tpScale(block.labelFont, paperMm)}px">${esc(block.label)}</span><span class="tp-pair-value" style="font-size:${tpScale(block.valueFont, paperMm)}px">${esc(block.value)}</span></div>`
      );
      continue;
    }

    if (block.type === 'text' && block.text === 'الزبون') {
      closeCustomer();
      parts.push('<div class="tp-customer-card">');
      customerOpen = true;
      parts.push(`<div class="tp-customer-label" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'hero' && customerOpen) {
      const align = block.align === 'right' ? ' tp-align-right' : '';
      parts.push(`<div class="tp-hero${align}" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      closeCustomer();
      continue;
    }

    if (block.type === 'text' && block.text === 'المبلغ المستلم') {
      closeAmount();
      parts.push('<div class="tp-amount-panel">');
      amountOpen = true;
      parts.push(`<div class="tp-amount-label" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if ((block.type === 'amount' || block.type === 'amountBox') && amountOpen) {
      parts.push(`<div class="tp-amount-value" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.value)}</div>`);
      closeAmount();
      continue;
    }

    if (block.type === 'text' || block.type === 'hero' || block.type === 'caption') {
      const muted = block.muted ? ' tp-muted' : '';
      const italic = block.italic ? ' tp-italic' : '';
      let cls = block.type === 'caption' ? 'tp-caption' : 'tp-body';
      if (block.type === 'hero') cls = 'tp-hero';
      const align = block.align === 'right' ? ' tp-align-right' : block.align === 'left' ? ' tp-align-left' : '';
      parts.push(`<div class="${cls}${muted}${italic}${align}" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'amount' || block.type === 'amountBox') {
      parts.push('<div class="tp-amount-box">');
      if (block.label) {
        parts.push(`<div class="tp-amount-label" style="font-size:${tpScale(block.labelFont || 13, paperMm)}px">${esc(block.label)}</div>`);
      }
      parts.push(`<div class="tp-amount-value" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.value)}</div>`);
      if (block.subText) {
        parts.push(`<div class="tp-amount-label" style="font-size:${tpScale(block.labelFont || 13, paperMm)}px">${esc(block.subText)}</div>`);
      }
      parts.push('</div>');
      continue;
    }

    if (block.type === 'legalBox' || block.type === 'notesBox') {
      if (block.label) parts.push(`<div class="tp-caption" style="font-size:${tpScale(block.labelFont, paperMm)}px">${esc(block.label)}</div>`);
      parts.push(`<div class="tp-caption tp-italic" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      continue;
    }

    if (block.type === 'customerBox') {
      parts.push('<div class="tp-customer-card">');
      parts.push(`<div class="tp-customer-label" style="font-size:${tpScale(block.labelFont, paperMm)}px">${esc(block.label || 'الزبون')}</div>`);
      parts.push(`<div class="tp-hero tp-align-right" style="font-size:${tpScale(block.valueFont, paperMm)}px">${esc(block.value)}</div>`);
      parts.push('</div>');
      continue;
    }

    if (block.type === 'titleBadge' || block.type === 'ribbon') {
      parts.push(`<div class="tp-doc-title" style="font-size:${tpScale(block.fontSize, paperMm)}px">${esc(block.text)}</div>`);
      if (block.subText) parts.push(`<div class="tp-receipt-id" style="font-size:${tpScale(block.subFontSize, paperMm)}px">${esc(block.subText)}</div>`);
    }
  }

  closeHeader();
  closeCustomer();
  closeAmount();
  box.innerHTML = parts.join('');
}

function buildClientPreview(template) {
  const tpl = template || {};
  const b = tpl.branding || {};
  const ty = tpl.typography || {};
  const c = tpl.content || {};
  const blocks = [];
  const ctx = {
    deliveryNo: 'WR-20260824-0001',
    date: new Date().toISOString().slice(0, 10),
    agent: 'مندوب تجريبي',
    customer: 'محل الأمين / بغداد',
    customerNum: '1201042',
    tree: 'شجرة بغداد',
    amount: '250,000 IQD',
    notes: ''
  };

  const pushPair = (label, value) => {
    blocks.push({ type: 'pair', label, value, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  };

  if (b.showLogo && b.logoUrl) blocks.push({ type: 'logo', url: b.logoUrl, maxWidth: b.logoWidth });
  if (b.legalName) blocks.push({ type: 'text', text: b.legalName, fontSize: b.legalNameFont, bold: true });
  if (b.companyName) blocks.push({ type: 'text', text: b.companyName, fontSize: b.companyFont, muted: true });
  blocks.push({ type: 'spacer', count: 1 });
  if (b.title) blocks.push({ type: 'title', text: b.title, fontSize: b.titleFont, bold: true });
  if (c.showDeliveryNo) blocks.push({ type: 'receiptId', text: ctx.deliveryNo, fontSize: ty.labelFont });
  blocks.push({ type: 'rule' });
  if (c.showDate) pushPair('التاريخ', ctx.date);
  if (c.showAgent) pushPair('المندوب', ctx.agent);
  if (c.showCustomer) {
    blocks.push({ type: 'spacer', count: 1 });
    blocks.push({ type: 'text', text: 'الزبون', fontSize: ty.labelFont, align: 'right', muted: true });
    blocks.push({ type: 'hero', text: ctx.customer, fontSize: Math.min((ty.bodyFont || 18) + 8, 32), align: 'right', bold: true });
  }
  if (c.showCustomerNum && ctx.customerNum) pushPair('رقم الحساب', ctx.customerNum);
  if (c.showTree && ctx.tree) pushPair('الشجرة', ctx.tree);
  blocks.push({ type: 'rule' });
  blocks.push({ type: 'text', text: 'المبلغ المستلم', fontSize: ty.labelFont, align: 'center', muted: true });
  blocks.push({ type: 'amount', value: ctx.amount, fontSize: ty.amountFont });
  blocks.push({ type: 'spacer', count: 1 });
  if (c.legalText) blocks.push({ type: 'caption', text: c.legalText, fontSize: ty.legalFont, muted: true });
  if (c.showNotes && ctx.notes) blocks.push({ type: 'text', text: `ملاحظات: ${ctx.notes}`, fontSize: ty.bodyFont, italic: true });
  blocks.push({ type: 'spacer', count: 2 });
  if (b.footer) blocks.push({ type: 'text', text: b.footer, fontSize: b.footerFont, muted: true });

  return { blocks };
}

function onThermalFormChange() {
  if (thermalTplAdmin.hydrating) return;
  thermalTplAdmin.template = thermalFromForm();
  thermalTplAdmin.preview = buildClientPreview(thermalTplAdmin.template);
  renderThermalPreview();
  saveThermalLocalBackup(thermalTplAdmin.template);
}

function bindThermalGlobals() {
  const ids = [
    'thermalShowLogo', 'thermalLogoWidth', 'thermalLegalName', 'thermalLegalNameFont',
    'thermalCompanyName', 'thermalCompanyFont', 'thermalTitle', 'thermalTitleFont',
    'thermalFooter', 'thermalFooterFont', 'thermalFooterBlanks', 'thermalLegalText',
    'thermalBodyFont', 'thermalLabelFont', 'thermalAmountFont', 'thermalLegalFont',
    'thermalShowDeliveryNo', 'thermalShowDate', 'thermalShowAgent', 'thermalShowCustomer',
    'thermalShowCustomerNum', 'thermalShowTree', 'thermalShowNotes', 'thermalPaperMm', 'thermalDividerStyle'
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', onThermalFormChange);
    el.addEventListener('change', onThermalFormChange);
  });

  document.getElementById('thermalLogoInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
        reader.readAsDataURL(file);
      });
      const data = await commerceApi('/delivery-receipts/print-template/logo', {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      thermalTplAdmin.template = data.template;
      thermalTplAdmin.preview = data.preview;
      fillThermalForm(data.template);
      renderThermalPreview();
      saveThermalLocalBackup(data.template);
      showToast('تم رفع الشعار');
    } catch (err) {
      showToast(err.message, 'err');
    }
    e.target.value = '';
  });

  document.getElementById('btnThermalLogoRemove')?.addEventListener('click', async () => {
    try {
      const data = await commerceApi('/delivery-receipts/print-template/logo', { method: 'DELETE' });
      thermalTplAdmin.template = data.template;
      thermalTplAdmin.preview = data.preview;
      fillThermalForm(data.template);
      renderThermalPreview();
      saveThermalLocalBackup(data.template);
      showToast('تمت إزالة الشعار');
    } catch (err) {
      showToast(err.message, 'err');
    }
  });

  document.getElementById('btnThermalReset')?.addEventListener('click', () => {
    if (!confirm('استعادة التصميم الافتراضي؟')) return;
    thermalTplAdmin.template = JSON.parse(JSON.stringify(thermalTplAdmin.defaults || {}));
    fillThermalForm(thermalTplAdmin.template);
    thermalTplAdmin.preview = buildClientPreview(thermalTplAdmin.template);
    renderThermalPreview();
    try {
      localStorage.removeItem(THERMAL_LOCAL_KEY);
    } catch (_) {}
  });

  document.getElementById('btnThermalSave')?.addEventListener('click', () => saveThermalTemplate());
}

async function loadThermalTemplatePage() {
  const previewBox = document.getElementById('thermalPreviewPaper');
  if (previewBox) previewBox.innerHTML = '<p class="muted">جاري تحميل التصميم...</p>';

  const localFirst = readThermalLocalBackup();
  if (localFirst?.template) {
    thermalTplAdmin.template = localFirst.template;
    thermalTplAdmin.preview = buildClientPreview(localFirst.template);
    fillThermalForm(localFirst.template);
    renderThermalPreview();
  }

  try {
    const data = await commerceApi('/delivery-receipts/print-template');
    const local = readThermalLocalBackup();
    const picked = pickThermalTemplate(data.template, local || localFirst);
    const template = picked || data.template || data.defaults || thermalTplAdmin.template;
    thermalTplAdmin.template = template;
    thermalTplAdmin.defaults = data.defaults;
    thermalTplAdmin.preview = buildClientPreview(template);
    fillThermalForm(template);
    renderThermalPreview();
  } catch (err) {
    const local = readThermalLocalBackup();
    if (local?.template) {
      thermalTplAdmin.template = local.template;
      thermalTplAdmin.defaults = thermalTplAdmin.defaults || {};
      thermalTplAdmin.preview = buildClientPreview(local.template);
      fillThermalForm(local.template);
      renderThermalPreview();
      showToast('تم تحميل النسخة المحفوظة على المتصفح', 'ok');
    } else if (previewBox) {
      previewBox.innerHTML = '<p class="muted">تعذّر تحميل التصميم</p>';
      showToast(err.message || 'تعذّر تحميل تصميم الفاتورة', 'err');
    }
  }
}

async function saveThermalTemplate() {
  let template = null;
  try {
    template = thermalFromForm();
    const data = await commerceApi('/delivery-receipts/print-template', {
      method: 'PUT',
      body: JSON.stringify({ template })
    });
    thermalTplAdmin.template = data.template;
    thermalTplAdmin.preview = buildClientPreview(data.template);
    fillThermalForm(data.template);
    renderThermalPreview();
    saveThermalLocalBackup(data.template);
    showToast('تم حفظ تصميم الفاتورة الحرارية');
  } catch (err) {
    if (template) saveThermalLocalBackup(template);
    showToast(err.message || 'تعذّر الحفظ على السيرفر — نُسخت محلياً', 'err');
  }
}

bindThermalGlobals();

(function bootstrapThermalFromLocal() {
  const local = readThermalLocalBackup();
  if (!local?.template) return;
  thermalTplAdmin.template = local.template;
  thermalTplAdmin.preview = buildClientPreview(local.template);
  fillThermalForm(local.template);
  renderThermalPreview();
})();

window.adminPages = window.adminPages || {};
window.adminPages.thermalReceipt = loadThermalTemplatePage;

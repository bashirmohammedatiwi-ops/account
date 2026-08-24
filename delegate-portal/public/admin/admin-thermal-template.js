/* Admin: thermal receipt designer v2 */

const thermalTplAdmin = {
  template: null,
  defaults: null,
  preview: null
};

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

function tpScale(size, factor = 0.58) {
  return Math.max(11, Math.round((size || 16) * factor));
}

function tpDividerRepeat(paperMm) {
  return Number(paperMm) === 58 ? 28 : 48;
}

function renderThermalPreview() {
  const box = document.getElementById('thermalPreviewPaper');
  if (!box) return;
  const preview = thermalTplAdmin.preview;
  const paperMm = thermalTplAdmin.template?.paperMm ?? 80;
  box.classList.remove('tp-paper-58', 'tp-paper-80');
  box.classList.add(Number(paperMm) === 58 ? 'tp-paper-58' : 'tp-paper-80');
  const divRepeat = tpDividerRepeat(paperMm);
  if (!preview?.blocks) {
    box.innerHTML = '<p class="muted">لا معاينة</p>';
    return;
  }

  const parts = [];
  let rowGroup = [];
  let inMetaCard = false;

  const flushRows = () => {
    if (!rowGroup.length) return;
    const inner = rowGroup.join('');
    if (inMetaCard) {
      parts.push(inner);
    } else {
      parts.push(`<div class="tp-meta-card">${inner}</div>`);
    }
    rowGroup = [];
  };

  for (const block of preview.blocks) {
    if (block.type === 'metaStart') {
      flushRows();
      inMetaCard = true;
      parts.push('<div class="tp-meta-card">');
      continue;
    }
    if (block.type === 'metaEnd') {
      flushRows();
      inMetaCard = false;
      parts.push('</div>');
      continue;
    }
    if (block.type === 'row') {
      const emphasis = block.emphasis ? ' tp-row-emphasis' : '';
      rowGroup.push(
        `<div class="tp-row${emphasis}"><span class="tp-row-label" style="font-size:${tpScale(block.labelFont, 0.5)}px">${esc(block.label)}</span><span class="tp-row-value" style="font-size:${tpScale(block.valueFont)}px">${esc(block.value)}</span></div>`
      );
      continue;
    }
    flushRows();

    if (block.type === 'logo' && block.url) {
      parts.push(`<div class="tp-logo"><img src="${esc(block.url)}" alt="logo"></div>`);
    } else if (block.type === 'ornament') {
      const ch = esc(block.char || '✦');
      const n = Math.min(5, block.repeat || 3);
      parts.push(`<div class="tp-ornament">${Array(n).fill(`<span>${ch}</span>`).join('')}</div>`);
    } else if (block.type === 'text') {
      const muted = block.muted ? ' tp-muted' : '';
      const italic = block.italic ? ' tp-italic' : '';
      let cls = 'tp-body';
      if (block.bold && (block.fontSize || 0) >= 24) cls = 'tp-brand';
      else if (block.bold) cls = 'tp-brand-sub';
      parts.push(`<div class="${cls}${muted}${italic}" style="font-size:${tpScale(block.fontSize)}px">${esc(block.text)}</div>`);
    } else if (block.type === 'divider') {
      parts.push(`<div class="tp-divider">${esc(block.char || '─').repeat(divRepeat)}</div>`);
    } else if (block.type === 'doubleDivider') {
      const ch = esc(block.char || '═');
      parts.push(`<div class="tp-divider tp-divider-heavy">${ch.repeat(divRepeat)}</div>`);
    } else if (block.type === 'ribbon') {
      const ch = esc(block.char || '─');
      parts.push(
        `<div class="tp-ribbon"><div class="tp-divider">${ch.repeat(divRepeat)}</div><div class="tp-ribbon-text" style="font-size:${tpScale(block.fontSize)}px">${esc(block.text)}</div><div class="tp-divider">${ch.repeat(divRepeat)}</div></div>`
      );
    } else if (block.type === 'titleBadge') {
      const ch = esc(block.char || '═');
      parts.push(
        `<div class="tp-title-badge"><div class="tp-divider tp-divider-heavy">${ch.repeat(divRepeat)}</div><div class="tp-title-badge-text" style="font-size:${tpScale(block.fontSize)}px">${esc(block.text)}</div>${block.subText ? `<div class="tp-title-badge-sub" style="font-size:${tpScale(block.subFontSize, 0.5)}px">${esc(block.subText)}</div>` : ''}<div class="tp-divider tp-divider-heavy">${ch.repeat(divRepeat)}</div></div>`
      );
    } else if (block.type === 'customerBox') {
      const ch = esc(block.char || '─');
      parts.push(
        `<div class="tp-customer-box"><div class="tp-divider">${ch.repeat(divRepeat)}</div><div class="tp-customer-label" style="font-size:${tpScale(block.labelFont, 0.5)}px">${esc(block.label || 'الزبون')}</div><div class="tp-customer-value" style="font-size:${tpScale(block.valueFont, 0.72)}px">${esc(block.value)}</div><div class="tp-divider">${ch.repeat(divRepeat)}</div></div>`
      );
    } else if (block.type === 'notesBox') {
      parts.push(
        `<div class="tp-notes-box"><div class="tp-notes-label" style="font-size:${tpScale(block.labelFont, 0.5)}px">${esc(block.label || 'ملاحظات')}</div><div class="tp-notes-text tp-italic" style="font-size:${tpScale(block.fontSize)}px">${esc(block.text)}</div></div>`
      );
    } else if (block.type === 'blank') {
      parts.push('<div class="tp-blank"></div>');
    } else if (block.type === 'amount' || block.type === 'amountBox') {
      const ch = esc(block.char || '═');
      parts.push(
        `<div class="tp-amount-box"><div class="tp-divider tp-divider-heavy">${ch.repeat(divRepeat)}</div><div class="tp-amount-label">${esc(block.label || '')}</div><div class="tp-amount-value" style="font-size:${tpScale(block.fontSize, 0.62)}px">${esc(block.value)}</div><div class="tp-divider tp-divider-heavy">${ch.repeat(divRepeat)}</div></div>`
      );
    } else if (block.type === 'legalBox') {
      const ch = esc(block.char || '─');
      parts.push(
        `<div class="tp-legal-box"><div class="tp-divider">${ch.repeat(divRepeat)}</div><div class="tp-legal-text" style="font-size:${tpScale(block.fontSize, 0.52)}px">${esc(block.text)}</div><div class="tp-divider">${ch.repeat(divRepeat)}</div></div>`
      );
    }
  }
  flushRows();
  box.innerHTML = parts.join('');
}

function buildClientPreview(template) {
  const tpl = template || {};
  const b = tpl.branding || {};
  const ty = tpl.typography || {};
  const c = tpl.content || {};
  const div = c.dividerStyle === 'solid' ? '━' : '─';
  const heavy = c.dividerStyle === 'solid' ? '━' : '═';
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

  const pushDivider = (char) => blocks.push({ type: 'divider', char });
  const pushDouble = (char) => blocks.push({ type: 'doubleDivider', char });
  const pushRow = (label, value, emphasis = false) => {
    blocks.push({
      type: 'row',
      label,
      value,
      labelFont: ty.labelFont,
      valueFont: emphasis ? Math.min((ty.bodyFont || 18) + 3, 28) : ty.bodyFont,
      emphasis
    });
  };

  blocks.push({ type: 'ornament', char: '✦', repeat: 3 });

  if (b.showLogo && b.logoUrl) {
    blocks.push({ type: 'logo', url: b.logoUrl, maxWidth: b.logoWidth });
    blocks.push({ type: 'blank', count: 1 });
  }
  if (b.legalName) blocks.push({ type: 'text', text: b.legalName, fontSize: b.legalNameFont, bold: true });
  if (b.companyName) blocks.push({ type: 'text', text: b.companyName, fontSize: b.companyFont, muted: true });
  pushDouble(heavy);
  if (b.title) {
    const subText = c.showDeliveryNo ? `رقم الوصل: ${ctx.deliveryNo}` : '';
    blocks.push({
      type: 'titleBadge',
      text: b.title,
      subText,
      fontSize: b.titleFont,
      subFontSize: ty.labelFont,
      char: heavy
    });
  }
  blocks.push({ type: 'blank', count: 1 });

  const metaRows = [];
  if (c.showDate) metaRows.push({ label: 'التاريخ', value: ctx.date });
  if (c.showAgent) metaRows.push({ label: 'المندوب', value: ctx.agent });
  if (c.showDeliveryNo && !b.title) metaRows.unshift({ label: 'رقم الوصل', value: ctx.deliveryNo });

  if (metaRows.length) {
    blocks.push({ type: 'metaStart' });
    metaRows.forEach((r) => pushRow(r.label, r.value));
    blocks.push({ type: 'metaEnd' });
  }

  if (c.showCustomer) {
    blocks.push({
      type: 'customerBox',
      label: 'الزبون',
      value: ctx.customer,
      labelFont: ty.labelFont,
      valueFont: Math.min((ty.bodyFont || 18) + 6, 34),
      char: div
    });
  }
  if (c.showCustomerNum && ctx.customerNum) pushRow('رقم الحساب', ctx.customerNum);
  if (c.showTree && ctx.tree) pushRow('الشجرة', ctx.tree);

  pushDouble(heavy);
  blocks.push({ type: 'amountBox', label: 'المبلغ المستلم (نقداً)', value: ctx.amount, fontSize: ty.amountFont, char: heavy });
  blocks.push({ type: 'blank', count: 1 });
  if (c.legalText) blocks.push({ type: 'legalBox', text: c.legalText, fontSize: ty.legalFont, char: div });
  if (c.showNotes && ctx.notes) {
    blocks.push({ type: 'notesBox', label: 'ملاحظات', text: ctx.notes, labelFont: ty.labelFont, fontSize: ty.bodyFont });
  }
  pushDivider(div);
  if (b.footer) blocks.push({ type: 'text', text: b.footer, fontSize: b.footerFont });
  blocks.push({ type: 'ornament', char: '✦', repeat: 3 });

  return { blocks };
}

function onThermalFormChange() {
  thermalTplAdmin.template = thermalFromForm();
  thermalTplAdmin.preview = buildClientPreview(thermalTplAdmin.template);
  renderThermalPreview();
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
  });

  document.getElementById('btnThermalSave')?.addEventListener('click', () => saveThermalTemplate());
}

async function loadThermalTemplatePage() {
  const data = await commerceApi('/delivery-receipts/print-template');
  thermalTplAdmin.template = data.template;
  thermalTplAdmin.defaults = data.defaults;
  thermalTplAdmin.preview = data.preview || buildClientPreview(data.template);
  fillThermalForm(data.template);
  renderThermalPreview();
}

async function saveThermalTemplate() {
  try {
    const template = thermalFromForm();
    const data = await commerceApi('/delivery-receipts/print-template', {
      method: 'PUT',
      body: JSON.stringify({ template })
    });
    thermalTplAdmin.template = data.template;
    thermalTplAdmin.preview = data.preview;
    fillThermalForm(data.template);
    renderThermalPreview();
    showToast('تم حفظ تصميم الفاتورة الحرارية');
  } catch (err) {
    showToast(err.message, 'err');
  }
}

bindThermalGlobals();

window.adminPages = window.adminPages || {};
window.adminPages.thermalReceipt = loadThermalTemplatePage;

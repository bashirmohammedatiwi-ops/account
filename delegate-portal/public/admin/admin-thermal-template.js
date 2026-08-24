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
    paperMm: 58,
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

function renderThermalPreview() {
  const box = document.getElementById('thermalPreviewPaper');
  if (!box) return;
  const preview = thermalTplAdmin.preview;
  if (!preview?.blocks) {
    box.innerHTML = '<p class="muted">لا معاينة</p>';
    return;
  }

  const html = [];
  for (const block of preview.blocks) {
    if (block.type === 'logo' && block.url) {
      html.push(`<div class="tp-logo"><img src="${esc(block.url)}" alt="logo"></div>`);
    } else if (block.type === 'text') {
      let cls = 'tp-footer';
      if (block.bold && (block.fontSize || 0) >= 22) cls = 'tp-title';
      else if (block.bold) cls = 'tp-legal';
      else if ((block.fontSize || 0) <= 18) cls = 'tp-company';
      html.push(`<div class="${cls}" style="font-size:${(block.fontSize || 16) * 0.42}px">${esc(block.text)}</div>`);
    } else if (block.type === 'divider') {
      const ch = block.char || '─';
      html.push(`<div class="tp-divider">${ch.repeat(28)}</div>`);
    } else if (block.type === 'blank') {
      html.push('<div class="tp-blank"></div>');
    } else if (block.type === 'row') {
      html.push(`<div class="tp-row"><span class="tp-row-label" style="font-size:${(block.labelFont || 14) * 0.4}px">${esc(block.label)}</span><span class="tp-row-value" style="font-size:${(block.valueFont || 16) * 0.4}px">${esc(block.value)}</span></div>`);
    } else if (block.type === 'amount') {
      html.push(`<div class="tp-amount"><div class="tp-amount-label">${esc(block.label || '')}</div><div class="tp-amount-value" style="font-size:${(block.fontSize || 28) * 0.45}px">${esc(block.value)}</div></div>`);
    }
  }
  box.innerHTML = html.join('');
}

function buildClientPreview(template) {
  const t = template;
  const b = t.branding || {};
  const ty = t.typography || {};
  const c = t.content || {};
  const div = c.dividerStyle === 'solid' ? '━' : '─';
  const blocks = [];
  const sample = {
    deliveryNo: 'WR-20260824-0001',
    date: new Date().toISOString().slice(0, 10),
    agent: 'مندوب تجريبي',
    customer: 'محل الأمين / بغداد',
    customerNum: '1201042',
    tree: 'شجرة بغداد',
    amount: '250,000 IQD',
    notes: 'دفعة شهرية'
  };

  if (b.showLogo && b.logoUrl) blocks.push({ type: 'logo', url: b.logoUrl });
  if (b.legalName) blocks.push({ type: 'text', text: b.legalName, fontSize: b.legalNameFont, bold: true });
  if (b.companyName) blocks.push({ type: 'text', text: b.companyName, fontSize: b.companyFont });
  blocks.push({ type: 'divider', char: div });
  if (b.title) blocks.push({ type: 'text', text: b.title, fontSize: b.titleFont, bold: true });
  blocks.push({ type: 'blank', count: 1 });
  if (c.showDeliveryNo) blocks.push({ type: 'row', label: 'رقم الوصل', value: sample.deliveryNo, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  if (c.showDate) blocks.push({ type: 'row', label: 'التاريخ', value: sample.date, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  if (c.showAgent) blocks.push({ type: 'row', label: 'المندوب', value: sample.agent, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  if (c.showCustomer) blocks.push({ type: 'row', label: 'الزبون', value: sample.customer, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  if (c.showCustomerNum) blocks.push({ type: 'row', label: 'رقم الحساب', value: sample.customerNum, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  if (c.showTree) blocks.push({ type: 'row', label: 'الشجرة', value: sample.tree, labelFont: ty.labelFont, valueFont: ty.bodyFont });
  blocks.push({ type: 'divider', char: div });
  blocks.push({ type: 'amount', label: 'المبلغ المستلم', value: sample.amount, fontSize: ty.amountFont });
  blocks.push({ type: 'blank', count: 1 });
  if (c.legalText) blocks.push({ type: 'text', text: c.legalText, fontSize: ty.legalFont });
  if (c.showNotes && sample.notes) blocks.push({ type: 'text', text: sample.notes, fontSize: ty.bodyFont });
  blocks.push({ type: 'divider', char: div });
  if (b.footer) blocks.push({ type: 'text', text: b.footer, fontSize: b.footerFont });
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
    'thermalShowCustomerNum', 'thermalShowTree', 'thermalShowNotes', 'thermalDividerStyle'
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

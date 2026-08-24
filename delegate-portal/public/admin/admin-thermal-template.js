/* Admin: thermal delivery receipt template designer */

const thermalTplAdmin = {
  template: null,
  fieldLabels: {},
  defaults: null,
  selectedIndex: -1
};

const THERMAL_FIELD_OPTIONS = [
  'company', 'title', 'deliveryNo', 'date', 'agent', 'customer', 'customerNum', 'tree', 'amount', 'notes', 'footer'
];

function thermalLineSummary(line) {
  if (!line) return '';
  if (line.type === 'separator') return `خط فاصل (${line.char || '='})`;
  if (line.type === 'blank') return `سطر فارغ × ${line.count || 1}`;
  if (line.type === 'field') {
    const label = thermalTplAdmin.fieldLabels[line.field] || line.field;
    return `حقل: ${label}`;
  }
  return line.text || 'نص';
}

function renderThermalPreview() {
  const box = document.getElementById('thermalPreviewPaper');
  if (!box || !thermalTplAdmin.template) return;
  const lines = buildPreviewLinesClient(thermalTplAdmin.template);
  box.innerHTML = lines.map((ln) => {
    const cls = ln.size === 2 ? 'thermal-line thermal-line-lg' : 'thermal-line';
    return `<div class="${cls}">${esc(ln.text) || '&nbsp;'}</div>`;
  }).join('');
}

function buildPreviewLinesClient(template) {
  const width = Number(template.paperChars) || 32;
  const sample = template.sample || {};
  const ctx = {
    company: sample.company || 'Edari',
    title: sample.title || 'وصل استلام مبلغ',
    footer: sample.footer || 'شكراً لتعاملكم',
    deliveryNo: 'WR-20260824-0001',
    date: new Date().toISOString().slice(0, 10),
    agent: 'مندوب تجريبي',
    customer: 'محل الأمين / بغداد',
    customerNum: '1201042',
    tree: 'شجرة بغداد',
    amount: 250000,
    notes: 'دفعة شهرية'
  };
  const pad = (text, align) => {
    const t = String(text ?? '');
    if (t.length >= width) return t.slice(0, width);
    if (align === 'center') {
      const left = Math.floor((width - t.length) / 2);
      return `${' '.repeat(left)}${t}`;
    }
    return t;
  };
  const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('en-US')} IQD`;
  const fieldVal = (field) => {
    switch (field) {
      case 'company': return ctx.company;
      case 'title': return ctx.title;
      case 'footer': return ctx.footer;
      case 'deliveryNo': return ctx.deliveryNo;
      case 'date': return ctx.date;
      case 'agent': return ctx.agent;
      case 'customer': return ctx.customer;
      case 'customerNum': return ctx.customerNum;
      case 'tree': return ctx.tree;
      case 'amount': return money(ctx.amount);
      case 'notes': return ctx.notes;
      default: return '';
    }
  };
  const out = [];
  for (const line of template.lines || []) {
    if (line.type === 'separator') {
      const c = String(line.char || '=').slice(0, 1);
      out.push({ text: c.repeat(width), size: line.size || 1 });
    } else if (line.type === 'blank') {
      for (let i = 0; i < (line.count || 1); i += 1) out.push({ text: '', size: 1 });
    } else if (line.type === 'field') {
      const v = fieldVal(line.field);
      if (line.hideIfEmpty && !v) continue;
      out.push({ text: pad(`${line.prefix || ''}${v}${line.suffix || ''}`, line.align), size: line.size || 1 });
    } else {
      out.push({ text: pad(line.text || '', line.align), size: line.size || 1 });
    }
  }
  const blanks = Number(template.footerBlankLines) || 0;
  for (let i = 0; i < blanks; i += 1) out.push({ text: '', size: 1 });
  return out;
}

function renderThermalLineEditor() {
  const panel = document.getElementById('thermalLineEditor');
  const list = document.getElementById('thermalLinesList');
  if (!panel || !list || !thermalTplAdmin.template) return;

  list.innerHTML = (thermalTplAdmin.template.lines || []).map((line, i) => `
    <button type="button" class="thermal-line-item${thermalTplAdmin.selectedIndex === i ? ' active' : ''}" data-thermal-idx="${i}">
      <span class="thermal-line-item-type">${esc(line.type)}</span>
      <span class="thermal-line-item-sum">${esc(thermalLineSummary(line))}</span>
      <span class="thermal-line-item-actions">
        <button type="button" class="btn btn-icon btn-sm" data-thermal-up="${i}" title="أعلى">↑</button>
        <button type="button" class="btn btn-icon btn-sm" data-thermal-down="${i}" title="أسفل">↓</button>
        <button type="button" class="btn btn-icon btn-sm" data-thermal-del="${i}" title="حذف">×</button>
      </span>
    </button>`).join('') || '<p class="muted">لا توجد أسطر — أضف من الأزرار</p>';

  list.querySelectorAll('[data-thermal-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      thermalTplAdmin.selectedIndex = Number(btn.dataset.thermalIdx);
      renderThermalLineEditor();
    });
  });
  list.querySelectorAll('[data-thermal-up]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveThermalLine(Number(btn.dataset.thermalUp), -1);
    });
  });
  list.querySelectorAll('[data-thermal-down]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveThermalLine(Number(btn.dataset.thermalDown), 1);
    });
  });
  list.querySelectorAll('[data-thermal-del]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteThermalLine(Number(btn.dataset.thermalDel));
    });
  });

  const idx = thermalTplAdmin.selectedIndex;
  const line = thermalTplAdmin.template.lines?.[idx];
  if (!line) {
    panel.innerHTML = '<p class="muted">اختر سطراً للتعديل أو أضف سطراً جديداً</p>';
    return;
  }

  if (line.type === 'text') {
    panel.innerHTML = `
      <h4 class="panel-title-sm">تعديل نص ثابت</h4>
      <label class="field"><span>النص</span><textarea id="thermalEditText" rows="2">${esc(line.text || '')}</textarea></label>
      <div class="rv-edit-grid">
        <label class="field"><span>محاذاة</span>
          <select id="thermalEditAlign"><option value="left" ${line.align !== 'center' ? 'selected' : ''}>يسار</option><option value="center" ${line.align === 'center' ? 'selected' : ''}>وسط</option></select></label>
        <label class="field"><span>حجم</span>
          <select id="thermalEditSize"><option value="1" ${line.size !== 2 ? 'selected' : ''}>عادي</option><option value="2" ${line.size === 2 ? 'selected' : ''}>كبير</option></select></label>
      </div>`;
    panel.querySelector('#thermalEditText')?.addEventListener('input', (e) => {
      line.text = e.target.value;
      renderThermalPreview();
    });
    panel.querySelector('#thermalEditAlign')?.addEventListener('change', (e) => {
      line.align = e.target.value;
      renderThermalPreview();
    });
    panel.querySelector('#thermalEditSize')?.addEventListener('change', (e) => {
      line.size = Number(e.target.value);
      renderThermalPreview();
    });
    return;
  }

  if (line.type === 'separator') {
    panel.innerHTML = `
      <h4 class="panel-title-sm">خط فاصل</h4>
      <div class="rv-edit-grid">
        <label class="field"><span>الرمز</span><input type="text" id="thermalSepChar" maxlength="1" value="${esc(line.char || '=')}"></label>
        <label class="field"><span>حجم</span>
          <select id="thermalEditSize"><option value="1" ${line.size !== 2 ? 'selected' : ''}>عادي</option><option value="2" ${line.size === 2 ? 'selected' : ''}>كبير</option></select></label>
      </div>`;
    panel.querySelector('#thermalSepChar')?.addEventListener('input', (e) => {
      line.char = e.target.value.slice(0, 1) || '=';
      renderThermalPreview();
    });
    panel.querySelector('#thermalEditSize')?.addEventListener('change', (e) => {
      line.size = Number(e.target.value);
      renderThermalPreview();
    });
    return;
  }

  if (line.type === 'field') {
    const opts = THERMAL_FIELD_OPTIONS.map((f) =>
      `<option value="${f}" ${line.field === f ? 'selected' : ''}>${esc(thermalTplAdmin.fieldLabels[f] || f)}</option>`
    ).join('');
    panel.innerHTML = `
      <h4 class="panel-title-sm">حقل ديناميكي</h4>
      <label class="field"><span>الحقل</span><select id="thermalFieldKey">${opts}</select></label>
      <div class="rv-edit-grid">
        <label class="field"><span>بادئة</span><input type="text" id="thermalFieldPrefix" value="${esc(line.prefix || '')}"></label>
        <label class="field"><span>لاحقة</span><input type="text" id="thermalFieldSuffix" value="${esc(line.suffix || '')}"></label>
      </div>
      <div class="rv-edit-grid">
        <label class="field"><span>محاذاة</span>
          <select id="thermalEditAlign"><option value="left" ${line.align !== 'center' ? 'selected' : ''}>يسار</option><option value="center" ${line.align === 'center' ? 'selected' : ''}>وسط</option></select></label>
        <label class="field"><span>حجم</span>
          <select id="thermalEditSize"><option value="1" ${line.size !== 2 ? 'selected' : ''}>عادي</option><option value="2" ${line.size === 2 ? 'selected' : ''}>كبير</option></select></label>
      </div>
      <label class="check-row"><input type="checkbox" id="thermalFieldHide" ${line.hideIfEmpty ? 'checked' : ''}><span>إخفاء إذا فارغ (مثل الملاحظات)</span></label>`;
    const bind = (sel, fn) => panel.querySelector(sel)?.addEventListener('input', fn);
    panel.querySelector('#thermalFieldKey')?.addEventListener('change', (e) => {
      line.field = e.target.value;
      renderThermalLineEditor();
      renderThermalPreview();
    });
    bind('#thermalFieldPrefix', (e) => { line.prefix = e.target.value; renderThermalPreview(); });
    bind('#thermalFieldSuffix', (e) => { line.suffix = e.target.value; renderThermalPreview(); });
    panel.querySelector('#thermalEditAlign')?.addEventListener('change', (e) => {
      line.align = e.target.value;
      renderThermalPreview();
    });
    panel.querySelector('#thermalEditSize')?.addEventListener('change', (e) => {
      line.size = Number(e.target.value);
      renderThermalPreview();
    });
    panel.querySelector('#thermalFieldHide')?.addEventListener('change', (e) => {
      line.hideIfEmpty = e.target.checked;
      renderThermalPreview();
    });
    return;
  }

  if (line.type === 'blank') {
    panel.innerHTML = `
      <h4 class="panel-title-sm">سطر فارغ</h4>
      <label class="field"><span>عدد الأسطر</span><input type="number" id="thermalBlankCount" min="1" max="5" value="${line.count || 1}"></label>`;
    panel.querySelector('#thermalBlankCount')?.addEventListener('input', (e) => {
      line.count = Math.min(5, Math.max(1, Number(e.target.value) || 1));
      renderThermalPreview();
    });
  }
}

function moveThermalLine(index, delta) {
  const lines = thermalTplAdmin.template.lines;
  const next = index + delta;
  if (next < 0 || next >= lines.length) return;
  const [item] = lines.splice(index, 1);
  lines.splice(next, 0, item);
  thermalTplAdmin.selectedIndex = next;
  renderThermalLineEditor();
  renderThermalPreview();
}

function deleteThermalLine(index) {
  thermalTplAdmin.template.lines.splice(index, 1);
  thermalTplAdmin.selectedIndex = Math.min(index, thermalTplAdmin.template.lines.length - 1);
  renderThermalLineEditor();
  renderThermalPreview();
}

function addThermalLine(type) {
  const lines = thermalTplAdmin.template.lines || [];
  let line;
  if (type === 'separator') line = { type: 'separator', char: '=', size: 2 };
  else if (type === 'blank') line = { type: 'blank', count: 1 };
  else if (type === 'field') line = { type: 'field', field: 'amount', align: 'left', size: 2, prefix: 'المبلغ: ', suffix: '' };
  else line = { type: 'text', text: 'نص جديد', align: 'center', size: 1 };
  lines.push(line);
  thermalTplAdmin.template.lines = lines;
  thermalTplAdmin.selectedIndex = lines.length - 1;
  renderThermalLineEditor();
  renderThermalPreview();
}

function bindThermalGlobals() {
  document.getElementById('thermalPaperChars')?.addEventListener('input', (e) => {
    thermalTplAdmin.template.paperChars = Math.min(48, Math.max(24, Number(e.target.value) || 32));
    renderThermalPreview();
  });
  document.getElementById('thermalFooterBlanks')?.addEventListener('input', (e) => {
    thermalTplAdmin.template.footerBlankLines = Math.min(8, Math.max(0, Number(e.target.value) || 0));
    renderThermalPreview();
  });
  ['thermalSampleCompany', 'thermalSampleTitle', 'thermalSampleFooter'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const key = id.replace('thermalSample', '').toLowerCase();
      thermalTplAdmin.template.sample = thermalTplAdmin.template.sample || {};
      if (key === 'company') thermalTplAdmin.template.sample.company = e.target.value;
      if (key === 'title') thermalTplAdmin.template.sample.title = e.target.value;
      if (key === 'footer') thermalTplAdmin.template.sample.footer = e.target.value;
      renderThermalPreview();
    });
  });
  document.getElementById('btnThermalAddText')?.addEventListener('click', () => addThermalLine('text'));
  document.getElementById('btnThermalAddField')?.addEventListener('click', () => addThermalLine('field'));
  document.getElementById('btnThermalAddSep')?.addEventListener('click', () => addThermalLine('separator'));
  document.getElementById('btnThermalAddBlank')?.addEventListener('click', () => addThermalLine('blank'));
  document.getElementById('btnThermalReset')?.addEventListener('click', () => {
    if (!confirm('استعادة التصميم الافتراضي؟')) return;
    thermalTplAdmin.template = JSON.parse(JSON.stringify(thermalTplAdmin.defaults || {}));
    thermalTplAdmin.selectedIndex = 0;
    fillThermalFormFields();
    renderThermalLineEditor();
    renderThermalPreview();
  });
  document.getElementById('btnThermalSave')?.addEventListener('click', () => saveThermalTemplate());
}

function fillThermalFormFields() {
  const t = thermalTplAdmin.template;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('thermalPaperChars', t.paperChars || 32);
  set('thermalFooterBlanks', t.footerBlankLines ?? 3);
  set('thermalSampleCompany', t.sample?.company || '');
  set('thermalSampleTitle', t.sample?.title || '');
  set('thermalSampleFooter', t.sample?.footer || '');
}

async function loadThermalTemplatePage() {
  const data = await commerceApi('/delivery-receipts/print-template');
  thermalTplAdmin.template = data.template;
  thermalTplAdmin.fieldLabels = data.fieldLabels || {};
  thermalTplAdmin.defaults = data.defaults;
  thermalTplAdmin.selectedIndex = 0;
  fillThermalFormFields();
  renderThermalLineEditor();
  renderThermalPreview();
}

async function saveThermalTemplate() {
  try {
    const data = await commerceApi('/delivery-receipts/print-template', {
      method: 'PUT',
      body: JSON.stringify({ template: thermalTplAdmin.template })
    });
    thermalTplAdmin.template = data.template;
    showToast('تم حفظ تصميم الوصل الحراري');
    renderThermalPreview();
  } catch (err) {
    showToast(err.message, 'err');
  }
}

bindThermalGlobals();

window.adminPages = window.adminPages || {};
window.adminPages.thermalReceipt = loadThermalTemplatePage;

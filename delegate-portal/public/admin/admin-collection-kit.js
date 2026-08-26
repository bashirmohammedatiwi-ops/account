/* Shared UI helpers for collection pages (receipts, delivery, customers, promo) */

function colAgentInitial(name) {
  const ch = String(name || '?').trim().charAt(0);
  return ch || '?';
}

function colStatusPill(status, label, map = {}) {
  const cls = map[status] || 'pending';
  return `<span class="rcv-pill rcv-pill-${cls}">${esc(label)}</span>`;
}

function colRenderStatGrid(el, cards, onFilter) {
  if (!el) return;
  el.innerHTML = cards.map((c) => {
    const clickable = c.clickable !== false;
    const tag = clickable ? 'button' : 'article';
    const attrs = clickable ? ` type="button" data-col-stat="${esc(c.filterKey || c.key || '')}"` : '';
    const value = c.money ? fmtMoney(c.count || 0) : fmtNumAlways(c.count || 0);
    const sub = c.subMoney != null
      ? `<span class="rcv-stat-amt num-en" dir="ltr">${fmtMoney(c.subMoney || 0)}</span>`
      : (c.subText ? `<span class="rcv-stat-amt">${esc(c.subText)}</span>` : '');
    return `
    <${tag}${attrs} class="rcv-stat rcv-stat-${c.cls}${clickable ? ' rcv-stat-btn' : ''}">
      <span class="rcv-stat-label">${esc(c.label)}</span>
      <strong class="rcv-stat-value num-en" dir="ltr">${value}</strong>
      ${sub}
    </${tag}>`;
  }).join('');
  if (onFilter) {
    el.querySelectorAll('[data-col-stat]').forEach((btn) => {
      btn.addEventListener('click', () => onFilter(btn.dataset.colStat));
    });
  }
}

function colSyncChips(active, chipSelector = '[data-col-chip]') {
  document.querySelectorAll(chipSelector).forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.colChip === active);
  });
}

function colDetailNav(ids, currentId) {
  const idx = ids.indexOf(currentId);
  const prev = idx > 0 ? ids[idx - 1] : null;
  const next = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;
  return `
    <div class="rcv-detail-nav">
      <button type="button" class="btn btn-soft btn-sm" data-col-prev="${prev || ''}" ${prev ? '' : 'disabled'}>السابق</button>
      <span class="rcv-detail-nav-pos num-en" dir="ltr">${idx >= 0 ? fmtNumAlways(idx + 1) : '—'} / ${fmtNumAlways(ids.length)}</span>
      <button type="button" class="btn btn-soft btn-sm" data-col-next="${next || ''}" ${next ? '' : 'disabled'}>التالي</button>
    </div>`;
}

function colBindDetailNav(openFn) {
  document.querySelector('[data-col-prev]:not([disabled])')?.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.colPrev);
    if (id) void openFn(id);
  });
  document.querySelector('[data-col-next]:not([disabled])')?.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.dataset.colNext);
    if (id) void openFn(id);
  });
}

function colDetailEmptyHtml(title, hint) {
  return `
    <div class="rcv-detail-empty">
      <div class="rcv-detail-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h6"/></svg>
      </div>
      <strong>${esc(title)}</strong>
      <p>${esc(hint)}</p>
    </div>`;
}

function colShowDetailEmpty(panel, title, hint) {
  if (!panel) return;
  panel.classList.remove('has-receipt');
  panel.innerHTML = colDetailEmptyHtml(title, hint);
}

function colSetViewMode(mode, prefix, store) {
  const view = mode === 'cards' ? 'cards' : 'table';
  if (store) store.viewMode = view;
  document.querySelectorAll(`[data-col-view="${prefix}"]`).forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.colViewMode === view);
  });
  document.getElementById(`${prefix}TableWrap`)?.classList.toggle('hidden', view !== 'table');
  document.getElementById(`${prefix}CardsGrid`)?.classList.toggle('hidden', view !== 'cards');
}

function colInitViewToggle(prefix, store, rerender) {
  document.querySelectorAll(`[data-col-view="${prefix}"]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      colSetViewMode(btn.dataset.colViewMode, prefix, store);
      if (rerender) rerender();
    });
  });
}

function colInitChips(onChip) {
  document.querySelectorAll('[data-col-chip]').forEach((btn) => {
    btn.addEventListener('click', () => onChip(btn.dataset.colChip));
  });
}

function colHighlightRows(selectors, activeId) {
  document.querySelectorAll(selectors).forEach((el) => {
    const id = Number(el.dataset.drRow || el.dataset.crRow || el.dataset.pvRow || el.dataset.colRow);
    el.classList.toggle('is-active', id === activeId);
  });
}

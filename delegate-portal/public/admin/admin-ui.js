/* Edari Admin UI v6 — انتقالات، لوحة أوامر، بحث، شريط علوي */

const SECTION_TONES = {
  home: 'tone-home',
  commerce: 'tone-commerce',
  collections: 'tone-collections',
  reports: 'tone-reports',
  system: 'tone-system',
  team: 'tone-team'
};

let _pageSwitchGen = 0;
let _cmdkIndex = 0;
let _cmdkItems = [];

function waitMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getMainScroller() {
  return document.getElementById('mainScroll') || document.querySelector('.main') || document.documentElement;
}

function scrollMainToTop(smooth = true) {
  const el = getMainScroller();
  if (!el) return;
  try {
    el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' });
  } catch (_) {
    el.scrollTop = 0;
  }
}

function showPageLoadingBar(show) {
  const bar = document.getElementById('pageLoadingBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !show);
  bar.classList.toggle('is-active', show);
}

function animateTopbar(meta, pageName) {
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSubtitle');
  [titleEl, subEl].forEach((el) => {
    if (!el) return;
    el.classList.remove('topbar-text-in');
    void el.offsetWidth;
    el.classList.add('topbar-text-in');
  });
  if (titleEl && meta?.title) titleEl.textContent = meta.title;
  if (subEl && meta?.sub) subEl.textContent = meta.sub;

  const backBtn = document.getElementById('btnTopbarBack');
  if (backBtn) backBtn.classList.toggle('hidden', !pageName || pageName === 'dashboard');

  updateTopbarIcon(pageName);
}

function updateTopbarIcon(pageName) {
  const host = document.getElementById('topbarPageIcon');
  if (!host || typeof findNavSection !== 'function') return;
  const hit = findNavSection(pageName);
  const icon = hit?.item?.icon || 'home';
  if (typeof navIcon === 'function') {
    host.innerHTML = navIcon(icon);
  }
}

function setWorkspaceTone(sectionId) {
  const workspace = document.querySelector('.workspace');
  if (!workspace) return;
  Object.values(SECTION_TONES).forEach((c) => workspace.classList.remove(c));
  if (sectionId && SECTION_TONES[sectionId]) {
    workspace.classList.add(SECTION_TONES[sectionId]);
  }
}

async function switchAdminPage(name, meta) {
  const gen = ++_pageSwitchGen;
  const next = document.getElementById(`page-${name}`);
  const current = document.querySelector('.page.active');
  if (!next) return;

  showPageLoadingBar(true);
  const viewport = document.getElementById('pageViewport');
  if (viewport) viewport.classList.add('is-switching');

  if (current && current !== next) {
    current.classList.add('is-leaving');
    current.setAttribute('aria-hidden', 'true');
    await waitMs(120);
    if (gen !== _pageSwitchGen) return;
    current.classList.remove('active', 'is-leaving');
  } else if (current === next) {
    animateTopbar(meta, name);
    showPageLoadingBar(false);
    if (viewport) viewport.classList.remove('is-switching');
    return;
  }

  document.querySelectorAll('.page').forEach((p) => {
    if (p !== next) {
      p.classList.remove('active', 'is-leaving', 'is-entering', 'is-settled');
      p.setAttribute('aria-hidden', 'true');
    }
  });

  next.classList.add('active', 'is-entering');
  next.setAttribute('aria-hidden', 'false');
  void next.offsetWidth;
  next.classList.remove('is-entering');

  scrollMainToTop(true);
  animateTopbar(meta, name);

  await waitMs(300);
  if (gen !== _pageSwitchGen) return;
  showPageLoadingBar(false);
  if (viewport) viewport.classList.remove('is-switching');
  next.classList.add('is-settled');
  window.setTimeout(() => next.classList.remove('is-settled'), 400);
}

function closeMobileSidebarIfOpen() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar?.classList.contains('is-open')) return;
  sidebar.classList.remove('is-open');
  document.body.classList.remove('sidebar-open');
}

function filterSidebarNav(query) {
  const q = String(query || '').trim().toLowerCase();
  document.querySelectorAll('#sidebarNav .nav-item').forEach((btn) => {
    const text = btn.textContent.toLowerCase();
    const match = !q || text.includes(q);
    btn.classList.toggle('nav-filter-hidden', !match);
    if (match && q) {
      btn.closest('.nav-section')?.classList.add('is-open');
    }
  });
  document.querySelectorAll('#sidebarNav .nav-section').forEach((sec) => {
    const visible = sec.querySelectorAll('.nav-item:not(.nav-filter-hidden)').length;
    sec.classList.toggle('nav-section-empty', q.length > 0 && visible === 0);
  });
}

function getCmdkItems() {
  if (typeof flattenAdminNav === 'function') return flattenAdminNav();
  return [];
}

function renderCmdkList(filter = '') {
  const list = document.getElementById('cmdkList');
  if (!list) return;
  const q = filter.trim().toLowerCase();
  _cmdkItems = getCmdkItems().filter((item) => {
    if (!q) return true;
    const hay = [item.label, item.desc, item.section, item.page].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
  _cmdkIndex = 0;
  if (!_cmdkItems.length) {
    list.innerHTML = '<li class="cmdk-empty">لا توجد نتائج</li>';
    return;
  }
  list.innerHTML = _cmdkItems.map((item, i) => `
    <li>
      <button type="button" class="cmdk-item${i === 0 ? ' is-active' : ''}" data-page="${item.page}" data-idx="${i}">
        <span class="cmdk-item-icon">${typeof navIcon === 'function' ? navIcon(item.icon) : ''}</span>
        <span class="cmdk-item-body">
          <strong>${typeof esc === 'function' ? esc(item.label) : item.label}</strong>
          <span>${typeof esc === 'function' ? esc(item.section) : item.section}${item.desc ? ` · ${typeof esc === 'function' ? esc(item.desc) : item.desc}` : ''}</span>
        </span>
      </button>
    </li>`).join('');

  list.querySelectorAll('.cmdk-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeCmdk();
      if (typeof showPage === 'function') showPage(btn.dataset.page);
    });
  });
}

function setCmdkActive(idx) {
  const list = document.getElementById('cmdkList');
  if (!list || !_cmdkItems.length) return;
  _cmdkIndex = Math.max(0, Math.min(idx, _cmdkItems.length - 1));
  list.querySelectorAll('.cmdk-item').forEach((el, i) => {
    el.classList.toggle('is-active', i === _cmdkIndex);
    if (i === _cmdkIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function openCmdk() {
  const el = document.getElementById('cmdk');
  const input = document.getElementById('cmdkInput');
  if (!el || !input) return;
  el.hidden = false;
  el.classList.remove('hidden');
  document.body.classList.add('cmdk-open');
  input.value = '';
  renderCmdkList('');
  window.setTimeout(() => input.focus(), 30);
}

function closeCmdk() {
  const el = document.getElementById('cmdk');
  if (!el) return;
  el.hidden = true;
  el.classList.add('hidden');
  document.body.classList.remove('cmdk-open');
}

function initCommandPalette() {
  document.getElementById('btnOpenCmdk')?.addEventListener('click', openCmdk);
  document.getElementById('cmdkBackdrop')?.addEventListener('click', closeCmdk);
  document.getElementById('cmdkInput')?.addEventListener('input', (e) => {
    renderCmdkList(e.target.value);
  });
  document.getElementById('cmdkInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCmdkActive(_cmdkIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdkActive(_cmdkIndex - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = _cmdkItems[_cmdkIndex];
      if (item) {
        closeCmdk();
        if (typeof showPage === 'function') showPage(item.page);
      }
    } else if (e.key === 'Escape') closeCmdk();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (document.getElementById('cmdk')?.hidden) openCmdk();
      else closeCmdk();
    }
    if (e.key === 'Escape') closeCmdk();
  });
}

function initSidebarNavFilter() {
  const input = document.getElementById('sidebarNavFilter');
  if (!input) return;
  input.addEventListener('input', () => filterSidebarNav(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      filterSidebarNav('');
      input.blur();
    }
  });
}

function initAdminUi() {
  document.getElementById('btnTopbarBack')?.addEventListener('click', () => {
    if (typeof showPage === 'function') showPage('dashboard');
  });

  document.getElementById('sidebarNav')?.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item')) closeMobileSidebarIfOpen();
  });

  initCommandPalette();
  initSidebarNavFilter();

  document.querySelectorAll('.page').forEach((p) => {
    if (!p.classList.contains('active')) p.setAttribute('aria-hidden', 'true');
  });
  const active = document.querySelector('.page.active');
  if (active) {
    active.setAttribute('aria-hidden', 'false');
    active.classList.add('is-settled');
  }
}

function dashGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'صباح الخير';
  if (h < 17) return 'مساء الخير';
  return 'مساء النور';
}

window.switchAdminPage = switchAdminPage;
window.animateTopbar = animateTopbar;
window.updateTopbarIcon = updateTopbarIcon;
window.setWorkspaceTone = setWorkspaceTone;
window.scrollMainToTop = scrollMainToTop;
window.initAdminUi = initAdminUi;
window.openCmdk = openCmdk;
window.dashGreeting = dashGreeting;
window.SECTION_TONES = SECTION_TONES;

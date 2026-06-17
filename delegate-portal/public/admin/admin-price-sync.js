const DEFAULT_PRICE_APP_SERVER = 'http://187.124.23.65:5000';

function resolvePriceAppServerUrl() {
  const saved = (localStorage.getItem('priceAppServerUrl') || '').trim().replace(/\/$/, '');
  const input = (document.getElementById('priceAppServerUrl')?.value || '').trim().replace(/\/$/, '');
  return input || saved || DEFAULT_PRICE_APP_SERVER;
}

function applyPriceAppServerUrl(url) {
  const norm = String(url || '').trim().replace(/\/$/, '');
  if (!norm) return;
  localStorage.setItem('priceAppServerUrl', norm);
  const el = document.getElementById('priceAppServerUrl');
  if (el) el.value = norm;
}

function resolvePriceSyncKey() {
  const saved = (localStorage.getItem('priceSyncKey') || '').trim();
  const input = (document.getElementById('priceSyncKey')?.value || '').trim();
  return input || saved || '';
}

function applyPriceSyncKey(key) {
  const norm = String(key || '').trim();
  localStorage.setItem('priceSyncKey', norm);
  const el = document.getElementById('priceSyncKey');
  if (el) el.value = norm;
}

function hasPriceSyncHistory() {
  return localStorage.getItem('priceSyncHasHistory') === '1';
}

function markPriceSyncHistory() {
  localStorage.setItem('priceSyncHasHistory', '1');
  updatePriceSyncModeUi();
}

function updatePriceSyncModeUi() {
  const hint = document.getElementById('priceSyncModeHint');
  const btn = document.getElementById('btnPriceSyncNow');
  if (hint) {
    hint.textContent = hasPriceSyncHistory()
      ? 'الزر الرئيسي يرفع التحديثات الجديدة فقط. استخدم «مزامنة كاملة» لإعادة رفع كل حركات المشتريات من Edari.'
      : 'أول مرة: نفّذ «مزامنة كاملة» لرفع كل حركات المشتريات (فواتير Kind=1 — مثل تقرير حركة المادة). بعدها «تحديث» يرفع الجديد فقط.';
  }
  if (btn) {
    btn.textContent = hasPriceSyncHistory() ? 'تحديث الأسعار' : 'مزامنة كاملة';
  }
}

function setPriceSyncStatus(text, state = '') {
  const el = document.getElementById('priceSyncStatus');
  if (!el) return;
  el.textContent = text;
  el.className = `price-sync-status ${state}`.trim();
}

function setPriceSyncProgress(visible, msg = '', pct = 0) {
  const wrap = document.getElementById('priceSyncProgress');
  const msgEl = document.getElementById('priceSyncProgressMsg');
  const barEl = document.getElementById('priceSyncProgressBar');
  if (wrap) wrap.classList.toggle('hidden', !visible);
  if (msgEl) msgEl.textContent = msg || '';
  if (barEl) barEl.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function appendPriceSyncLog(line) {
  const feed = document.getElementById('priceSyncLog');
  if (!feed) return;
  const p = document.createElement('p');
  p.textContent = line;
  feed.prepend(p);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);
}

async function verifyPriceAppServer() {
  const base = resolvePriceAppServerUrl();
  setPriceSyncStatus('جاري التحقق...', 'pending');
  try {
    const res = await fetch(`${base}/sync/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error('offline');
    setPriceSyncStatus('متصل بسيرفر الأسعار', 'ok');
    return true;
  } catch {
    setPriceSyncStatus('غير متصل بسيرفر الأسعار', 'err');
    return false;
  }
}

async function runPriceAppSync(mode = 'incremental') {
  const serverUrl = resolvePriceAppServerUrl();
  const syncKey = resolvePriceSyncKey();
  const syncMode = mode === 'full' ? 'full' : (hasPriceSyncHistory() ? 'incremental' : 'full');

  applyPriceAppServerUrl(serverUrl);
  applyPriceSyncKey(syncKey);

  if (!serverUrl) {
    alert('أدخل عنوان سيرفر الأسعار');
    return;
  }

  const btn = document.getElementById('btnPriceSyncNow');
  const fullBtn = document.getElementById('btnPriceSyncFull');
  if (btn) btn.disabled = true;
  if (fullBtn) fullBtn.disabled = true;

  const modeLabel = syncMode === 'full' ? 'مزامنة كاملة' : 'تحديث';
  setPriceSyncProgress(true, `بدء ${modeLabel}...`, 5);
  appendPriceSyncLog(`${modeLabel}: ${serverUrl}`);

  let unsubscribe = null;
  if (window.edariDesktop?.onPriceSyncProgress) {
    unsubscribe = window.edariDesktop.onPriceSyncProgress((line) => {
      appendPriceSyncLog(line);
      const m = String(line).match(/^@PROGRESS\|(\d+)\|(\d+)\|(\d+)\|(.*)$/);
      if (m) {
        const pct = Number(m[3]) || 0;
        setPriceSyncProgress(true, m[4] || 'جاري الرفع...', pct);
      }
    });
  }

  try {
    if (!window.edariDesktop?.runPriceAppSync) {
      throw new Error('المزامنة متاحة من تطبيق الإدارة على سطح المكتب فقط');
    }

    const result = await window.edariDesktop.runPriceAppSync({
      serverUrl,
      syncKey,
      mode: syncMode,
    });

    if (!result?.ok) throw new Error(result?.error || 'فشلت المزامنة');

    if (syncMode === 'full' || (result.movementsUpserted || 0) > 0) {
      markPriceSyncHistory();
    }

    const msg = result.message
      || `تم! ${result.bills || 0} فاتورة، ${result.movementsUpserted || result.movements || 0} حركة، ${result.productsUpserted || result.products || 0} منتج (${syncMode === 'full' ? 'كاملة' : 'تحديث'})`;
    setPriceSyncProgress(true, msg, 100);
    appendPriceSyncLog(msg);
    setPriceSyncStatus('آخر مزامنة ناجحة', 'ok');
    document.getElementById('priceSyncLastResult').textContent = msg;
  } catch (err) {
    const msg = err.message || 'فشلت المزامنة';
    setPriceSyncProgress(true, msg, 0);
    appendPriceSyncLog(`خطأ: ${msg}`);
    setPriceSyncStatus(msg, 'err');
    alert(msg);
  } finally {
    if (typeof unsubscribe === 'function') unsubscribe();
    if (btn) btn.disabled = false;
    if (fullBtn) fullBtn.disabled = false;
    setTimeout(() => setPriceSyncProgress(false), 2500);
  }
}

function initPriceSyncPage() {
  applyPriceAppServerUrl(resolvePriceAppServerUrl());
  applyPriceSyncKey(resolvePriceSyncKey());
  updatePriceSyncModeUi();
  void verifyPriceAppServer();
}

window.adminPages = window.adminPages || {};
window.adminPages.priceSync = initPriceSyncPage;

document.getElementById('btnPriceSyncNow')?.addEventListener('click', () => void runPriceAppSync('incremental'));
document.getElementById('btnPriceSyncFull')?.addEventListener('click', () => void runPriceAppSync('full'));
document.getElementById('btnPriceSyncVerify')?.addEventListener('click', () => void verifyPriceAppServer());
document.getElementById('priceAppServerUrl')?.addEventListener('change', () => {
  applyPriceAppServerUrl(document.getElementById('priceAppServerUrl').value);
  void verifyPriceAppServer();
});

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
  while (feed.children.length > 12) feed.removeChild(feed.lastChild);
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

async function runPriceAppSync() {
  const serverUrl = resolvePriceAppServerUrl();
  const syncKey = resolvePriceSyncKey();
  const dateFrom = document.getElementById('priceSyncDateFrom')?.value || '';
  const dateTo = document.getElementById('priceSyncDateTo')?.value || '';

  applyPriceAppServerUrl(serverUrl);
  applyPriceSyncKey(syncKey);

  if (!serverUrl) {
    alert('أدخل عنوان سيرفر الأسعار');
    return;
  }

  const btn = document.getElementById('btnPriceSyncNow');
  if (btn) btn.disabled = true;
  setPriceSyncProgress(true, 'بدء المزامنة...', 5);
  appendPriceSyncLog(`بدء المزامنة → ${serverUrl}`);

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
      dateFrom,
      dateTo,
    });

    if (!result?.ok) throw new Error(result?.error || 'فشلت المزامنة');

    const msg = `تم! ${result.productsUpserted || 0} منتج، ${result.movementsUpserted || 0} حركة، ${result.consumerPricesUpdated || 0} سعر مستهلك`;
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
    setTimeout(() => setPriceSyncProgress(false), 2500);
  }
}

function initPriceSyncPage() {
  applyPriceAppServerUrl(resolvePriceAppServerUrl());
  applyPriceSyncKey(resolvePriceSyncKey());

  const today = new Date();
  const from = new Date(today);
  from.setFullYear(from.getFullYear() - 1);
  const toEl = document.getElementById('priceSyncDateTo');
  const fromEl = document.getElementById('priceSyncDateFrom');
  if (toEl && !toEl.value) toEl.value = today.toISOString().slice(0, 10);
  if (fromEl && !fromEl.value) fromEl.value = from.toISOString().slice(0, 10);

  void verifyPriceAppServer();
}

window.adminPages = window.adminPages || {};
window.adminPages.priceSync = initPriceSyncPage;

document.getElementById('btnPriceSyncNow')?.addEventListener('click', () => void runPriceAppSync());
document.getElementById('btnPriceSyncVerify')?.addEventListener('click', () => void verifyPriceAppServer());
document.getElementById('priceAppServerUrl')?.addEventListener('change', () => {
  applyPriceAppServerUrl(document.getElementById('priceAppServerUrl').value);
  void verifyPriceAppServer();
});

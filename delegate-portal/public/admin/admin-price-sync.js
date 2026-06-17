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

function isPriceSyncAllDates() {
  const el = document.getElementById('priceSyncAllDates');
  if (!el) return true;
  if (localStorage.getItem('priceSyncAllDates') === '0') return false;
  return el.checked;
}

function applyPriceSyncAllDates(all) {
  localStorage.setItem('priceSyncAllDates', all ? '1' : '0');
  const el = document.getElementById('priceSyncAllDates');
  if (el) el.checked = all;
  updatePriceSyncDateUi();
}

function updatePriceSyncDateUi() {
  const all = isPriceSyncAllDates();
  const fromEl = document.getElementById('priceSyncDateFrom');
  const toEl = document.getElementById('priceSyncDateTo');
  const hint = document.getElementById('priceSyncDateHint');
  if (fromEl) fromEl.disabled = all;
  if (toEl) toEl.disabled = all;
  if (hint) {
    hint.textContent = all
      ? 'يُجلب كل فواتير المشتريات (Kind=3) مع كل البنود — مثل تقرير حركة المادة في Edari.'
      : 'يُرفع فقط الحركات ضمن الفترة المحددة. لجلب كل التاريخ فعّل الخيار أعلاه.';
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

async function runPriceAppSync() {
  const serverUrl = resolvePriceAppServerUrl();
  const syncKey = resolvePriceSyncKey();
  const fetchAll = isPriceSyncAllDates();
  const dateFrom = fetchAll ? '' : (document.getElementById('priceSyncDateFrom')?.value || '');
  const dateTo = fetchAll ? '' : (document.getElementById('priceSyncDateTo')?.value || '');

  applyPriceAppServerUrl(serverUrl);
  applyPriceSyncKey(syncKey);
  applyPriceSyncAllDates(fetchAll);

  if (!serverUrl) {
    alert('أدخل عنوان سيرفر الأسعار');
    return;
  }

  if (!fetchAll && (!dateFrom || !dateTo)) {
    alert('حدد تاريخ البداية والنهاية، أو فعّل «جلب كل الحركات»');
    return;
  }

  const btn = document.getElementById('btnPriceSyncNow');
  if (btn) btn.disabled = true;
  setPriceSyncProgress(true, 'بدء المزامنة...', 5);
  appendPriceSyncLog(fetchAll ? 'مزامنة: كل حركات المشتريات' : `مزامنة: ${dateFrom} → ${dateTo}`);

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
      fetchAll,
      dateFrom,
      dateTo,
    });

    if (!result?.ok) throw new Error(result?.error || 'فشلت المزامنة');

    const msg = `تم! ${result.bills || 0} فاتورة، ${result.movementsUpserted || 0} حركة، ${result.productsUpserted || 0} منتج`;
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
  from.setFullYear(from.getFullYear() - 5);
  const toEl = document.getElementById('priceSyncDateTo');
  const fromEl = document.getElementById('priceSyncDateFrom');
  if (toEl && !toEl.value) toEl.value = today.toISOString().slice(0, 10);
  if (fromEl && !fromEl.value) fromEl.value = from.toISOString().slice(0, 10);

  const savedAll = localStorage.getItem('priceSyncAllDates');
  applyPriceSyncAllDates(savedAll !== '0');

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
document.getElementById('priceSyncAllDates')?.addEventListener('change', (e) => {
  applyPriceSyncAllDates(e.target.checked);
});

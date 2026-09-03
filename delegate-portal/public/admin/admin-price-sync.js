const DEFAULT_PRICE_APP_SERVER = 'https://demaalhayaadelivery.online/price-api';
const DEFAULT_POS_SQL_SERVER = 'localhost\\FOTSQLSERVER';
const DEFAULT_POS_SQL_DATABASE = 'HAYAT2025.mdf';
const LEGACY_PRICE_APP_SERVERS = new Set([
  'http://187.124.23.65:5000',
  'http://187.124.23.65:5000/',
  'https://187.124.23.65:5000',
]);

function resolvePriceAppServerUrl() {
  const saved = (localStorage.getItem('priceAppServerUrl') || '').trim().replace(/\/$/, '');
  const input = (document.getElementById('priceAppServerUrl')?.value || '').trim().replace(/\/$/, '');
  const raw = input || saved || DEFAULT_PRICE_APP_SERVER;
  if (LEGACY_PRICE_APP_SERVERS.has(raw) || LEGACY_PRICE_APP_SERVERS.has(`${raw}/`)) {
    applyPriceAppServerUrl(DEFAULT_PRICE_APP_SERVER);
    return DEFAULT_PRICE_APP_SERVER;
  }
  return raw;
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

function resolvePosSqlConfig() {
  return {
    posSqlServer: (document.getElementById('posSqlServer')?.value || localStorage.getItem('posSqlServer') || DEFAULT_POS_SQL_SERVER).trim(),
    posSqlDatabase: (document.getElementById('posSqlDatabase')?.value || localStorage.getItem('posSqlDatabase') || DEFAULT_POS_SQL_DATABASE).trim(),
    posSqlUser: (document.getElementById('posSqlUser')?.value || localStorage.getItem('posSqlUser') || '').trim(),
    posSqlPassword: document.getElementById('posSqlPassword')?.value ?? localStorage.getItem('posSqlPassword') ?? '',
  };
}

function applyPosSqlConfig(config = {}) {
  const server = String(config.posSqlServer || DEFAULT_POS_SQL_SERVER).trim();
  const database = String(config.posSqlDatabase || DEFAULT_POS_SQL_DATABASE).trim();
  const user = String(config.posSqlUser || '').trim();
  const password = config.posSqlPassword ?? '';

  localStorage.setItem('posSqlServer', server);
  localStorage.setItem('posSqlDatabase', database);
  localStorage.setItem('posSqlUser', user);
  if (password) localStorage.setItem('posSqlPassword', password);

  const serverEl = document.getElementById('posSqlServer');
  const databaseEl = document.getElementById('posSqlDatabase');
  const userEl = document.getElementById('posSqlUser');
  const passwordEl = document.getElementById('posSqlPassword');
  if (serverEl) serverEl.value = server;
  if (databaseEl) databaseEl.value = database;
  if (userEl) userEl.value = user;
  if (passwordEl && password) passwordEl.value = password;
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
      ? 'الزر الرئيسي يرفع تحديثات Edari ثم أسعار POS تلقائياً. «إعادة مزامنة كاملة» يعيد رفع كل حركات المشتريات وكل أسعار POS.'
      : 'أول مرة: نفّذ «مزامنة كاملة» لرفع كل حركات المشتريات من Edari وكل أسعار POS. بعدها «تحديث الأسعار» يرفع الجديد فقط.';
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
  const raw = String(line || '').trim();
  if (!raw) return;
  // لا تعرض سطر JSON التقني — يُعرَض ملخّص مقروء بدلاً منه.
  if (raw.startsWith('@SYNC_RESULT|')) return;
  if (raw.startsWith('@PROGRESS|')) return;
  const p = document.createElement('p');
  p.textContent = raw;
  feed.prepend(p);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);
}

function parsePriceSyncProgressLine(line) {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const progress = raw.match(/^@PROGRESS\|(\d+)\|(\d+)\|(\d+)\|(.*)$/);
  if (progress) {
    return { type: 'progress', pct: Number(progress[3]) || 0, msg: progress[4] || 'جاري الرفع...' };
  }

  if (raw.startsWith('@SYNC_RESULT|')) {
    try {
      const result = JSON.parse(raw.slice('@SYNC_RESULT|'.length));
      return { type: 'result', result, msg: result.message || 'اكتملت المزامنة' };
    } catch {
      return { type: 'result', result: null, msg: 'اكتملت المزامنة' };
    }
  }
  return null;
}

function applyPriceSyncCompletion(result, syncMode) {
  const msg = formatSyncResult(result, syncMode);
  setPriceSyncProgress(true, msg, 100);
  appendPriceSyncLog(msg);
  const edariOk = result?.edariOk !== false;
  const posOk = result?.posOk !== false;
  let statusText = 'آخر مزامنة ناجحة';
  let statusState = 'ok';
  if (!edariOk && !posOk) { statusText = 'فشلت المزامنة (Edari و POS)'; statusState = 'err'; }
  else if (!posOk) { statusText = 'تم Edari — تعذّر رفع أسعار POS'; statusState = 'pending'; }
  else if (!edariOk) { statusText = 'تم رفع أسعار POS — تعذّر Edari'; statusState = 'pending'; }
  setPriceSyncStatus(statusText, statusState);
  const last = document.getElementById('priceSyncLastResult');
  if (last) last.textContent = msg;
  if (syncMode === 'full' || (result?.movementsUpserted || 0) > 0 || (result?.posSynced || 0) > 0) {
    markPriceSyncHistory();
  }
}

function formatSyncResult(result, syncMode) {
  if (result?.message) return result.message;

  const edariPart = `${result.movementsUpserted || result.movements || 0} حركة، ${result.productsUpserted || result.products || 0} منتج Edari`;
  const posPart = result.posSynced != null
    ? `${result.posSynced} سعر POS (${result.posOffers || 0} عرض)`
    : '';
  const modeLabel = syncMode === 'full' ? 'كاملة' : 'تحديث';
  return posPart
    ? `تم (${modeLabel})! ${edariPart} | ${posPart}`
    : `تم (${modeLabel})! ${result.bills || 0} فاتورة، ${edariPart}`;
}

async function verifyPriceAppServer() {
  const base = resolvePriceAppServerUrl();
  setPriceSyncStatus('جاري التحقق...', 'pending');
  try {
    const res = await fetch(`${base}/sync/health`, { cache: 'no-store' });
    const data = await res.json();
    const posCount = data.productsPosSynced != null ? Number(data.productsPosSynced) : null;
    const total = data.productsTotal != null ? Number(data.productsTotal) : null;
    const lastPos = data.lastPosSyncAt ? new Date(data.lastPosSyncAt).toLocaleString('en-US') : null;
    let msg = 'متصل بسيرفر الأسعار';
    if (posCount != null && total != null) {
      msg += ` — POS: ${fmtNumAlways(posCount)}/${fmtNumAlways(total)} منتج`;
      if (posCount === 0) msg += ' ⚠️ لم تُزامَن أسعار POS بعد';
    }
    if (lastPos) msg += ` · آخر POS: ${lastPos}`;
    setPriceSyncStatus(msg, posCount === 0 ? 'pending' : 'ok');
    return true;
  } catch (err) {
    setPriceSyncStatus(`غير متصل: ${base}`, 'err');
    return false;
  }
}

async function runPriceAppSync(mode = 'incremental') {
  const serverUrl = resolvePriceAppServerUrl();
  const syncKey = resolvePriceSyncKey();
  const posConfig = resolvePosSqlConfig();
  const syncMode = mode === 'full' ? 'full' : (hasPriceSyncHistory() ? 'incremental' : 'full');

  applyPriceAppServerUrl(serverUrl);
  applyPriceSyncKey(syncKey);
  applyPosSqlConfig(posConfig);

  if (!serverUrl) {
    alert('أدخل عنوان سيرفر الأسعار');
    return;
  }
  if (!posConfig.posSqlServer || !posConfig.posSqlDatabase) {
    alert('أدخل إعدادات قاعدة POS (السيرفر واسم القاعدة)');
    return;
  }

  const btn = document.getElementById('btnPriceSyncNow');
  const fullBtn = document.getElementById('btnPriceSyncFull');
  if (btn) btn.disabled = true;
  if (fullBtn) fullBtn.disabled = true;

  const modeLabel = syncMode === 'full' ? 'مزامنة كاملة' : 'تحديث';
  setPriceSyncProgress(true, `بدء ${modeLabel}...`, 5);
  appendPriceSyncLog(`${modeLabel}: ${serverUrl} · POS: ${posConfig.posSqlServer}/${posConfig.posSqlDatabase}`);

  let unsubscribe = null;
  let sawStreamResult = false;
  if (window.edariDesktop?.onPriceSyncProgress) {
    unsubscribe = window.edariDesktop.onPriceSyncProgress((line) => {
      const parsed = parsePriceSyncProgressLine(line);
      if (parsed?.type === 'progress') {
        setPriceSyncProgress(true, parsed.msg, parsed.pct);
        return;
      }
      if (parsed?.type === 'result') {
        sawStreamResult = true;
        applyPriceSyncCompletion(parsed.result || { ok: true, message: parsed.msg }, syncMode);
        return;
      }
      appendPriceSyncLog(line);
    });
  }

  try {
    if (!window.edariDesktop?.runPriceAppSync) {
      throw new Error('الاتصال بالسيرفر الرئيسي مطلوب لمزامنة الأسعار');
    }

    const result = await window.edariDesktop.runPriceAppSync({
      serverUrl,
      syncKey,
      mode: syncMode,
      ...posConfig,
    });

    if (!result?.ok) throw new Error(result?.error || 'فشلت المزامنة');

    if (!sawStreamResult) {
      applyPriceSyncCompletion(result, syncMode);
    }
    void verifyPriceAppServer();
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
  applyPosSqlConfig(resolvePosSqlConfig());
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
['posSqlServer', 'posSqlDatabase', 'posSqlUser', 'posSqlPassword'].forEach((id) => {
  document.getElementById(id)?.addEventListener('change', () => applyPosSqlConfig(resolvePosSqlConfig()));
});

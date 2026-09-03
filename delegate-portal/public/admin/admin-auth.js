/**
 * Admin authentication — optional when ADMIN_REQUIRE_AUTH or LAN_REQUIRE_AUTH is enabled.
 */
(function () {
  const TOKEN_KEY = 'adminToken';
  const USER_KEY = 'adminUsername';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(token, username) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    if (username) localStorage.setItem(USER_KEY, username);
    else localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new CustomEvent('admin-auth-changed'));
  }

  function authHeaders() {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function login(username, password) {
    const base = typeof window.getApiBase === 'function' ? window.getApiBase() : '';
    const res = await fetch(`${base}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');
    setSession(data.token, data.username || username);
    return data;
  }

  function logout() {
    setSession('', '');
    location.reload();
  }

  function showLoginGate(show) {
    const gate = document.getElementById('adminLoginGate');
    if (!gate) return;
    gate.classList.toggle('hidden', !show);
    gate.setAttribute('aria-hidden', show ? 'false' : 'true');
    document.body.classList.toggle('login-locked', show);
  }

  async function initAdminAuth() {
    const base = typeof window.getApiBase === 'function' ? window.getApiBase() : '';
    let config = {};
    try {
      const res = await fetch(`${base}/api/admin/config`, { cache: 'no-store' });
      config = await res.json();
    } catch {
      return { requireAuth: false };
    }

    if (!config.requireAuth) {
      showLoginGate(false);
      updateAuthBadge(null);
      return config;
    }

    if (getToken()) {
      try {
        const meRes = await fetch(`${base}/api/admin/me`, { headers: authHeaders() });
        const me = await meRes.json();
        if (meRes.ok && me.admin) {
          showLoginGate(false);
          updateAuthBadge(me.admin.username);
          return config;
        }
      } catch { /* fall through */ }
      setSession('', '');
    }

    showLoginGate(true);
    updateAuthBadge(null);
    return config;
  }

  function updateAuthBadge(username) {
    const el = document.getElementById('adminAuthBadge');
    const logoutBtn = document.getElementById('btnAdminLogout');
    if (!el) return;
    if (username) {
      el.hidden = false;
      el.textContent = username;
      el.className = 'admin-auth-badge is-in';
      if (logoutBtn) logoutBtn.classList.remove('hidden');
    } else {
      el.hidden = true;
      if (logoutBtn) logoutBtn.classList.add('hidden');
    }
  }

  document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('adminLoginError');
    const btn = document.getElementById('adminLoginSubmit');
    const user = document.getElementById('adminLoginUser')?.value?.trim();
    const pass = document.getElementById('adminLoginPass')?.value || '';
    if (errEl) errEl.textContent = '';
    if (btn) btn.disabled = true;
    try {
      await login(user, pass);
      showLoginGate(false);
      updateAuthBadge(user);
      if (typeof window.refreshAll === 'function') await window.refreshAll();
    } catch (err) {
      if (errEl) errEl.textContent = err.message || 'فشل الدخول';
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('btnAdminLogout')?.addEventListener('click', () => logout());

  window.adminAuth = {
    getToken,
    authHeaders,
    login,
    logout,
    initAdminAuth
  };
})();

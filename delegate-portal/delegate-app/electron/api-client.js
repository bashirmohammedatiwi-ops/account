const path = require('path');

async function request(baseUrl, route, { method = 'GET', token, body } = {}) {
  const url = `${baseUrl.replace(/\/$/, '')}${route}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

module.exports = { request };

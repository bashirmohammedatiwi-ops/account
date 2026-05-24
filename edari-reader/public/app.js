const state = {
  selectedDatabase: null,
  tables: [],
  textFiles: [],
  lastResults: null,
  config: null
};

const els = {
  statusBadges: document.getElementById('statusBadges'),
  databaseList: document.getElementById('databaseList'),
  tablesBody: document.getElementById('tablesBody'),
  tableSearch: document.getElementById('tableSearch'),
  tableMeta: document.getElementById('tableMeta'),
  textFileList: document.getElementById('textFileList'),
  textPreview: document.getElementById('textPreview'),
  connectionResult: document.getElementById('connectionResult'),
  sqlInput: document.getElementById('sqlInput'),
  sqlResultMeta: document.getElementById('sqlResultMeta'),
  resultsHead: document.getElementById('resultsHead'),
  resultsBody: document.getElementById('resultsBody'),
  alias: document.getElementById('alias'),
  server: document.getElementById('server'),
  port: document.getElementById('port'),
  mode: document.getElementById('mode'),
  databasePath: document.getElementById('databasePath')
};

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok && !data.error) {
    throw new Error(`HTTP ${response.status}`);
  }
  return data;
}

function connectionPayload(extra = {}) {
  return {
    mode: els.mode.value,
    alias: els.alias.value.trim(),
    server: els.server.value.trim(),
    port: Number(els.port.value),
    databasePath: els.databasePath.value.trim(),
    database: state.selectedDatabase,
    ...extra
  };
}

function renderBadges(status) {
  const badges = [];

  badges.push({
    text: status.server.online ? 'nxServer متصل' : 'nxServer غير متصل',
    className: status.server.online ? 'ok' : 'err'
  });

  badges.push({
    text: status.drivers.hasDriver
      ? `ODBC: ${status.drivers.installed.join(', ')}`
      : 'ODBC غير مثبت',
    className: status.drivers.hasDriver ? 'ok' : 'warn'
  });

  if (status.server.version) {
    badges.push({ text: status.server.version, className: '' });
  }

  els.statusBadges.innerHTML = badges
    .map((badge) => `<span class="badge ${badge.className}">${badge.text}</span>`)
    .join('');
}

function renderDatabases(databases) {
  if (!databases.length) {
    els.databaseList.innerHTML = '<div class="empty">لم يتم العثور على مجلدات بيانات</div>';
    return;
  }

  els.databaseList.innerHTML = databases
    .map(
      (db) => `
      <button class="list-item ${state.selectedDatabase === db.name ? 'active' : ''}" data-db="${db.name}">
        <div class="title">${db.name}</div>
        <div class="meta">${db.tableCount} جدول • ${db.totalSizeLabel}</div>
      </button>`
    )
    .join('');

  els.databaseList.querySelectorAll('[data-db]').forEach((button) => {
    button.addEventListener('click', () => selectDatabase(button.dataset.db));
  });
}

async function selectDatabase(name) {
  state.selectedDatabase = name;
  els.alias.value = name;
  renderDatabases(state.config.databases);

  const data = await api(`/api/databases/${encodeURIComponent(name)}/tables`);
  state.tables = data.tables;
  state.textFiles = data.textFiles;
  els.databasePath.value = data.path;
  renderTables();
  renderTextFiles();
}

function renderTables() {
  const query = els.tableSearch.value.trim().toLowerCase();
  const filtered = state.tables.filter((table) => {
    if (!query) return true;
    return (
      table.tableName.toLowerCase().includes(query) ||
      table.file.toLowerCase().includes(query)
    );
  });

  els.tableMeta.textContent = `${filtered.length} جدول`;
  els.tablesBody.innerHTML = filtered
    .map((table) => {
      const status = table.locked
        ? '<span class="pill lock">مقفل</span>'
        : table.validNx1
          ? '<span class="pill ok">جاهز</span>'
          : '<span class="pill bad">غير معروف</span>';

      return `
        <tr>
          <td>${escapeHtml(table.tableName)}</td>
          <td>${escapeHtml(table.file)}</td>
          <td>${escapeHtml(table.sizeLabel)}</td>
          <td>${status}</td>
          <td><button class="btn small" data-query="${escapeHtml(table.tableName)}">SQL</button></td>
        </tr>`;
    })
    .join('');

  els.tablesBody.querySelectorAll('[data-query]').forEach((button) => {
    button.addEventListener('click', () => {
      els.sqlInput.value = `SELECT TOP 100 * FROM ${button.dataset.query}`;
      switchTab('sql');
    });
  });
}

function renderTextFiles() {
  if (!state.textFiles.length) {
    els.textFileList.innerHTML = '<div class="empty">لا توجد ملفات .txt</div>';
    els.textPreview.textContent = '';
    return;
  }

  els.textFileList.innerHTML = state.textFiles
    .map(
      (file) => `
      <button class="list-item" data-text="${escapeHtml(file.file)}">
        <div class="title">${escapeHtml(file.file)}</div>
        <div class="meta">${escapeHtml(file.sizeLabel)}</div>
      </button>`
    )
    .join('');

  els.textFileList.querySelectorAll('[data-text]').forEach((button) => {
    button.addEventListener('click', async () => {
      const file = button.dataset.text;
      const data = await api(
        `/api/databases/${encodeURIComponent(state.selectedDatabase)}/text/${encodeURIComponent(file)}`
      );
      els.textPreview.textContent = data.lines.join('\n');
      if (data.truncated) {
        els.textPreview.textContent += `\n\n... (${data.totalLines - data.lines.length} سطر إضافي)`;
      }
    });
  });
}

function renderResults(result) {
  state.lastResults = result;

  if (!result.ok) {
    els.sqlResultMeta.textContent = result.error || 'فشل الاستعلام';
    els.resultsHead.innerHTML = '';
    els.resultsBody.innerHTML = '';
    return;
  }

  els.sqlResultMeta.textContent = `${result.rowCount} صف • ${result.columns.length} عمود`;
  els.resultsHead.innerHTML = `<tr>${result.columns.map((col) => `<th>${escapeHtml(col)}</th>`).join('')}</tr>`;
  els.resultsBody.innerHTML = result.rows
    .map(
      (row) =>
        `<tr>${result.columns
          .map((col) => `<td>${escapeHtml(row[col] ?? '')}</td>`)
          .join('')}</tr>`
    )
    .join('');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `${name}Tab`);
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportCsv() {
  const result = state.lastResults;
  if (!result?.ok || !result.rows?.length) return;

  const lines = [result.columns.join(',')];
  for (const row of result.rows) {
    lines.push(
      result.columns
        .map((col) => `"${String(row[col] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${state.selectedDatabase || 'query'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const status = await api('/api/status');
  state.config = status;
  renderBadges(status);
  renderDatabases(status.databases);

  const preferred = status.databases.find((db) => db.name === '2025') || status.databases[0];
  if (preferred) {
    await selectDatabase(preferred.name);
  }

  if (!status.drivers.hasDriver) {
    els.connectionResult.innerHTML =
      'لقراءة بيانات الجداول عبر SQL، ثبّت <strong>NexusDB ODBC Driver</strong> (Devart أو الرسمي) ثم أعد تحميل الصفحة.';
  } else {
    els.connectionResult.innerHTML = `تم اكتشاف ODBC: <strong>${status.drivers.installed.join(', ')}</strong> — يمكنك اختبار الاتصال وتشغيل SQL.`;
    els.connectionResult.className = 'hint success';
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

els.tableSearch.addEventListener('input', renderTables);

document.getElementById('testConnectionBtn').addEventListener('click', async () => {
  els.connectionResult.textContent = 'جاري الاختبار...';
  els.connectionResult.className = 'hint';

  try {
    const result = await api('/api/connection/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connectionPayload())
    });

    if (result.ok) {
      els.connectionResult.textContent = `تم الاتصال بنجاح عبر ${result.driver}`;
      els.connectionResult.className = 'hint success';
    } else {
      els.connectionResult.textContent = result.error;
      els.connectionResult.className = 'hint error';
    }
  } catch (error) {
    els.connectionResult.textContent = error.message;
    els.connectionResult.className = 'hint error';
  }
});

document.getElementById('runSqlBtn').addEventListener('click', async () => {
  els.sqlResultMeta.textContent = 'جاري التنفيذ...';
  try {
    const result = await api('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(connectionPayload({ sql: els.sqlInput.value }))
    });
    renderResults(result);
  } catch (error) {
    renderResults({ ok: false, error: error.message });
  }
});

document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

init().catch((error) => {
  els.statusBadges.innerHTML = `<span class="badge err">${escapeHtml(error.message)}</span>`;
});

const dashboard = require('./dashboard');
const odbcBridge = require('./odbc-bridge');
const config = require('./config');
const fieldLabels = require('./field-labels');

const BATCH = 1000;
const ESSENTIAL = ['stats', 'accounts', 'cash', 'materialGroups', 'items', 'invoices'];
const LIVE_SECTIONS = new Set(['receipts', 'journal']);

class DataService {
  constructor() {
    this.conn = { ...dashboard.DEFAULT_CONN };
    this.cache = {
      stats: null,
      accounts: null,
      items: null,
      materialGroups: null,
      invoices: null,
      receipts: null,
      journal: null,
      cash: null
    };
    this.syncMeta = {};
    this.liveCursors = { receipts: '', journal: '' };
  }

  setConnection(conn = {}) {
    this.conn = {
      alias: conn.alias || '2025',
      server: conn.server || config.defaultServer,
      port: Number(conn.port || config.defaultPort)
    };
    this.clearCache();
  }

  clearCache() {
    Object.keys(this.cache).forEach((k) => { this.cache[k] = null; });
    this.syncMeta = {};
    this.liveCursors = { receipts: '', journal: '' };
  }

  async getStatus() {
    const drivers = await odbcBridge.detectDrivers();
    return {
      ok: true,
      drivers,
      conn: this.conn,
      dataRoot: config.dataRoot,
      cached: Object.fromEntries(
        Object.entries(this.cache).map(([k, v]) => [k, Array.isArray(v) ? v.length : v ? 1 : 0])
      ),
      syncMeta: this.syncMeta
    };
  }

  emit(onProgress, payload) {
    if (onProgress) {
      onProgress(payload);
    }
  }

  async fetchPaged(fetchFn, label, onProgress, { initialCursor = '' } = {}) {
    const all = [];
    let cursor = initialCursor;
    let page = 0;
    while (true) {
      page += 1;
      const result = await fetchFn(cursor);
      all.push(...result.rows);
      this.emit(onProgress, {
        section: label,
        loaded: all.length,
        page,
        hasMore: result.hasMore
      });
      if (!result.hasMore) break;
      cursor = result.nextCursor;
    }
    return all;
  }

  async syncSection(section, onProgress) {
    const started = Date.now();
    let rows = [];

    switch (section) {
      case 'stats':
        this.emit(onProgress, { section, loaded: 0, status: 'connecting' });
        this.cache.stats = await dashboard.getStats(this.conn);
        break;

      case 'accounts':
        rows = await dashboard.getAccountsTree(this.conn);
        this.cache.accounts = rows;
        break;

      case 'cash':
        rows = await dashboard.getCashUsers(this.conn);
        this.cache.cash = rows;
        break;

      case 'items':
        rows = await this.fetchPaged(
          (cursor) => dashboard.getItems(this.conn, { cursor, limit: BATCH }),
          'items',
          onProgress,
          { initialCursor: '0' }
        );
        this.cache.items = rows;
        break;

      case 'materialGroups':
        rows = await dashboard.getMaterialsTree(this.conn, '0');
        this.cache.materialGroups = rows;
        break;

      case 'invoices':
        rows = await this.fetchPaged(
          (cursor) => dashboard.getInvoices(this.conn, { cursor, limit: BATCH }),
          'invoices',
          onProgress
        );
        this.cache.invoices = rows;
        break;

      default:
        throw new Error(`Unknown section: ${section}`);
    }

    this.syncMeta[section] = {
      at: new Date().toISOString(),
      count: Array.isArray(this.cache[section]) ? this.cache[section].length : 1,
      ms: Date.now() - started
    };

    return {
      section,
      count: this.syncMeta[section].count,
      ms: this.syncMeta[section].ms
    };
  }

  async syncEssential(onProgress) {
    const plan = ESSENTIAL;
    const results = [];
    for (let i = 0; i < plan.length; i += 1) {
      const section = plan[i];
      this.emit(onProgress, { phase: 'start', section, step: i + 1, total: plan.length });
      const result = await this.syncSection(section, (p) => {
        this.emit(onProgress, { phase: 'loading', section, step: i + 1, total: plan.length, ...p });
      });
      results.push(result);
      this.emit(onProgress, { phase: 'done', section, step: i + 1, total: plan.length, ...result });
    }
    return results;
  }

  async syncAll(onProgress) {
    return this.syncEssential(onProgress);
  }

  getSection(section) {
    return this.cache[section] || null;
  }

  getFieldLabels() {
    return fieldLabels;
  }

  filterRows(rows, search, keys) {
    if (!search || !rows) return rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      keys.some((key) => String(row[key] ?? '').toLowerCase().includes(q))
    );
  }

  pageRows(rows, { page = 1, pageSize = 100, search = '', keys = [] } = {}) {
    const filtered = this.filterRows(rows, search, keys);
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pages);
    const start = (safePage - 1) * pageSize;
    return {
      rows: filtered.slice(start, start + pageSize),
      total,
      page: safePage,
      pages,
      pageSize,
      live: false
    };
  }

  async queryLive(section, { cursor = '', limit = 100, search = '' } = {}) {
    if (!LIVE_SECTIONS.has(section)) {
      throw new Error(`Section ${section} is not live-queryable`);
    }

    let result;
    if (section === 'receipts') {
      result = await dashboard.getReceipts(this.conn, { cursor, limit, search });
    } else if (section === 'journal') {
      result = await dashboard.getJournal(this.conn, { cursor, limit, search });
    }

    return {
      rows: result.rows,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      total: null,
      page: null,
      pages: null,
      pageSize: limit,
      live: true
    };
  }

  async pageOrLive(section, opts) {
    const cached = this.getSection(section);
    if (cached && cached.length) {
      return this.pageRows(cached, opts);
    }
    if (LIVE_SECTIONS.has(section)) {
      const cursor = opts.cursor ?? '';
      return this.queryLive(section, {
        cursor,
        limit: opts.pageSize || 100,
        search: opts.search || ''
      });
    }
    return this.pageRows([], opts);
  }

  async getItemDetail(seq) {
    return dashboard.getItemBySeq(this.conn, seq);
  }

  async getInvoiceLines(seq) {
    return dashboard.getInvoiceLines(this.conn, seq);
  }

  async getReceiptItems(id) {
    return dashboard.getReceiptItems(this.conn, id);
  }

  async getMaterialsChildren(parent) {
    return dashboard.getMaterialsTree(this.conn, parent);
  }
}

module.exports = new DataService();

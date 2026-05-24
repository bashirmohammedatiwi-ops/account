const odbcBridge = require('./odbc-bridge');
const config = require('./config');

const DEFAULT_CONN = {
  mode: 'tcp',
  alias: '2025',
  server: config.defaultServer,
  port: config.defaultPort
};

async function query(sql, conn = {}) {
  const result = await odbcBridge.runQuery({ ...DEFAULT_CONN, ...conn, sql });
  if (!result.ok) {
    const err = new Error(result.error || 'Query failed');
    err.details = result;
    throw err;
  }
  return result;
}

async function getStats(conn) {
  const tables = [
    ['accounts', 'File11n'],
    ['items', "File13n WHERE SubCount = 0"],
    ['invoices', 'File15n'],
    ['receipts', 'FOT_Reciepts'],
    ['journal', 'File12n'],
    ['users', 'FileCash']
  ];

  const stats = {};
  for (const [key, fromClause] of tables) {
    const result = await query(`SELECT COUNT(*) AS c FROM ${fromClause}`, conn);
    stats[key] = Number(result.rows[0]?.c || 0);
  }

  const sales = await query(
    'SELECT SUM(CAST(total_amount AS DOUBLE PRECISION)) AS total FROM FOT_Reciepts',
    conn
  );
  stats.posSalesTotal = Number(sales.rows[0]?.total || 0);

  const invoiceTotal = await query(
    'SELECT SUM(CAST(Total AS DOUBLE PRECISION)) AS total FROM File15n',
    conn
  );
  stats.invoiceTotal = Number(invoiceTotal.rows[0]?.total || 0);

  return stats;
}

async function getAccountsTree(conn) {
  const result = await query(
    'SELECT Seq, Num, Name1, Name2, Master, SubCount, Bal, Dest, Remarks, Tot1, Tot2, Address FROM File11n ORDER BY Num',
    conn
  );
  return result.rows;
}

async function getMaterialsTree(conn, parent = '0') {
  const parentNum = String(parent).replace(/[^0-9]/g, '') || '0';
  const result = await query(
    `SELECT Seq, Num, Name1, Name2, Father, SubCount, SellPr1, Barcode, Dest FROM File13n WHERE Father = ${parentNum} ORDER BY Name1`,
    conn
  );
  return result.rows;
}

const MATERIAL_LIST_SELECT = `
  Seq, Num, Name1, Name2, Barcode, Unt1, Unt2, Unt3,
  InTot, OutTot, PurchaseTot, SalesTot,
  Avrg, CurAvrg, Top, Last, CTop, CLast,
  InAm, OutAm, PurchaseAm, SalesAm,
  SellPr1, SellPr2, SellPr3, SellPr4, SellPr5,
  Minimum, Maximum, VAT, Bonus, Remarks, Father, Supplier
`.replace(/\s+/g, ' ').trim();

const MATERIAL_FULL_SELECT = 'Seq, Num, Name1, Name2, Dest, Remarks, Regist, Barcode, SubCount, Father, Stored, Group1, Group2, Group3, CustNum, CatNum, Unt1, Unt2, Unt3, Point, Point2, Point3, FixedFactor, UFactor2, UFactor3, Avrg, Top, Last, CurAvrg, CCAvrg, CTop, CLast, InTot, InAm, PurchaseTot, PurchaseAm, OutTot, OutAm, SalesTot, SalesAm, Minimum, Maximum, Bonus, BonusDiv, SellPr1, SellPr2, SellPr3, SellPr4, SellPr5, MatCurr, Method, SellCurr, OutBooked, InBooked, DefUnit, PlaceFnf, SellType1, SellType2, SellType3, SellType4, SellType5, Weight, Length, Width, Height, OrderQ, Supplier, Carton, ItemsInCart, TmpSellQu, TmpReturnQu, TmpOutQu, VAT, Comm, Horiz, Tot1, Tot2, Tot3, CurTot1, CurTot2, CurTot3, Total';

function enrichMaterial(row) {
  const inTot = Number(row.InTot || 0);
  const outTot = Number(row.OutTot || 0);
  return {
    ...row,
    StockQty: String(inTot - outTot)
  };
}

async function getItems(conn, { search = '', cursor = '0', limit = 50 } = {}) {
  const safeSearch = search.replace(/'/g, "''");
  const safeCursor = String(cursor).replace(/[^0-9]/g, '') || '0';
  let where = `SubCount = 0 AND Seq > ${safeCursor}`;
  if (safeSearch) {
    where += ` AND (Name1 LIKE '%${safeSearch}%' OR Name2 LIKE '%${safeSearch}%' OR Num LIKE '%${safeSearch}%' OR Barcode LIKE '%${safeSearch}%')`;
  }

  const result = await query(
    `SELECT TOP ${Number(limit)} ${MATERIAL_LIST_SELECT} FROM File13n WHERE ${where} ORDER BY Seq`,
    conn
  );

  const rows = result.rows.map(enrichMaterial);
  const nextCursor = rows.length ? rows[rows.length - 1].Seq : null;
  return { rows, nextCursor, hasMore: rows.length === Number(limit) };
}

async function exportItems(conn, { search = '', limit = 5000 } = {}) {
  const safeSearch = search.replace(/'/g, "''");
  let where = 'SubCount = 0';
  if (safeSearch) {
    where += ` AND (Name1 LIKE '%${safeSearch}%' OR Name2 LIKE '%${safeSearch}%' OR Num LIKE '%${safeSearch}%' OR Barcode LIKE '%${safeSearch}%')`;
  }

  const result = await query(
    `SELECT TOP ${Number(limit)} ${MATERIAL_FULL_SELECT} FROM File13n WHERE ${where} ORDER BY Seq`,
    conn
  );
  return result.rows.map(enrichMaterial);
}

async function getInvoices(conn, { cursor = '', limit = 50, search = '' } = {}) {
  const safeSearch = search.replace(/'/g, "''");
  let where = '1=1';
  if (cursor) {
    const safeCursor = String(cursor).replace(/[^0-9]/g, '');
    if (safeCursor) where += ` AND Seq < ${safeCursor}`;
  }
  if (safeSearch) {
    where += ` AND (Num LIKE '%${safeSearch}%' OR remarks LIKE '%${safeSearch}%')`;
  }

  const result = await query(
    `SELECT TOP ${Number(limit)} Seq, Num, Kind, "Date", Total, Payment, DisCnt, "count", Two, remarks, Book, DayBillN FROM File15n WHERE ${where} ORDER BY Seq DESC`,
    conn
  );

  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].Seq : null;
  return { rows: result.rows, nextCursor, hasMore: result.rows.length === Number(limit) };
}

async function getInvoiceLines(conn, billSeq) {
  const id = String(billSeq).replace(/[^0-9]/g, '');
  const result = await query(
    `SELECT BillSeq, BillNo, Mat, MatName, Quant, Price, Kind, person, DtCreated FROM file14n WHERE BillSeq = '${id}' ORDER BY BillNo`,
    conn
  );
  return result.rows;
}

async function getReceipts(conn, { cursor = '', limit = 50, search = '' } = {}) {
  const safeSearch = search.replace(/'/g, "''");
  let where = '1=1';
  if (cursor) {
    const safeCursor = String(cursor).replace(/[^0-9]/g, '');
    if (safeCursor) where += ` AND id < ${safeCursor}`;
  }
  if (safeSearch) {
    where += ` AND (CAST(number AS VARCHAR(100)) LIKE '%${safeSearch}%' OR CAST(branch AS VARCHAR(100)) LIKE '%${safeSearch}%')`;
  }

  const result = await query(
    `SELECT TOP ${Number(limit)} id, number, creation_date, total_amount, payment, items_discount, branch, cashier_id FROM FOT_Reciepts WHERE ${where} ORDER BY id DESC`,
    conn
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].id : null;
  return { rows: result.rows, nextCursor, hasMore: result.rows.length === Number(limit) };
}

async function getReceiptItems(conn, receiptId) {
  const id = String(receiptId).replace(/[^0-9]/g, '');
  const result = await query(
    `SELECT id, reciept_id, article_id, quantity, price, discount, original_price FROM FOT_Reciept_Items WHERE reciept_id = '${id}' ORDER BY id`,
    conn
  );
  return result.rows;
}

async function getJournal(conn, { cursor = '', limit = 50, search = '' } = {}) {
  const safeSearch = search.replace(/'/g, "''");
  let where = '1=1';
  if (cursor) {
    const safeCursor = String(cursor).replace(/[^0-9]/g, '');
    if (safeCursor) where += ` AND Seq < ${safeCursor}`;
  }
  if (safeSearch) {
    where += ` AND (Acc LIKE '%${safeSearch}%' OR Remarks LIKE '%${safeSearch}%' OR BillNum LIKE '%${safeSearch}%')`;
  }

  const result = await query(
    `SELECT TOP ${Number(limit)} Seq, Num, Acc, Am, Dept, Exp1, Exp2, BillSeq, BillKind, BillNum, Remarks, DtCreated FROM File12n WHERE ${where} ORDER BY Seq DESC`,
    conn
  );
  const nextCursor = result.rows.length ? result.rows[result.rows.length - 1].Seq : null;
  return { rows: result.rows, nextCursor, hasMore: result.rows.length === Number(limit) };
}

async function getCashUsers(conn) {
  const result = await query(
    'SELECT Seq, Name, Branch, UserGroup, FromTime, ToTime FROM FileCash ORDER BY Seq',
    conn
  );
  return result.rows;
}

async function getAccountBySeq(conn, seq) {
  const id = String(seq).replace(/[^0-9]/g, '');
  const result = await query(
    `SELECT Seq, Num, Name1, Name2, Master, SubCount, Bal, Tot1, Tot2, Dest, Remarks, Address FROM File11n WHERE Seq = '${id}'`,
    conn
  );
  return result.rows[0] || null;
}

async function getItemBySeq(conn, seq) {
  const id = String(seq).replace(/[^0-9]/g, '');
  const result = await query(
    `SELECT ${MATERIAL_FULL_SELECT} FROM File13n WHERE Seq = ${id}`,
    conn
  );
  return result.rows[0] ? enrichMaterial(result.rows[0]) : null;
}

module.exports = {
  getStats,
  getAccountsTree,
  getMaterialsTree,
  getItems,
  exportItems,
  getInvoices,
  getInvoiceLines,
  getReceipts,
  getReceiptItems,
  getJournal,
  getCashUsers,
  getAccountBySeq,
  getItemBySeq,
  DEFAULT_CONN
};

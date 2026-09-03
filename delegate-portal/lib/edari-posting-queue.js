const jobs = new Map();

function postingKey(kind, payload = {}) {
  const id = payload.id ?? payload.receiptId ?? payload.requestId;
  if (id != null && String(id).trim()) return `${kind}:id:${id}`;
  if (kind === 'receipt') {
    const no = String(payload.receiptNo || payload.receipt_no || '').trim();
    if (no) return `${kind}:no:${no}`;
  }
  if (kind === 'customer') {
    const tree = String(payload.treeNum || payload.treeAccSeq || '').trim();
    const name = String(payload.name || '').trim();
    if (tree && name) return `${kind}:${tree}:${name}`;
  }
  return '';
}

async function runPostingJob(kind, payload, fn) {
  const key = postingKey(kind, payload);
  if (!key) return fn();
  if (jobs.has(key)) {
    return { ok: false, error: 'جاري الترحيل — انتظر اكتمال العملية السابقة' };
  }
  const job = (async () => fn())();
  jobs.set(key, job);
  try {
    return await job;
  } finally {
    jobs.delete(key);
  }
}

module.exports = { runPostingJob, postingKey };

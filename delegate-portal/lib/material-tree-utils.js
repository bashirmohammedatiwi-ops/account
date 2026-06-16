function normalizeMatNum(value) {
  const s = String(value || '').trim();
  if (!/^\d+$/.test(s)) return s;
  const trimmed = s.replace(/^0+/, '');
  return trimmed || '0';
}

function buildMaterialIndex(nodes = []) {
  const byNum = new Map();
  const bySeq = new Map();
  const pending = [];

  for (const n of nodes) {
    const seq = String(n.seq ?? n.Seq ?? '');
    const num = String(n.num ?? n.Num ?? '');
    if (!num && !seq) continue;
    pending.push({
      seq,
      num,
      name1: n.name1 ?? n.Name1 ?? '',
      subCount: Number(n.sub_count ?? n.subCount ?? n.SubCount ?? 0),
      barcode: String(n.barcode ?? n.Barcode ?? '').trim(),
      fatherRaw: String(n.father_num ?? n.fatherNum ?? n.Father ?? '0')
    });
  }

  for (const row of pending) {
    bySeq.set(row.seq, row);
    if (row.num) {
      byNum.set(row.num, row);
      byNum.set(normalizeMatNum(row.num), row);
    }
  }

  const byFather = new Map();
  for (const row of pending) {
    let fatherRef = row.fatherRaw;
    if (bySeq.has(fatherRef)) {
      fatherRef = bySeq.get(fatherRef).num || fatherRef;
    } else if (byNum.has(fatherRef)) {
      fatherRef = byNum.get(fatherRef).num;
    } else if (/^\d+$/.test(fatherRef)) {
      const padded = fatherRef.padStart(3, '0');
      if (byNum.has(padded)) fatherRef = byNum.get(padded).num;
    }
    const father = normalizeMatNum(fatherRef);
    if (!byFather.has(father)) byFather.set(father, []);
    byFather.get(father).push(row);
  }

  return { byNum, byFather, bySeq };
}

function resolveMaterialTree(ref, index) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  if (index.bySeq.has(raw)) return index.bySeq.get(raw);
  if (index.byNum.has(raw)) return index.byNum.get(raw);
  if (/^\d+$/.test(raw)) {
    const padded = raw.padStart(3, '0');
    if (index.byNum.has(padded)) return index.byNum.get(padded);
    if (index.byNum.has(normalizeMatNum(raw))) return index.byNum.get(normalizeMatNum(raw));
  }
  return null;
}

function getMaterialDescendantLeafSeqs(rootRef, nodes = []) {
  const index = buildMaterialIndex(nodes);
  const tree = resolveMaterialTree(rootRef, index);
  if (!tree) return { tree: null, matSeqs: [], matNums: [] };

  const matSeqs = new Set();
  const matNums = new Set();
  const queue = [String(tree.num), normalizeMatNum(tree.num)];
  const seen = new Set();

  while (queue.length) {
    const num = queue.shift();
    if (!num || seen.has(num)) continue;
    seen.add(num);

    const node = index.byNum.get(num);
    if (!node) continue;

    if (Number(node.subCount || 0) === 0) {
      matSeqs.add(String(node.seq));
      matNums.add(String(node.num));
      if (node.barcode) matNums.add(String(node.barcode));
    }

    for (const child of index.byFather.get(normalizeMatNum(num)) || []) {
      queue.push(String(child.num));
    }
  }

  if (matSeqs.size === 0 && Number(tree.subCount || 0) === 0) {
    matSeqs.add(String(tree.seq));
    matNums.add(String(tree.num));
  }

  return {
    tree: {
      seq: tree.seq,
      num: tree.num,
      name1: tree.name1,
      subCount: tree.subCount
    },
    matSeqs: [...matSeqs],
    matNums: [...matNums]
  };
}

module.exports = {
  normalizeMatNum,
  buildMaterialIndex,
  resolveMaterialTree,
  getMaterialDescendantLeafSeqs
};

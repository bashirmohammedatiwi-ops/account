/** Arabic + extended Arabic blocks */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/** Typical mojibake when UTF-8 Arabic was read as Latin-1 / Windows-1252 */
const MOJIBAKE_MARKERS_RE = /[ØÙÃÂþðŸŽ]/;

function hasArabic(text) {
  return ARABIC_RE.test(String(text || ''));
}

function looksGarbled(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t === '[object Object]') return true;
  if (/^[\s?.\-_]+$/.test(t)) return true;
  if (/\uFFFD/.test(t)) return true;
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(t)) return true;

  const hasAr = hasArabic(t);
  const mojibakeHits = (t.match(MOJIBAKE_MARKERS_RE) || []).length;

  // UTF-8 Arabic mis-decoded as Latin-1 (Ø´Ø§Ù… style)
  if (!hasAr && /Ø|Ã/.test(t) && mojibakeHits >= 1) return true;
  if (!hasAr && mojibakeHits >= 2 && mojibakeHits / t.length >= 0.08) return true;

  // Lots of isolated Latin extended without Arabic often means broken encoding
  if (!hasAr && /[À-ÿ]{4,}/.test(t) && t.length < 80) return true;

  return false;
}

function tryFixUtf8Mojibake(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8').trim();
    if (fixed && fixed !== s && hasArabic(fixed) && !looksGarbled(fixed)) return fixed;
  } catch {
    /* ignore */
  }
  return s;
}

function normalizeProductName(name) {
  let s = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';

  const fixed = tryFixUtf8Mojibake(s);
  if (fixed && fixed !== s && hasArabic(fixed)) return fixed;

  if (looksGarbled(s)) {
    if (fixed && !looksGarbled(fixed)) return fixed;
    return '';
  }

  return s;
}

function scoreProductName(name) {
  const n = normalizeProductName(name);
  if (!n) return -1;
  let score = Math.min(n.length, 120);
  if (hasArabic(n)) score += 80;
  if (/[A-Za-z0-9]/.test(n) && !hasArabic(n)) score += 20;
  if (looksGarbled(n)) score -= 200;
  return score;
}

function pickBetterName(current, incoming) {
  const a = normalizeProductName(current);
  const b = normalizeProductName(incoming);
  if (!a) return b;
  if (!b) return a;
  return scoreProductName(b) > scoreProductName(a) ? b : a;
}

function pickBestName(...candidates) {
  let best = '';
  let bestScore = -1;
  for (const raw of candidates) {
    const n = normalizeProductName(raw);
    if (!n) continue;
    const score = scoreProductName(n);
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  return best;
}

module.exports = {
  hasArabic,
  looksGarbled,
  normalizeProductName,
  pickBetterName,
  pickBestName,
  scoreProductName,
  tryFixUtf8Mojibake,
};

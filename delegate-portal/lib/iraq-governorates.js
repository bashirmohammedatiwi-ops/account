/** محافظات العراق — 19 محافظة */
const IRAQ_GOVERNORATES = [
  { code: 'BGD', name: 'بغداد' },
  { code: 'BAS', name: 'البصرة' },
  { code: 'NIN', name: 'نينوى' },
  { code: 'ERB', name: 'أربيل' },
  { code: 'SUL', name: 'السليمانية' },
  { code: 'KRK', name: 'كركوك' },
  { code: 'DIY', name: 'ديالى' },
  { code: 'ANB', name: 'الأنبار' },
  { code: 'BAB', name: 'بابل' },
  { code: 'KAR', name: 'كربلاء' },
  { code: 'NAJ', name: 'النجف' },
  { code: 'DHI', name: 'ذي قار' },
  { code: 'MAY', name: 'ميسان' },
  { code: 'WAS', name: 'واسط' },
  { code: 'SAL', name: 'صلاح الدين' },
  { code: 'MUT', name: 'المثنى' },
  { code: 'QAD', name: 'القادسية' },
  { code: 'DOH', name: 'دهوك' },
  { code: 'HAL', name: 'حلبجة' }
];

const GOVERNORATE_BY_CODE = Object.fromEntries(IRAQ_GOVERNORATES.map((g) => [g.code, g]));

function listGovernorates() {
  return IRAQ_GOVERNORATES.map((g) => ({ ...g }));
}

function resolveGovernorate(codeOrName) {
  const raw = String(codeOrName || '').trim();
  if (!raw) return null;
  const byCode = GOVERNORATE_BY_CODE[raw.toUpperCase()];
  if (byCode) return { ...byCode };
  const byName = IRAQ_GOVERNORATES.find((g) => g.name === raw);
  if (byName) return { ...byName };
  return null;
}

module.exports = { IRAQ_GOVERNORATES, listGovernorates, resolveGovernorate };

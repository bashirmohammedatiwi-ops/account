/// تحويل المبلغ إلى كلمات عربية — لتأكيد قراءة المبلغ قبل الإرسال.
library;

const _units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const _teens = [
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر',
  'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const _tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const _hundreds = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

/// (مفرد، مثنى، جمع 3-10)
const _scales = [
  ('', '', ''),
  ('ألف', 'ألفان', 'آلاف'),
  ('مليون', 'مليونان', 'ملايين'),
  ('مليار', 'ملياران', 'مليارات'),
  ('تريليون', 'تريليونان', 'تريليونات'),
];

String _below1000(int n) {
  final parts = <String>[];
  final h = n ~/ 100;
  final rest = n % 100;
  if (h > 0) parts.add(_hundreds[h]);
  if (rest > 0) {
    if (rest < 10) {
      parts.add(_units[rest]);
    } else if (rest < 20) {
      parts.add(_teens[rest - 10]);
    } else {
      final u = rest % 10;
      final t = rest ~/ 10;
      parts.add(u > 0 ? '${_units[u]} و${_tens[t]}' : _tens[t]);
    }
  }
  return parts.join(' و');
}

String _group(int n, int scale) {
  if (scale == 0) return _below1000(n);
  final (single, dual, plural) = _scales[scale];
  if (n == 1) return single;
  if (n == 2) return dual;
  if (n >= 3 && n <= 10) return '${_below1000(n)} $plural';
  return '${_below1000(n)} $single';
}

/// مثال: 1250000 → «مليون ومئتان وخمسون ألف دينار».
String amountInArabicWords(num? value, {String currency = 'دينار'}) {
  if (value == null) return '';
  var n = value.abs().round();
  if (n == 0) return 'صفر $currency';
  if (n >= 1000000000000000) return '';
  final groups = <int>[];
  while (n > 0) {
    groups.add(n % 1000);
    n ~/= 1000;
  }
  final parts = <String>[];
  for (var i = groups.length - 1; i >= 0; i--) {
    if (groups[i] == 0) continue;
    parts.add(_group(groups[i], i));
  }
  final words = parts.join(' و');
  final sign = value < 0 ? 'سالب ' : '';
  return currency.isEmpty ? '$sign$words' : '$sign$words $currency';
}

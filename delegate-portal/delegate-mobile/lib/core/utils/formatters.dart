import 'package:intl/intl.dart';

final _numFmt = NumberFormat('#,##0', 'en_US');
final _moneyFmt = NumberFormat('#,##0.##', 'en_US');
final _qtyFmt = NumberFormat('#,##0.##', 'en_US');

String fmtNum(num? v) {
  if (v == null || v == 0) return '';
  return _numFmt.format(v);
}

String fmtNumAlways(num? v) {
  if (v == null || v.isNaN) return '—';
  return _numFmt.format(v);
}

String fmtMoney(num? v) {
  if (v == null || v.isNaN) return '—';
  return _moneyFmt.format(v);
}

String fmtQty(num? v) {
  if (v == null || v.isNaN) return '—';
  if (v == v.roundToDouble()) return v.toInt().toString();
  return _qtyFmt.format(v);
}

String fmtDate(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '—';
  final s = raw.trim().replaceAll(' 00:00:00', '');

  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  if (iso != null) {
    return '${iso.group(3)}/${iso.group(2)}/${iso.group(1)}';
  }

  final parts = RegExp(r'^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})').firstMatch(s);
  if (parts != null) {
    final a = int.parse(parts.group(1)!);
    final b = int.parse(parts.group(2)!);
    final y = parts.group(3)!;
    if (a > 12) return '${a.toString().padLeft(2, '0')}/${b.toString().padLeft(2, '0')}/$y';
    if (b > 12) return '${b.toString().padLeft(2, '0')}/${a.toString().padLeft(2, '0')}/$y';
    return '${a.toString().padLeft(2, '0')}/${b.toString().padLeft(2, '0')}/$y';
  }

  final d = DateTime.tryParse(s);
  if (d != null) {
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }
  return s.length >= 10 ? s.substring(0, 10) : s;
}

String isoToday() {
  final n = DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

String isoMonthStart([DateTime? d]) {
  final n = d ?? DateTime.now();
  return '${n.year}-${n.month.toString().padLeft(2, '0')}-01';
}

String isoMonthEnd([DateTime? d]) {
  final n = d ?? DateTime.now();
  final last = DateTime(n.year, n.month + 1, 0);
  return '${last.year}-${last.month.toString().padLeft(2, '0')}-${last.day.toString().padLeft(2, '0')}';
}

const arMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

String orderStatusLabel(String? status) {
  final s = status?.trim().toLowerCase();
  switch (s) {
    case 'draft':
    case 'submitted':
    case 'under_review':
    case 'pending':
      return 'قيد الانتظار';
    case 'approved':
    case 'processing':
    case 'delivered':
      return 'تم التجهيز';
    case 'rejected':
    case 'cancelled':
      return 'مرفوض';
    default:
      final raw = status?.trim();
      if (raw == null || raw.isEmpty) return '—';
      // إذا كانت الحالة نصاً إنجليزياً غير معروف، لا نعرضه للمستخدم.
      if (RegExp(r'^[a-z_]+$').hasMatch(raw.toLowerCase())) return 'قيد الانتظار';
      return raw;
  }
}

/// يعرض حالة الطلب بالعربية — يفضّل التسمية من السيرفر إن وُجدت.
String displayOrderStatusLabel({String? status, String? statusLabel}) {
  final label = statusLabel?.trim();
  if (label != null && label.isNotEmpty) return label;
  return orderStatusLabel(status);
}

/// وقت نسبي مختصر بالعربية: «الآن»، «قبل 5 د»، «قبل ساعتين»، «أمس 14:20».
String relativeTimeAr(DateTime t, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final d = n.difference(t);
  if (d.inSeconds < 45) return 'الآن';
  if (d.inMinutes < 60) {
    final m = d.inMinutes < 1 ? 1 : d.inMinutes;
    return m == 1 ? 'قبل دقيقة' : m == 2 ? 'قبل دقيقتين' : m <= 10 ? 'قبل $m دقائق' : 'قبل $m دقيقة';
  }
  if (d.inHours < 24 && n.day == t.day) {
    final h = d.inHours;
    return h == 1 ? 'قبل ساعة' : h == 2 ? 'قبل ساعتين' : h <= 10 ? 'قبل $h ساعات' : 'قبل $h ساعة';
  }
  final hm = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  final yesterday = DateTime(n.year, n.month, n.day).subtract(const Duration(days: 1));
  if (t.year == yesterday.year && t.month == yesterday.month && t.day == yesterday.day) return 'أمس $hm';
  return '${t.day.toString().padLeft(2, '0')}/${t.month.toString().padLeft(2, '0')} $hm';
}

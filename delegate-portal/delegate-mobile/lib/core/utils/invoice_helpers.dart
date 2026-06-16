import 'package:intl/intl.dart';

final _invFmt = NumberFormat('#,##0', 'en_US');

String fmtInvInt(num? v) {
  if (v == null || v.isNaN) return '—';
  return _invFmt.format(v.round());
}

String invoiceBarcode(Map<String, dynamic> line) {
  final code = '${line['matNum'] ?? line['mat'] ?? ''}'.trim().replaceAll(RegExp(r'\s+'), '');
  return code.isEmpty ? '—' : code;
}

num invoiceLineTotal(Map<String, dynamic> line) {
  final q = (line['quant'] ?? line['qty'] ?? 0) as num;
  final p = (line['price'] ?? line['unitPrice'] ?? 0) as num;
  final computed = (q * p).round();
  final stored = ((line['lineTotal'] ?? line['amount'] ?? 0) as num).round();
  if (stored > 0 && computed > 0 && (stored - computed).abs() > 1) return computed;
  if (stored > 0) return stored;
  return computed;
}

Map<String, dynamic> reconcileInvoiceTotals(Map<String, dynamic> inv, List<Map<String, dynamic>> lines) {
  final discount = ((inv['discount'] as num?) ?? 0).round().clamp(0, 1 << 31);
  final headerTotal = ((inv['total'] ?? inv['amount'] ?? 0) as num).round();
  final headerLineCount = (inv['lineCount'] as num?)?.toInt() ?? 0;
  final linesSum = lines.fold<num>(0, (s, l) => s + invoiceLineTotal(l)).round();

  var total = linesSum > 0 ? linesSum : headerTotal;
  if (headerTotal > 0 &&
      linesSum > 0 &&
      headerLineCount > 0 &&
      lines.length < headerLineCount &&
      headerTotal > linesSum) {
    total = headerTotal;
  } else if (headerTotal > 0 && linesSum > 0 && (headerTotal - linesSum).abs() <= (headerTotal * 0.002).clamp(1, double.infinity)) {
    total = headerTotal;
  }

  final netPay = (total - discount).clamp(0, 1 << 31);
  return {...inv, 'total': total, 'discount': discount, 'netPay': netPay};
}

String invoiceCustomerName(Map<String, dynamic> inv, Map<String, dynamic>? customer) {
  final fromInv = '${inv['accountName'] ?? ''}'.trim();
  if (fromInv.isNotEmpty) return fromInv;
  if (customer != null) {
    final n = '${customer['name1'] ?? customer['name'] ?? ''}'.trim();
    if (n.isNotEmpty) return n;
  }
  return '—';
}

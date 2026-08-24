import '../../models/models.dart';
import '../../core/utils/formatters.dart';

class DeliveryReceiptPrintLine {
  const DeliveryReceiptPrintLine({required this.text, required this.size});

  final String text;
  final int size;
}

/// يبني أسطر الطباعة من قالب JSON القادم من لوحة التحكم.
List<DeliveryReceiptPrintLine> buildDeliveryReceiptPrintLines(
  DeliveryReceipt receipt, {
  Map<String, dynamic>? template,
  String? agentName,
}) {
  if (template == null || template['lines'] is! List) {
    return _legacyLines(receipt, agentName: agentName);
  }

  final width = (template['paperChars'] as num?)?.toInt() ?? 32;
  final footerBlank = (template['footerBlankLines'] as num?)?.toInt() ?? 3;
  final sample = template['sample'] is Map ? Map<String, dynamic>.from(template['sample'] as Map) : <String, dynamic>{};

  final ctx = <String, String>{
    'company': sample['company']?.toString() ?? 'Edari',
    'title': sample['title']?.toString() ?? 'وصل استلام مبلغ',
    'footer': sample['footer']?.toString() ?? 'شكراً لتعاملكم',
    'deliveryNo': receipt.deliveryNo,
    'date': receipt.receiptDate ?? receipt.createdAt ?? '',
    'agent': (agentName?.trim().isNotEmpty == true) ? agentName!.trim() : (receipt.agentName ?? 'مندوب'),
    'customer': receipt.customerName ?? '—',
    'customerNum': receipt.customerNum ?? '',
    'tree': receipt.treeName ?? '',
    'amount': fmtMoney(receipt.amount),
    'notes': receipt.notes?.trim() ?? '',
  };

  final out = <DeliveryReceiptPrintLine>[];
  for (final raw in template['lines'] as List) {
    if (raw is! Map) continue;
    final line = Map<String, dynamic>.from(raw);
    final type = line['type']?.toString() ?? 'text';
    final size = (line['size'] as num?)?.toInt() == 2 ? 2 : 1;
    final align = line['align']?.toString() == 'center' ? 'center' : 'left';

    if (type == 'separator') {
      final chStr = line['char']?.toString() ?? '=';
      final ch = chStr.isNotEmpty ? chStr[0] : '=';
      out.add(DeliveryReceiptPrintLine(text: ch * width, size: size));
      continue;
    }
    if (type == 'blank') {
      final count = (line['count'] as num?)?.toInt() ?? 1;
      for (var i = 0; i < count.clamp(1, 5); i++) {
        out.add(const DeliveryReceiptPrintLine(text: '', size: 1));
      }
      continue;
    }
    if (type == 'field') {
      final field = line['field']?.toString() ?? '';
      final value = ctx[field] ?? '';
      if (line['hideIfEmpty'] == true && value.isEmpty) continue;
      final composed = '${line['prefix'] ?? ''}$value${line['suffix'] ?? ''}';
      out.add(DeliveryReceiptPrintLine(text: _pad(composed, width, align), size: size));
      continue;
    }
    final text = line['text']?.toString() ?? '';
    if (text.isNotEmpty) {
      out.add(DeliveryReceiptPrintLine(text: _pad(text, width, align), size: size));
    }
  }
  for (var i = 0; i < footerBlank.clamp(0, 8); i++) {
    out.add(const DeliveryReceiptPrintLine(text: '', size: 1));
  }
  return out;
}

String _pad(String text, int width, String align) {
  final t = text;
  if (t.length >= width) return t.substring(0, width);
  if (align == 'center') {
    final left = ((width - t.length) / 2).floor();
    return '${' ' * left}$t';
  }
  return t;
}

List<DeliveryReceiptPrintLine> _legacyLines(DeliveryReceipt receipt, {String? agentName}) {
  final agent = agentName?.trim().isNotEmpty == true ? agentName!.trim() : 'مندوب';
  final lines = [
    '================================',
    '           Edari',
    '      وصل استلام مبلغ',
    '================================',
    'رقم: ${receipt.deliveryNo}',
    'التاريخ: ${receipt.receiptDate ?? receipt.createdAt ?? ''}',
    'المندوب: $agent',
    'الزبون: ${receipt.customerName ?? '—'}',
    'المبلغ: ${fmtMoney(receipt.amount)}',
    '--------------------------------',
    'وصلني منكم المبلغ المذكور',
    'أعلاه نقداً / شيكاً',
    if (receipt.notes != null && receipt.notes!.trim().isNotEmpty) receipt.notes!.trim(),
    '================================',
    '      شكراً لتعاملكم',
    '================================',
  ];
  return lines.map((t) => DeliveryReceiptPrintLine(text: t, size: t.contains('==') || t.contains('Edari') ? 2 : 1)).toList();
}

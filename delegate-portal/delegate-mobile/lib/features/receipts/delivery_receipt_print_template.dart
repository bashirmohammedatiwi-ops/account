import '../../models/models.dart';
import '../../core/utils/formatters.dart';

class DeliveryReceiptPrintBlock {
  const DeliveryReceiptPrintBlock({
    required this.type,
    this.text,
    this.label,
    this.value,
    this.url,
    this.maxWidth,
    this.fontSize,
    this.labelFont,
    this.valueFont,
    this.align = 'center',
    this.bold = false,
    this.char,
    this.count = 1,
  });

  final String type;
  final String? text;
  final String? label;
  final String? value;
  final String? url;
  final int? maxWidth;
  final int? fontSize;
  final int? labelFont;
  final int? valueFont;
  final String align;
  final bool bold;
  final String? char;
  final int count;
}

class DeliveryReceiptPrintPayload {
  const DeliveryReceiptPrintPayload({
    required this.blocks,
    required this.footerBlankLines,
  });

  final List<DeliveryReceiptPrintBlock> blocks;
  final int footerBlankLines;
}

int _clampInt(dynamic v, int min, int max, int fallback) {
  final n = (v as num?)?.toInt();
  if (n == null) return fallback;
  return n.clamp(min, max);
}

Map<String, dynamic> _normalizeTemplate(Map<String, dynamic>? raw) {
  if (raw == null || (raw['version'] as num?)?.toInt() != 2) {
    return {
      'version': 2,
      'footerBlankLines': 4,
      'branding': {
        'showLogo': false,
        'logoUrl': '',
        'logoWidth': 180,
        'legalName': raw?['sample']?['company']?.toString() ?? 'شركة التوزيع',
        'legalNameFont': 30,
        'companyName': raw?['sample']?['company']?.toString() ?? 'Edari',
        'companyFont': 17,
        'title': raw?['sample']?['title']?.toString() ?? 'وصل استلام مبلغ',
        'titleFont': 24,
        'footer': raw?['sample']?['footer']?.toString() ?? 'شكراً لتعاملكم',
        'footerFont': 17,
      },
      'typography': {'bodyFont': 18, 'labelFont': 16, 'amountFont': 30, 'legalFont': 17},
      'content': {
        'showDeliveryNo': true,
        'showDate': true,
        'showAgent': true,
        'showCustomer': true,
        'showCustomerNum': true,
        'showTree': false,
        'showNotes': true,
        'legalText': 'وصلني منكم المبلغ المذكور أعلاه نقداً / شيكاً',
        'dividerStyle': 'light',
      },
    };
  }
  return raw;
}

String _dividerChar(String? style) => style == 'solid' ? '━' : '─';

/// يبني blocks الطباعة من قالب لوحة التحكم (v2).
DeliveryReceiptPrintPayload buildDeliveryReceiptPrintBlocks(
  DeliveryReceipt receipt, {
  Map<String, dynamic>? template,
  String? agentName,
}) {
  final tpl = _normalizeTemplate(template);
  final b = Map<String, dynamic>.from(tpl['branding'] as Map? ?? {});
  final t = Map<String, dynamic>.from(tpl['typography'] as Map? ?? {});
  final c = Map<String, dynamic>.from(tpl['content'] as Map? ?? {});
  final div = _dividerChar(c['dividerStyle']?.toString());

  final ctx = <String, String>{
    'deliveryNo': receipt.deliveryNo,
    'date': receipt.receiptDate ?? receipt.createdAt ?? '—',
    'agent': (agentName?.trim().isNotEmpty == true) ? agentName!.trim() : 'مندوب',
    'customer': receipt.customerName ?? '—',
    'customerNum': receipt.customerNum ?? '',
    'tree': receipt.treeName ?? '',
    'amount': fmtMoney(receipt.amount),
    'notes': receipt.notes?.trim() ?? '',
  };

  final blocks = <DeliveryReceiptPrintBlock>[];

  if (b['showLogo'] == true && (b['logoUrl']?.toString().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'logo',
      url: b['logoUrl']?.toString(),
      maxWidth: _clampInt(b['logoWidth'], 80, 320, 180),
    ));
  }

  final legalName = b['legalName']?.toString().trim() ?? '';
  if (legalName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: legalName,
      fontSize: _clampInt(b['legalNameFont'], 14, 42, 30),
      align: 'center',
      bold: true,
    ));
  }

  final companyName = b['companyName']?.toString().trim() ?? '';
  if (companyName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: companyName,
      fontSize: _clampInt(b['companyFont'], 12, 28, 17),
      align: 'center',
    ));
  }

  blocks.add(DeliveryReceiptPrintBlock(type: 'divider', char: div));

  final title = b['title']?.toString().trim() ?? '';
  if (title.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: title,
      fontSize: _clampInt(b['titleFont'], 14, 36, 24),
      align: 'center',
      bold: true,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  void row(String label, String field, bool show) {
    if (!show) return;
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'row',
      label: label,
      value: ctx[field] ?? '',
      labelFont: _clampInt(t['labelFont'], 12, 24, 16),
      valueFont: _clampInt(t['bodyFont'], 12, 28, 18),
    ));
  }

  row('رقم الوصل', 'deliveryNo', c['showDeliveryNo'] == true);
  row('التاريخ', 'date', c['showDate'] == true);
  row('المندوب', 'agent', c['showAgent'] == true);
  row('الزبون', 'customer', c['showCustomer'] == true);
  if (c['showCustomerNum'] == true && ctx['customerNum']!.isNotEmpty) {
    row('رقم الحساب', 'customerNum', true);
  }
  if (c['showTree'] == true && ctx['tree']!.isNotEmpty) {
    row('الشجرة', 'tree', true);
  }

  blocks.add(DeliveryReceiptPrintBlock(type: 'divider', char: div));

  blocks.add(DeliveryReceiptPrintBlock(
    type: 'amount',
    label: 'المبلغ المستلم',
    value: ctx['amount'],
    fontSize: _clampInt(t['amountFont'], 18, 40, 30),
  ));

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  final legalText = c['legalText']?.toString().trim() ?? '';
  if (legalText.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: legalText,
      fontSize: _clampInt(t['legalFont'], 12, 24, 17),
      align: 'center',
    ));
  }

  if (c['showNotes'] == true && ctx['notes']!.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: ctx['notes'],
      fontSize: _clampInt(t['bodyFont'], 12, 28, 18),
      align: 'center',
    ));
  }

  blocks.add(DeliveryReceiptPrintBlock(type: 'divider', char: div));

  final footer = b['footer']?.toString().trim() ?? '';
  if (footer.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: footer,
      fontSize: _clampInt(b['footerFont'], 12, 28, 17),
      align: 'center',
    ));
  }

  return DeliveryReceiptPrintPayload(
    blocks: blocks,
    footerBlankLines: _clampInt(tpl['footerBlankLines'], 0, 8, 4),
  );
}

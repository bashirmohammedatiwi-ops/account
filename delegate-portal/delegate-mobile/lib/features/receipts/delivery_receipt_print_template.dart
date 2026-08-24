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
    this.emphasis = false,
    this.muted = false,
    this.italic = false,
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
  final bool emphasis;
  final bool muted;
  final bool italic;
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

String _cleanNotes(String? notes) {
  final t = notes?.trim() ?? '';
  if (t.isEmpty) return '';
  return t.replaceAll(RegExp(r'دفعة\s*شهرية'), '').trim();
}

String _cleanLegalText(String text) {
  return text.replaceAll(RegExp(r'\s*/\s*شيكاً'), '').replaceAll('شيكاً', '').trim();
}

String _dividerChar(String? style) => style == 'solid' ? '━' : '─';

String _heavyDividerChar(String? style) => style == 'solid' ? '━' : '═';

Map<String, dynamic> _normalizeTemplate(Map<String, dynamic>? raw) {
  if (raw == null || (raw['version'] as num?)?.toInt() != 2) {
    return {
      'version': 2,
      'footerBlankLines': 4,
      'branding': {
        'showLogo': false,
        'logoUrl': '',
        'logoWidth': 200,
        'legalName': raw?['sample']?['company']?.toString() ?? 'شركة التوزيع',
        'legalNameFont': 32,
        'companyName': raw?['sample']?['company']?.toString() ?? 'Edari',
        'companyFont': 16,
        'title': raw?['sample']?['title']?.toString() ?? 'وصل قبض',
        'titleFont': 26,
        'footer': raw?['sample']?['footer']?.toString() ?? 'شكراً لتعاملكم — نتشرف بخدمتكم',
        'footerFont': 16,
      },
      'typography': {'bodyFont': 17, 'labelFont': 15, 'amountFont': 36, 'legalFont': 15},
      'content': {
        'showDeliveryNo': true,
        'showDate': true,
        'showAgent': true,
        'showCustomer': true,
        'showCustomerNum': true,
        'showTree': false,
        'showNotes': true,
        'legalText': 'وصلني منكم المبلغ المذكور أعلاه نقداً',
        'dividerStyle': 'light',
      },
    };
  }
  final content = Map<String, dynamic>.from(raw['content'] as Map? ?? {});
  content['legalText'] = _cleanLegalText(content['legalText']?.toString() ?? 'وصلني منكم المبلغ المذكور أعلاه نقداً');
  return Map<String, dynamic>.from(raw)..['content'] = content;
}

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
  final heavy = _heavyDividerChar(c['dividerStyle']?.toString());

  final ctx = <String, String>{
    'deliveryNo': receipt.deliveryNo,
    'date': receipt.receiptDate ?? receipt.createdAt ?? '—',
    'agent': (agentName?.trim().isNotEmpty == true) ? agentName!.trim() : 'مندوب',
    'customer': receipt.customerName ?? '—',
    'customerNum': receipt.customerNum ?? '',
    'tree': receipt.treeName ?? '',
    'amount': fmtMoney(receipt.amount),
    'notes': _cleanNotes(receipt.notes),
  };

  final blocks = <DeliveryReceiptPrintBlock>[];

  void pushDivider(String char) => blocks.add(DeliveryReceiptPrintBlock(type: 'divider', char: char));

  void pushDoubleDivider(String char) => blocks.add(DeliveryReceiptPrintBlock(type: 'doubleDivider', char: char));

  void pushRow(String label, String field, {bool emphasis = false}) {
    final value = ctx[field] ?? '';
    if (value.isEmpty && field != 'customer') return;
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'row',
      label: label,
      value: value,
      labelFont: _clampInt(t['labelFont'], 12, 24, 15),
      valueFont: emphasis
          ? _clampInt(t['bodyFont'] + 3, 14, 28, 20)
          : _clampInt(t['bodyFont'], 12, 28, 17),
      emphasis: emphasis,
    ));
  }

  if (b['showLogo'] == true && (b['logoUrl']?.toString().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'logo',
      url: b['logoUrl']?.toString(),
      maxWidth: _clampInt(b['logoWidth'], 80, 320, 200),
    ));
    blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));
  }

  final legalName = b['legalName']?.toString().trim() ?? '';
  if (legalName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: legalName,
      fontSize: _clampInt(b['legalNameFont'], 14, 42, 32),
      align: 'center',
      bold: true,
    ));
  }

  final companyName = b['companyName']?.toString().trim() ?? '';
  if (companyName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: companyName,
      fontSize: _clampInt(b['companyFont'], 12, 28, 16),
      align: 'center',
      muted: true,
    ));
  }

  pushDoubleDivider(heavy);

  final title = b['title']?.toString().trim() ?? '';
  if (title.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'ribbon',
      text: title,
      fontSize: _clampInt(b['titleFont'], 14, 36, 26),
      char: div,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  final metaCount = (c['showDeliveryNo'] == true ? 1 : 0) +
      (c['showDate'] == true ? 1 : 0) +
      (c['showAgent'] == true ? 1 : 0);

  if (c['showDeliveryNo'] == true) pushRow('رقم الوصل', 'deliveryNo');
  if (c['showDate'] == true) pushRow('التاريخ', 'date');
  if (c['showAgent'] == true) pushRow('المندوب', 'agent');

  final hasCustomerBlock = c['showCustomer'] == true ||
      (c['showCustomerNum'] == true && ctx['customerNum']!.isNotEmpty) ||
      (c['showTree'] == true && ctx['tree']!.isNotEmpty);

  if (metaCount > 0 && hasCustomerBlock) {
    pushDivider(div);
  }

  if (c['showCustomer'] == true) pushRow('الزبون', 'customer', emphasis: true);
  if (c['showCustomerNum'] == true && ctx['customerNum']!.isNotEmpty) {
    pushRow('رقم الحساب', 'customerNum');
  }
  if (c['showTree'] == true && ctx['tree']!.isNotEmpty) {
    pushRow('الشجرة', 'tree');
  }

  pushDoubleDivider(heavy);

  blocks.add(DeliveryReceiptPrintBlock(
    type: 'amountBox',
    label: 'المبلغ المستلم',
    value: ctx['amount'],
    fontSize: _clampInt(t['amountFont'], 18, 40, 36),
    char: heavy,
  ));

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  final legalText = c['legalText']?.toString().trim() ?? '';
  if (legalText.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'legalBox',
      text: legalText,
      fontSize: _clampInt(t['legalFont'], 12, 24, 15),
      char: div,
    ));
  }

  if (c['showNotes'] == true && ctx['notes']!.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: ctx['notes'],
      fontSize: _clampInt(t['bodyFont'], 12, 28, 17),
      align: 'center',
      italic: true,
    ));
  }

  pushDoubleDivider(div);

  final footer = b['footer']?.toString().trim() ?? '';
  if (footer.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: footer,
      fontSize: _clampInt(b['footerFont'], 12, 28, 16),
      align: 'center',
    ));
  }

  return DeliveryReceiptPrintPayload(
    blocks: blocks,
    footerBlankLines: _clampInt(tpl['footerBlankLines'], 0, 8, 4),
  );
}

import '../../models/models.dart';
import '../../core/utils/formatters.dart';

class DeliveryReceiptPrintBlock {
  const DeliveryReceiptPrintBlock({
    required this.type,
    this.text,
    this.subText,
    this.label,
    this.value,
    this.url,
    this.maxWidth,
    this.fontSize,
    this.subFontSize,
    this.labelFont,
    this.valueFont,
    this.align = 'center',
    this.bold = false,
    this.char,
    this.count = 1,
    this.repeat = 3,
    this.emphasis = false,
    this.muted = false,
    this.italic = false,
  });

  final String type;
  final String? text;
  final String? subText;
  final String? label;
  final String? value;
  final String? url;
  final int? maxWidth;
  final int? fontSize;
  final int? subFontSize;
  final int? labelFont;
  final int? valueFont;
  final String align;
  final bool bold;
  final String? char;
  final int count;
  final int repeat;
  final bool emphasis;
  final bool muted;
  final bool italic;
}

class DeliveryReceiptPrintPayload {
  const DeliveryReceiptPrintPayload({
    required this.blocks,
    required this.footerBlankLines,
    this.paperMm = 80,
  });

  final List<DeliveryReceiptPrintBlock> blocks;
  final int footerBlankLines;
  final int paperMm;
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

int _normalizePaperMm(dynamic v) {
  final n = (v as num?)?.toInt();
  return n == 58 ? 58 : 80;
}

Map<String, dynamic> _normalizeTemplate(Map<String, dynamic>? raw) {
  if (raw == null || (raw['version'] as num?)?.toInt() != 2) {
    return {
      'version': 2,
      'paperMm': 80,
      'footerBlankLines': 4,
      'branding': {
        'showLogo': false,
        'logoUrl': '',
        'logoWidth': 200,
        'legalName': raw?['sample']?['company']?.toString() ?? 'شركة التوزيع',
        'legalNameFont': 28,
        'companyName': raw?['sample']?['company']?.toString() ?? 'Edari',
        'companyFont': 14,
        'title': raw?['sample']?['title']?.toString() ?? 'وصل قبض',
        'titleFont': 24,
        'footer': raw?['sample']?['footer']?.toString() ?? 'شكراً لتعاملكم — نتشرف بخدمتكم',
        'footerFont': 14,
      },
      'typography': {'bodyFont': 17, 'labelFont': 13, 'amountFont': 38, 'legalFont': 13},
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
  final out = Map<String, dynamic>.from(raw);
  out['content'] = content;
  out['paperMm'] = _normalizePaperMm(raw['paperMm']);
  return out;
}

/// يبني blocks الطباعة من قالب لوحة التحكم (v2) — تصميم minimal أنيق.
DeliveryReceiptPrintPayload buildDeliveryReceiptPrintBlocks(
  DeliveryReceipt receipt, {
  Map<String, dynamic>? template,
  String? agentName,
}) {
  final tpl = _normalizeTemplate(template);
  final b = Map<String, dynamic>.from(tpl['branding'] as Map? ?? {});
  final t = Map<String, dynamic>.from(tpl['typography'] as Map? ?? {});
  final c = Map<String, dynamic>.from(tpl['content'] as Map? ?? {});

  final labelFont = _clampInt(t['labelFont'], 11, 20, 13);
  final bodyFont = _clampInt(t['bodyFont'], 13, 24, 17);
  final amountFont = _clampInt(t['amountFont'], 22, 48, 38);
  final legalFont = _clampInt(t['legalFont'], 11, 20, 13);

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

  void pushPair(String label, String field) {
    final value = ctx[field] ?? '';
    if (value.isEmpty) return;
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'pair',
      label: label,
      value: value,
      labelFont: labelFont,
      valueFont: bodyFont,
    ));
  }

  if (b['showLogo'] == true && (b['logoUrl']?.toString().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'logo',
      url: b['logoUrl']?.toString(),
      maxWidth: _clampInt(b['logoWidth'], 80, 320, 200),
    ));
  }

  final legalName = b['legalName']?.toString().trim() ?? '';
  if (legalName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: legalName,
      fontSize: _clampInt(b['legalNameFont'], 14, 36, 28),
      align: 'center',
      bold: true,
    ));
  }

  final companyName = b['companyName']?.toString().trim() ?? '';
  if (companyName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: companyName,
      fontSize: _clampInt(b['companyFont'], 11, 22, 14),
      align: 'center',
      muted: true,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 1));

  final title = b['title']?.toString().trim() ?? '';
  final showTitle = c['showTitle'] == true;
  if (showTitle && title.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'title',
      text: title,
      fontSize: _clampInt(b['titleFont'], 14, 32, 24),
      align: 'center',
      bold: true,
    ));
  }

  if (c['showDeliveryNo'] == true) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: ctx['deliveryNo']!,
      fontSize: labelFont,
      align: 'center',
      muted: true,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'rule'));

  if (c['showDate'] == true) pushPair('التاريخ', 'date');
  if (c['showAgent'] == true) pushPair('المندوب', 'agent');

  final customer = ctx['customer'] ?? '';
  if (c['showCustomer'] == true && customer.isNotEmpty && customer != '—') {
    blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 1));
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: 'الزبون',
      fontSize: labelFont,
      align: 'right',
      muted: true,
    ));
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'hero',
      text: customer,
      fontSize: _clampInt(bodyFont + 8, 18, 32, 25),
      align: 'right',
      bold: true,
    ));
  }

  if (c['showCustomerNum'] == true && ctx['customerNum']!.isNotEmpty) {
    pushPair('رقم الحساب', 'customerNum');
  }
  if (c['showTree'] == true && ctx['tree']!.isNotEmpty) {
    pushPair('الشجرة', 'tree');
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'rule'));

  blocks.add(DeliveryReceiptPrintBlock(
    type: 'text',
    text: 'المبلغ المستلم',
    fontSize: labelFont,
    align: 'center',
    muted: true,
  ));
  blocks.add(DeliveryReceiptPrintBlock(
    type: 'amount',
    value: ctx['amount'],
    fontSize: amountFont,
  ));

  blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 1));

  final legalText = c['legalText']?.toString().trim() ?? '';
  if (legalText.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'caption',
      text: legalText,
      fontSize: legalFont,
      align: 'center',
      muted: true,
    ));
  }

  if (c['showNotes'] == true && ctx['notes']!.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: 'ملاحظات: ${ctx['notes']}',
      fontSize: bodyFont,
      align: 'center',
      italic: true,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 2));

  final footer = b['footer']?.toString().trim() ?? '';
  if (footer.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: footer,
      fontSize: _clampInt(b['footerFont'], 11, 22, 14),
      align: 'center',
      muted: true,
    ));
  }

  return DeliveryReceiptPrintPayload(
    blocks: blocks,
    footerBlankLines: _clampInt(tpl['footerBlankLines'], 0, 8, 4),
    paperMm: _normalizePaperMm(tpl['paperMm']),
  );
}

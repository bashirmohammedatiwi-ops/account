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

String _dividerChar(String? style) => style == 'solid' ? '━' : '─';

String _heavyDividerChar(String? style) => style == 'solid' ? '━' : '═';

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
        'logoWidth': 240,
        'legalName': raw?['sample']?['company']?.toString() ?? 'شركة التوزيع',
        'legalNameFont': 32,
        'companyName': raw?['sample']?['company']?.toString() ?? 'Edari',
        'companyFont': 16,
        'title': raw?['sample']?['title']?.toString() ?? 'وصل قبض',
        'titleFont': 26,
        'footer': raw?['sample']?['footer']?.toString() ?? 'شكراً لتعاملكم — نتشرف بخدمتكم',
        'footerFont': 16,
      },
      'typography': {'bodyFont': 18, 'labelFont': 14, 'amountFont': 42, 'legalFont': 14},
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
      labelFont: _clampInt(t['labelFont'], 12, 24, 14),
      valueFont: emphasis
          ? _clampInt(t['bodyFont'] + 3, 14, 28, 20)
          : _clampInt(t['bodyFont'], 12, 28, 18),
      emphasis: emphasis,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'ornament', char: '✦', repeat: 3));

  if (b['showLogo'] == true && (b['logoUrl']?.toString().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'logo',
      url: b['logoUrl']?.toString(),
      maxWidth: _clampInt(b['logoWidth'], 80, 400, 240),
    ));
    blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));
  }

  final legalName = b['legalName']?.toString().trim() ?? '';
  if (legalName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: legalName,
      fontSize: _clampInt(b['legalNameFont'], 14, 42, 34),
      align: 'center',
      bold: true,
    ));
  }

  final companyName = b['companyName']?.toString().trim() ?? '';
  if (companyName.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: companyName,
      fontSize: _clampInt(b['companyFont'], 12, 28, 15),
      align: 'center',
      muted: true,
    ));
  }

  pushDoubleDivider(heavy);

  final title = b['title']?.toString().trim() ?? '';
  final showTitle = c['showTitle'] == true;
  if (showTitle && title.isNotEmpty) {
    final showDeliveryNo = c['showDeliveryNo'] == true;
    final subText = showDeliveryNo ? 'رقم الوصل: ${ctx['deliveryNo']}' : '';
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'titleBadge',
      text: title,
      subText: subText.isNotEmpty ? subText : null,
      fontSize: _clampInt(b['titleFont'], 14, 36, 28),
      subFontSize: _clampInt(t['labelFont'], 12, 24, 14),
      char: heavy,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  final metaRows = <Map<String, String>>[];
  if (c['showDeliveryNo'] == true && !showTitle) {
    metaRows.add({'label': 'رقم الوصل', 'field': 'deliveryNo'});
  }
  if (c['showDate'] == true) metaRows.add({'label': 'التاريخ', 'field': 'date'});
  if (c['showAgent'] == true) metaRows.add({'label': 'المندوب', 'field': 'agent'});

  if (metaRows.isNotEmpty) {
    blocks.add(const DeliveryReceiptPrintBlock(type: 'metaStart'));
    for (final row in metaRows) {
      pushRow(row['label']!, row['field']!);
    }
    blocks.add(const DeliveryReceiptPrintBlock(type: 'metaEnd'));
  }

  final customer = ctx['customer'] ?? '';
  if (c['showCustomer'] == true && customer.isNotEmpty && customer != '—') {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'customerBox',
      label: 'الزبون',
      value: customer,
      labelFont: _clampInt(t['labelFont'], 12, 24, 14),
      valueFont: _clampInt(t['bodyFont'] + 6, 16, 34, 24),
      char: div,
    ));
  }

  if (c['showCustomerNum'] == true && ctx['customerNum']!.isNotEmpty) {
    pushRow('رقم الحساب', 'customerNum');
  }
  if (c['showTree'] == true && ctx['tree']!.isNotEmpty) {
    pushRow('الشجرة', 'tree');
  }

  pushDoubleDivider(heavy);

  blocks.add(DeliveryReceiptPrintBlock(
    type: 'amountBox',
    label: 'المبلغ المستلم (نقداً)',
    value: ctx['amount'],
    fontSize: _clampInt(t['amountFont'], 18, 48, 42),
    char: heavy,
  ));

  blocks.add(const DeliveryReceiptPrintBlock(type: 'blank', count: 1));

  final legalText = c['legalText']?.toString().trim() ?? '';
  if (legalText.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'legalBox',
      text: legalText,
      fontSize: _clampInt(t['legalFont'], 12, 24, 14),
      char: div,
    ));
  }

  if (c['showNotes'] == true && ctx['notes']!.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'notesBox',
      label: 'ملاحظات',
      text: ctx['notes'],
      labelFont: _clampInt(t['labelFont'], 12, 24, 14),
      fontSize: _clampInt(t['bodyFont'], 12, 28, 18),
    ));
  }

  pushDivider(div);

  final footer = b['footer']?.toString().trim() ?? '';
  if (footer.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: footer,
      fontSize: _clampInt(b['footerFont'], 12, 28, 15),
      align: 'center',
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'ornament', char: '✦', repeat: 3));

  return DeliveryReceiptPrintPayload(
    blocks: blocks,
    footerBlankLines: _clampInt(tpl['footerBlankLines'], 0, 8, 4),
    paperMm: _normalizePaperMm(tpl['paperMm']),
  );
}

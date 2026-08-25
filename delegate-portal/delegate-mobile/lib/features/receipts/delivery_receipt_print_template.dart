import '../../models/models.dart';
import '../../core/utils/formatters.dart';
import 'mobile_receipt_print_defaults.dart';

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

/// يطابق normalizeTemplate على السيرفر — قالب لوحة التحكم.
Map<String, dynamic> normalizeAdminPrintTemplate(Map<String, dynamic>? raw) {
  final d = kFallbackReceiptPrintTemplate;
  final dBranding = Map<String, dynamic>.from(d['branding'] as Map);
  final dTypography = Map<String, dynamic>.from(d['typography'] as Map);
  final dContent = Map<String, dynamic>.from(d['content'] as Map);

  if (raw != null && ((raw['version'] as num?)?.toInt() ?? 0) < 2) {
    final legacyBranding = Map<String, dynamic>.from(raw['branding'] as Map? ?? raw['sample'] as Map? ?? {});
    final legacyContent = Map<String, dynamic>.from(raw['content'] as Map? ?? {});
    final out = Map<String, dynamic>.from(d);
    final b = Map<String, dynamic>.from(out['branding'] as Map);
    if (legacyBranding['companyName'] != null || legacyBranding['company'] != null) {
      b['companyName'] = '${legacyBranding['companyName'] ?? legacyBranding['company'] ?? b['companyName']}';
    }
    if (legacyBranding['title'] != null) b['title'] = '${legacyBranding['title']}';
    if (legacyBranding['footer'] != null) b['footer'] = '${legacyBranding['footer']}';
    if (legacyBranding['legalName'] != null) b['legalName'] = '${legacyBranding['legalName']}';
    if (legacyBranding['logoUrl'] != null) b['logoUrl'] = '${legacyBranding['logoUrl']}';
    out['branding'] = b;
    final c = Map<String, dynamic>.from(out['content'] as Map);
    if (legacyContent['legalText'] != null) {
      c['legalText'] = _cleanLegalText('${legacyContent['legalText']}');
    }
    out['content'] = c;
    if (raw['footerBlankLines'] != null) {
      out['footerBlankLines'] = _clampInt(raw['footerBlankLines'], 0, 8, 4);
    }
    return out;
  }

  if (raw == null || (raw['version'] as num?)?.toInt() != 2) {
    return Map<String, dynamic>.from(d);
  }

  final b = Map<String, dynamic>.from(raw['branding'] as Map? ?? {});
  final t = Map<String, dynamic>.from(raw['typography'] as Map? ?? {});
  final c = Map<String, dynamic>.from(raw['content'] as Map? ?? {});

  return {
    'version': 2,
    'paperMm': _normalizePaperMm(raw['paperMm']),
    'footerBlankLines': _clampInt(raw['footerBlankLines'], 0, 8, 4),
    'branding': {
      'showLogo': b['showLogo'] ?? dBranding['showLogo'],
      'logoUrl': '${b['logoUrl'] ?? ''}',
      'logoWidth': _clampInt(b['logoWidth'], 80, 400, _clampInt(dBranding['logoWidth'], 80, 400, 200)),
      'legalName': '${b['legalName'] ?? dBranding['legalName']}',
      'legalNameFont': _clampInt(b['legalNameFont'], 14, 42, _clampInt(dBranding['legalNameFont'], 14, 42, 32)),
      'companyName': '${b['companyName'] ?? dBranding['companyName']}',
      'companyFont': _clampInt(b['companyFont'], 12, 28, _clampInt(dBranding['companyFont'], 12, 28, 17)),
      'title': '${b['title'] ?? dBranding['title']}',
      'titleFont': _clampInt(b['titleFont'], 14, 36, _clampInt(dBranding['titleFont'], 14, 36, 26)),
      'footer': '${b['footer'] ?? dBranding['footer']}',
      'footerFont': _clampInt(b['footerFont'], 12, 28, _clampInt(dBranding['footerFont'], 12, 28, 17)),
    },
    'typography': {
      'bodyFont': _clampInt(t['bodyFont'], 12, 28, _clampInt(dTypography['bodyFont'], 12, 28, 18)),
      'labelFont': _clampInt(t['labelFont'], 12, 24, _clampInt(dTypography['labelFont'], 12, 24, 16)),
      'amountFont': _clampInt(t['amountFont'], 18, 48, _clampInt(dTypography['amountFont'], 18, 48, 36)),
      'legalFont': _clampInt(t['legalFont'], 12, 24, _clampInt(dTypography['legalFont'], 12, 24, 17)),
    },
    'content': {
      'showLegalName': c['showLegalName'] ?? dContent['showLegalName'],
      'showCompany': c['showCompany'] ?? dContent['showCompany'],
      'showTitle': c['showTitle'] ?? dContent['showTitle'],
      'showDeliveryNo': c['showDeliveryNo'] ?? dContent['showDeliveryNo'],
      'showDate': c['showDate'] ?? dContent['showDate'],
      'showAgent': c['showAgent'] ?? dContent['showAgent'],
      'showCustomer': c['showCustomer'] ?? dContent['showCustomer'],
      'showCustomerNum': c['showCustomerNum'] ?? dContent['showCustomerNum'],
      'showTree': c['showTree'] ?? dContent['showTree'],
      'showNotes': c['showNotes'] ?? dContent['showNotes'],
      'legalText': _cleanLegalText('${c['legalText'] ?? dContent['legalText']}'),
      'dividerStyle': c['dividerStyle'] == 'solid' ? 'solid' : 'light',
    },
  };
}

/// يبني blocks الطباعة — مطابق لـ buildDeliveryReceiptPrintBlocks على السيرفر / لوحة التحكم.
DeliveryReceiptPrintPayload buildDeliveryReceiptPrintBlocks(
  DeliveryReceipt receipt, {
  Map<String, dynamic>? template,
  String? agentName,
}) {
  final tpl = normalizeAdminPrintTemplate(template);
  final b = Map<String, dynamic>.from(tpl['branding'] as Map);
  final t = Map<String, dynamic>.from(tpl['typography'] as Map);
  final c = Map<String, dynamic>.from(tpl['content'] as Map);

  final labelFont = _clampInt(t['labelFont'], 12, 24, 16);
  final bodyFont = _clampInt(t['bodyFont'], 12, 28, 18);
  final amountFont = _clampInt(t['amountFont'], 18, 48, 36);
  final legalFont = _clampInt(t['legalFont'], 12, 24, 17);

  final ctx = <String, String>{
    'deliveryNo': receipt.deliveryNo,
    'date': fmtDate(receipt.receiptDate ?? receipt.createdAt),
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
      maxWidth: _clampInt(b['logoWidth'], 80, 400, 200),
    ));
  }

  if (c['showLegalName'] == true && (b['legalName']?.toString().trim().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: b['legalName']?.toString().trim(),
      fontSize: _clampInt(b['legalNameFont'], 14, 42, 32),
      align: 'center',
      bold: true,
    ));
  }

  if (c['showCompany'] == true && (b['companyName']?.toString().trim().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: b['companyName']?.toString().trim(),
      fontSize: _clampInt(b['companyFont'], 12, 28, 17),
      align: 'center',
      muted: true,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'rule'));

  if (c['showTitle'] == true && (b['title']?.toString().trim().isNotEmpty == true)) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'titleBadge',
      text: b['title']?.toString().trim(),
      fontSize: _clampInt(b['titleFont'], 14, 36, 26),
    ));
  }

  if (c['showDeliveryNo'] == true) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'receiptId',
      text: ctx['deliveryNo']!,
      fontSize: labelFont,
    ));
  }

  blocks.add(const DeliveryReceiptPrintBlock(type: 'dashedRule'));

  if (c['showDate'] == true) pushPair('التاريخ', 'date');
  if (c['showAgent'] == true) pushPair('المندوب', 'agent');

  final customer = ctx['customer'] ?? '';
  if (c['showCustomer'] == true && customer.isNotEmpty && customer != '—') {
    blocks.add(const DeliveryReceiptPrintBlock(type: 'dashedRule'));
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
      fontSize: _clampInt(bodyFont + 8, 18, 32, 26),
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

  blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 1));

  blocks.add(DeliveryReceiptPrintBlock(
    type: 'amountBox',
    label: 'المبلغ المستلم',
    value: ctx['amount'],
    subText: 'دينار عراقي',
    fontSize: amountFont,
    labelFont: labelFont,
  ));

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

  blocks.add(const DeliveryReceiptPrintBlock(type: 'spacer', count: 1));
  blocks.add(const DeliveryReceiptPrintBlock(type: 'signature', label: 'توقيع المستلم'));
  blocks.add(const DeliveryReceiptPrintBlock(type: 'dashedRule'));

  final footer = b['footer']?.toString().trim() ?? '';
  if (footer.isNotEmpty) {
    blocks.add(DeliveryReceiptPrintBlock(
      type: 'text',
      text: footer,
      fontSize: _clampInt(b['footerFont'], 12, 28, 17),
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

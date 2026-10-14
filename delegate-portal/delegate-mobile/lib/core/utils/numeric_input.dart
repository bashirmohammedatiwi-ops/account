import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';

/// يحوّل الأرقام العربية/الفارسية إلى 0-9 لاتينية.
class WesternDigitsFormatter extends TextInputFormatter {
  static String toWestern(String input) {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    const persian = '۰۱۲۳۴۵۶۷۸۹';
    final buf = StringBuffer();
    for (final rune in input.runes) {
      final ch = String.fromCharCode(rune);
      final ai = arabic.indexOf(ch);
      if (ai >= 0) {
        buf.write(ai);
        continue;
      }
      final pi = persian.indexOf(ch);
      if (pi >= 0) {
        buf.write(pi);
        continue;
      }
      buf.write(ch);
    }
    return buf.toString();
  }

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final western = toWestern(newValue.text);
    if (western == newValue.text) return newValue;
    final base = newValue.selection.baseOffset.clamp(0, western.length);
    final extent = newValue.selection.extentOffset.clamp(0, western.length);
    return TextEditingValue(
      text: western,
      selection: TextSelection(baseOffset: base, extentOffset: extent),
      composing: TextRange.empty,
    );
  }
}

TextInputType edIntegerKeyboard() {
  if (!kIsWeb && Platform.isIOS) {
    // على iOS مع لوحة عربية، decimal:true يُظهر لوحة أرقام لاتينية 0-9.
    return const TextInputType.numberWithOptions(decimal: true, signed: false);
  }
  return const TextInputType.numberWithOptions(decimal: false, signed: false);
}

TextInputType edDecimalKeyboard() {
  if (!kIsWeb && Platform.isIOS) {
    return const TextInputType.numberWithOptions(decimal: true, signed: false);
  }
  return const TextInputType.numberWithOptions(decimal: true, signed: false);
}

TextInputType edPhoneKeyboard() {
  if (!kIsWeb && Platform.isIOS) {
    return TextInputType.phone;
  }
  return TextInputType.phone;
}

final westernDigitsFormatter = WesternDigitsFormatter();

final edIntegerFormatters = <TextInputFormatter>[
  westernDigitsFormatter,
  FilteringTextInputFormatter.digitsOnly,
];

final edDecimalFormatters = <TextInputFormatter>[
  westernDigitsFormatter,
  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
  _SingleDecimalFormatter(),
];

/// مبالغ صحيحة مع فواصل المراتب (1,250,000) أثناء الكتابة.
final edMoneyFormatters = <TextInputFormatter>[
  westernDigitsFormatter,
  ThousandsSeparatorInputFormatter(),
];

/// أرقام عشرية مع فواصل المراتب (1,250.5) — للكميات والأسعار.
final edGroupedDecimalFormatters = <TextInputFormatter>[
  westernDigitsFormatter,
  ThousandsSeparatorInputFormatter(allowDecimal: true),
];

final edPhoneFormatters = <TextInputFormatter>[
  westernDigitsFormatter,
  FilteringTextInputFormatter.allow(RegExp(r'[0-9+]')),
];

/// إعدادات مشتركة لحقول الأرقام في TextField مباشرة.
class EdNumericFieldConfig {
  const EdNumericFieldConfig._({
    required this.keyboardType,
    required this.inputFormatters,
    required this.textDirection,
    required this.enableSuggestions,
    required this.autocorrect,
  });

  final TextInputType keyboardType;
  final List<TextInputFormatter> inputFormatters;
  final TextDirection textDirection;
  final bool enableSuggestions;
  final bool autocorrect;

  static final integer = EdNumericFieldConfig._(
    keyboardType: edIntegerKeyboard(),
    inputFormatters: edIntegerFormatters,
    textDirection: TextDirection.ltr,
    enableSuggestions: false,
    autocorrect: false,
  );

  static final decimal = EdNumericFieldConfig._(
    keyboardType: edDecimalKeyboard(),
    inputFormatters: edDecimalFormatters,
    textDirection: TextDirection.ltr,
    enableSuggestions: false,
    autocorrect: false,
  );

  /// مبلغ بالدينار — أرقام صحيحة مع فواصل المراتب.
  static final money = EdNumericFieldConfig._(
    keyboardType: edIntegerKeyboard(),
    inputFormatters: edMoneyFormatters,
    textDirection: TextDirection.ltr,
    enableSuggestions: false,
    autocorrect: false,
  );

  /// رقم عشري مع فواصل المراتب.
  static final groupedDecimal = EdNumericFieldConfig._(
    keyboardType: edDecimalKeyboard(),
    inputFormatters: edGroupedDecimalFormatters,
    textDirection: TextDirection.ltr,
    enableSuggestions: false,
    autocorrect: false,
  );

  static final phone = EdNumericFieldConfig._(
    keyboardType: edPhoneKeyboard(),
    inputFormatters: edPhoneFormatters,
    textDirection: TextDirection.ltr,
    enableSuggestions: false,
    autocorrect: false,
  );
}

class _SingleDecimalFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = newValue.text;
    final firstDot = text.indexOf('.');
    if (firstDot < 0) return newValue;
    final cleaned = StringBuffer(text.substring(0, firstDot + 1));
    cleaned.write(text.substring(firstDot + 1).replaceAll('.', ''));
    final out = cleaned.toString();
    if (out == text) return newValue;
    return TextEditingValue(
      text: out,
      selection: TextSelection.collapsed(offset: out.length.clamp(0, out.length)),
      composing: TextRange.empty,
    );
  }
}


/// يحذف الفواصل والمسافات ويحوّل الأرقام العربية — ثم يقرأ الرقم.
num? parseAmount(String? raw) {
  if (raw == null) return null;
  final cleaned = WesternDigitsFormatter.toWestern(raw)
      .replaceAll(RegExp(r'[,\s٬،]'), '')
      .replaceAll('٫', '.');
  if (cleaned.isEmpty) return null;
  return num.tryParse(cleaned);
}

/// نص جاهز لحقل مبلغ (مع فواصل) — يُستخدم عند تعبئة الحقل برمجياً.
String formatAmountInput(num? value) {
  if (value == null) return '';
  final isWhole = value == value.roundToDouble();
  final raw = isWhole ? value.round().toString() : value.toString();
  return ThousandsSeparatorInputFormatter.group(raw);
}

/// يضيف فواصل المراتب أثناء الكتابة مع الحفاظ على موضع المؤشر.
class ThousandsSeparatorInputFormatter extends TextInputFormatter {
  ThousandsSeparatorInputFormatter({this.allowDecimal = false, this.maxIntegerDigits = 12});

  final bool allowDecimal;
  final int maxIntegerDigits;

  static String group(String plain) {
    if (plain.isEmpty) return plain;
    final dot = plain.indexOf('.');
    var intPart = dot >= 0 ? plain.substring(0, dot) : plain;
    final fracPart = dot >= 0 ? plain.substring(dot) : '';
    final negative = intPart.startsWith('-');
    if (negative) intPart = intPart.substring(1);
    final buf = StringBuffer();
    for (var i = 0; i < intPart.length; i++) {
      if (i > 0 && (intPart.length - i) % 3 == 0) buf.write(',');
      buf.write(intPart[i]);
    }
    return '${negative ? '-' : ''}$buf$fracPart';
  }

  bool _keep(String ch) => RegExp(r'[0-9]').hasMatch(ch) || (allowDecimal && ch == '.');

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = newValue.text;
    final cursor = newValue.selection.isValid ? newValue.selection.extentOffset.clamp(0, text.length) : text.length;

    // عدد المحارف المهمة (أرقام/نقطة) قبل المؤشر.
    var significantBefore = 0;
    final plain = StringBuffer();
    var seenDot = false;
    for (var i = 0; i < text.length; i++) {
      final ch = text[i];
      if (!_keep(ch)) continue;
      if (ch == '.') {
        if (seenDot) continue;
        seenDot = true;
      }
      plain.write(ch);
      if (i < cursor) significantBefore++;
    }

    var digits = plain.toString();
    // إزالة الأصفار البادئة (مع إبقاء "0." للأرقام العشرية).
    final dotIdx = digits.indexOf('.');
    var intPart = dotIdx >= 0 ? digits.substring(0, dotIdx) : digits;
    final frac = dotIdx >= 0 ? digits.substring(dotIdx) : '';
    final trimmed = intPart.replaceFirst(RegExp(r'^0+(?=\d)'), '');
    significantBefore -= (intPart.length - trimmed.length).clamp(0, significantBefore);
    intPart = trimmed;
    if (intPart.length > maxIntegerDigits) return oldValue;
    if (intPart.isEmpty && frac.isNotEmpty) {
      intPart = '0';
      // الصفر المضاف يسبق المؤشر إن كان المؤشر بعد النقطة.
      if (significantBefore > 0) significantBefore++;
    }
    digits = '$intPart$frac';

    final formatted = group(digits);
    var offset = 0;
    var seen = 0;
    while (offset < formatted.length && seen < significantBefore) {
      if (formatted[offset] != ',') seen++;
      offset++;
    }
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: offset),
      composing: TextRange.empty,
    );
  }
}

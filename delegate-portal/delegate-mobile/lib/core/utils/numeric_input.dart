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

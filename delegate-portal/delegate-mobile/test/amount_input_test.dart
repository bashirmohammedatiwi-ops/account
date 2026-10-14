import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:edari_delegate/core/utils/amount_words.dart';
import 'package:edari_delegate/core/utils/formatters.dart';
import 'package:edari_delegate/core/utils/numeric_input.dart';

/// يحاكي كتابة نص حرفاً حرفاً عند موضع المؤشر عبر سلسلة المنسّقات.
TextEditingValue _type(TextEditingValue value, String chars, List<TextInputFormatter> formatters) {
  var current = value;
  for (final ch in chars.split('')) {
    final cursor = current.selection.isValid ? current.selection.extentOffset : current.text.length;
    final text = current.text.substring(0, cursor) + ch + current.text.substring(cursor);
    var next = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: cursor + 1));
    for (final f in formatters) {
      next = f.formatEditUpdate(current, next);
    }
    current = next;
  }
  return current;
}

TextEditingValue _backspace(TextEditingValue value, List<TextInputFormatter> formatters) {
  final cursor = value.selection.extentOffset;
  if (cursor == 0) return value;
  final text = value.text.substring(0, cursor - 1) + value.text.substring(cursor);
  var next = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: cursor - 1));
  for (final f in formatters) {
    next = f.formatEditUpdate(value, next);
  }
  return next;
}

void main() {
  group('ThousandsSeparatorInputFormatter', () {
    test('groups digits while typing', () {
      final v = _type(TextEditingValue.empty, '1250000', edMoneyFormatters);
      expect(v.text, '1,250,000');
      expect(v.selection.extentOffset, v.text.length);
      expect(parseAmount(v.text), 1250000);
    });

    test('converts Arabic-Indic digits', () {
      final v = _type(TextEditingValue.empty, '٧٥٠٠٠٠', edMoneyFormatters);
      expect(v.text, '750,000');
      expect(parseAmount(v.text), 750000);
    });

    test('backspace keeps a valid grouped value', () {
      var v = _type(TextEditingValue.empty, '1000', edMoneyFormatters);
      expect(v.text, '1,000');
      v = _backspace(v, edMoneyFormatters);
      expect(v.text, '100');
      expect(parseAmount(v.text), 100);
    });

    test('editing in the middle keeps the caret after the inserted digit', () {
      var v = _type(TextEditingValue.empty, '1000', edMoneyFormatters);
      // المؤشر بعد الرقم الأول: "1|,000"
      v = v.copyWith(selection: const TextSelection.collapsed(offset: 1));
      v = _type(v, '5', edMoneyFormatters);
      expect(v.text, '15,000');
      expect(v.text.substring(0, v.selection.extentOffset), '15');
    });

    test('drops leading zeros and rejects letters', () {
      final v = _type(TextEditingValue.empty, '00a12', edMoneyFormatters);
      expect(v.text, '12');
    });

    test('decimal variant keeps a single dot', () {
      final v = _type(TextEditingValue.empty, '1234.5.6', edGroupedDecimalFormatters);
      expect(v.text, '1,234.56');
      expect(parseAmount(v.text), 1234.56);
    });

    test('typing a leading dot gives 0.x', () {
      final v = _type(TextEditingValue.empty, '.5', edGroupedDecimalFormatters);
      expect(v.text, '0.5');
      expect(parseAmount(v.text), 0.5);
    });

    test('pasting a pre-formatted amount is accepted', () {
      const old = TextEditingValue.empty;
      const pasted = TextEditingValue(text: '2,500,000', selection: TextSelection.collapsed(offset: 9));
      var next = pasted;
      for (final f in edMoneyFormatters) {
        next = f.formatEditUpdate(old, next);
      }
      expect(next.text, '2,500,000');
    });

    test('formatAmountInput / parseAmount round-trip', () {
      expect(formatAmountInput(1500000), '1,500,000');
      expect(formatAmountInput(12.5), '12.5');
      expect(parseAmount('1,500,000'), 1500000);
      expect(parseAmount(' ١٬٢٥٠ '), 1250);
      expect(parseAmount(''), isNull);
    });
  });

  group('amountInArabicWords', () {
    test('common amounts', () {
      expect(amountInArabicWords(1250000), 'مليون ومئتان وخمسون ألف دينار');
      expect(amountInArabicWords(750000), 'سبعمئة وخمسون ألف دينار');
      expect(amountInArabicWords(2000), 'ألفان دينار');
      expect(amountInArabicWords(3000), 'ثلاثة آلاف دينار');
      expect(amountInArabicWords(11000), 'أحد عشر ألف دينار');
      expect(amountInArabicWords(21), 'واحد وعشرون دينار');
      expect(amountInArabicWords(0), 'صفر دينار');
    });
  });

  group('relativeTimeAr', () {
    test('uses correct Arabic plurals', () {
      final now = DateTime(2026, 10, 14, 12, 0);
      expect(relativeTimeAr(now.subtract(const Duration(seconds: 10)), now: now), 'الآن');
      expect(relativeTimeAr(now.subtract(const Duration(minutes: 2)), now: now), 'قبل دقيقتين');
      expect(relativeTimeAr(now.subtract(const Duration(minutes: 5)), now: now), 'قبل 5 دقائق');
      expect(relativeTimeAr(now.subtract(const Duration(minutes: 25)), now: now), 'قبل 25 دقيقة');
    });
  });
}

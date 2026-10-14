import 'package:flutter_test/flutter_test.dart';

import 'package:edari_delegate/models/models.dart';

/// سطور كشف كما يعيدها الخادم: فاتورة حالية وأخرى سابقة بنفس الرقم (5000)،
/// وفاتورة سابقة غير مُزامَنة (6000) لها نظير بنفس الرقم في السنة الحالية.
StatementLine _line(Map<String, dynamic> m) => StatementLine.fromJson({
      'description': 'فاتورة مبيعات',
      'hasInvoice': true,
      ...m,
    });

void main() {
  test('previous-year invoice opens by its own scoped sequence', () {
    final l = _line({'debit': 480000, 'billNum': '5000', 'billSeq': 'PY2025:40077', 'sourceYear': '2025', 'invoiceRef': 'PY2025:40077', 'clickable': true});
    expect(l.invoiceLookup?.ref, 'PY2025:40077');
    expect(l.invoiceLookup?.by, 'seq');
  });

  test('current-year invoice with the same number opens its own sequence', () {
    final l = _line({'debit': 1250000, 'billNum': '5000', 'billSeq': '70001', 'invoiceRef': '70001', 'clickable': true});
    expect(l.invoiceLookup?.ref, '70001');
    expect(l.invoiceLookup?.by, 'seq');
  });

  test('unsynced previous-year invoice never falls back to the current-year number', () {
    final l = _line({'debit': 300000, 'billNum': '6000', 'billSeq': null, 'sourceYear': '2025', 'invoiceRef': null, 'clickable': false});
    expect(l.invoiceLookup, isNull);
  });

  test('previous-year line without sequence is not linked even on servers without clickable', () {
    final l = _line({'debit': 300000, 'billNum': '6000', 'sourceYear': '2025'});
    expect(l.invoiceLookup, isNull);
  });

  test('current-year line without sequence still opens by number', () {
    final l = _line({'debit': 100000, 'billNum': '8000', 'invoiceRef': '8000', 'clickable': true});
    expect(l.invoiceLookup?.ref, '8000');
    expect(l.invoiceLookup?.by, 'num');
  });

  test('receipts (credit) on non-return lines are not invoice links', () {
    final l = StatementLine.fromJson({'description': 'سند قبض', 'credit': 1250000, 'billNum': '9000', 'hasInvoice': false});
    expect(l.invoiceLookup, isNull);
  });
}

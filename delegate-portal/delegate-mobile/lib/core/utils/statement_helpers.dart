import 'package:flutter/material.dart';

import '../../models/models.dart';

String txTypeLabel(StatementLine line) {
  if (line.isOpening) return 'رصيد مدور';
  if (line.isReconciliation) return 'ترصيد';
  if (line.isReturnInvoice) return 'مردود';
  if (line.debit > 0 && line.hasInvoice) return 'فاتورة';
  if (line.debit > 0) return 'مدين';
  if (line.credit > 0) return 'دائن';
  return 'حركة';
}

Color txTypeColor(StatementLine line) {
  if (line.isOpening) return const Color(0xFF2563EB);
  if (line.isReconciliation) return const Color(0xFF7C3AED);
  if (line.isReturnInvoice) return const Color(0xFFEA580C);
  if (line.debit > 0 && line.hasInvoice) return const Color(0xFF0F766E);
  if (line.debit > 0) return const Color(0xFFDC2626);
  if (line.credit > 0) return const Color(0xFF059669);
  return const Color(0xFF64748B);
}

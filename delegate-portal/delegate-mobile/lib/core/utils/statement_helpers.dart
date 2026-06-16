import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../../models/models.dart';
import 'formatters.dart';

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
  if (line.isOpening) return AppColors.accentTeal;
  if (line.isReconciliation) return AppColors.muted;
  if (line.isReturnInvoice) return const Color(0xFF9A3412);
  if (line.debit > 0 && line.hasInvoice) return const Color(0xFF0F766E);
  if (line.debit > 0) return const Color(0xFF9A3412);
  if (line.credit > 0) return const Color(0xFF0F766E);
  return AppColors.muted;
}

/// عرض الرصيد: 1,234 مدين / 1,234 دائن
String fmtBalanceDisplay(num? bal) {
  if (bal == null || bal.isNaN) return '—';
  if (bal == 0) return '0';
  final abs = fmtNumAlways(bal.abs());
  if (bal < 0) return '$abs مدين';
  return '$abs دائن';
}

/// حركة الرصيد كما في Edari: 4,701,950-
String fmtEdariRunningBalance(num? bal, {bool isOpening = false}) {
  if (isOpening) return '';
  if (bal == null || bal.isNaN || bal == 0) return '0';
  final abs = fmtNumAlways(bal.abs());
  return bal < 0 ? '$abs-' : abs;
}

Color balanceColor(num? v) {
  if (v == null || v == 0) return AppColors.muted;
  return v < 0 ? const Color(0xFF9A3412) : const Color(0xFF0F766E);
}

String fmtAmtCell(num? v) {
  if (v == null || v == 0) return '—';
  return fmtNumAlways(v);
}

String formatStatementPeriod(AccountStatement data) {
  final acc = data.account;
  final start = data.periodStart ?? acc['fixDate'] as String?;
  final end = data.periodEnd;
  final parts = <String>[];

  if (start != null && start.isNotEmpty && end != null && end.isNotEmpty) {
    parts.add('من ${fmtDate(start)} إلى ${fmtDate(end)}');
  } else if (start != null && start.isNotEmpty) {
    parts.add('من ${fmtDate(start)}');
  } else if (end != null && end.isNotEmpty) {
    parts.add('إلى ${fmtDate(end)}');
  }
  parts.add('العملة: دينار عراقي');

  final openingBal = data.openingBalance;
  if (openingBal != 0) {
    final abs = fmtNumAlways(openingBal.abs());
    parts.add('رصيد مدور $abs');
  }

  return parts.join(' · ');
}

bool statementShowsBranchCol(List<StatementLine> lines) {
  return lines.any((l) => (l.branch2 ?? '').trim().isNotEmpty);
}

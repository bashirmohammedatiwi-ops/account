import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/statement_helpers.dart';
import '../../models/models.dart';
import 'accounts_theme.dart';

class EdStatementExportBar extends StatelessWidget {
  const EdStatementExportBar({super.key, required this.onExport, this.loading = false, this.compact = false});

  final VoidCallback? onExport;
  final bool loading;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: loading ? null : onExport,
        borderRadius: BorderRadius.circular(10),
        child: Ink(
          decoration: BoxDecoration(
            color: EdAccountsTheme.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: EdAccountsTheme.accent.withValues(alpha: 0.35)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (loading)
                const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: EdAccountsTheme.accent))
              else
                const Icon(Icons.download_rounded, size: 17, color: EdAccountsTheme.accent),
              const SizedBox(width: 6),
              Text(
                compact ? 'PDF' : 'تصدير الكشف PDF',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: EdAccountsTheme.accent),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EdStatementDebtField extends StatelessWidget {
  const EdStatementDebtField({super.key, required this.amount});

  final num amount;

  @override
  Widget build(BuildContext context) {
    if (amount <= 0) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: EdAccountsTheme.card,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: EdAccountsTheme.cardTint, borderRadius: BorderRadius.circular(10), border: Border.all(color: EdAccountsTheme.line)),
            child: const Icon(Icons.payments_outlined, color: EdAccountsTheme.debt, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('الديون', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                Text(
                  fmtNumAlways(amount),
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EdStatementDocPanel extends StatelessWidget {
  const EdStatementDocPanel({super.key, required this.stmt, this.onExport, this.exporting = false});

  final AccountStatement stmt;
  final VoidCallback? onExport;
  final bool exporting;

  @override
  Widget build(BuildContext context) {
    final acc = stmt.account;
    final period = formatStatementPeriod(stmt);
    final currentBal = stmt.finalBalance;
    final moveCount = stmt.lines.where((l) => !l.isOpening).length;
    final name = _accountName(acc);
    final num = '${acc['num'] ?? ''}'.trim();
    final address = '${acc['address'] ?? ''}'.trim();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: EdAccountsTheme.heroGradient,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: EdAccountsTheme.line),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.08), blurRadius: 18, offset: const Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 4, color: EdAccountsTheme.accent),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: EdAccountsTheme.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: EdAccountsTheme.accent.withValues(alpha: 0.15)),
                      ),
                      child: const Icon(Icons.receipt_long_rounded, color: EdAccountsTheme.accent, size: 21),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('كشف حساب', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
                          const SizedBox(height: 4),
                          Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, height: 1.3, color: AppColors.navy),
                          ),
                          if (num.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              num,
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (onExport != null) EdStatementExportBar(onExport: onExport, loading: exporting, compact: true),
                  ],
                ),
                if (address.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    address,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textSecondary),
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  period,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary, height: 1.4),
                ),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, c) {
                    final narrow = c.maxWidth < 560;
                    final debt = stmt.debtAmount ?? 0;
                    final stats = <Widget>[
                      if (debt > 0)
                        _StmtStatBox(label: 'الديون', value: fmtNumAlways(debt), fg: EdAccountsTheme.debt),
                      _StmtStatBox(label: 'إجمالي مدين', value: fmtNumAlways(stmt.totalDebit), fg: EdAccountsTheme.debit),
                      _StmtStatBox(label: 'إجمالي دائن', value: fmtNumAlways(stmt.totalCredit), fg: EdAccountsTheme.credit),
                      _StmtStatBox(label: 'عدد الحركات', value: '$moveCount', fg: AppColors.navy),
                      _StmtStatBox(label: 'رصيد الحساب', value: fmtBalanceDisplay(currentBal), fg: balanceColor(currentBal)),
                    ];
                    if (narrow) {
                      return Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in stats)
                            SizedBox(width: (c.maxWidth - 8) / 2, child: s),
                        ],
                      );
                    }
                    return Row(
                      children: [
                        for (var i = 0; i < stats.length; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          Expanded(child: stats[i]),
                        ],
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _accountName(Map<String, dynamic> acc) {
    final parts = [acc['name1'], acc['name2']].whereType<String>().where((s) => s.trim().isNotEmpty);
    final name = parts.join(' - ');
    return name.isEmpty ? '—' : name;
  }
}

class _StmtStatBox extends StatelessWidget {
  const _StmtStatBox({required this.label, required this.value, required this.fg});

  final String label;
  final String value;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: EdAccountsTheme.cardTint,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.muted)),
          const SizedBox(height: 4),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: fg),
          ),
        ],
      ),
    );
  }
}

class EdStatementMovesSection extends StatelessWidget {
  const EdStatementMovesSection({
    super.key,
    required this.stmt,
    required this.accSeq,
    this.onInvoicePdf,
  });

  final AccountStatement stmt;
  final String accSeq;
  final Future<void> Function(String ref, String by)? onInvoicePdf;

  @override
  Widget build(BuildContext context) {
    final lines = stmt.lines;
    if (lines.isEmpty) {
      return _EdStatementMovesEmpty();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _EdStatementMovesHeader(stmt: stmt),
        const SizedBox(height: 12),
        EdStatementDataTable(
          stmt: stmt,
          accSeq: accSeq,
          onInvoicePdf: onInvoicePdf,
          onOpenInvoice: (ref, by) => context.push('/invoice/$ref?by=$by&acc=$accSeq'),
        ),
      ],
    );
  }
}

List<Widget> edStatementMoveSlivers(
  BuildContext context, {
  required AccountStatement stmt,
  required String accSeq,
  Future<void> Function(String ref, String by)? onInvoicePdf,
}) {
  void openInvoice(String ref, String by) => context.push('/invoice/$ref?by=$by&acc=$accSeq');

  if (stmt.lines.isEmpty) {
    return [
      SliverPadding(
        padding: EdgeInsets.fromLTRB(edPageHorizontalPadding(context), 18, edPageHorizontalPadding(context), 32),
        sliver: SliverToBoxAdapter(child: _EdStatementMovesEmpty()),
      ),
    ];
  }

  return [
    SliverPadding(
      padding: EdgeInsets.fromLTRB(edPageHorizontalPadding(context), 18, edPageHorizontalPadding(context), 32),
      sliver: SliverToBoxAdapter(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _EdStatementMovesHeader(stmt: stmt),
            const SizedBox(height: 12),
            EdStatementDataTable(
              stmt: stmt,
              accSeq: accSeq,
              onInvoicePdf: onInvoicePdf,
              onOpenInvoice: openInvoice,
            ),
          ],
        ),
      ),
    ),
  ];
}

class _EdStatementMovesEmpty extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 44, horizontal: 20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(color: EdAccountsTheme.accentSoft, borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.receipt_long_outlined, color: EdAccountsTheme.accent, size: 26),
          ),
          const SizedBox(height: 12),
          const Text('لا توجد حركات في كشف الحساب', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _EdStatementMovesHeader extends StatelessWidget {
  const _EdStatementMovesHeader({required this.stmt});

  final AccountStatement stmt;

  @override
  Widget build(BuildContext context) {
    final moveCount = stmt.lines.where((l) => !l.isOpening).length;
    return Row(
      children: [
        const Text('الحركات', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: EdAccountsTheme.accentSoft,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: EdAccountsTheme.line),
          ),
          child: Text('$moveCount حركة', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
        ),
      ],
    );
  }
}

class EdStatementMoveCard extends StatelessWidget {
  const EdStatementMoveCard({
    super.key,
    required this.line,
    required this.accSeq,
    this.onInvoicePdf,
    required this.onOpenInvoice,
  });

  final StatementLine line;
  final String accSeq;
  final Future<void> Function(String ref, String by)? onInvoicePdf;
  final void Function(String ref, String by) onOpenInvoice;

  @override
  Widget build(BuildContext context) {
    final lookup = line.invoiceLookup;
    final showInvoice = line.isInvoiceLine && lookup != null;
    final exportPdf = onInvoicePdf;
    final stripe = line.debit > 0 ? EdAccountsTheme.debit : (line.credit > 0 ? EdAccountsTheme.credit : AppColors.muted);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: showInvoice ? () => onOpenInvoice(lookup.ref, lookup.by) : null,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            color: EdAccountsTheme.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: EdAccountsTheme.line),
            boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Stack(
            children: [
              PositionedDirectional(
                start: 0,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 3,
                  decoration: BoxDecoration(
                    color: stripe.withValues(alpha: 0.7),
                    borderRadius: const BorderRadiusDirectional.horizontal(start: Radius.circular(14)),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(17, 14, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        if (!line.isOpening) _TypeTag(line: line),
                        if (!line.isOpening) const Spacer(),
                        if (!line.isOpening && line.date != null)
                          Text(
                            fmtDate(line.date),
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                        if (line.isOpening)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: EdAccountsTheme.accentSoft, borderRadius: BorderRadius.circular(999)),
                            child: const Text('رصيد مدور', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      line.description.isEmpty ? '—' : line.description,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, height: 1.35, color: AppColors.text),
                    ),
                    if ((line.branch2 ?? '').trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        'الفرع 2: ${line.branch2}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _AmtBox(label: 'مدين', value: line.debit, color: EdAccountsTheme.debit, emptyColor: AppColors.borderStrong)),
                        const SizedBox(width: 8),
                        Expanded(child: _AmtBox(label: 'دائن', value: line.credit, color: EdAccountsTheme.credit, emptyColor: AppColors.borderStrong)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _AmtBox(
                            label: 'حركة الرصيد',
                            valueText: fmtEdariRunningBalance(line.balance, isOpening: line.isOpening),
                            color: balanceColor(line.balance),
                            emptyColor: AppColors.borderStrong,
                          ),
                        ),
                      ],
                    ),
                    if (showInvoice) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _MoveActionBtn(
                              label: line.isReturnInvoice ? 'مردود' : 'فاتورة',
                              filled: true,
                              onTap: () => onOpenInvoice(lookup.ref, lookup.by),
                            ),
                          ),
                          if (exportPdf != null) ...[
                            const SizedBox(width: 8),
                            Expanded(
                              child: _MoveActionBtn(
                                label: 'PDF',
                                filled: false,
                                onTap: () => exportPdf(lookup.ref, lookup.by),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AmtBox extends StatelessWidget {
  const _AmtBox({
    required this.label,
    this.value,
    this.valueText,
    required this.color,
    required this.emptyColor,
  });

  final String label;
  final num? value;
  final String? valueText;
  final Color color;
  final Color emptyColor;

  @override
  Widget build(BuildContext context) {
    final text = valueText ?? (value == null || value == 0 ? '—' : fmtNumAlways(value!));
    final isEmpty = text == '—';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: isEmpty ? EdAccountsTheme.cardTint : EdAccountsTheme.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Column(
        children: [
          Text(label, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.muted)),
          const SizedBox(height: 3),
          Text(
            text,
            textAlign: TextAlign.center,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: isEmpty ? emptyColor : color),
          ),
        ],
      ),
    );
  }
}

class _TypeTag extends StatelessWidget {
  const _TypeTag({required this.line});
  final StatementLine line;

  @override
  Widget build(BuildContext context) {
    final c = txTypeColor(line);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: EdAccountsTheme.accentSoft,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Text(txTypeLabel(line), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: c.withValues(alpha: 0.9))),
    );
  }
}

class _MoveActionBtn extends StatelessWidget {
  const _MoveActionBtn({required this.label, required this.filled, required this.onTap});

  final String label;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? EdAccountsTheme.accentSoft : AppColors.surface,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: filled ? EdAccountsTheme.accent.withValues(alpha: 0.3) : EdAccountsTheme.line),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: filled ? EdAccountsTheme.accent : AppColors.textSecondary),
          ),
        ),
      ),
    );
  }
}

class EdStatementTotalsCard extends StatelessWidget {
  const EdStatementTotalsCard({super.key, required this.stmt});

  final AccountStatement stmt;

  @override
  Widget build(BuildContext context) {
    final summary = stmt.summary;
    final currentBal = stmt.finalBalance;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Column(
        children: [
          _TotalRow(
            label: 'المجموع',
            debit: fmtNumAlways(stmt.totalDebit),
            credit: fmtNumAlways(stmt.totalCredit),
            balance: '',
            highlight: false,
          ),
          Divider(height: 1, color: AppColors.border),
          _TotalRow(
            label: '${summary?['label'] ?? 'الرصيد النهائي'}',
            debit: summary?['side'] == 'debit' ? fmtNumAlways(summary?['amount'] ?? 0) : '',
            credit: summary?['side'] == 'credit' ? fmtNumAlways(summary?['amount'] ?? 0) : '',
            balance: fmtEdariRunningBalance(currentBal),
            runningBalanceColor: balanceColor(currentBal),
            highlight: true,
          ),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({
    required this.label,
    required this.debit,
    required this.credit,
    required this.balance,
    required this.highlight,
    this.runningBalanceColor,
  });

  final String label;
  final String debit;
  final String credit;
  final String balance;
  final bool highlight;
  final Color? runningBalanceColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: highlight ? AppColors.surfaceMuted : AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppColors.navy)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: _AmtBox(label: 'مدين', valueText: debit.isEmpty ? '—' : debit, color: EdAccountsTheme.debit, emptyColor: AppColors.borderStrong)),
              const SizedBox(width: 8),
              Expanded(child: _AmtBox(label: 'دائن', valueText: credit.isEmpty ? '—' : credit, color: EdAccountsTheme.credit, emptyColor: AppColors.borderStrong)),
              const SizedBox(width: 8),
              Expanded(
                child: _AmtBox(
                  label: 'حركة الرصيد',
                  valueText: balance.isEmpty ? '—' : balance,
                  color: runningBalanceColor ?? AppColors.muted,
                  emptyColor: AppColors.borderStrong,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class EdStatementDataTable extends StatelessWidget {
  const EdStatementDataTable({
    super.key,
    required this.stmt,
    required this.accSeq,
    this.onInvoicePdf,
    required this.onOpenInvoice,
  });

  final AccountStatement stmt;
  final String accSeq;
  final Future<void> Function(String ref, String by)? onInvoicePdf;
  final void Function(String ref, String by) onOpenInvoice;

  static const _hdr = EdAccountsTheme.tableHead;

  @override
  Widget build(BuildContext context) {
    final lines = stmt.lines;
    final showBranch = statementShowsBranchCol(lines);
    final summary = stmt.summary;
    final currentBal = stmt.finalBalance;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.borderStrong),
        borderRadius: BorderRadius.circular(14),
        color: AppColors.surface,
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: EdFullWidthTable(
          minWidth: 680,
          builder: (_) => Table(
            border: TableBorder.all(color: AppColors.border, width: 1),
            defaultVerticalAlignment: TableCellVerticalAlignment.middle,
            columnWidths: _columnWidths(showBranch),
            children: [
                TableRow(
                  decoration: const BoxDecoration(color: _hdr),
                  children: [
                    _th('مدين'),
                    _th('دائن'),
                    _th('البيان'),
                    if (showBranch) _th('الفرع 2'),
                    _th('التاريخ'),
                    _th('حركة الرصيد'),
                    _th('إجراءات'),
                  ],
                ),
                ...lines.asMap().entries.map((e) => _dataRow(e.key, e.value, showBranch)),
                _footerRow(
                  showBranch: showBranch,
                  debit: fmtNumAlways(stmt.totalDebit),
                  credit: fmtNumAlways(stmt.totalCredit),
                  label: 'المجموع',
                  balance: '',
                  highlight: false,
                ),
                _footerRow(
                  showBranch: showBranch,
                  debit: summary?['side'] == 'debit' ? fmtNumAlways(summary?['amount'] ?? 0) : '',
                  credit: summary?['side'] == 'credit' ? fmtNumAlways(summary?['amount'] ?? 0) : '',
                  label: '${summary?['label'] ?? 'الرصيد النهائي'}',
                  balance: fmtEdariRunningBalance(currentBal),
                  highlight: true,
                ),
              ],
            ),
          ),
        ),
    );
  }

  Map<int, TableColumnWidth> _columnWidths(bool showBranch) {
    return {
      0: const FixedColumnWidth(68),
      1: const FixedColumnWidth(68),
      2: const FlexColumnWidth(4),
      if (showBranch) 3: const FixedColumnWidth(72),
      (showBranch ? 4 : 3): const FixedColumnWidth(76),
      (showBranch ? 5 : 4): const FixedColumnWidth(88),
      (showBranch ? 6 : 5): const FixedColumnWidth(104),
    };
  }

  TableRow _dataRow(int index, StatementLine line, bool showBranch) {
    Color? bg;
    if (line.isOpening || line.isReconciliation) {
      bg = AppColors.surfaceMuted;
    } else if (index.isEven) {
      bg = AppColors.surface;
    }

    final lookup = line.invoiceLookup;
    final showInvoice = line.isInvoiceLine && lookup != null;

    return TableRow(
      decoration: bg != null ? BoxDecoration(color: bg) : null,
      children: [
        _amtCell(line.debit, EdAccountsTheme.debit),
        _amtCell(line.credit, EdAccountsTheme.credit),
        _descCell(line),
        if (showBranch) _textCell(line.branch2 ?? '', align: TextAlign.center, size: 11),
        _textCell(line.isOpening ? '' : fmtDate(line.date), align: TextAlign.center, size: 11),
        _textCell(fmtEdariRunningBalance(line.balance, isOpening: line.isOpening), align: TextAlign.center, color: balanceColor(line.balance), bold: true),
        _actionsCell(line, lookup, showInvoice),
      ],
    );
  }

  TableRow _footerRow({
    required bool showBranch,
    required String debit,
    required String credit,
    required String label,
    required String balance,
    required bool highlight,
  }) {
    return TableRow(
      decoration: BoxDecoration(color: highlight ? AppColors.surfaceMuted : AppColors.surface),
      children: [
        _textCell(debit, align: TextAlign.center, color: debit.isNotEmpty ? EdAccountsTheme.debit : AppColors.borderStrong, bold: true, emptyAsDash: false),
        _textCell(credit, align: TextAlign.center, color: credit.isNotEmpty ? EdAccountsTheme.credit : AppColors.borderStrong, bold: true, emptyAsDash: false),
        _textCell(label, align: TextAlign.right, bold: true, emptyAsDash: false),
        if (showBranch) _textCell('', align: TextAlign.center, emptyAsDash: false),
        _textCell('', align: TextAlign.center, emptyAsDash: false),
        _textCell(balance, align: TextAlign.center, bold: true, emptyAsDash: false),
        _textCell('', align: TextAlign.center, emptyAsDash: false),
      ],
    );
  }

  Widget _th(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 9),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: EdAccountsTheme.tableHeadText, fontSize: 11, fontWeight: FontWeight.w700)),
    );
  }

  Widget _amtCell(num v, Color color) {
    final empty = v == 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        empty ? '—' : fmtNumAlways(v),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: empty ? AppColors.borderStrong : color),
      ),
    );
  }

  Widget _descCell(StatementLine line) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!line.isOpening)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: _TypeTag(line: line),
            ),
          Text(line.description.isEmpty ? '—' : line.description, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, height: 1.35)),
        ],
      ),
    );
  }

  Widget _textCell(String text, {TextAlign align = TextAlign.right, Color? color, double size = 11, bool bold = false, bool emptyAsDash = true}) {
    final display = text.isEmpty ? (emptyAsDash ? '—' : '') : text;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        display,
        textAlign: align,
        textDirection: display.isNotEmpty && (display.contains('-') || RegExp(r'^\d').hasMatch(display)) ? TextDirection.ltr : TextDirection.rtl,
        style: TextStyle(fontSize: size, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: color ?? AppColors.text),
      ),
    );
  }

  Widget _actionsCell(StatementLine line, InvoiceLookup? lookup, bool showInvoice) {
    if (!showInvoice || lookup == null) {
      return const Padding(
        padding: EdgeInsets.all(6),
        child: Text('—', textAlign: TextAlign.center, style: TextStyle(color: AppColors.borderStrong, fontWeight: FontWeight.w600)),
      );
    }

    final invLabel = line.isReturnInvoice ? 'مردود' : 'فاتورة';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Flexible(child: _TblBtn(label: invLabel, filled: true, onTap: () => onOpenInvoice(lookup.ref, lookup.by))),
          if (onInvoicePdf != null) ...[
            const SizedBox(width: 4),
            Flexible(child: _TblBtn(label: 'PDF', filled: false, onTap: () => onInvoicePdf!(lookup.ref, lookup.by))),
          ],
        ],
      ),
    );
  }
}

class _TblBtn extends StatelessWidget {
  const _TblBtn({required this.label, required this.filled, required this.onTap});

  final String label;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? EdAccountsTheme.accentSoft : AppColors.surface,
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: filled ? EdAccountsTheme.accent.withValues(alpha: 0.3) : EdAccountsTheme.line),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: filled ? EdAccountsTheme.accent : AppColors.textSecondary),
          ),
        ),
      ),
    );
  }
}

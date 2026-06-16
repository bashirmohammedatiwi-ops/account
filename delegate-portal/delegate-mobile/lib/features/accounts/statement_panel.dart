import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/utils/statement_helpers.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import 'accounts_screens.dart';

class StatementPanel extends ConsumerWidget {
  const StatementPanel({super.key, required this.accSeq, this.treeSeq, this.compact = false});

  final String accSeq;
  final String? treeSeq;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stmtAsync = ref.watch(statementProvider(accSeq));
    final api = ref.read(apiClientProvider);

    return stmtAsync.when(
      loading: () => const LoadingView(message: 'جاري تحميل الكشف...'),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(statementProvider(accSeq))),
      data: (stmt) => RefreshIndicator(
        color: AppColors.navy,
        onRefresh: () async => ref.invalidate(statementProvider(accSeq)),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(compact ? 10 : 16, compact ? 10 : 16, compact ? 10 : 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (!compact)
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${stmt.account['name1'] ?? ''}',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: () async {
                              try {
                                final bytes = await api.getStatementPdf(accSeq);
                                await saveAndOpenPdf(bytes, 'statement-$accSeq.pdf');
                              } catch (e) {
                                if (context.mounted) {
                                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                }
                              }
                            },
                            icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                            label: const Text('PDF'),
                          ),
                        ],
                      ),
                    if (stmt.debtAmount != null && stmt.debtAmount! > 0) ...[
                      if (!compact) const SizedBox(height: 12),
                      EdDebtBanner(amount: fmtNumAlways(stmt.debtAmount)),
                      const SizedBox(height: 12),
                    ],
                    EdDocPanel(
                      title: 'ملخص الكشف — ${stmt.account['num'] ?? accSeq}',
                      rows: [
                        (label: 'إجمالي مدين', value: fmtNumAlways(stmt.totalDebit)),
                        (label: 'إجمالي دائن', value: fmtNumAlways(stmt.totalCredit)),
                        (label: stmt.summary?['label']?.toString() ?? 'الرصيد', value: fmtNumAlways(stmt.summary?['amount'] ?? stmt.finalBalance)),
                      ],
                    ),
                    const SizedBox(height: 16),
                    const Text('الحركات', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(compact ? 10 : 16, 0, compact ? 10 : 16, 16),
              sliver: SliverList.separated(
                itemCount: stmt.lines.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _StatementLineTile(line: stmt.lines[i], accSeq: accSeq),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatementLineTile extends ConsumerWidget {
  const _StatementLineTile({required this.line, required this.accSeq});
  final StatementLine line;
  final String accSeq;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.read(apiClientProvider);
    final lookup = line.invoiceLookup;
    final typeColor = txTypeColor(line);

    return Container(
      decoration: BoxDecoration(
        color: line.isOpening ? AppColors.accentSoft : AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: typeColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(txTypeLabel(line), style: TextStyle(color: typeColor, fontWeight: FontWeight.w800, fontSize: 11)),
                ),
                const Spacer(),
                if (line.date != null)
                  Text(line.date!, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 8),
            Text(line.description, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 10),
            Row(
              children: [
                _amountCell('مدين', line.debit, AppColors.danger),
                _amountCell('دائن', line.credit, AppColors.success),
                _amountCell('رصيد', line.balance, AppColors.accent),
              ],
            ),
            if (lookup != null) ...[
              const SizedBox(height: 10),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () => context.push('/invoice/${lookup.ref}?by=${lookup.by}&acc=$accSeq'),
                    icon: const Icon(Icons.receipt_long_outlined, size: 16),
                    label: const Text('فاتورة'),
                  ),
                  TextButton.icon(
                    onPressed: () async {
                      try {
                        final bytes = await api.getInvoicePdf(lookup.ref, by: lookup.by, accSeq: accSeq);
                        await saveAndOpenPdf(bytes, 'invoice-${lookup.ref}.pdf');
                      } catch (e) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                        }
                      }
                    },
                    icon: const Icon(Icons.picture_as_pdf_outlined, size: 16),
                    label: const Text('PDF'),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _amountCell(String label, num? value, Color color) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 10, color: AppColors.muted, fontWeight: FontWeight.w700)),
          Text(
            value != null && value != 0 ? fmtNumAlways(value) : '—',
            textDirection: TextDirection.ltr,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: color),
          ),
        ],
      ),
    );
  }
}

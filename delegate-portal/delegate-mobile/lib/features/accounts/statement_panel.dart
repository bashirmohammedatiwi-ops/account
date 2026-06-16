import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/utils/statement_helpers.dart';
import '../../core/widgets/adaptive_shell.dart';
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
    final api = ref.watch(apiClientProvider);

    return stmtAsync.when(
      loading: () => const LoadingView(),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(statementProvider(accSeq))),
      data: (stmt) => RefreshIndicator(
        onRefresh: () async => ref.invalidate(statementProvider(accSeq)),
        child: ListView(
          padding: EdgeInsets.all(compact ? 8 : 16),
          children: [
            if (!compact)
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${stmt.account['name1'] ?? ''} / ${stmt.account['num'] ?? accSeq}',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  IconButton(
                    tooltip: 'PDF كامل',
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
                    icon: const Icon(Icons.picture_as_pdf_outlined),
                  ),
                ],
              ),
            if (stmt.debtAmount != null && stmt.debtAmount! > 0)
              Card(
                color: const Color(0xFFFFF7ED),
                child: ListTile(
                  leading: const Icon(Icons.warning_amber_rounded, color: Color(0xFFEA580C)),
                  title: const Text('الديون'),
                  trailing: Text(
                    fmtNumAlways(stmt.debtAmount),
                    style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFEA580C)),
                  ),
                ),
              ),
            Row(
              children: [
                Expanded(child: StatCard(label: 'مدين', value: fmtNumAlways(stmt.totalDebit))),
                const SizedBox(width: 8),
                Expanded(child: StatCard(label: 'دائن', value: fmtNumAlways(stmt.totalCredit))),
                const SizedBox(width: 8),
                Expanded(
                  child: StatCard(
                    label: stmt.summary?['label']?.toString() ?? 'الرصيد',
                    value: fmtNumAlways(stmt.summary?['amount'] ?? stmt.finalBalance),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...stmt.lines.map((line) => _StatementLineTile(line: line, accSeq: accSeq)),
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
    final api = ref.watch(apiClientProvider);
    final lookup = line.invoiceLookup;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: line.isOpening ? const Color(0xFFEFF6FF) : null,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: txTypeColor(line).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(txTypeLabel(line), style: TextStyle(color: txTypeColor(line), fontWeight: FontWeight.w700, fontSize: 12)),
                ),
                const Spacer(),
                Text(fmtDate(line.date), style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            const SizedBox(height: 8),
            Text(line.description, style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Row(
              children: [
                if (line.debit > 0)
                  Text('مدين ${fmtNum(line.debit)}', style: const TextStyle(color: Color(0xFFDC2626), fontWeight: FontWeight.w700)),
                if (line.credit > 0) ...[
                  if (line.debit > 0) const SizedBox(width: 12),
                  Text('دائن ${fmtNum(line.credit)}', style: const TextStyle(color: Color(0xFF059669), fontWeight: FontWeight.w700)),
                ],
                const Spacer(),
                if (line.balance != null)
                  Text('${fmtNum(line.balance)}', style: Theme.of(context).textTheme.labelLarge),
              ],
            ),
            if (line.isInvoiceLine && lookup != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: () => context.push('/invoice/${lookup.ref}?by=${lookup.by}&acc=$accSeq'),
                    icon: const Icon(Icons.receipt_outlined, size: 18),
                    label: const Text('تفاصيل'),
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
                    icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
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
}

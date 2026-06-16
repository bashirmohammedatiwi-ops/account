import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/layout/ed_table_wrap.dart';
import 'accounts_screens.dart';
import 'accounts_theme.dart';
import 'statement_ui.dart';

class StatementPanel extends ConsumerStatefulWidget {
  const StatementPanel({
    super.key,
    required this.accSeq,
    this.treeSeq,
    this.treeName,
    this.treeNum,
  });

  final String accSeq;
  final String? treeSeq;
  final String? treeName;
  final String? treeNum;

  @override
  ConsumerState<StatementPanel> createState() => _StatementPanelState();
}

class _StatementPanelState extends ConsumerState<StatementPanel> {
  bool _exporting = false;

  Future<void> _exportStatementPdf() async {
    setState(() => _exporting = true);
    try {
      final bytes = await ref.read(apiClientProvider).getStatementPdf(widget.accSeq);
      final num = widget.treeNum ?? widget.accSeq;
      await saveAndOpenPdf(bytes, 'statement-$num.pdf');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _exportInvoicePdf(String invoiceRef, String by) async {
    try {
      final bytes = await ref.read(apiClientProvider).getInvoicePdf(invoiceRef, by: by, accSeq: widget.accSeq);
      await saveAndOpenPdf(bytes, 'invoice-$invoiceRef.pdf');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final stmtAsync = ref.watch(statementProvider(widget.accSeq));

    return ColoredBox(
      color: EdAccountsTheme.pageBg,
      child: stmtAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الكشف...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(statementProvider(widget.accSeq))),
          data: (stmt) => RefreshIndicator(
          color: AppColors.navy,
          onRefresh: () async => ref.invalidate(statementProvider(widget.accSeq)),
          child: Builder(
            builder: (context) {
              final pad = edPageHorizontalPadding(context);
              return CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: EdgeInsets.fromLTRB(pad, 12, pad, 0),
                    sliver: SliverToBoxAdapter(
                      child: EdStatementDocPanel(stmt: stmt, onExport: _exportStatementPdf, exporting: _exporting),
                    ),
                  ),
                  ...edStatementMoveSlivers(
                    context,
                    stmt: stmt,
                    accSeq: widget.accSeq,
                    onInvoicePdf: _exportInvoicePdf,
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

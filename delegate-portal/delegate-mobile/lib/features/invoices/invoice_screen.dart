import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import 'invoice_ui.dart';

final invoiceProvider = FutureProvider.family<InvoiceDetail, ({String ref, String by, String? accSeq})>((ref, p) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getInvoice(p.ref, by: p.by, accSeq: p.accSeq));
});

class InvoiceScreen extends ConsumerStatefulWidget {
  const InvoiceScreen({super.key, required this.ref, required this.by, this.accSeq});
  final String ref;
  final String by;
  final String? accSeq;

  @override
  ConsumerState<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends ConsumerState<InvoiceScreen> {
  bool _exporting = false;

  Future<void> _exportPdf() async {
    setState(() => _exporting = true);
    try {
      final bytes = await ref.read(apiClientProvider).getInvoicePdf(widget.ref, by: widget.by, accSeq: widget.accSeq);
      await saveAndOpenPdf(bytes, 'invoice-${widget.ref}.pdf');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final params = (ref: widget.ref, by: widget.by, accSeq: widget.accSeq);
    final invoiceAsync = ref.watch(invoiceProvider(params));

    return AppPage(
      title: 'تفاصيل الفاتورة',
      kicker: 'Edari · الفاتورة',
      showBack: true,
      subtitle: invoiceAsync.maybeWhen(
        data: (d) => 'فاتورة ${d.invoice['num'] ?? widget.ref}',
        orElse: () => widget.ref,
      ),
      child: ColoredBox(
        color: InvTheme.pageBg,
        child: invoiceAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الفاتورة...'),
          error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(invoiceProvider(params))),
          data: (detail) {
            final num = detail.invoice['num'] ?? widget.ref;
            return RefreshIndicator(
              color: AppColors.navy,
              onRefresh: () async => ref.invalidate(invoiceProvider(params)),
              child: CustomScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                    sliver: SliverList(
                      delegate: SliverChildListDelegate([
                        EdInvoiceExportBar(
                          label: 'تصدير فاتورة $num PDF',
                          onExport: _exportPdf,
                          loading: _exporting,
                        ),
                        const SizedBox(height: 12),
                        EdInvoiceDocPanel(detail: detail),
                      ]),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    sliver: SliverToBoxAdapter(child: EdInvoiceLinesSection(detail: detail)),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

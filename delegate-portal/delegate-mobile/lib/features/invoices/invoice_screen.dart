import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';

final invoiceProvider = FutureProvider.family<InvoiceDetail, ({String ref, String by, String? accSeq})>((ref, p) {
  return withAuth(ref, () => ref.read(apiClientProvider).getInvoice(p.ref, by: p.by, accSeq: p.accSeq));
});

class InvoiceScreen extends ConsumerWidget {
  const InvoiceScreen({super.key, required this.ref, required this.by, this.accSeq});
  final String ref;
  final String by;
  final String? accSeq;

  @override
  Widget build(BuildContext context, WidgetRef refWatch) {
    final params = (ref: ref, by: by, accSeq: accSeq);
    final invoiceAsync = refWatch.watch(invoiceProvider(params));
    final api = refWatch.watch(apiClientProvider);

    return AppPage(
      title: 'تفاصيل الفاتورة',
      kicker: 'الفواتير',
      showBack: true,
      subtitle: invoiceAsync.maybeWhen(
        data: (d) => '${d.invoice['num'] ?? ref}',
        orElse: () => ref,
      ),
      actions: [
        EdHeaderIconButton(
          icon: Icons.picture_as_pdf_outlined,
          tooltip: 'PDF',
          onPressed: () {
            if (!invoiceAsync.hasValue) return;
            () async {
              try {
                final bytes = await api.getInvoicePdf(ref, by: by, accSeq: accSeq);
                await saveAndOpenPdf(bytes, 'invoice-$ref.pdf');
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                }
              }
            }();
          },
        ),
      ],
      child: invoiceAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الفاتورة...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => refWatch.invalidate(invoiceProvider(params))),
        data: (detail) {
          final inv = detail.invoice;
          final customerName = detail.customer != null ? '${detail.customer!['name1'] ?? detail.customer!['name'] ?? ''}' : '—';

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              EdDocPanel(
                title: 'فاتورة ${inv['num'] ?? ''}',
                rows: [
                  (label: 'التاريخ', value: fmtDate(inv['date']?.toString())),
                  (label: 'الزبون', value: customerName),
                  (label: 'المبلغ', value: fmtMoney(inv['amount'] ?? inv['total'])),
                ],
              ),
              const SizedBox(height: 16),
              const EdSectionHeader(title: 'البنود'),
              ...detail.lines.map((line) => EdLineRow(
                    title: '${line['matName'] ?? line['name'] ?? ''}',
                    subtitle: '${fmtQty(line['quant'] ?? line['qty'])} + هدية ${fmtQty(line['bonus'] ?? 0)} · ${fmtMoney(line['price'] ?? line['unitPrice'])}',
                    amount: fmtMoney(line['lineTotal'] ?? line['amount']),
                  )),
            ],
          );
        },
      ),
    );
  }
}

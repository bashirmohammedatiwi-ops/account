import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/pdf_utils.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';

final invoiceProvider = FutureProvider.family<InvoiceDetail, ({String ref, String by, String? accSeq})>((ref, p) {
  return ref.watch(apiClientProvider).getInvoice(p.ref, by: p.by, accSeq: p.accSeq);
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
      showBack: true,
      subtitle: invoiceAsync.maybeWhen(
        data: (d) => '${d.invoice['num'] ?? ref}',
        orElse: () => ref,
      ),
      actions: [
        IconButton(
          tooltip: 'PDF',
          onPressed: invoiceAsync.hasValue
              ? () async {
                  try {
                    final bytes = await api.getInvoicePdf(ref, by: by, accSeq: accSeq);
                    await saveAndOpenPdf(bytes, 'invoice-$ref.pdf');
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                    }
                  }
                }
              : null,
          icon: const Icon(Icons.picture_as_pdf_outlined),
        ),
      ],
      child: invoiceAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: '$e', onRetry: () => refWatch.invalidate(invoiceProvider(params))),
        data: (detail) {
          final inv = detail.invoice;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('فاتورة ${inv['num'] ?? ''}', style: Theme.of(context).textTheme.titleLarge),
                      Text('التاريخ: ${fmtDate(inv['date']?.toString())}'),
                      if (detail.customer != null)
                        Text('الزبون: ${detail.customer!['name1'] ?? detail.customer!['name'] ?? ''}'),
                      Text('المبلغ: ${fmtMoney(inv['amount'] ?? inv['total'])}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columns: const [
                      DataColumn(label: Text('المادة')),
                      DataColumn(label: Text('الكمية')),
                      DataColumn(label: Text('هدية')),
                      DataColumn(label: Text('السعر')),
                      DataColumn(label: Text('المجموع')),
                    ],
                    rows: detail.lines.map((line) {
                      return DataRow(cells: [
                        DataCell(Text('${line['matName'] ?? line['name'] ?? ''}')),
                        DataCell(Text(fmtQty(line['quant'] ?? line['qty']))),
                        DataCell(Text(fmtQty(line['bonus'] ?? 0))),
                        DataCell(Text(fmtMoney(line['price'] ?? line['unitPrice']))),
                        DataCell(Text(fmtMoney(line['lineTotal'] ?? line['amount']))),
                      ]);
                    }).toList(),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

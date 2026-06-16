import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String? _treeSeq;
  late DateTime _from;
  late DateTime _to;
  SalesReportResult? _result;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = DateTime(now.year, now.month, 1);
    _to = now;
  }

  Future<void> _run({bool loadMore = false}) async {
    if (_treeSeq == null) {
      setState(() => _error = 'اختر شجرة الحساب');
      return;
    }
    setState(() {
      _loading = true;
      if (!loadMore) _error = null;
    });
    try {
      final offset = loadMore && _result != null ? _result!.offset + _result!.invoices.length : 0;
      final data = await ref.read(apiClientProvider).getSalesReport(
            treeSeq: _treeSeq!,
            dateFrom: '${_from.year}-${_from.month.toString().padLeft(2, '0')}-${_from.day.toString().padLeft(2, '0')}',
            dateTo: '${_to.year}-${_to.month.toString().padLeft(2, '0')}-${_to.day.toString().padLeft(2, '0')}',
            offset: offset,
          );
      setState(() {
        if (loadMore && _result != null) {
          _result = SalesReportResult(
            summary: data.summary,
            invoices: [..._result!.invoices, ...data.invoices],
            total: data.total,
            offset: data.offset,
            limit: data.limit,
          );
        } else {
          _result = data;
        }
      });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _loading = false);
    }
  }

  void _presetMonth(int offset) {
    final now = DateTime.now();
    final d = DateTime(now.year, now.month + offset, 1);
    setState(() {
      _from = d;
      _to = DateTime(d.year, d.month + 1, 0);
    });
  }

  @override
  Widget build(BuildContext context) {
    final treesAsync = ref.watch(treesProvider);

    return AppPage(
      title: 'تقارير المبيعات',
      subtitle: 'ملخص وقائمة الفواتير',
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    treesAsync.when(
                      loading: () => const LinearProgressIndicator(),
                      error: (e, _) => Text('$e'),
                      data: (trees) => DropdownButtonFormField<String>(
                        value: _treeSeq,
                        decoration: const InputDecoration(labelText: 'شجرة الحساب'),
                        items: trees.map((t) => DropdownMenuItem(value: t.seq, child: Text('${t.name1} (${t.accountNum})'))).toList(),
                        onChanged: (v) => setState(() => _treeSeq = v),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _DateField(label: 'من', value: _from, onPick: (d) => setState(() => _from = d))),
                        const SizedBox(width: 12),
                        Expanded(child: _DateField(label: 'إلى', value: _to, onPick: (d) => setState(() => _to = d))),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      children: [
                        ActionChip(label: const Text('هذا الشهر'), onPressed: () { _presetMonth(0); }),
                        ActionChip(label: const Text('الشهر الماضي'), onPressed: () { _presetMonth(-1); }),
                        ActionChip(label: const Text('هذه السنة'), onPressed: () {
                          final y = DateTime.now().year;
                          setState(() {
                            _from = DateTime(y, 1, 1);
                            _to = DateTime(y, 12, 31);
                          });
                        }),
                      ],
                    ),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _loading ? null : () => _run(), child: const Text('عرض التقرير')),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                  ],
                ),
              ),
            ),
          ),
          if (_loading && _result == null) const Expanded(child: LoadingView()),
          if (_result != null)
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  Row(
                    children: [
                      Expanded(child: StatCard(label: 'مبيعات', value: fmtMoney(_result!.summary.salesAmount))),
                      const SizedBox(width: 8),
                      Expanded(child: StatCard(label: 'مردود', value: fmtMoney(_result!.summary.returnsAmount))),
                      const SizedBox(width: 8),
                      Expanded(child: StatCard(label: 'صافي', value: fmtMoney(_result!.summary.netAmount))),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ..._result!.invoices.map((inv) => Card(
                        child: ListTile(
                          title: Text('${inv.isReturn ? 'مردود' : 'فاتورة'} ${inv.invoiceNum}'),
                          subtitle: Text('${inv.customerName ?? ''} · ${fmtDate(inv.date)}'),
                          trailing: Text(fmtMoney(inv.amount), style: const TextStyle(fontWeight: FontWeight.w700)),
                          onTap: () => context.push('/invoice/${inv.ref}?by=auto${inv.accSeq != null ? '&acc=${inv.accSeq}' : ''}'),
                        ),
                      )),
                  if (_result!.invoices.length < _result!.total)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: OutlinedButton(
                        onPressed: _loading ? null : () => _run(loadMore: true),
                        child: _loading ? const CircularProgressIndicator() : const Text('تحميل المزيد'),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onPick});
  final String label;
  final DateTime value;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () async {
        final d = await showDatePicker(context: context, initialDate: value, firstDate: DateTime(2010), lastDate: DateTime(2100));
        if (d != null) onPick(d);
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text('${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}'),
      ),
    );
  }
}

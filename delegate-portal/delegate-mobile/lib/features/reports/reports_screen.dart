import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
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

  Widget _filtersPanel() {
    final treesAsync = ref.watch(treesProvider);

    return EdPanelCard(
      title: 'معايير التقرير',
      subtitle: 'اختر الشجرة والفترة',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          treesAsync.when(
            loading: () => const LinearProgressIndicator(color: AppColors.navy),
            error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.danger)),
            data: (trees) => DropdownButtonFormField<String>(
              initialValue: _treeSeq,
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
            runSpacing: 8,
            children: [
              ActionChip(label: const Text('هذا الشهر'), onPressed: () => _presetMonth(0), backgroundColor: AppColors.surfaceMuted, side: const BorderSide(color: AppColors.border)),
              ActionChip(label: const Text('الشهر الماضي'), onPressed: () => _presetMonth(-1), backgroundColor: AppColors.surfaceMuted, side: const BorderSide(color: AppColors.border)),
              ActionChip(
                label: const Text('هذه السنة'),
                onPressed: () {
                  final y = DateTime.now().year;
                  setState(() {
                    _from = DateTime(y, 1, 1);
                    _to = DateTime(y, 12, 31);
                  });
                },
                backgroundColor: AppColors.surfaceMuted,
                side: const BorderSide(color: AppColors.border),
              ),
            ],
          ),
          const SizedBox(height: 14),
          EdPrimaryButton(label: 'عرض التقرير', loading: _loading && _result == null, onPressed: _loading ? null : () => _run()),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }

  Widget _resultsPanel() {
    if (_loading && _result == null) return const LoadingView(message: 'جاري تحميل التقرير...');
    if (_result == null) {
      return const EmptyState(message: 'حدّد المعايير واضغط «عرض التقرير»', icon: Icons.bar_chart_rounded);
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      children: [
        EdStatsBar(
          items: [
            (label: 'مبيعات', value: fmtMoney(_result!.summary.salesAmount), color: AppColors.success),
            (label: 'مردود', value: fmtMoney(_result!.summary.returnsAmount), color: AppColors.danger),
            (label: 'صافي', value: fmtMoney(_result!.summary.netAmount), color: AppColors.navy),
          ],
        ),
        const SizedBox(height: 16),
        const EdSectionHeader(title: 'الفواتير', subtitle: 'اضغط لعرض التفاصيل'),
        ..._result!.invoices.map((inv) {
          final accent = inv.isReturn ? AppColors.danger : AppColors.moduleReports;
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: EdNavCard(
              icon: inv.isReturn ? Icons.undo_rounded : Icons.receipt_long_rounded,
              title: '${inv.isReturn ? 'مردود' : 'فاتورة'} ${inv.invoiceNum}',
              subtitle: '${inv.customerName ?? ''} · ${fmtDate(inv.date)}',
              accent: accent,
              trailing: fmtMoney(inv.amount),
              onTap: () => context.push('/invoice/${inv.ref}?by=auto${inv.accSeq != null ? '&acc=${inv.accSeq}' : ''}'),
            ),
          );
        }),
        if (_result!.invoices.length < _result!.total)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: OutlinedButton(
              onPressed: _loading ? null : () => _run(loadMore: true),
              child: _loading ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('تحميل المزيد'),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'تقارير المبيعات',
      kicker: 'التقارير',
      subtitle: 'ملخص وقائمة الفواتير',
      showBack: true,
      onBack: () => context.go('/home'),
      child: Column(
        children: [
          Padding(padding: const EdgeInsets.all(16), child: _filtersPanel()),
          Expanded(child: _resultsPanel()),
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
      borderRadius: BorderRadius.circular(AppColors.radiusSm),
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text('${value.day.toString().padLeft(2, '0')}/${value.month.toString().padLeft(2, '0')}/${value.year}'),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/api_client.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../core/widgets/ed_form.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';

import '../home/home_screen.dart';

class ReceiptsScreen extends ConsumerStatefulWidget {
  const ReceiptsScreen({super.key});

  @override
  ConsumerState<ReceiptsScreen> createState() => _ReceiptsScreenState();
}

class _ReceiptsScreenState extends ConsumerState<ReceiptsScreen> {
  PickedCustomer? _picked;
  final _amountCtrl = TextEditingController();
  final _commissionCtrl = TextEditingController();
  final _discountCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _commissionCtrl.dispose();
    _discountCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickCustomer() async {
    final picked = await showCustomerPicker(context, ref);
    if (picked != null) setState(() => _picked = picked);
  }

  Future<void> _submit() async {
    if (_picked == null) {
      _snack('اختر شجرة ثم زبوناً');
      return;
    }
    final amount = num.tryParse(_amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      _snack('أدخل مبلغ سند القبض');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createReceipt(
            customerAccSeq: _picked!.customer.seq,
            treeAccSeq: _picked!.tree.seq,
            treeName: _picked!.tree.name1,
            amount: amount,
            commission: num.tryParse(_commissionCtrl.text.trim()) ?? 0,
            discount: num.tryParse(_discountCtrl.text.trim()) ?? 0,
            notes: _notesCtrl.text.trim(),
          );
      ref.invalidate(receiptsListProvider);
      if (!mounted) return;
      _amountCtrl.clear();
      _commissionCtrl.clear();
      _discountCtrl.clear();
      _notesCtrl.clear();
      setState(() => _picked = null);
      _snack('أُرسل السند للوحة التحكم للمراجعة', success: true);
    } catch (e) {
      _snack(e is ApiException ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _delete(int id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف السند'),
        content: const Text('هل تريد حذف سند القبض؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiClientProvider).deleteReceipt(id);
      ref.invalidate(receiptsListProvider);
    } catch (e) {
      _snack('$e');
    }
  }

  void _snack(String msg, {bool success = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: success ? AppColors.success : null,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final receiptsAsync = ref.watch(receiptsListProvider);
    final layout = EdLayout.of(context);
    final isWide = layout.isTablet;

    return AppPage(
      title: 'سند قبض',
      kicker: 'تحصيل',
      subtitle: 'يُراجع ثم يُرحَّل للإداري',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: AppColors.bg,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(receiptsListProvider),
          child: isWide
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: layout.isDesktop ? 420 : 380, child: _formCard()),
                    const SizedBox(width: 16),
                    Expanded(child: _listSection(receiptsAsync)),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, kPhoneBottomInset),
                  children: [
                    _formCard(),
                    const SizedBox(height: EdSpacing.xxl),
                    _listSection(receiptsAsync),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _formCard() {
    final c = _picked?.customer;
    return EdFormCard(
      title: 'سند قبض جديد',
      subtitle: 'يُراجع ثم يُرحَّل للإداري',
      icon: Icons.receipt_long_rounded,
      iconColor: AppColors.moduleReceipts,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          EdPickerField(
            label: 'الزبون',
            value: c != null ? c.name1 : null,
            subtitle: c != null ? c.accountNum : null,
            placeholder: 'اختر شجرة ثم زبوناً',
            icon: Icons.person_outline_rounded,
            accentColor: AppColors.moduleReceipts,
            onTap: _pickCustomer,
          ),
          const SizedBox(height: EdSpacing.lg),
          EdLabeledField(
            label: 'المبلغ',
            controller: _amountCtrl,
            hint: '0',
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            prefixIcon: Icons.payments_outlined,
          ),
          const SizedBox(height: EdSpacing.md),
          Row(
            children: [
              Expanded(
                child: EdLabeledField(
                  label: 'العمولة',
                  controller: _commissionCtrl,
                  hint: '0',
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
              const SizedBox(width: EdSpacing.md),
              Expanded(
                child: EdLabeledField(
                  label: 'الحسم',
                  controller: _discountCtrl,
                  hint: '0',
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                ),
              ),
            ],
          ),
          const SizedBox(height: EdSpacing.md),
          EdLabeledField(
            label: 'ملاحظات',
            controller: _notesCtrl,
            hint: 'البيان — يظهر في سند القيد',
            maxLines: 2,
            prefixIcon: Icons.notes_outlined,
          ),
          const SizedBox(height: EdSpacing.xl),
          EdSubmitButton(
            label: _submitting ? 'جاري الإرسال...' : 'إرسال للوحة التحكم',
            onPressed: _submitting ? null : _submit,
            loading: _submitting,
          ),
        ],
      ),
    );
  }

  Widget _listSection(AsyncValue<List<Receipt>> receiptsAsync) {
    return receiptsAsync.when(
      loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(receiptsListProvider)),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(padding: EdgeInsets.all(24), child: EmptyState(message: 'لا توجد سندات بعد', icon: Icons.receipt_long_outlined));
        }
        return EdListSection(
          title: 'سنداتي',
          count: list.length,
          child: Column(children: list.map(_receiptTile).toList()),
        );
      },
    );
  }

  Widget _receiptTile(Receipt r) {
    final color = _statusColor(r.status);
    return EdListTileCard(
      title: r.receiptNo,
      subtitle: '${r.customerName ?? '—'} · ${fmtMoney(r.amount)}',
      icon: Icons.receipt_long_rounded,
      iconColor: color,
      badge: r.statusLabel,
      badgeColor: color,
      trailing: fmtMoney(r.amount),
      onDelete: r.canDelete ? () => _delete(r.id) : null,
    );
  }

  Color _statusColor(String status) => switch (status) {
        'posted' => AppColors.success,
        'rejected' => AppColors.danger,
        'reviewed' => AppColors.moduleShop,
        _ => AppColors.warning,
      };
}

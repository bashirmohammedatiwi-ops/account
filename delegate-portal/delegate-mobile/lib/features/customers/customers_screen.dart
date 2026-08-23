import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/delegate_api.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_form.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  AccountTree? _tree;
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _addressCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _addressCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_tree == null) {
      _snack('اختر الشجرة التي يُضاف لها الزبون');
      return;
    }
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      _snack('أدخل اسم الزبون');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createCustomerRequest(
            treeAccSeq: _tree!.seq,
            treeName: _tree!.name1,
            name: name,
            phone: _phoneCtrl.text.trim(),
            address: _addressCtrl.text.trim(),
            notes: _notesCtrl.text.trim(),
          );
      ref.invalidate(customerRequestsListProvider);
      if (!mounted) return;
      _nameCtrl.clear();
      _phoneCtrl.clear();
      _addressCtrl.clear();
      _notesCtrl.clear();
      setState(() => _tree = null);
      _snack('أُرسل الطلب للوحة التحكم للمراجعة', success: true);
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
        title: const Text('حذف الطلب'),
        content: const Text('هل تريد حذف طلب الزبون؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiClientProvider).deleteCustomerRequest(id);
      ref.invalidate(customerRequestsListProvider);
    } catch (e) {
      _snack('$e');
    }
  }

  void _snack(String msg, {bool success = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: success ? AppColors.success : null, behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    final treesAsync = ref.watch(treesProvider);
    final requestsAsync = ref.watch(customerRequestsListProvider);
    final layout = EdLayout.of(context);

    return AppPage(
      title: 'زبون جديد',
      kicker: 'إضافة فرع',
      subtitle: 'يُراجع ثم يُرحَّل للإداري',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: Colors.white,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(treesProvider);
            ref.invalidate(customerRequestsListProvider);
          },
          child: layout.isTablet
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: layout.isDesktop ? 420 : 380, child: _formCard(treesAsync)),
                    const SizedBox(width: 16),
                    Expanded(child: _listSection(requestsAsync)),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, kPhoneBottomInset),
                  children: [
                    _formCard(treesAsync),
                    const SizedBox(height: EdSpacing.xxl),
                    _listSection(requestsAsync),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _formCard(AsyncValue<List<AccountTree>> treesAsync) {
    return EdFormCard(
      title: 'طلب زبون جديد',
      subtitle: 'يُضاف تحت الشجرة المختارة',
      icon: Icons.person_add_alt_1_rounded,
      iconColor: AppColors.moduleCustomers,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          treesAsync.when(
            loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: LinearProgressIndicator(color: AppColors.accentTeal)),
            error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
            data: (trees) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: EdSpacing.sm, right: 4),
                  child: const Text('الشجرة', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
                ),
                DropdownButtonFormField<AccountTree>(
                  value: _tree,
                  decoration: const InputDecoration(hintText: 'اختر الشجرة'),
                  items: trees.map((t) => DropdownMenuItem(value: t, child: Text('${t.name1} · ${t.accountNum}'))).toList(),
                  onChanged: (v) => setState(() => _tree = v),
                ),
              ],
            ),
          ),
          const SizedBox(height: EdSpacing.lg),
          EdLabeledField(label: 'اسم الزبون', controller: _nameCtrl, hint: 'الاسم الكامل', prefixIcon: Icons.person_outline),
          const SizedBox(height: EdSpacing.md),
          EdLabeledField(label: 'الهاتف', controller: _phoneCtrl, hint: '07xxxxxxxxx', keyboardType: TextInputType.phone, prefixIcon: Icons.phone_outlined),
          const SizedBox(height: EdSpacing.md),
          EdLabeledField(label: 'العنوان / المنطقة', controller: _addressCtrl, hint: 'المنطقة أو العنوان', prefixIcon: Icons.location_on_outlined),
          const SizedBox(height: EdSpacing.md),
          EdLabeledField(label: 'ملاحظات', controller: _notesCtrl, maxLines: 2, prefixIcon: Icons.notes_outlined),
          const SizedBox(height: EdSpacing.xl),
          EdSubmitButton(
            label: _submitting ? 'جاري الإرسال...' : 'إرسال للوحة التحكم',
            onPressed: _submitting ? null : _submit,
            loading: _submitting,
            icon: Icons.send_rounded,
          ),
        ],
      ),
    );
  }

  Widget _listSection(AsyncValue<List<CustomerRequest>> requestsAsync) {
    return requestsAsync.when(
      loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(customerRequestsListProvider)),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(padding: EdgeInsets.all(24), child: EmptyState(message: 'لا توجد طلبات بعد', icon: Icons.person_add_alt_1_outlined));
        }
        return EdListSection(
          title: 'طلباتي',
          count: list.length,
          child: Column(children: list.map(_requestTile).toList()),
        );
      },
    );
  }

  Widget _requestTile(CustomerRequest r) {
    final color = _statusColor(r.status);
    return EdListTileCard(
      title: r.name,
      subtitle: '${r.requestNo} · ${r.treeName ?? r.treeNum ?? '—'}',
      icon: Icons.person_add_rounded,
      iconColor: color,
      badge: r.statusLabel,
      badgeColor: color,
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

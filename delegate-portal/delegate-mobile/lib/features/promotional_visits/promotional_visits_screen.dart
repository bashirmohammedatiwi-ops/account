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

class PromotionalVisitsScreen extends ConsumerStatefulWidget {
  const PromotionalVisitsScreen({super.key});

  @override
  ConsumerState<PromotionalVisitsScreen> createState() => _PromotionalVisitsScreenState();
}

class _PromotionalVisitsScreenState extends ConsumerState<PromotionalVisitsScreen> {
  final _areaCtrl = TextEditingController();
  final _shopCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  IraqGovernorate? _governorate;
  VisitOutcome? _outcome;
  bool _submitting = false;

  @override
  void dispose() {
    _areaCtrl.dispose();
    _shopCtrl.dispose();
    _phoneCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_governorate == null) {
      _snack('اختر المحافظة');
      return;
    }
    if (_outcome == null) {
      _snack('اختر الحالة بعد الترويج');
      return;
    }
    final area = _areaCtrl.text.trim();
    if (area.isEmpty) {
      _snack('أدخل اسم المنطقة');
      return;
    }
    final shop = _shopCtrl.text.trim();
    if (shop.isEmpty) {
      _snack('أدخل اسم المحل أو المركز');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).createPromotionalVisit(
            governorateCode: _governorate!.code,
            areaName: area,
            shopName: shop,
            visitOutcome: _outcome!.code,
            centerPhone: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
            notes: _notesCtrl.text.trim(),
          );
      ref.invalidate(promotionalVisitsListProvider);
      if (!mounted) return;
      _areaCtrl.clear();
      _shopCtrl.clear();
      _phoneCtrl.clear();
      _notesCtrl.clear();
      setState(() {
        _governorate = null;
        _outcome = null;
      });
      _snack('أُرسلت الزيارة الترويجية للوحة التحكم', success: true);
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
        title: const Text('حذف الزيارة'),
        content: const Text('هل تريد حذف هذه الزيارة الترويجية؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف', style: TextStyle(color: AppColors.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(apiClientProvider).deletePromotionalVisit(id);
      ref.invalidate(promotionalVisitsListProvider);
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
    final metaAsync = ref.watch(promotionalVisitsMetaProvider);
    final visitsAsync = ref.watch(promotionalVisitsListProvider);
    final layout = EdLayout.of(context);

    return AppPage(
      title: 'الزيادات الترويجية',
      kicker: 'ترويج المنتجات',
      subtitle: 'تسجيل زيارة المحل أو المركز',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: Colors.white,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(promotionalVisitsMetaProvider);
            ref.invalidate(promotionalVisitsListProvider);
          },
          child: layout.isTablet
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: layout.isDesktop ? 420 : 380, child: _formCard(metaAsync)),
                    const SizedBox(width: 16),
                    Expanded(child: _listSection(visitsAsync)),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, kPhoneBottomInset),
                  children: [
                    _formCard(metaAsync),
                    const SizedBox(height: EdSpacing.xxl),
                    _listSection(visitsAsync),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _formCard(AsyncValue<PromotionalVisitsMeta> metaAsync) {
    return EdFormCard(
      title: 'زيارة ترويجية جديدة',
      subtitle: 'المحافظة · المنطقة · المحل · النتيجة',
      icon: Icons.campaign_rounded,
      iconColor: AppColors.modulePromo,
      child: metaAsync.when(
        loading: () => const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: LinearProgressIndicator(color: AppColors.accentTeal)),
        error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
        data: (meta) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: EdSpacing.sm, right: 4),
              child: const Text('المحافظة', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
            ),
            DropdownButtonFormField<IraqGovernorate>(
              value: _governorate,
              decoration: const InputDecoration(hintText: 'اختر المحافظة'),
              items: meta.governorates.map((g) => DropdownMenuItem(value: g, child: Text(g.name))).toList(),
              onChanged: (v) => setState(() => _governorate = v),
            ),
            const SizedBox(height: EdSpacing.lg),
            EdLabeledField(label: 'اسم المنطقة', controller: _areaCtrl, hint: 'الحي أو المنطقة', prefixIcon: Icons.map_outlined),
            const SizedBox(height: EdSpacing.md),
            EdLabeledField(label: 'المحل أو المركز', controller: _shopCtrl, hint: 'اسم المحل الذي زرته', prefixIcon: Icons.storefront_outlined),
            const SizedBox(height: EdSpacing.md),
            EdLabeledField.phone(
              label: 'رقم هاتف المركز (اختياري)',
              controller: _phoneCtrl,
              hint: '07XXXXXXXX',
              prefixIcon: Icons.phone_outlined,
            ),
            const SizedBox(height: EdSpacing.md),
            Padding(
              padding: const EdgeInsets.only(bottom: EdSpacing.sm, right: 4),
              child: const Text('الحالة بعد الترويج', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
            ),
            DropdownButtonFormField<VisitOutcome>(
              value: _outcome,
              decoration: const InputDecoration(hintText: 'نتيجة الزيارة'),
              items: meta.outcomes.map((o) => DropdownMenuItem(value: o, child: Text(o.label))).toList(),
              onChanged: (v) => setState(() => _outcome = v),
            ),
            const SizedBox(height: EdSpacing.md),
            EdLabeledField(label: 'ملاحظات المندوب', controller: _notesCtrl, maxLines: 3, prefixIcon: Icons.notes_outlined),
            const SizedBox(height: EdSpacing.xl),
            EdSubmitButton(
              label: _submitting ? 'جاري الإرسال...' : 'إرسال للوحة التحكم',
              onPressed: _submitting ? null : _submit,
              loading: _submitting,
              icon: Icons.send_rounded,
            ),
          ],
        ),
      ),
    );
  }

  Widget _listSection(AsyncValue<List<PromotionalVisit>> visitsAsync) {
    return visitsAsync.when(
      loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(promotionalVisitsListProvider)),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: EmptyState(message: 'لا توجد زيارات ترويجية بعد', icon: Icons.campaign_outlined),
          );
        }
        return EdListSection(
          title: 'زياراتي',
          count: list.length,
          child: Column(children: list.map(_visitTile).toList()),
        );
      },
    );
  }

  Widget _visitTile(PromotionalVisit v) {
    final color = _statusColor(v.status);
    return EdListTileCard(
      title: v.shopName,
      subtitle: '${v.visitNo} · ${v.governorateName} · ${v.areaName}',
      icon: Icons.campaign_rounded,
      iconColor: color,
      badge: v.visitOutcomeLabel,
      badgeColor: AppColors.modulePromo,
      onDelete: v.canDelete ? () => _delete(v.id) : null,
    );
  }

  Color _statusColor(String status) => switch (status) {
        'reviewed' => AppColors.success,
        'archived' => AppColors.textSecondary,
        _ => AppColors.warning,
      };
}

class PromotionalVisitsMeta {
  const PromotionalVisitsMeta({required this.governorates, required this.outcomes});

  final List<IraqGovernorate> governorates;
  final List<VisitOutcome> outcomes;
}

final promotionalVisitsMetaProvider = FutureProvider((ref) async {
  final api = ref.read(apiClientProvider);
  final results = await Future.wait([api.getGovernorates(), api.getVisitOutcomes()]);
  return PromotionalVisitsMeta(
    governorates: results[0] as List<IraqGovernorate>,
    outcomes: results[1] as List<VisitOutcome>,
  );
});

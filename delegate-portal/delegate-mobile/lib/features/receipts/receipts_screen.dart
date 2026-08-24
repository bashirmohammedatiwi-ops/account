import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/delegate_api.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../core/widgets/ed_form.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';

import '../home/home_screen.dart';
import 'receipts_ui.dart';
import 'thermal_print_service.dart';

final deliveryReceiptsListProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getDeliveryReceipts());
});

class ReceiptsScreen extends ConsumerStatefulWidget {
  const ReceiptsScreen({super.key});

  @override
  ConsumerState<ReceiptsScreen> createState() => _ReceiptsScreenState();
}

class _ReceiptsScreenState extends ConsumerState<ReceiptsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;

  PickedCustomer? _drPicked;
  final _drAmountCtrl = TextEditingController();
  final _drNotesCtrl = TextEditingController();
  bool _drSubmitting = false;
  bool _drPrinting = false;
  int? _reprintingDeliveryId;
  PrinterStatus? _printerStatus;

  PickedCustomer? _picked;
  final _amountCtrl = TextEditingController();
  final _commissionCtrl = TextEditingController();
  final _discountCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  bool _submitting = false;
  int? _linkedDeliveryId;
  String? _linkedDeliveryNo;
  DeliveryReceipt? _linkedDelivery;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _tabs.addListener(() {
      if (!_tabs.indexIsChanging) setState(() {});
    });
    if (!kIsWeb) {
      _refreshPrinterStatus();
      _refreshPrintTemplate();
    }
  }

  Future<void> _refreshPrintTemplate() async {
    if (kIsWeb) return;
    try {
      final tpl = await ref.read(apiClientProvider).getDeliveryReceiptPrintTemplate();
      if (tpl != null) await ThermalPrintService.cacheTemplate(tpl);
    } catch (_) {}
  }

  Future<void> _refreshPrinterStatus() async {
    if (kIsWeb) return;
    final status = await ThermalPrintService.status();
    if (mounted) setState(() => _printerStatus = status);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _drAmountCtrl.dispose();
    _drNotesCtrl.dispose();
    _amountCtrl.dispose();
    _commissionCtrl.dispose();
    _discountCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _refreshAll() async {
    ref.invalidate(receiptsListProvider);
    ref.invalidate(deliveryReceiptsListProvider);
    await _refreshPrintTemplate();
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

  Future<void> _pickDrCustomer() async {
    final picked = await showCustomerPicker(context, ref, includePending: false);
    if (picked != null) setState(() => _drPicked = picked);
  }

  Future<void> _pickCustomer() async {
    final picked = await showCustomerPicker(context, ref, includePending: false);
    if (picked != null) setState(() => _picked = picked);
  }

  Future<void> _configurePrinter() async {
    if (kIsWeb) {
      _snack('الطباعة الحرارية متاحة على الآيباد والهاتف فقط');
      return;
    }
    if (!await ThermalPrintService.isBluetoothOn()) {
      _snack('فعّل البلوتوث على الجهاز');
      return;
    }
    final devices = await ThermalPrintService.scanPrinters();
    if (!mounted) return;
    if (devices.isEmpty) {
      _snack('لا توجد طابعات مقترنة — اقترن الطابعة من إعدادات الجهاز');
      return;
    }
    final selected = await showModalBottomSheet<BluetoothInfo>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('اختر الطابعة الحرارية', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
            ...devices.map((d) => ListTile(
                  title: Text(d.name),
                  subtitle: Text(d.macAdress),
                  onTap: () => Navigator.pop(ctx, d),
                )),
          ],
        ),
      ),
    );
    if (selected == null) return;
    final ok = await ThermalPrintService.connect(selected.macAdress, name: selected.name);
    await _refreshPrinterStatus();
    _snack(ok ? 'تم الاتصال بالطابعة' : 'فشل الاتصال — تأكد أن الطابعة مفعّلة ومقترنة', success: ok);
  }

  Future<bool> _printDelivery(DeliveryReceipt receipt, {bool showMessages = true}) async {
    if (kIsWeb) {
      if (showMessages) _snack('الطباعة متاحة على الهاتف والآيباد فقط');
      return false;
    }
    final agent = ref.read(authProvider).agent?.name;
    final printed = await ThermalPrintService.printDeliveryReceipt(receipt, agentName: agent);
    if (printed) {
      try {
        await ref.read(apiClientProvider).markDeliveryReceiptPrinted(receipt.id);
        ref.invalidate(deliveryReceiptsListProvider);
      } catch (_) {}
      if (showMessages) _snack('تمت الطباعة', success: true);
      await _refreshPrinterStatus();
      return true;
    }
    if (showMessages) {
      _snack('تعذّرت الطباعة — ربط الطابعة من الزر أعلاه ثم أعد المحاولة');
    }
    await _refreshPrinterStatus();
    return false;
  }

  Future<void> _issueDelivery({required bool tryPrint}) async {
    if (_drPicked == null) {
      _snack('اختر شجرة ثم زبوناً');
      return;
    }
    final amount = num.tryParse(_drAmountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      _snack('أدخل مبلغ وصل الاستلام');
      return;
    }
    setState(() => _drSubmitting = true);
    try {
      final receipt = await ref.read(apiClientProvider).createDeliveryReceipt(
            customerAccSeq: _drPicked!.customer.seq,
            treeAccSeq: _drPicked!.tree.seq,
            treeName: _drPicked!.tree.name1,
            amount: amount,
            notes: _drNotesCtrl.text.trim(),
          );
      ref.invalidate(deliveryReceiptsListProvider);

      if (!mounted) return;
      _drAmountCtrl.clear();
      _drNotesCtrl.clear();
      setState(() => _drPicked = null);

      _snack('تم إصدار وصل الاستلام — يمكنك إصدار وصول أخرى أو إنشاء سند قبض لاحقاً', success: true);

      if (tryPrint && !kIsWeb) {
        setState(() => _drPrinting = true);
        await _printDelivery(receipt);
        if (mounted) setState(() => _drPrinting = false);
      }
    } catch (e) {
      _snack(e is ApiException ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _drSubmitting = false);
    }
  }

  Future<void> _reprintDelivery(DeliveryReceipt item) async {
    if (kIsWeb) {
      _snack('الطباعة متاحة على الآيباد والهاتف');
      return;
    }
    setState(() => _reprintingDeliveryId = item.id);
    try {
      await _printDelivery(item);
    } finally {
      if (mounted) setState(() => _reprintingDeliveryId = null);
    }
  }

  void _startReceiptFromDelivery(DeliveryReceipt item, {bool quiet = false}) {
    setState(() {
      _linkedDelivery = item;
      _linkedDeliveryId = item.id;
      _linkedDeliveryNo = item.deliveryNo;
      _amountCtrl.text = '${item.amount}';
      _notesCtrl.text = item.notes ?? '';
      _picked = null;
    });
    _tabs.animateTo(1);
    if (!quiet) {
      _snack('أكمل سند القبض الداخلي ثم أرسله للوحة التحكم');
    }
  }

  void _clearLinkedDelivery() {
    setState(() {
      _linkedDeliveryId = null;
      _linkedDeliveryNo = null;
      _linkedDelivery = null;
    });
  }

  Future<void> _submitReceipt() async {
    final customerSeq = _picked?.customer.seq ?? _linkedDelivery?.customerAccSeq;
    final treeSeq = _picked?.tree.seq ?? _linkedDelivery?.treeAccSeq ?? '';
    final treeName = _picked?.tree.name1 ?? _linkedDelivery?.treeName ?? '';
    if (customerSeq == null || customerSeq.isEmpty) {
      _snack('اختر زبوناً أو اربط بوصل استلام');
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
            customerAccSeq: customerSeq,
            treeAccSeq: treeSeq,
            treeName: treeName,
            amount: amount,
            commission: num.tryParse(_commissionCtrl.text.trim()) ?? 0,
            discount: num.tryParse(_discountCtrl.text.trim()) ?? 0,
            notes: _notesCtrl.text.trim(),
            deliveryReceiptId: _linkedDeliveryId,
          );
      ref.invalidate(receiptsListProvider);
      ref.invalidate(deliveryReceiptsListProvider);
      if (!mounted) return;
      _amountCtrl.clear();
      _commissionCtrl.clear();
      _discountCtrl.clear();
      _notesCtrl.clear();
      setState(() {
        _picked = null;
        _linkedDeliveryId = null;
        _linkedDeliveryNo = null;
        _linkedDelivery = null;
      });
      _snack('أُرسل السند للوحة التحكم للمراجعة', success: true);
    } catch (e) {
      _snack(e is ApiException ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  int _pendingDeliveryReceipt(List<DeliveryReceipt> list) => list.where((d) => d.canCreateReceipt).length;

  int _pendingReceipts(List<Receipt> list) => list.where((r) => r.status == 'pending' || r.status == 'reviewed').length;

  @override
  Widget build(BuildContext context) {
    final receiptsAsync = ref.watch(receiptsListProvider);
    final deliveryAsync = ref.watch(deliveryReceiptsListProvider);
    final layout = EdLayout.of(context);
    final isWide = layout.isTablet;
    final tabIndex = _tabs.index;

    final deliveryCount = deliveryAsync.maybeWhen(data: (l) => l.length, orElse: () => 0);
    final receiptCount = receiptsAsync.maybeWhen(data: (l) => l.length, orElse: () => 0);
    final pendingDr = deliveryAsync.maybeWhen(data: _pendingDeliveryReceipt, orElse: () => 0);
    final pendingR = receiptsAsync.maybeWhen(data: _pendingReceipts, orElse: () => 0);

    return AppPage(
      title: 'سند قبض',
      kicker: 'تحصيل',
      subtitle: 'وصل استلام للزبون — سند قبض داخلي (اختياري الربط)',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: Colors.white,
        child: Stack(
          children: [
            const ReceiptsBackdrop(),
            Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, 0),
                  child: ReceiptsStatsHeader(
                    deliveryCount: deliveryCount,
                    pendingDeliveryReceipt: pendingDr,
                    receiptCount: receiptCount,
                    pendingReceipts: pendingR,
                    large: isWide,
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
                  child: ReceiptsFlowBanner(step: tabIndex),
                ),
                const SizedBox(height: 8),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
                  child: _pillTabBar(),
                ),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _refreshAll,
                    child: TabBarView(
                      controller: _tabs,
                      children: [
                        _deliveryTab(deliveryAsync, isWide),
                        _receiptTab(receiptsAsync, isWide, layout),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _pillTabBar() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          Expanded(child: _pillTab(0, 'وصل استلام', Icons.print_outlined)),
          Expanded(child: _pillTab(1, 'سند قبض', Icons.receipt_long_rounded)),
        ],
      ),
    );
  }

  Widget _pillTab(int index, String label, IconData icon) {
    final active = _tabs.index == index;
    return GestureDetector(
      onTap: () => _tabs.animateTo(index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: active ? AppColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: active ? AppColors.softShadow : null,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: active ? AppColors.navy : AppColors.muted),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: active ? AppColors.navy : AppColors.muted)),
          ],
        ),
      ),
    );
  }

  Widget _deliveryTab(AsyncValue<List<DeliveryReceipt>> deliveryAsync, bool isWide) {
    final form = _deliveryFormCard();
    final list = _deliveryListSection(deliveryAsync);
    if (isWide) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 400, child: SingleChildScrollView(padding: const EdgeInsets.all(16), physics: const AlwaysScrollableScrollPhysics(), child: form)),
          Expanded(child: SingleChildScrollView(padding: const EdgeInsets.all(16), physics: const AlwaysScrollableScrollPhysics(), child: list)),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, kPhoneBottomInset),
      children: [form, const SizedBox(height: EdSpacing.xxl), list],
    );
  }

  Widget _deliveryFormCard() {
    final c = _drPicked?.customer;
    return EdFormCard(
      title: 'وصل استلام مبلغ',
      subtitle: 'يُطبع للزبون — يمكنك إصدار عدة وصول ثم سند قبض لاحقاً',
      icon: Icons.print_outlined,
      iconColor: AppColors.moduleReceipts,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!kIsWeb && _printerStatus != null) ...[
            PrinterStatusBanner(
              status: _printerStatus!,
              onConfigure: _configurePrinter,
              onRefresh: _refreshPrinterStatus,
            ),
            const SizedBox(height: EdSpacing.md),
          ],
          EdPickerField(
            label: 'الزبون',
            value: c != null ? c.name1 : null,
            subtitle: c != null ? c.accountNum : null,
            placeholder: 'اختر شجرة ثم زبوناً',
            icon: Icons.person_outline_rounded,
            accentColor: AppColors.moduleReceipts,
            onTap: _pickDrCustomer,
          ),
          const SizedBox(height: EdSpacing.lg),
          EdLabeledField(
            label: 'المبلغ المستلم',
            controller: _drAmountCtrl,
            hint: '0',
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            prefixIcon: Icons.payments_outlined,
          ),
          const SizedBox(height: EdSpacing.md),
          EdLabeledField(
            label: 'ملاحظات',
            controller: _drNotesCtrl,
            hint: 'اختياري — يظهر على الوصل',
            maxLines: 2,
            prefixIcon: Icons.notes_outlined,
          ),
          const SizedBox(height: EdSpacing.md),
          if (!kIsWeb)
            OutlinedButton.icon(
              onPressed: _configurePrinter,
              icon: const Icon(Icons.bluetooth_rounded, size: 18),
              label: const Text('اختيار / ربط الطابعة'),
            ),
          const SizedBox(height: EdSpacing.lg),
          EdSubmitButton(
            label: _drSubmitting ? 'جاري الإصدار...' : 'إصدار وصل الاستلام',
            icon: Icons.check_circle_outline_rounded,
            onPressed: (_drSubmitting || _drPrinting) ? null : () => _issueDelivery(tryPrint: false),
            loading: _drSubmitting && !_drPrinting,
          ),
          if (!kIsWeb) ...[
            const SizedBox(height: EdSpacing.sm),
            EdSubmitButton(
              label: _drPrinting ? 'جاري الطباعة...' : 'إصدار وطباعة للزبون',
              icon: Icons.print_rounded,
              onPressed: (_drSubmitting || _drPrinting) ? null : () => _issueDelivery(tryPrint: true),
              loading: _drPrinting,
            ),
          ],
          const SizedBox(height: 8),
          Text(
            'بعد الإصدار تبقى في قائمة وصول الاستلام — أنشئ سند قبض من التبويب الثاني عند الحاجة',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted.withValues(alpha: 0.9)),
          ),
        ],
      ),
    );
  }

  Widget _deliveryListSection(AsyncValue<List<DeliveryReceipt>> deliveryAsync) {
    return deliveryAsync.when(
      loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(deliveryReceiptsListProvider)),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: EmptyState(message: 'لا توجد وصول استلام — أصدر وصلاً من النموذج', icon: Icons.print_outlined),
          );
        }
        return EdListSection(
          title: 'وصول الاستلام',
          count: list.length,
          child: Column(
            children: list
                .map(
                  (d) => DeliveryReceiptCard(
                    item: d,
                    showPrint: !kIsWeb,
                    isReprinting: _reprintingDeliveryId == d.id,
                    onReprint: !kIsWeb ? () => _reprintDelivery(d) : null,
                    onCreateReceipt: d.canCreateReceipt ? () => _startReceiptFromDelivery(d) : null,
                  ),
                )
                .toList(),
          ),
        );
      },
    );
  }

  Widget _receiptTab(AsyncValue<List<Receipt>> receiptsAsync, bool isWide, EdLayoutData layout) {
    final form = _receiptFormCard();
    final list = _receiptListSection(receiptsAsync);
    if (isWide) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: layout.isDesktop ? 440 : 400,
            child: SingleChildScrollView(padding: const EdgeInsets.all(16), physics: const AlwaysScrollableScrollPhysics(), child: form),
          ),
          Expanded(child: SingleChildScrollView(padding: const EdgeInsets.all(16), physics: const AlwaysScrollableScrollPhysics(), child: list)),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, kPhoneBottomInset),
      children: [form, const SizedBox(height: EdSpacing.xxl), list],
    );
  }

  Widget _receiptFormCard() {
    final c = _picked?.customer;
    final linkedCustomer = _linkedDelivery?.customerName ?? '';
    return EdFormCard(
      title: 'سند قبض داخلي',
      subtitle: 'اختياري: اربط بوصل استلام أو أرسل سنداً مباشرة للوحة التحكم',
      icon: Icons.receipt_long_rounded,
      iconColor: AppColors.moduleReceipts,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_linkedDeliveryNo != null)
            Padding(
              padding: const EdgeInsets.only(bottom: EdSpacing.md),
              child: ReceiptLinkedBanner(
                deliveryNo: _linkedDeliveryNo!,
                customerName: linkedCustomer,
                amount: _linkedDelivery?.amount ?? 0,
                onClear: _clearLinkedDelivery,
              ),
            ),
          if (_linkedDelivery == null)
            EdPickerField(
              label: 'الزبون',
              value: c != null ? c.name1 : null,
              subtitle: c != null ? c.accountNum : null,
              placeholder: 'اختر شجرة ثم زبوناً',
              icon: Icons.person_outline_rounded,
              accentColor: AppColors.moduleReceipts,
              onTap: _pickCustomer,
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Row(
                children: [
                  const Icon(Icons.person_outline_rounded, color: AppColors.muted, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('الزبون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                        Text(linkedCustomer, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy)),
                      ],
                    ),
                  ),
                ],
              ),
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
            onPressed: _submitting ? null : _submitReceipt,
            loading: _submitting,
          ),
        ],
      ),
    );
  }

  Widget _receiptListSection(AsyncValue<List<Receipt>> receiptsAsync) {
    return receiptsAsync.when(
      loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(receiptsListProvider)),
      data: (list) {
        if (list.isEmpty) {
          return const Padding(
            padding: EdgeInsets.all(24),
            child: EmptyState(message: 'لا توجد سندات — أرسل سند قبض جديداً (مع أو بدون وصل استلام)', icon: Icons.receipt_long_outlined),
          );
        }
        return EdListSection(
          title: 'سندات القبض',
          count: list.length,
          child: Column(children: list.map((r) => InternalReceiptCard(receipt: r)).toList()),
        );
      },
    );
  }
}

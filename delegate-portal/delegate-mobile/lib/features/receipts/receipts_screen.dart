import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/delegate_api.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../core/widgets/ed_form.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';

import 'receipts_hub.dart';
import 'receipts_ui.dart';
import 'thermal_print_service.dart';

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

  final _drSearchCtrl = TextEditingController();
  final _rSearchCtrl = TextEditingController();
  var _drPeriod = ReceiptsPeriod.all;
  var _rDateRange = ReceiptsDateRange.all();
  bool _drFormOpen = false;
  bool _rFormOpen = false;

  List<DeliveryReceipt> _filterDeliveries(List<DeliveryReceipt> items) {
    final q = _drSearchCtrl.text.trim().toLowerCase();
    return items.where((d) {
      if (!receiptsMatchesPeriod(d.receiptDate ?? d.createdAt, _drPeriod)) return false;
      if (q.isEmpty) return true;
      return '${d.deliveryNo} ${d.customerName ?? ''} ${d.customerNum ?? ''} ${d.linkedReceiptNo ?? ''}'
          .toLowerCase()
          .contains(q);
    }).toList();
  }

  List<Receipt> _filterReceipts(List<Receipt> items) {
    final q = _rSearchCtrl.text.trim().toLowerCase();
    return items.where((r) {
      if (!receiptsMatchesDateRange(r.receiptDate ?? r.createdAt, _rDateRange)) return false;
      if (q.isEmpty) return true;
      return '${r.receiptNo} ${r.customerName ?? ''} ${r.customerNum ?? ''}'.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _bootstrapLists() async {
    try {
      final deliveries = await ref.read(deliveriesListNotifierProvider.future);
      final receipts = await ref.read(receiptsListProvider.future);
      if (!mounted) return;
      setState(() {
        _drFormOpen = deliveries.isEmpty;
        _rFormOpen = _rFormOpen || receipts.isEmpty;
      });
    } catch (_) {}
  }

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapLists());
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
    final status = await ThermalPrintService.status(requestPermissions: false);
    if (mounted) setState(() => _printerStatus = status);
  }

  void _openPrinterSettings() {
    if (kIsWeb) {
      _snack('الطباعة الحرارية متاحة على الآيباد والهاتف فقط');
      return;
    }
    context.push('/settings/printer').then((_) => _refreshPrinterStatus());
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
    _drSearchCtrl.dispose();
    _rSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refreshAll() async {
    invalidateReceiptsData(ref);
    try {
      await ref.read(deliveriesListNotifierProvider.future);
      await ref.read(receiptsListProvider.future);
    } catch (_) {}
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

  Future<bool> _printDelivery(DeliveryReceipt receipt, {bool showMessages = true}) async {
    if (kIsWeb) {
      if (showMessages) _snack('الطباعة متاحة على الهاتف والآيباد فقط');
      return false;
    }
    final agent = ref.read(authProvider).agent?.name;
    final serverUrl = ref.read(apiClientProvider).serverUrl;
    final printed = await ThermalPrintService.printDeliveryReceipt(
      receipt,
      agentName: agent,
      serverUrl: serverUrl,
      fetchTemplate: () => ref.read(apiClientProvider).getDeliveryReceiptPrintTemplate(),
    );
    if (printed) {
      try {
        await ref.read(apiClientProvider).markDeliveryReceiptPrinted(receipt.id);
        invalidateReceiptsData(ref);
      } catch (_) {}
      if (showMessages) _snack('تمت الطباعة', success: true);
      await _refreshPrinterStatus();
      return true;
    }
    if (showMessages) {
      _snack('تعذّرت الطباعة — راجع إعدادات الطابعة من الحساب → الطابعة الحرارية');
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
      _snack('أدخل مبلغ وصل القبض');
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
            displayCustomerName: _drPicked!.customer.name1,
            displayCustomerNum: _drPicked!.customer.accountNum,
          );
      ref.read(deliveriesListNotifierProvider.notifier).upsert(receipt);
      invalidateReceiptsData(ref);
      try {
        await ref.read(deliveriesListNotifierProvider.future);
      } catch (_) {}

      if (!mounted) return;
      _drAmountCtrl.clear();
      _drNotesCtrl.clear();
      setState(() {
        _drPicked = null;
        _drFormOpen = false;
      });

      _snack('تم إصدار وصل القبض', success: true);

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
      _rFormOpen = true;
    });
    _tabs.animateTo(1);
    if (!quiet) {
      _snack('أكمل سند القبض ثم أرسله للوحة التحكم', success: true);
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
      _snack('اختر زبوناً أو اربط بوصل قبض');
      return;
    }
    final amount = num.tryParse(_amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      _snack('أدخل مبلغ سند القبض');
      return;
    }
    setState(() => _submitting = true);
    try {
      final created = await ref.read(apiClientProvider).createReceipt(
            customerAccSeq: customerSeq,
            treeAccSeq: treeSeq,
            treeName: treeName,
            amount: amount,
            commission: num.tryParse(_commissionCtrl.text.trim()) ?? 0,
            discount: num.tryParse(_discountCtrl.text.trim()) ?? 0,
            notes: _notesCtrl.text.trim(),
            deliveryReceiptId: _linkedDeliveryId,
          );
      ref.read(receiptsListProvider.notifier).upsert(created);
      invalidateReceiptsData(ref);
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
        _rFormOpen = false;
      });
      _snack('أُرسل السند للوحة التحكم للمراجعة', success: true);
    } catch (e) {
      _snack(e is ApiException ? e.message : '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final deliveriesAsync = ref.watch(deliveriesListNotifierProvider);
    final receiptsAsync = ref.watch(receiptsListProvider);
    final layout = EdLayout.of(context);
    final isWide = layout.isTablet;
    final tabIndex = _tabs.index;

    final deliveries = deliveriesAsync.value ?? [];
    final receipts = receiptsAsync.value ?? [];
    final pendingDr = deliveries.where((d) => d.canCreateReceipt).length;
    final pendingR = receipts.where((r) => r.status == 'pending' || r.status == 'reviewed').length;

    final loading = (deliveriesAsync.isLoading && !deliveriesAsync.hasValue) ||
        (receiptsAsync.isLoading && !receiptsAsync.hasValue);
    final error = deliveriesAsync.hasError ? deliveriesAsync.error : receiptsAsync.error;

    return AppPage(
      title: 'سند قبض',
      kicker: 'تحصيل',
      subtitle: 'وصل قبض للزبون — سند قبض للإدارة',
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
                    deliveryCount: deliveries.length,
                    pendingDeliveryReceipt: pendingDr,
                    receiptCount: receipts.length,
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
                  child: loading
                      ? const Center(child: LoadingView())
                      : error != null
                          ? ErrorView(
                              message: error.displayMessage,
                              onRetry: () => invalidateReceiptsData(ref),
                            )
                          : RefreshIndicator(
                              onRefresh: _refreshAll,
                              child: isWide
                                  ? (_tabs.index == 0
                                      ? _deliveryTabBodyWide(deliveries)
                                      : _receiptTabBodyWide(deliveries, receipts))
                                  : (_tabs.index == 0
                                      ? _deliveryPhoneLayout(deliveries)
                                      : _receiptPhoneLayout(deliveries, receipts)),
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
          Expanded(child: _pillTab(0, 'وصل قبض', Icons.print_outlined)),
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

  static const _tabScrollPhysics = AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics());

  Widget _deliveryPhoneLayout(List<DeliveryReceipt> deliveries) {
    final visible = _filterDeliveries(deliveries);
    final filtering = _drSearchCtrl.text.trim().isNotEmpty || _drPeriod != ReceiptsPeriod.all;

    return CustomScrollView(
      physics: _tabScrollPhysics,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, EdSpacing.sm),
          sliver: SliverToBoxAdapter(
            child: CollapsibleFormPanel(
              title: 'إصدار وصل قبض',
              subtitle: 'اضغط لفتح النموذج وإصدار وصل جديد',
              icon: Icons.print_outlined,
              expanded: _drFormOpen,
              onToggle: () => setState(() => _drFormOpen = !_drFormOpen),
              child: _deliveryFormCard(),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, EdSpacing.sm),
          sliver: SliverToBoxAdapter(
            child: ReceiptsHistoryFilter(
              controller: _drSearchCtrl,
              period: _drPeriod,
              onPeriodChanged: (p) => setState(() => _drPeriod = p),
              onQueryChanged: (_) => setState(() {}),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
          sliver: SliverToBoxAdapter(
            child: ReceiptsSectionHeader(
              title: 'سجل وصول القبض',
              subtitle: filtering ? 'نتائج البحث ضمن ${_drPeriod.label}' : 'جميع الوصولات المُصدَرة',
              count: visible.length,
              accent: AppColors.accentTeal,
            ),
          ),
        ),
        if (visible.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: EmptyState(
                message: filtering
                    ? 'لا توجد نتائج مطابقة — جرّب "الكل" أو غيّر كلمة البحث'
                    : 'لا توجد وصول قبض — أصدر وصلاً من النموذج أعلاه',
                icon: filtering ? Icons.search_off_rounded : Icons.print_outlined,
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, kPhoneBottomInset),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final d = visible[index];
                  return DeliveryReceiptCard(
                    item: d,
                    showPrint: true,
                    isReprinting: _reprintingDeliveryId == d.id,
                    onReprint: () => _reprintDelivery(d),
                    onCreateReceipt: d.canCreateReceipt ? () => _startReceiptFromDelivery(d) : null,
                  );
                },
                childCount: visible.length,
              ),
            ),
          ),
      ],
    );
  }

  Widget _receiptPhoneLayout(List<DeliveryReceipt> deliveries, List<Receipt> receipts) {
    final awaiting = deliveries.where((d) => d.canCreateReceipt).toList();
    final visible = _filterReceipts(receipts);
    final totals = ReceiptAmountTotals.fromReceipts(visible);
    final filtering = _rSearchCtrl.text.trim().isNotEmpty || !_rDateRange.isAll;

    return CustomScrollView(
      physics: _tabScrollPhysics,
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, EdSpacing.sm),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (awaiting.isNotEmpty)
                  PendingDeliveriesPanel(items: awaiting, onTap: (d) => _startReceiptFromDelivery(d)),
                CollapsibleFormPanel(
                  title: 'إرسال سند قبض',
                  subtitle: 'اضغط لفتح النموذج وإرسال سند للإدارة',
                  icon: Icons.receipt_long_rounded,
                  accent: AppColors.navy,
                  expanded: _rFormOpen,
                  onToggle: () => setState(() => _rFormOpen = !_rFormOpen),
                  child: _receiptFormCard(),
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, EdSpacing.sm),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ReceiptsDateRangeFilter(
                  controller: _rSearchCtrl,
                  dateRange: _rDateRange,
                  hintText: 'ابحث برقم السند أو اسم الزبون',
                  onDateRangeChanged: (range) => setState(() => _rDateRange = range),
                  onQueryChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 10),
                ReceiptAmountSummaryPanel(
                  totals: totals,
                  periodLabel: _rDateRange.label,
                ),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
          sliver: SliverToBoxAdapter(
            child: ReceiptsSectionHeader(
              title: 'سندات القبض',
              subtitle: filtering ? 'نتائج البحث ضمن ${_rDateRange.label}' : 'السندات المُرسلة للإدارة',
              count: visible.length,
              accent: AppColors.navy,
            ),
          ),
        ),
        if (visible.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: EmptyState(
                message: filtering
                    ? 'لا توجد نتائج مطابقة — جرّب "الكل" أو غيّر كلمة البحث'
                    : 'لا توجد سندات — أرسل سند قبض من النموذج أعلاه',
                icon: filtering ? Icons.search_off_rounded : Icons.receipt_long_outlined,
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, kPhoneBottomInset),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) => InternalReceiptCard(receipt: visible[index]),
                childCount: visible.length,
              ),
            ),
          ),
      ],
    );
  }

  Widget _deliveryTabBodyWide(List<DeliveryReceipt> deliveries) {
    final visible = _filterDeliveries(deliveries);
    return Padding(
      padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, 0),
      child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(flex: 5, child: SingleChildScrollView(child: _deliveryFormCard())),
        const SizedBox(width: 16),
        Expanded(
          flex: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ReceiptsHistoryFilter(
                controller: _drSearchCtrl,
                period: _drPeriod,
                onPeriodChanged: (p) => setState(() => _drPeriod = p),
                onQueryChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: EdSpacing.sm),
              ReceiptsSectionHeader(
                title: 'سجل وصول القبض',
                subtitle: 'جميع الوصولات المُصدَرة',
                count: visible.length,
                accent: AppColors.accentTeal,
              ),
              Expanded(
                child: visible.isEmpty
                    ? ListView(
                        physics: _tabScrollPhysics,
                        padding: const EdgeInsets.all(24),
                        children: const [
                          EmptyState(message: 'لا توجد نتائج مطابقة', icon: Icons.print_outlined),
                        ],
                      )
                    : ListView.builder(
                        physics: _tabScrollPhysics,
                        padding: const EdgeInsets.only(bottom: kPhoneBottomInset),
                        itemCount: visible.length,
                        itemBuilder: (context, index) {
                          final d = visible[index];
                          return DeliveryReceiptCard(
                            item: d,
                            showPrint: true,
                            isReprinting: _reprintingDeliveryId == d.id,
                            onReprint: () => _reprintDelivery(d),
                            onCreateReceipt: d.canCreateReceipt ? () => _startReceiptFromDelivery(d) : null,
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ],
      ),
    );
  }

  Widget _receiptTabBodyWide(List<DeliveryReceipt> deliveries, List<Receipt> receipts) {
    final awaiting = deliveries.where((d) => d.canCreateReceipt).toList();
    final visible = _filterReceipts(receipts);
    final totals = ReceiptAmountTotals.fromReceipts(visible);
    return Padding(
      padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, 0),
      child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (awaiting.isNotEmpty)
                  PendingDeliveriesPanel(items: awaiting, onTap: (d) => _startReceiptFromDelivery(d)),
                _receiptFormCard(),
              ],
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          flex: 6,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ReceiptsDateRangeFilter(
                controller: _rSearchCtrl,
                dateRange: _rDateRange,
                hintText: 'ابحث برقم السند أو اسم الزبون',
                onDateRangeChanged: (range) => setState(() => _rDateRange = range),
                onQueryChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: EdSpacing.sm),
              ReceiptAmountSummaryPanel(
                totals: totals,
                periodLabel: _rDateRange.label,
              ),
              const SizedBox(height: EdSpacing.sm),
              ReceiptsSectionHeader(
                title: 'سندات القبض',
                subtitle: 'السندات المُرسلة للإدارة',
                count: visible.length,
                accent: AppColors.navy,
              ),
              Expanded(
                child: visible.isEmpty
                    ? ListView(
                        physics: _tabScrollPhysics,
                        padding: const EdgeInsets.all(24),
                        children: const [
                          EmptyState(
                            message: 'لا توجد نتائج مطابقة',
                            icon: Icons.receipt_long_outlined,
                          ),
                        ],
                      )
                    : ListView.builder(
                        physics: _tabScrollPhysics,
                        padding: const EdgeInsets.only(bottom: kPhoneBottomInset),
                        itemCount: visible.length,
                        itemBuilder: (context, index) => InternalReceiptCard(receipt: visible[index]),
                      ),
              ),
            ],
          ),
        ),
      ],
      ),
    );
  }

  Widget _deliveryFormCard() {
    final c = _drPicked?.customer;
    return EdFormCard(
      key: const ValueKey('delivery_form'),
      title: 'إصدار وصل قبض',
      subtitle: 'يُطبع للزبون — يمكن إصدار عدة وصولات',
      icon: Icons.print_outlined,
      iconColor: AppColors.moduleReceipts,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (!kIsWeb && _printerStatus != null) ...[
            PrinterStatusBanner(
              status: _printerStatus!,
              onConfigure: _openPrinterSettings,
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
          EdLabeledField.integer(
            label: 'المبلغ المستلم',
            controller: _drAmountCtrl,
            hint: '0',
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
              onPressed: _openPrinterSettings,
              icon: const Icon(Icons.settings_bluetooth_rounded, size: 18),
              label: const Text('إعدادات الطابعة'),
            ),
          const SizedBox(height: EdSpacing.lg),
          EdSubmitButton(
            label: _drSubmitting ? 'جاري الإصدار...' : 'إصدار وصل القبض',
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
        ],
      ),
    );
  }

  Widget _receiptFormCard() {
    final c = _picked?.customer;
    final linkedCustomer = _linkedDelivery?.customerName ?? '';
    return EdFormCard(
      key: const ValueKey('receipt_form'),
      title: 'سند قبض للإدارة',
      subtitle: 'أرسل المبلغ المحصل للمراجعة والترحيل',
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
          EdLabeledField.integer(
            label: 'المبلغ',
            controller: _amountCtrl,
            hint: '0',
            prefixIcon: Icons.payments_outlined,
          ),
          const SizedBox(height: EdSpacing.md),
          Row(
            children: [
              Expanded(
                child: EdLabeledField.integer(
                  label: 'العمولة',
                  controller: _commissionCtrl,
                  hint: '0',
                ),
              ),
              const SizedBox(width: EdSpacing.md),
              Expanded(
                child: EdLabeledField.integer(
                  label: 'الحسم',
                  controller: _discountCtrl,
                  hint: '0',
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
}

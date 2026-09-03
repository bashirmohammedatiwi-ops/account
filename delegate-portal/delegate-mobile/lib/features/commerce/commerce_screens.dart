import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/delegate_api.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/ed_page_scroll.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'commerce_draft.dart';
import 'commerce_theme.dart';
import 'order_invoice_ui.dart';

final catalogBranchesProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCatalogBranches());
});

final catalogSectionsProvider = FutureProvider.family<List<CatalogSection>, int>((ref, branchId) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCatalogSections(branchId));
});

final catalogProductsProvider = FutureProvider.family<List<Product>, int>((ref, sectionId) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getProducts(sectionId));
});

class InvoiceDraftNotifier extends Notifier<Map<int, DraftLine>> {
  int? branchId;
  int? sectionId;
  String? branchName;
  String? sectionName;
  BranchAccount? customer;
  String notes = '';

  @override
  Map<int, DraftLine> build() => {};

  Future<void> load(int agentId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('delegateInvoice:$agentId');
    if (raw == null) return;
    final data = jsonDecode(raw) as Map<String, dynamic>;
    branchId = data['branchId'] as int?;
    sectionId = data['sectionId'] as int?;
    branchName = data['branchName'] as String?;
    sectionName = data['sectionName'] as String?;
    notes = data['notes'] as String? ?? '';
    final customerJson = data['customer'] as Map<String, dynamic>?;
    if (customerJson != null) {
      customer = BranchAccount.fromJson(customerJson);
    }
    final draft = data['draft'] as Map<String, dynamic>? ?? {};
    state = draft.map((k, v) {
      final m = v as Map<String, dynamic>;
      return MapEntry(int.parse(k), (
        quant: m['quant'] as num? ?? 0,
        bonus: m['bonus'] as num? ?? 0,
        tester: m['tester'] as num? ?? 0,
      ));
    });
  }

  Future<void> persist(int agentId) async {
    final prefs = await SharedPreferences.getInstance();
    final draft = state.map((k, v) => MapEntry('$k', {'quant': v.quant, 'bonus': v.bonus, 'tester': v.tester}));
    await prefs.setString('delegateInvoice:$agentId', jsonEncode({
      'branchId': branchId,
      'sectionId': sectionId,
      'branchName': branchName,
      'sectionName': sectionName,
      'notes': notes,
      'customer': customer == null
          ? null
          : {
              'seq': customer!.seq,
              'num': customer!.accountNum,
              'name1': customer!.name1,
              'name2': customer!.name2,
              'address': customer!.address,
              'bal': customer!.bal,
              if (customer!.requestId != null) 'requestId': customer!.requestId,
              if (customer!.isPending) 'isPending': true,
              if (customer!.pendingLabel != null) 'pendingLabel': customer!.pendingLabel,
            },
      'draft': draft,
    }));
  }

  void updateLine(int productId, {num? quant, num? bonus, num? tester}) {
    final cur = state[productId] ?? emptyDraftLine();
    final q = quant ?? cur.quant;
    final b = bonus ?? cur.bonus;
    final t = tester ?? cur.tester;
    if (q <= 0 && b <= 0 && t <= 0) {
      final next = {...state};
      next.remove(productId);
      state = next;
      return;
    }
    state = {...state, productId: (quant: q, bonus: b, tester: t)};
  }

  void adjustLine(int productId, {required String field, required int delta}) {
    final cur = state[productId] ?? emptyDraftLine();
    switch (field) {
      case 'bonus':
        updateLine(productId, bonus: (cur.bonus + delta).clamp(0, 999999));
      case 'tester':
        updateLine(productId, tester: (cur.tester + delta).clamp(0, 999999));
      default:
        updateLine(productId, quant: (cur.quant + delta).clamp(0, 999999));
    }
  }

  void clear() {
    state = {};
    customer = null;
    notes = '';
  }
}

final invoiceDraftProvider = NotifierProvider<InvoiceDraftNotifier, Map<int, DraftLine>>(InvoiceDraftNotifier.new);


class EdOrderInvoiceSheet extends ConsumerStatefulWidget {
  const EdOrderInvoiceSheet({super.key, required this.branchId, required this.products});

  final int branchId;
  final List<Product> products;

  @override
  ConsumerState<EdOrderInvoiceSheet> createState() => _EdOrderInvoiceSheetState();
}

class _EdOrderInvoiceSheetState extends ConsumerState<EdOrderInvoiceSheet> {
  bool _submitting = false;
  late TextEditingController _notesCtrl;

  @override
  void initState() {
    super.initState();
    _notesCtrl = TextEditingController(text: ref.read(invoiceDraftProvider.notifier).notes);
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _persist() async {
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) await ref.read(invoiceDraftProvider.notifier).persist(agentId);
  }

  Future<void> _pickCustomer() async {
    final branch = await pickBranchCustomer(context, ref);
    if (branch != null) {
      ref.read(invoiceDraftProvider.notifier).customer = branch;
      await _persist();
      if (mounted) setState(() {});
    }
  }

  void _adjustLine(int productId, {required String field, required int delta}) {
    ref.read(invoiceDraftProvider.notifier).adjustLine(productId, field: field, delta: delta);
    _persist();
    setState(() {});
  }

  Future<void> _clearDraft() async {
    ref.read(invoiceDraftProvider.notifier).clear();
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('delegateInvoice:$agentId');
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _submit() async {
    final draftNotifier = ref.read(invoiceDraftProvider.notifier);
    final customer = draftNotifier.customer;
    if (customer == null || (!customer.hasPostedAccount && customer.requestId == null)) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اختر الزبون أولاً')));
      return;
    }
    draftNotifier.notes = _notesCtrl.text;
    final draft = ref.read(invoiceDraftProvider);
    final lines = <OrderLine>[];
    for (final p in widget.products) {
      final d = draft[p.id];
      if (d == null || !draftLineActive(d)) continue;
      lines.add(OrderLine(
        productId: p.id,
        matName: p.name,
        quant: d.quant,
        bonus: d.bonus,
        tester: d.tester,
        unitPrice: p.price,
        barcode: p.barcode ?? p.skuNum,
      ));
    }
    if (lines.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).submitOrder(
            customerAccSeq: customer.hasPostedAccount ? customer.seq : null,
            customerRequestId: customer.requestId,
            catalogBranchId: widget.branchId,
            notes: draftNotifier.notes,
            lines: lines,
          );
      draftNotifier.clear();
      final agentId = ref.read(authProvider).agent?.id;
      if (agentId != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('delegateInvoice:$agentId');
      }
      ref.invalidate(ordersProvider);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال الطلب')));
        context.go('/orders');
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(invoiceDraftProvider);
    final draftNotifier = ref.read(invoiceDraftProvider.notifier);
    final customer = draftNotifier.customer;
    final lines = buildOrderInvoiceLines(widget.products, draft);
    final total = lines.fold<num>(0, (s, l) => s + l.lineTotal);
    final qtySum = lines.fold<num>(0, (s, l) => s + l.quant);
    final bonusSum = lines.fold<num>(0, (s, l) => s + l.bonus);
    final testerSum = lines.fold<num>(0, (s, l) => s + l.tester);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.55,
      maxChildSize: 0.96,
      builder: (_, scrollCtrl) => Material(
        color: EdCommerceTheme.pageBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EdOrderInvoiceSheetHeader(onClose: () => Navigator.pop(context)),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  EdOrderInvoiceCustomerBar(customer: customer, onPick: _pickCustomer),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 2,
                    onChanged: (v) {
                      draftNotifier.notes = v;
                      _persist();
                    },
                    decoration: InputDecoration(
                      labelText: 'ملاحظات',
                      hintText: 'ملاحظات للإدارة (اختياري)...',
                      filled: true,
                      fillColor: EdCommerceTheme.card,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  EdOrderInvoiceDocPanel(
                    title: 'فاتورة طلب مندوب',
                    docNum: 'مسودة',
                    dateLabel: fmtDate(isoToday()),
                    customerName: customer?.name1 ?? '—',
                    customerNum: customer?.accountNum,
                    branchName: draftNotifier.branchName,
                    remarks: _notesCtrl.text.trim(),
                    lineCount: lines.length,
                    qtySum: qtySum,
                    bonusSum: bonusSum,
                    testerSum: testerSum,
                    total: total,
                  ),
                  const SizedBox(height: 16),
                  EdOrderInvoiceLinesSection(lines: lines, editable: true, onAdjust: _adjustLine),
                ],
              ),
            ),
            EdOrderInvoiceSheetFooter(
              total: total,
              lineCount: lines.length,
              submitting: _submitting,
              onClear: _clearDraft,
              onSubmit: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

final orderDetailProvider = FutureProvider.family<Order, int>((ref, id) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getOrder(id));
});

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  String _filter = 'all';

  bool _matchesFilter(Order o) {
    if (_filter == 'all') return true;
    if (_filter == 'active') {
      return o.status == 'submitted' || o.status == 'under_review' || o.status == 'pending' || o.status == 'processing' || o.status == 'approved';
    }
    if (_filter == 'done') {
      return o.status == 'delivered' || o.status == 'rejected' || o.status == 'cancelled';
    }
    return o.status == _filter;
  }

  @override
  Widget build(BuildContext context) {
    final ordersAsync = ref.watch(ordersProvider);
    return AppPage(
      title: 'طلباتي',
      kicker: 'الطلبات',
      subtitle: 'متابعة حالة الطلبات',
      showBack: true,
      onBack: () => context.go('/home'),
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(ordersProvider)),
      ],
      toolbar: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _filterChip('الكل', 'all'),
              _filterChip('نشطة', 'active'),
              _filterChip('مُرسلة', 'submitted'),
              _filterChip('مُسلّمة', 'delivered'),
              _filterChip('مرفوضة', 'rejected'),
            ],
          ),
        ),
      ),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: ordersAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الطلبات...'),
          error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(ordersProvider)),
          data: (orders) {
            final filtered = orders.where(_matchesFilter).toList();
            if (filtered.isEmpty) {
              return EmptyState(message: orders.isEmpty ? 'لا توجد طلبات' : 'لا توجد طلبات بهذا التصفية', icon: Icons.receipt_long_outlined);
            }
            return RefreshIndicator(
              color: AppColors.navy,
              onRefresh: () async => ref.invalidate(ordersProvider),
              child: ListView.separated(
                primary: false,
                physics: edPageScrollPhysics,
                padding: EdgeInsets.fromLTRB(16, 8, 16, EdPageInsets.bottom(context)),
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final o = filtered[i];
                  return EdOrderCard(
                    id: o.id,
                    customer: o.customerName ?? '—',
                    date: fmtDate(o.createdAt),
                    amount: fmtMoney(o.totalAmount),
                    statusLabel: displayOrderStatusLabel(status: o.status, statusLabel: o.statusLabel),
                    statusColor: AppTheme.orderStatusColor(o.status),
                    onTap: () => context.go('/orders/${o.id}'),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _filterChip(String label, String value) {
    final active = _filter == value;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: () => setState(() => _filter = value),
          borderRadius: BorderRadius.circular(999),
          child: Ink(
            decoration: BoxDecoration(
              color: active ? AppColors.navy : AppColors.surface,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: active ? AppColors.navy : AppColors.borderLight),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Text(
              label,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: active ? Colors.white : AppColors.textSecondary),
            ),
          ),
        ),
      ),
    );
  }
}

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.id});
  final int id;

  static const _cancellable = {'submitted', 'under_review', 'pending', 'processing'};
  static const _deletable = {'draft', 'cancelled', 'rejected'};

  Future<void> _deleteOrder(BuildContext context, WidgetRef ref, Order order) async {
    final cancellable = _cancellable.contains(order.status);
    final deletable = _deletable.contains(order.status);
    if (!cancellable && !deletable) return;

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(cancellable ? 'إلغاء الطلب' : 'حذف الطلب'),
        content: Text(cancellable ? 'سيتم إلغاء الطلب ورفضه. هل تريد المتابعة؟' : 'هل تريد حذف هذا الطلب نهائياً؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('لا')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(cancellable ? 'إلغاء' : 'حذف')),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await ref.read(apiClientProvider).deleteOrder(order.id);
      ref.invalidate(ordersProvider);
      ref.invalidate(orderDetailProvider(order.id));
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(cancellable ? 'تم إلغاء الطلب' : 'تم حذف الطلب'), backgroundColor: AppColors.success),
      );
      context.go('/orders');
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e is ApiException ? e.message : '$e'), backgroundColor: AppColors.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(id));

    return AppPage(
      title: 'تفاصيل الطلب',
      kicker: 'الطلبات',
      subtitle: '#$id',
      showBack: true,
      onBack: () => context.pop(),
      actions: orderAsync.maybeWhen(
        data: (order) {
          final canAct = _cancellable.contains(order.status) || _deletable.contains(order.status);
          if (!canAct) return null;
          return [
            EdHeaderIconButton(
              icon: Icons.delete_outline_rounded,
              tooltip: _cancellable.contains(order.status) ? 'إلغاء الطلب' : 'حذف الطلب',
              onPressed: () => _deleteOrder(context, ref, order),
            ),
          ];
        },
        orElse: () => null,
      ),
      child: OrderDetailBody(id: id),
    );
  }
}

class OrderDetailBody extends ConsumerWidget {
  const OrderDetailBody({super.key, required this.id});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(id));

    return ColoredBox(
      color: EdCommerceTheme.pageBg,
      child: orderAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(orderDetailProvider(id))),
        data: (order) {
          return EdOrderInvoiceDetailView(
            order: order,
            statusLabel: displayOrderStatusLabel(status: order.status, statusLabel: order.statusLabel),
            statusColor: AppTheme.orderStatusColor(order.status),
          );
        },
      ),
    );
  }
}

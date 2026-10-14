import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/offline/sync_center.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/ed_kit.dart';
import '../../models/models.dart';

/// بيانات الصفحة الرئيسية — مجمّعة من المزوّدات.
class HomeData {
  const HomeData({
    required this.agentName,
    required this.roleLabel,
    required this.isSecondary,
    required this.hasTeam,
    required this.trees,
    required this.orders,
    required this.receipts,
    required this.deliveries,
    required this.customerRequests,
    required this.promoVisits,
    required this.teamPendingHandover,
  });

  final String agentName;
  final String roleLabel;
  final bool isSecondary;
  final bool hasTeam;
  final AsyncValue<List<AccountTree>> trees;
  final AsyncValue<List<Order>> orders;
  final AsyncValue<List<Receipt>> receipts;
  final AsyncValue<List<DeliveryReceipt>> deliveries;
  final AsyncValue<List<CustomerRequest>> customerRequests;
  final AsyncValue<List<PromotionalVisit>> promoVisits;
  final int teamPendingHandover;

  List<DeliveryReceipt> get _deliveries => deliveries.valueOrNull ?? const [];
  List<Receipt> get _receipts => receipts.valueOrNull ?? const [];
  List<Order> get _orders => orders.valueOrNull ?? const [];

  List<DeliveryReceipt> get todayDeliveries =>
      _deliveries.where((d) => isTodayDate(d.receiptDate ?? d.createdAt)).toList();

  num get todayCollected => todayDeliveries.fold<num>(0, (s, d) => s + d.amount);

  List<DeliveryReceipt> get awaiting => isSecondary
      ? _deliveries.where((d) => d.status == 'issued' && !d.handoverReceived).toList()
      : _deliveries.where((d) => d.canCreateReceipt).toList();

  List<Receipt> get inReview => _receipts.where((r) => r.status == 'pending' || r.status == 'reviewed').toList();

  List<Order> get pendingOrders => _orders.where((o) => _isPendingOrder(o.status)).toList();

  int get customerCount => (trees.valueOrNull ?? const []).fold<int>(0, (s, t) => s + t.directChildren);

  int get pendingCustomers =>
      (customerRequests.valueOrNull ?? const []).where((r) => r.status == 'pending' || r.status == 'reviewed').length;

  int get pendingVisits => (promoVisits.valueOrNull ?? const []).where((v) => v.status == 'pending').length;

  static bool _isPendingOrder(String status) {
    final s = status.toLowerCase();
    return s == 'pending' || s == 'submitted' || s == 'under_review' || s == 'draft';
  }
}

/// هل التاريخ (نص ISO/SQL) هو اليوم؟
bool isTodayDate(String? raw) {
  if (raw == null || raw.trim().isEmpty) return false;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(raw.trim());
  if (m == null) return false;
  final now = DateTime.now();
  return int.parse(m.group(1)!) == now.year && int.parse(m.group(2)!) == now.month && int.parse(m.group(3)!) == now.day;
}

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء النور';
}

String _todayLabel() {
  const days = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];
  final n = DateTime.now();
  return '${days[n.weekday - 1]} ${n.day} ${arMonths[n.month - 1]}';
}

class HomeView extends StatelessWidget {
  const HomeView({
    super.key,
    required this.data,
    required this.onRefresh,
    required this.onNavigate,
    required this.onSettings,
  });

  final HomeData data;
  final Future<void> Function() onRefresh;
  final ValueChanged<String> onNavigate;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final top = MediaQuery.paddingOf(context).top;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: RefreshIndicator(
        onRefresh: onRefresh,
        edgeOffset: top,
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            SliverToBoxAdapter(child: SizedBox(height: top)),
            const SliverToBoxAdapter(child: OfflineStrip()),
            SliverToBoxAdapter(
              child: EdContent(
                child: Padding(
                  padding: EdgeInsets.only(top: layout.isPhone ? 16 : 24, bottom: 32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _Header(data: data, onRefresh: onRefresh, onSettings: layout.isPhone ? onSettings : null),
                      const SizedBox(height: 20),
                      _KpiGrid(data: data, onNavigate: onNavigate),
                      const SizedBox(height: 28),
                      const EdSectionTitle(title: 'إجراءات سريعة'),
                      _ActionsGrid(data: data, onNavigate: onNavigate),
                      const SizedBox(height: 28),
                      _RecentSection(data: data, onNavigate: onNavigate),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.data, required this.onRefresh, this.onSettings});

  final HomeData data;
  final Future<void> Function() onRefresh;
  final VoidCallback? onSettings;

  @override
  Widget build(BuildContext context) {
    final phone = EdLayout.of(context).isPhone;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${_greeting()}،',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
              Text(
                data.agentName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: phone ? 24 : 28, fontWeight: FontWeight.w800, color: AppColors.text, height: 1.25),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(_todayLabel(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                  if (data.roleLabel.isNotEmpty) EdPill(label: data.roleLabel, color: data.isSecondary ? AppColors.warning : AppColors.primary),
                  if (phone) const SyncStatusChip(dense: true),
                ],
              ),
            ],
          ),
        ),
        if (!phone) ...[
          const SyncStatusChip(),
          const SizedBox(width: 8),
        ],
        IconButton.outlined(
          tooltip: 'تحديث',
          onPressed: onRefresh,
          style: IconButton.styleFrom(side: const BorderSide(color: AppColors.border), backgroundColor: AppColors.surface),
          icon: const Icon(Icons.refresh_rounded, color: AppColors.textSecondary),
        ),
        if (onSettings != null) ...[
          const SizedBox(width: 6),
          IconButton.outlined(
            tooltip: 'الإعدادات',
            onPressed: onSettings,
            style: IconButton.styleFrom(side: const BorderSide(color: AppColors.border), backgroundColor: AppColors.surface),
            icon: const Icon(Icons.settings_outlined, color: AppColors.textSecondary),
          ),
        ],
      ],
    );
  }
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({required this.data, required this.onNavigate});

  final HomeData data;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    final deliveriesLoading = !data.deliveries.hasValue;
    final today = data.todayDeliveries;
    final awaiting = data.awaiting;
    final inReview = data.inReview;
    final pendingOrders = data.pendingOrders;

    return EdResponsiveGrid(
      minItemWidth: 150,
      maxColumns: 4,
      children: [
        EdKpiCard(
          label: 'تحصيل اليوم',
          value: fmtMoney(data.todayCollected),
          caption: today.isEmpty ? 'لا توجد وصولات اليوم' : '${today.length} وصل قبض · د.ع',
          icon: Icons.payments_outlined,
          color: AppColors.success,
          loading: deliveriesLoading,
          onTap: () => onNavigate('/receipts'),
        ),
        EdKpiCard(
          label: data.isSecondary ? 'بانتظار التسليم' : 'بانتظار سند قبض',
          value: '${awaiting.length}',
          caption: awaiting.isEmpty ? 'لا يوجد' : '${fmtMoney(awaiting.fold<num>(0, (s, d) => s + d.amount))} د.ع',
          icon: Icons.pending_actions_outlined,
          color: AppColors.warning,
          loading: deliveriesLoading,
          onTap: () => onNavigate('/receipts'),
        ),
        if (data.isSecondary)
          EdKpiCard(
            label: 'الزبائن',
            value: fmtNumAlways(data.customerCount),
            caption: '${data.trees.valueOrNull?.length ?? 0} شجرة',
            icon: Icons.people_alt_outlined,
            color: AppColors.moduleAccounts,
            loading: !data.trees.hasValue,
            onTap: () => onNavigate('/accounts'),
          )
        else
          EdKpiCard(
            label: 'سندات قيد المراجعة',
            value: '${inReview.length}',
            caption: inReview.isEmpty ? 'لا يوجد' : '${fmtMoney(inReview.fold<num>(0, (s, r) => s + r.amount))} د.ع',
            icon: Icons.fact_check_outlined,
            color: AppColors.primary,
            loading: !data.receipts.hasValue,
            onTap: () => onNavigate('/receipts'),
          ),
        EdKpiCard(
          label: 'طلبات قيد الانتظار',
          value: '${pendingOrders.length}',
          caption: 'من ${data.orders.valueOrNull?.length ?? 0} طلب',
          icon: Icons.shopping_bag_outlined,
          color: AppColors.moduleOrders,
          loading: !data.orders.hasValue,
          onTap: () => onNavigate('/orders'),
        ),
      ],
    );
  }
}

class _ActionsGrid extends StatelessWidget {
  const _ActionsGrid({required this.data, required this.onNavigate});

  final HomeData data;
  final ValueChanged<String> onNavigate;

  String? _badge(int n) => n > 0 ? '$n' : null;

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[
      EdActionTile(
        prominent: true,
        icon: Icons.receipt_long_rounded,
        title: data.isSecondary ? 'إصدار وصل قبض' : 'وصل / سند قبض',
        subtitle: 'تحصيل من زبون',
        color: AppColors.primary,
        badge: _badge(data.awaiting.length),
        onTap: () => onNavigate('/receipts'),
      ),
      EdActionTile(
        icon: Icons.add_shopping_cart_rounded,
        title: 'طلب جديد',
        subtitle: 'المنتجات والفاتورة',
        color: AppColors.moduleShop,
        onTap: () => onNavigate('/shop'),
      ),
      EdActionTile(
        icon: Icons.menu_book_rounded,
        title: 'كشوف الحساب',
        subtitle: data.trees.hasValue ? '${fmtNumAlways(data.customerCount)} زبون' : 'الزبائن والأرصدة',
        color: AppColors.moduleAccounts,
        onTap: () => onNavigate('/accounts'),
      ),
      EdActionTile(
        icon: Icons.shopping_bag_rounded,
        title: 'طلباتي',
        subtitle: 'متابعة الطلبات',
        color: AppColors.moduleOrders,
        badge: _badge(data.pendingOrders.length),
        onTap: () => onNavigate('/orders'),
      ),
      EdActionTile(
        icon: Icons.person_add_alt_1_rounded,
        title: 'زبون جديد',
        subtitle: 'يُراجع ثم يُرحّل',
        color: AppColors.moduleCustomers,
        badge: _badge(data.pendingCustomers),
        onTap: () => onNavigate('/customers'),
      ),
      EdActionTile(
        icon: Icons.campaign_rounded,
        title: 'زيارات ترويجية',
        subtitle: 'زيارة محل بعد الترويج',
        color: AppColors.modulePromo,
        badge: _badge(data.pendingVisits),
        onTap: () => onNavigate('/promotional-visits'),
      ),
      if (data.hasTeam)
        EdActionTile(
          icon: Icons.groups_rounded,
          title: 'متابعة الفريق',
          subtitle: 'المندوبون الثانويون',
          color: AppColors.accentBlue,
          badge: _badge(data.teamPendingHandover),
          onTap: () => onNavigate('/team'),
        ),
      EdActionTile(
        icon: Icons.insights_rounded,
        title: 'التقارير',
        subtitle: 'مبيعات الفترة',
        color: AppColors.moduleReports,
        onTap: () => onNavigate('/reports'),
      ),
    ];
    return EdResponsiveGrid(minItemWidth: EdLayout.of(context).isPhone ? 150 : 200, maxColumns: 4, children: tiles);
  }
}

class _RecentSection extends StatelessWidget {
  const _RecentSection({required this.data, required this.onNavigate});

  final HomeData data;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    final deliveries = [...(data.deliveries.valueOrNull ?? const <DeliveryReceipt>[])]
      ..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
    final orders = [...(data.orders.valueOrNull ?? const <Order>[])]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    final deliveriesCol = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        EdSectionTitle(title: 'آخر وصولات القبض', action: 'عرض الكل', onAction: () => onNavigate('/receipts')),
        EdListCard(
          emptyText: data.deliveries.hasValue ? 'لا توجد وصولات بعد' : 'جاري التحميل…',
          children: [
            for (final d in deliveries.take(6))
              EdListRow(
                icon: Icons.receipt_rounded,
                iconColor: AppColors.moduleReceipts,
                title: (d.customerName ?? '').trim().isEmpty ? 'وصل ${d.deliveryNo}' : d.customerName!,
                subtitle: '${d.deliveryNo} · ${fmtDate(d.receiptDate ?? d.createdAt)}',
                trailingValue: fmtMoney(d.amount),
                pill: _deliveryPill(d),
                onTap: () => onNavigate('/receipts'),
              ),
          ],
        ),
      ],
    );

    final ordersCol = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        EdSectionTitle(title: 'أحدث الطلبات', action: 'عرض الكل', onAction: () => onNavigate('/orders')),
        EdListCard(
          emptyText: data.orders.hasValue ? 'لا توجد طلبات بعد' : 'جاري التحميل…',
          children: [
            for (final o in orders.take(6))
              EdListRow(
                icon: Icons.shopping_bag_outlined,
                iconColor: AppColors.moduleOrders,
                title: (o.customerName ?? '').trim().isEmpty ? 'طلب #${o.id}' : o.customerName!,
                subtitle: '${o.catalogBranchName ?? 'طلب'} · ${fmtDate(o.createdAt)}',
                trailingValue: o.totalAmount != null ? fmtMoney(o.totalAmount) : null,
                pill: EdPill(
                  label: displayOrderStatusLabel(status: o.status, statusLabel: o.statusLabel),
                  color: AppTheme.orderStatusColor(o.status),
                ),
                onTap: () => onNavigate(o.id > 0 ? '/orders/${o.id}' : '/orders'),
              ),
          ],
        ),
      ],
    );

    return LayoutBuilder(
      builder: (context, c) {
        if (c.maxWidth >= 760) {
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: deliveriesCol),
              const SizedBox(width: 16),
              Expanded(child: ordersCol),
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [deliveriesCol, const SizedBox(height: 24), ordersCol],
        );
      },
    );
  }

  Widget _deliveryPill(DeliveryReceipt d) {
    if (d.id < 0) return const EdPill(label: 'بانتظار الإرسال', color: AppColors.warning, icon: Icons.schedule_rounded);
    if (d.receiptId != null || d.status == 'linked') {
      return const EdPill(label: 'مرتبط بسند', color: AppColors.success);
    }
    if (data.isSecondary) {
      return d.handoverReceived
          ? const EdPill(label: 'تم التسليم', color: AppColors.success)
          : const EdPill(label: 'بانتظار التسليم', color: AppColors.warning);
    }
    return EdPill(label: d.statusLabel.isEmpty ? 'مُصدَر' : d.statusLabel, color: AppColors.primary);
  }
}

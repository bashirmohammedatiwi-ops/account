import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/app_widgets.dart';
import 'orders_providers.dart';

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      if (ref.read(authProvider).isAuthenticated) {
        await ref.read(notificationServiceProvider).start();
      }
    });
    _searchCtrl.addListener(() {
      ref.read(ordersSearchProvider.notifier).state = _searchCtrl.text;
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(ordersListProvider);
    ref.invalidate(pendingCountProvider);
    ref.invalidate(orderStatsProvider);
    await ref.read(ordersListProvider.future);
    await ref.read(notificationServiceProvider).poll(seed: true);
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(ordersFilterProvider);
    final sourceFilter = ref.watch(ordersSourceFilterProvider);
    final searchQuery = ref.watch(ordersSearchProvider);
    final ordersAsync = ref.watch(ordersListProvider);
    final employee = ref.watch(authProvider).employee;
    final statsAsync = ref.watch(orderStatsProvider);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: themed(context, light: AppColors.bg, dark: AppColors.bgDark),
        body: Column(
          children: [
            GradientHeader(
              title: employee?.name ?? 'موظف التجهيز',
              subtitle: 'إدارة طلبات الشراء والتجهيز',
              trailing: IconButton(
                onPressed: _refresh,
                icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                tooltip: 'تحديث',
              ),
              bottom: statsAsync.when(
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (stats) => Row(
                  children: [
                    _HeaderStat(label: 'انتظار', value: '${stats.pending}', color: AppColors.pending),
                    const SizedBox(width: 10),
                    _HeaderStat(label: 'مجهّز', value: '${stats.processing}', color: AppColors.processing),
                    const SizedBox(width: 10),
                    _HeaderStat(label: 'اليوم', value: '${stats.todaySubmitted}', color: Colors.white),
                  ],
                ),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _refresh,
                color: AppColors.primary,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                        child: TextField(
                          controller: _searchCtrl,
                          decoration: InputDecoration(
                            hintText: 'بحث برقم الطلب، الزبون، الفرع…',
                            prefixIcon: const Icon(Icons.search_rounded),
                            suffixIcon: searchQuery.isNotEmpty
                                ? IconButton(
                                    onPressed: () {
                                      _searchCtrl.clear();
                                      ref.read(ordersSearchProvider.notifier).state = '';
                                    },
                                    icon: const Icon(Icons.close_rounded),
                                  )
                                : null,
                          ),
                        ),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            _FilterPill(
                              label: 'كل المصادر',
                              icon: Icons.layers_rounded,
                              selected: sourceFilter.isEmpty,
                              color: AppColors.primary,
                              onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = '',
                            ),
                            _FilterPill(
                              label: 'شورجة',
                              icon: Icons.storefront_rounded,
                              selected: sourceFilter == 'shorja',
                              color: AppColors.shorja,
                              onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'shorja',
                            ),
                            _FilterPill(
                              label: 'مندوبين',
                              icon: Icons.local_shipping_outlined,
                              selected: sourceFilter == 'delegate',
                              color: AppColors.accent,
                              onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'delegate',
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SliverToBoxAdapter(child: SizedBox(height: 10)),
                    SliverToBoxAdapter(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Row(
                          children: [
                            _FilterPill(
                              label: 'قيد الانتظار',
                              icon: Icons.schedule_rounded,
                              selected: filter == 'pending',
                              color: AppColors.pending,
                              onTap: () => ref.read(ordersFilterProvider.notifier).state = 'pending',
                            ),
                            _FilterPill(
                              label: 'تم التجهيز',
                              icon: Icons.check_circle_outline_rounded,
                              selected: filter == 'processing',
                              color: AppColors.processing,
                              onTap: () => ref.read(ordersFilterProvider.notifier).state = 'processing',
                            ),
                            _FilterPill(
                              label: 'مرفوض',
                              icon: Icons.cancel_outlined,
                              selected: filter == 'rejected',
                              color: AppColors.rejected,
                              onTap: () => ref.read(ordersFilterProvider.notifier).state = 'rejected',
                            ),
                            _FilterPill(
                              label: 'الكل',
                              icon: Icons.all_inbox_rounded,
                              selected: filter.isEmpty,
                              color: AppColors.muted,
                              onTap: () => ref.read(ordersFilterProvider.notifier).state = '',
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SliverToBoxAdapter(child: SizedBox(height: 12)),
                    ordersAsync.when(
                      loading: () => const SliverFillRemaining(child: OrdersListShimmer()),
                      error: (e, _) => SliverFillRemaining(
                        child: EmptyState(
                          icon: Icons.cloud_off_rounded,
                          title: 'تعذّر تحميل الطلبات',
                          subtitle: e is ApiException ? e.message : 'تحقق من الاتصال بالخادم',
                          action: FilledButton.icon(
                            onPressed: _refresh,
                            icon: const Icon(Icons.refresh_rounded),
                            label: const Text('إعادة المحاولة'),
                          ),
                        ),
                      ),
                      data: (orders) {
                        if (orders.isEmpty) {
                          return const SliverFillRemaining(
                            child: EmptyState(
                              icon: Icons.inbox_rounded,
                              title: 'لا توجد طلبات',
                              subtitle: 'ستظهر الطلبات الجديدة هنا فور وصولها',
                            ),
                          );
                        }
                        return SliverPadding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                          sliver: SliverList.separated(
                            itemCount: orders.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 12),
                            itemBuilder: (context, i) => Hero(
                        tag: 'order-${orders[i].id}',
                        child: Material(
                          color: Colors.transparent,
                          child: _OrderCard(order: orders[i]),
                        ),
                      ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeaderStat extends StatelessWidget {
  const _HeaderStat({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(color: color, fontSize: 20, fontWeight: FontWeight.w900)),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 11, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.icon,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: Material(
        color: selected ? color.withValues(alpha: isDark(context) ? 0.25 : 0.12) : surface,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: selected ? color.withValues(alpha: 0.5) : themed(context, light: AppColors.border, dark: AppColors.borderDark)),
            ),
            child: Row(
              children: [
                Icon(icon, size: 16, color: selected ? color : themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                const SizedBox(width: 6),
                Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: selected ? color : themed(context, light: AppColors.text, dark: AppColors.textDark))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final PurchaseOrder order;

  @override
  Widget build(BuildContext context) {
    final giftCount = order.lines.fold<num>(0, (s, l) => s + l.bonus);
    final testerCount = order.lines.fold<num>(0, (s, l) => s + l.tester);
    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);

    return Material(
      color: themed(context, light: AppColors.surface, dark: AppColors.surfaceDark),
      elevation: 0,
      shadowColor: AppColors.shadow,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppColors.radius),
        onTap: () => context.push('/orders/${order.id}'),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: border),
            boxShadow: isDark(context) ? null : [BoxShadow(color: AppColors.shadow, blurRadius: 16, offset: const Offset(0, 6))],
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17)),
                    ),
                    SourceBadge(isShorja: order.isShorja),
                    const SizedBox(width: 8),
                    StatusBadge(status: order.status, compact: true),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Icon(Icons.person_outline_rounded, size: 16, color: muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(order.customerName ?? 'بدون زبون', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  order.isShorja
                      ? '${order.shorjaBranchName ?? 'فرع الشورجة'}${order.shorjaInvoiceNo != null && order.shorjaInvoiceNo!.isNotEmpty ? ' · فاتورة ${order.shorjaInvoiceNo}' : ''}'
                      : '${order.agentName ?? '—'}${order.catalogBranchName != null ? ' · ${order.catalogBranchName}' : ''}',
                  style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _MiniStat(icon: Icons.inventory_2_outlined, label: '${order.lines.length} بند'),
                    const SizedBox(width: 12),
                    _MiniStat(icon: Icons.payments_outlined, label: '${formatMoney(order.totalAmount)} د.ع'),
                    if (giftCount > 0) ...[
                      const SizedBox(width: 12),
                      _MiniStat(icon: Icons.card_giftcard_rounded, label: '$giftCount هدية', color: AppColors.gift),
                    ],
                    if (testerCount > 0) ...[
                      const SizedBox(width: 12),
                      _MiniStat(icon: Icons.science_outlined, label: '$testerCount تيستر', color: AppColors.tester),
                    ],
                    const Spacer(),
                    Text(formatTimeAgo(order.submittedAt), style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w600)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: c),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c)),
      ],
    );
  }
}

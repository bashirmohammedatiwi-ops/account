import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/app_widgets.dart';
import 'order_card.dart';
import 'orders_providers.dart';
import 'orders_top_section.dart';

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
    final searchQuery = ref.watch(ordersSearchProvider);
    final ordersAsync = ref.watch(ordersListProvider);
    final employee = ref.watch(authProvider).employee;
    final statsAsync = ref.watch(orderStatsProvider);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: themed(context, light: AppColors.bg, dark: AppColors.bgDark),
        body: RefreshIndicator(
          onRefresh: _refresh,
          color: AppColors.primary,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(
                child: OrdersTopSection(
                  employeeName: employee?.name ?? 'موظف التجهيز',
                  searchController: _searchCtrl,
                  searchQuery: searchQuery,
                  stats: statsAsync.maybeWhen(data: (s) => s, orElse: () => null),
                  onRefresh: _refresh,
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 4)),
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
                      hasScrollBody: false,
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
                          child: OrderCard(
                            order: orders[i],
                            onChanged: _refresh,
                          ),
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
    );
  }
}

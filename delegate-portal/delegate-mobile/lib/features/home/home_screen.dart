import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/api/delegate_api.dart';
import '../receipts/receipts_hub.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import 'home_ui.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agent = ref.watch(authProvider).agent;
    final treesAsync = ref.watch(treesProvider);
    final ordersAsync = ref.watch(ordersProvider);
    final receiptsAsync = ref.watch(receiptsListProvider);
    final customersAsync = ref.watch(customerRequestsListProvider);
    final promoVisitsAsync = ref.watch(promotionalVisitsListProvider);
    final layout = EdLayout.of(context);

    final treeCount = treesAsync.maybeWhen(data: (t) => '${t.length}', orElse: () => '—');
    final customerCount = treesAsync.maybeWhen(
      data: (trees) => fmtNumAlways(trees.fold<int>(0, (s, t) => s + t.directChildren)),
      orElse: () => '—',
    );
    final orderCount = ordersAsync.maybeWhen(data: (o) => '${o.length}', orElse: () => '—');
    final pendingReceipts = receiptsAsync.maybeWhen(
      data: (list) => '${list.where((r) => r.status == 'pending' || r.status == 'reviewed').length}',
      orElse: () => null,
    );
    final pendingCustomers = customersAsync.maybeWhen(
      data: (list) => '${list.where((r) => r.status == 'pending' || r.status == 'reviewed').length}',
      orElse: () => null,
    );
    final pendingPromoVisits = promoVisitsAsync.maybeWhen(
      data: (list) => '${list.where((v) => v.status == 'pending').length}',
      orElse: () => null,
    );
    final agentName = agent?.name ?? 'مندوب';

    Future<void> refresh() async {
      ref.invalidate(treesProvider);
      ref.invalidate(ordersProvider);
      ref.invalidate(receiptsListProvider);
      ref.invalidate(customerRequestsListProvider);
      ref.invalidate(promotionalVisitsListProvider);
    }

    final apps = [
      EdHomeApp(
        icon: Icons.menu_book_rounded,
        name: 'كشوف الحساب',
        hint: 'الشجرات والزبائن',
        iconColor: AppColors.moduleAccounts,
        iconBg: EdHomeThemes.accountsBg,
        badge: treeCount,
        category: 'الحسابات والتقارير',
        onTap: () => context.go('/accounts'),
      ),
      EdHomeApp(
        icon: Icons.bar_chart_rounded,
        name: 'تقارير',
        hint: 'مبيعات الفترة',
        iconColor: AppColors.moduleReports,
        iconBg: EdHomeThemes.reportsBg,
        category: 'الحسابات والتقارير',
        onTap: () => context.go('/reports'),
      ),
      EdHomeApp(
        icon: Icons.inventory_2_outlined,
        name: 'المنتجات',
        hint: 'فاتورة · طلبات',
        iconColor: AppColors.moduleShop,
        iconBg: EdHomeThemes.shopBg,
        category: 'التجارة والطلبات',
        onTap: () => context.go('/shop'),
      ),
      EdHomeApp(
        icon: Icons.shopping_bag_outlined,
        name: 'طلباتي',
        hint: 'متابعة الطلبات',
        iconColor: AppColors.moduleOrders,
        iconBg: EdHomeThemes.ordersBg,
        badge: orderCount,
        category: 'التجارة والطلبات',
        onTap: () => context.go('/orders'),
      ),
      EdHomeApp(
        icon: Icons.receipt_long_rounded,
        name: 'سند قبض',
        hint: 'تحصيل من الزبون',
        iconColor: AppColors.moduleReceipts,
        iconBg: EdHomeThemes.receiptsBg,
        badge: pendingReceipts,
        category: 'الميدان والزبائن',
        onTap: () => context.go('/receipts'),
      ),
      EdHomeApp(
        icon: Icons.person_add_alt_1_rounded,
        name: 'زبون جديد',
        hint: 'يُراجع ثم يُرحَّل',
        iconColor: AppColors.moduleCustomers,
        iconBg: EdHomeThemes.customersBg,
        badge: pendingCustomers,
        category: 'الميدان والزبائن',
        onTap: () => context.go('/customers'),
      ),
      EdHomeApp(
        icon: Icons.campaign_rounded,
        name: 'الزيادات الترويجية',
        hint: 'زيارة المحل بعد الترويج',
        iconColor: AppColors.modulePromo,
        iconBg: EdHomeThemes.promoBg,
        badge: pendingPromoVisits,
        category: 'الميدان والزبائن',
        onTap: () => context.go('/promotional-visits'),
      ),
    ];

    return RefreshIndicator(
      color: AppColors.accentTeal,
      backgroundColor: AppColors.surface,
      onRefresh: refresh,
      child: EdHomePage(
        agentName: agentName,
        avatarText: agent?.name,
        apps: apps,
        treeCount: treeCount,
        customerCount: customerCount,
        orderCount: orderCount,
        pendingReceipts: pendingReceipts,
        pendingCustomers: pendingCustomers,
        pendingPromoVisits: pendingPromoVisits,
        onRefresh: refresh,
        onSettings: () => context.push('/settings'),
        onLogout: layout.isPhone
            ? null
            : () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
      ),
    );
  }
}

final treesProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getTrees());
});

final ordersProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getOrders());
});

final customerRequestsListProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCustomerRequests());
});

final promotionalVisitsListProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getPromotionalVisits());
});

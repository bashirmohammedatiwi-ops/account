import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
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
    final agentName = agent?.name ?? 'مندوب';

    Future<void> refresh() async {
      ref.invalidate(treesProvider);
      ref.invalidate(ordersProvider);
      ref.invalidate(receiptsListProvider);
      ref.invalidate(customerRequestsListProvider);
    }

    final apps = [
      EdHomeApp(
        icon: Icons.menu_book_rounded,
        name: 'كشوف الحساب',
        hint: 'الشجرات والزبائن',
        iconColor: AppColors.moduleAccounts,
        iconBg: EdHomeThemes.accountsBg,
        badge: treeCount,
        onTap: () => context.go('/accounts'),
      ),
      EdHomeApp(
        icon: Icons.inventory_2_outlined,
        name: 'المنتجات',
        hint: 'فاتورة · طلبات',
        iconColor: AppColors.moduleShop,
        iconBg: EdHomeThemes.shopBg,
        onTap: () => context.go('/shop'),
      ),
      EdHomeApp(
        icon: Icons.shopping_bag_outlined,
        name: 'طلباتي',
        hint: 'متابعة الطلبات',
        iconColor: const Color(0xFFD97706),
        iconBg: EdHomeThemes.ordersBg,
        badge: orderCount,
        onTap: () => context.go('/orders'),
      ),
      EdHomeApp(
        icon: Icons.receipt_long_rounded,
        name: 'سند قبض',
        hint: 'تحصيل من الزبون',
        iconColor: AppColors.moduleReceipts,
        iconBg: EdHomeThemes.receiptsBg,
        badge: pendingReceipts,
        onTap: () => context.go('/receipts'),
      ),
      EdHomeApp(
        icon: Icons.person_add_alt_1_rounded,
        name: 'زبون جديد',
        hint: 'يُراجع ثم يُرحَّل',
        iconColor: AppColors.moduleCustomers,
        iconBg: EdHomeThemes.customersBg,
        badge: pendingCustomers,
        onTap: () => context.go('/customers'),
      ),
      EdHomeApp(
        icon: Icons.bar_chart_rounded,
        name: 'تقارير',
        hint: 'مبيعات الفترة',
        iconColor: AppColors.moduleReports,
        iconBg: EdHomeThemes.reportsBg,
        onTap: () => context.go('/reports'),
      ),
    ];

    final homeBody = RefreshIndicator(
      color: AppColors.navy,
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
        onRefresh: refresh,
        onSettings: () => context.push('/settings'),
      ),
    );

    if (layout.isPhone) {
      return ColoredBox(
        color: AppColors.bg,
        child: homeBody,
      );
    }

    return AppPage(
      title: 'Edari',
      kicker: 'بوابة المندوب',
      subtitle: agentName,
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: refresh),
        EdHeaderIconButton(icon: Icons.settings_outlined, tooltip: 'الإعدادات', onPressed: () => context.push('/settings')),
        EdHeaderIconButton(
          icon: Icons.logout_rounded,
          tooltip: 'خروج',
          danger: true,
          onPressed: () async {
            await ref.read(authProvider.notifier).logout();
            if (context.mounted) context.go('/login');
          },
        ),
      ],
      child: ColoredBox(
        color: AppColors.bg,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const EdHomePageBackground(),
            homeBody,
          ],
        ),
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

final receiptsListProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getReceipts());
});

final customerRequestsListProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCustomerRequests());
});

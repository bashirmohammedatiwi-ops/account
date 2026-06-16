import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
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

    final treeCount = treesAsync.maybeWhen(data: (t) => '${t.length}', orElse: () => '—');
    final customerCount = treesAsync.maybeWhen(
      data: (trees) => fmtNumAlways(trees.fold<int>(0, (s, t) => s + t.directChildren)),
      orElse: () => '—',
    );
    final orderCount = ordersAsync.maybeWhen(data: (o) => '${o.length}', orElse: () => '—');
    final agentName = agent?.name ?? 'مندوب';

    Future<void> refresh() async {
      ref.invalidate(treesProvider);
      ref.invalidate(ordersProvider);
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
        icon: Icons.bar_chart_rounded,
        name: 'تقارير',
        hint: 'مبيعات الفترة',
        iconColor: AppColors.moduleReports,
        iconBg: EdHomeThemes.reportsBg,
        onTap: () => context.go('/reports'),
      ),
    ];

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
            RefreshIndicator(
              color: AppColors.navy,
              onRefresh: refresh,
              child: EdHomePage(
                agentName: agentName,
                avatarText: agent?.name,
                apps: apps,
                treeCount: treeCount,
                customerCount: customerCount,
                orderCount: orderCount,
              ),
            ),
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

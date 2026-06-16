import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agent = ref.watch(authProvider).agent;
    final treesAsync = ref.watch(treesProvider);
    final ordersAsync = ref.watch(ordersProvider);
    final layout = EdLayout.of(context);

    final treeCount = treesAsync.maybeWhen(data: (t) => '${t.length}', orElse: () => '—');
    final orderCount = ordersAsync.maybeWhen(data: (o) => '${o.length}', orElse: () => '—');

    final modules = [
      EdModuleCard(
        icon: Icons.account_tree_rounded,
        title: 'كشوف الحساب',
        subtitle: 'شجرات · زبائن · كشوف وحركات',
        color: AppColors.moduleAccounts,
        badge: treeCount,
        onTap: () => context.go('/accounts'),
      ),
      EdModuleCard(
        icon: Icons.storefront_rounded,
        title: 'المنتجات',
        subtitle: 'عرض وطلب · فاتورة مندوب',
        color: AppColors.moduleShop,
        onTap: () => context.go('/shop'),
      ),
      EdModuleCard(
        icon: Icons.receipt_long_rounded,
        title: 'طلباتي',
        subtitle: 'متابعة الطلبات والحالات',
        color: AppColors.moduleOrders,
        badge: orderCount,
        onTap: () => context.go('/orders'),
      ),
      EdModuleCard(
        icon: Icons.bar_chart_rounded,
        title: 'التقارير',
        subtitle: 'ملخص المبيعات والأداء',
        color: AppColors.moduleReports,
        onTap: () => context.go('/reports'),
      ),
    ];

    return AppPage(
      title: 'الرئيسية',
      kicker: 'Edari Delegate',
      subtitle: agent?.name ?? '',
      actions: [
        EdHeaderIconButton(
          icon: Icons.refresh_rounded,
          tooltip: 'تحديث',
          onPressed: () {
            ref.invalidate(treesProvider);
            ref.invalidate(ordersProvider);
          },
        ),
        EdHeaderIconButton(
          icon: Icons.person_outline_rounded,
          tooltip: 'الحساب',
          onPressed: () => context.push('/settings'),
        ),
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
      child: layout.isWide
          ? _WideHome(
              agentName: agent?.name ?? 'مندوب',
              treeCount: treeCount,
              orderCount: orderCount,
              modules: modules,
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                EdHeroCard(agentName: agent?.name ?? 'مندوب', avatarText: agent?.name),
                const SizedBox(height: 20),
                EdStatsBar(
                  items: [
                    (label: 'الأشجار', value: treeCount, color: AppColors.accentTeal),
                    (label: 'الطلبات', value: orderCount, color: AppColors.moduleOrders),
                    (label: 'الحالة', value: 'نشط', color: AppColors.success),
                  ],
                ),
                const SizedBox(height: 28),
                const Text('التطبيقات', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text)),
                const SizedBox(height: 6),
                const Text('اختر وحدة العمل للمتابعة', style: TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                const SizedBox(height: 16),
                for (var i = 0; i < modules.length; i++) ...[
                  if (i > 0) const SizedBox(height: 12),
                  modules[i],
                ],
              ],
            ),
    );
  }
}

class _WideHome extends StatelessWidget {
  const _WideHome({
    required this.agentName,
    required this.treeCount,
    required this.orderCount,
    required this.modules,
  });

  final String agentName;
  final String treeCount;
  final String orderCount;
  final List<Widget> modules;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 5,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                EdHeroCard(agentName: agentName, avatarText: agentName),
                const SizedBox(height: 20),
                EdStatsBar(
                  items: [
                    (label: 'الأشجار', value: treeCount, color: AppColors.accentTeal),
                    (label: 'الطلبات', value: orderCount, color: AppColors.moduleOrders),
                    (label: 'الحالة', value: 'نشط', color: AppColors.success),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 28),
          Expanded(
            flex: 5,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('التطبيقات', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                const Text('كل وحدة في صفحة مستقلة — ارجع للرئيسية في أي وقت', style: TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                const SizedBox(height: 20),
                for (var i = 0; i < modules.length; i++) ...[
                  if (i > 0) const SizedBox(height: 12),
                  modules[i],
                ],
              ],
            ),
          ),
        ],
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

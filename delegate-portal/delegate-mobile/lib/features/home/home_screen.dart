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

    final apps = [
      EdAppTile(
        icon: Icons.account_tree_rounded,
        label: 'كشوف\nالحساب',
        color: AppColors.moduleAccounts,
        badge: treeCount,
        onTap: () => context.go('/accounts'),
      ),
      EdAppTile(
        icon: Icons.storefront_rounded,
        label: 'المنتجات',
        color: AppColors.moduleShop,
        onTap: () => context.go('/shop'),
      ),
      EdAppTile(
        icon: Icons.receipt_long_rounded,
        label: 'طلباتي',
        color: AppColors.moduleOrders,
        badge: orderCount,
        onTap: () => context.go('/orders'),
      ),
      EdAppTile(
        icon: Icons.bar_chart_rounded,
        label: 'التقارير',
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
              apps: apps,
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                EdHeroCard(agentName: agent?.name ?? 'مندوب', avatarText: agent?.name),
                const SizedBox(height: 24),
                const Text('التطبيقات', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
                const SizedBox(height: 14),
                Center(child: Wrap(alignment: WrapAlignment.center, spacing: 24, runSpacing: 24, children: apps)),
                const SizedBox(height: 24),
                EdStatsBar(
                  items: [
                    (label: 'الأشجار', value: treeCount, color: AppColors.accentTeal),
                    (label: 'الطلبات', value: orderCount, color: AppColors.moduleOrders),
                    (label: 'الحالة', value: 'نشط', color: AppColors.success),
                  ],
                ),
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
    required this.apps,
  });

  final String agentName;
  final String treeCount;
  final String orderCount;
  final List<Widget> apps;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
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
            flex: 4,
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppColors.radiusLg),
                border: Border.all(color: AppColors.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('التطبيقات', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  const Text('اختر وحدة العمل', style: TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 24),
                  Wrap(spacing: 28, runSpacing: 28, children: apps),
                ],
              ),
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

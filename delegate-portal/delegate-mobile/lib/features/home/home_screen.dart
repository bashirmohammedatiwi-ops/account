import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/widgets/adaptive_shell.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agent = ref.watch(authProvider).agent;
    final treesAsync = ref.watch(treesProvider);
    final ordersAsync = ref.watch(ordersProvider);

    final treeCount = treesAsync.maybeWhen(data: (t) => t.length, orElse: () => '—');
    final orderCount = ordersAsync.maybeWhen(data: (o) => o.length, orElse: () => '—');

    return AppPage(
      title: 'مرحباً، ${agent?.name ?? ''}',
      subtitle: 'اختر القسم للبدء',
      actions: [
        IconButton(
          tooltip: 'تحديث',
          onPressed: () {
            ref.invalidate(treesProvider);
            ref.invalidate(ordersProvider);
          },
          icon: const Icon(Icons.refresh_rounded),
        ),
        IconButton(
          tooltip: 'خروج',
          onPressed: () async {
            await ref.read(authProvider.notifier).logout();
            if (context.mounted) context.go('/login');
          },
          icon: const Icon(Icons.logout_rounded),
        ),
      ],
      child: LayoutBuilder(
        builder: (context, c) {
          final cols = c.maxWidth >= 1100 ? 4 : (c.maxWidth >= 700 ? 2 : 1);
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Wrap(
                spacing: 16,
                runSpacing: 16,
                children: [
                  _ModuleCard(
                    width: (c.maxWidth - 40 - (cols - 1) * 16) / cols,
                    icon: Icons.account_tree_rounded,
                    color: const Color(0xFF0F766E),
                    title: 'كشوف الحساب',
                    subtitle: 'الأشجار والزبائن والحركات',
                    badge: '$treeCount',
                    onTap: () => context.go('/accounts'),
                  ),
                  _ModuleCard(
                    width: (c.maxWidth - 40 - (cols - 1) * 16) / cols,
                    icon: Icons.storefront_rounded,
                    color: const Color(0xFF2563EB),
                    title: 'المنتجات',
                    subtitle: 'عرض وطلب فاتورة',
                    onTap: () => context.go('/shop'),
                  ),
                  _ModuleCard(
                    width: (c.maxWidth - 40 - (cols - 1) * 16) / cols,
                    icon: Icons.receipt_long_rounded,
                    color: const Color(0xFF7C3AED),
                    title: 'طلباتي',
                    subtitle: 'متابعة الطلبات المرسلة',
                    badge: '$orderCount',
                    onTap: () => context.go('/orders'),
                  ),
                  _ModuleCard(
                    width: (c.maxWidth - 40 - (cols - 1) * 16) / cols,
                    icon: Icons.bar_chart_rounded,
                    color: const Color(0xFFEA580C),
                    title: 'تقارير المبيعات',
                    subtitle: 'ملخص وقائمة الفواتير',
                    onTap: () => context.go('/reports'),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(child: StatCard(label: 'الأشجار', value: '$treeCount')),
                  const SizedBox(width: 12),
                  Expanded(child: StatCard(label: 'الطلبات', value: '$orderCount')),
                  const SizedBox(width: 12),
                  Expanded(child: StatCard(label: 'الحالة', value: 'نشط', color: Colors.green)),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  const _ModuleCard({
    required this.width,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  final double width;
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width.clamp(280, 400),
      child: Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                      child: Icon(icon, color: color, size: 28),
                    ),
                    const Spacer(),
                    if (badge != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(999)),
                        child: Text(badge!, style: TextStyle(color: color, fontWeight: FontWeight.w700)),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text(subtitle, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey.shade600)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Text('فتح', style: TextStyle(color: color, fontWeight: FontWeight.w700)),
                    Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: color),
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

final treesProvider = FutureProvider((ref) => ref.watch(apiClientProvider).getTrees());
final ordersProvider = FutureProvider((ref) => ref.watch(apiClientProvider).getOrders());

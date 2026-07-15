import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:go_router/go_router.dart';

import '../../core/theme/app_theme.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/premium_widgets.dart';
import '../orders/orders_providers.dart';

class StatsScreen extends ConsumerWidget {
  const StatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statsAsync = ref.watch(orderStatsProvider);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: themed(context, light: AppColors.bg, dark: AppColors.bgDark),
        body: Column(
          children: [
            const GradientHeader(
              title: 'الإحصائيات',
              subtitle: 'ملخص أداء التجهيز اليوم',
              compact: true,
            ),
            Expanded(
              child: statsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => EmptyState(
                  icon: Icons.bar_chart_rounded,
                  title: 'تعذّر تحميل الإحصائيات',
                  subtitle: '$e',
                  action: FilledButton(onPressed: () => ref.invalidate(orderStatsProvider), child: const Text('إعادة المحاولة')),
                ),
                data: (stats) => RefreshIndicator(
                  onRefresh: () async {
                    ref.invalidate(orderStatsProvider);
                    await ref.read(orderStatsProvider.future);
                  },
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                    children: [
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 1.15,
                        children: [
                          StatCard(
                            label: 'قيد الانتظار',
                            value: '${stats.pending}',
                            icon: Icons.schedule_rounded,
                            color: AppColors.pending,
                            onTap: () {
                              ref.read(ordersFilterProvider.notifier).state = 'pending';
                              context.go('/orders');
                            },
                          ),
                          StatCard(
                            label: 'تم التجهيز',
                            value: '${stats.processing}',
                            icon: Icons.check_circle_outline_rounded,
                            color: AppColors.processing,
                            onTap: () {
                              ref.read(ordersFilterProvider.notifier).state = 'processing';
                              context.go('/orders');
                            },
                          ),
                          StatCard(
                            label: 'مرفوض',
                            value: '${stats.rejected}',
                            icon: Icons.cancel_outlined,
                            color: AppColors.rejected,
                            onTap: () {
                              ref.read(ordersFilterProvider.notifier).state = 'rejected';
                              context.go('/orders');
                            },
                          ),
                          StatCard(
                            label: 'طلبات اليوم',
                            value: '${stats.todaySubmitted}',
                            icon: Icons.today_rounded,
                            color: AppColors.primary,
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      SectionHeader(title: 'توزيع الطلبات'),
                      StatsBarChart(
                        pending: stats.pending,
                        processing: stats.processing,
                        rejected: stats.rejected,
                      ),
                      const SizedBox(height: 20),
                      SectionHeader(title: 'نظرة عامة'),
                      _InfoTile(
                        icon: Icons.receipt_long_rounded,
                        title: 'إجمالي الطلبات النشطة',
                        value: '${stats.total}',
                      ),
                      const SizedBox(height: 10),
                      _InfoTile(
                        icon: Icons.attach_money_rounded,
                        title: 'قيمة الطلبات (تقريبي)',
                        value: '${formatMoney(stats.totalAmount)} د.ع',
                      ),
                      const SizedBox(height: 20),
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          gradient: AppColors.cardGradient,
                          borderRadius: BorderRadius.circular(AppColors.radius),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.tips_and_updates_rounded, color: Colors.white, size: 28),
                            SizedBox(width: 14),
                            Expanded(
                              child: Text(
                                'راجع تبويب «الطلبات» بانتظام — الطلبات الجديدة تظهر تلقائياً مع الإشعارات.',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, height: 1.5),
                              ),
                            ),
                          ],
                        ),
                      ),
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

class _InfoTile extends StatelessWidget {
  const _InfoTile({required this.icon, required this.title, required this.value});

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: AppColors.primary),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700))),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w900, color: AppColors.primary)),
          ],
        ),
      ),
    );
  }
}

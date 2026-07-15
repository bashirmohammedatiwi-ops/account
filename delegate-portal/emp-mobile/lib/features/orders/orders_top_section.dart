import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import 'orders_providers.dart';

class OrdersTopSection extends ConsumerWidget {
  const OrdersTopSection({
    super.key,
    required this.employeeName,
    required this.searchController,
    required this.searchQuery,
    required this.stats,
    required this.onRefresh,
  });

  final String employeeName;
  final TextEditingController searchController;
  final String searchQuery;
  final OrderStats? stats;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(ordersFilterProvider);
    final sourceFilter = ref.watch(ordersSourceFilterProvider);
    final prepFilter = ref.watch(ordersPrepFilterProvider);
    final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);

    return Column(
      children: [
        Container(
          width: double.infinity,
          decoration: const BoxDecoration(gradient: AppColors.headerGradient),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
                        ),
                        child: Center(
                          child: Text(
                            employeeName.trim().isNotEmpty ? employeeName.trim()[0] : 'م',
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('مرحباً، $employeeName', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                            Text('لوحة طلبات التجهيز', style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontWeight: FontWeight.w600, fontSize: 12)),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: onRefresh,
                        icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                        tooltip: 'تحديث',
                        style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.12)),
                      ),
                    ],
                  ),
                  if (stats != null) ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        _HeroStat(icon: Icons.schedule_rounded, label: 'انتظار', value: '${stats!.pending}', color: const Color(0xFFFBBF24)),
                        const SizedBox(width: 8),
                        _HeroStat(icon: Icons.inventory_2_outlined, label: 'مجهّز', value: '${stats!.processing}', color: const Color(0xFF38BDF8)),
                        const SizedBox(width: 8),
                        _HeroStat(icon: Icons.today_rounded, label: 'اليوم', value: '${stats!.todaySubmitted}', color: Colors.white),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -18),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Material(
              color: surface,
              elevation: 0,
              shadowColor: AppColors.shadow,
              borderRadius: BorderRadius.circular(AppColors.radius),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppColors.radius),
                  border: Border.all(color: border),
                  boxShadow: isDark(context) ? null : [BoxShadow(color: AppColors.shadow, blurRadius: 20, offset: const Offset(0, 8))],
                ),
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: searchController,
                      decoration: InputDecoration(
                        hintText: 'بحث برقم الطلب، الزبون، الفرع…',
                        prefixIcon: const Icon(Icons.search_rounded),
                        filled: true,
                        fillColor: themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark),
                        suffixIcon: searchQuery.isNotEmpty
                            ? IconButton(
                                onPressed: () {
                                  searchController.clear();
                                  ref.read(ordersSearchProvider.notifier).state = '';
                                },
                                icon: const Icon(Icons.close_rounded),
                              )
                            : null,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text('حالة الطلب', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark))),
                    const SizedBox(height: 8),
                    _StatusSegmented(
                      value: filter,
                      onChanged: (v) {
                        ref.read(ordersFilterProvider.notifier).state = v;
                        if (v != 'processing') ref.read(ordersPrepFilterProvider.notifier).state = '';
                      },
                    ),
                    if (filter == 'processing') ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          _MiniChip(
                            label: 'الكل',
                            icon: Icons.layers_rounded,
                            selected: prepFilter.isEmpty,
                            color: AppColors.processing,
                            onTap: () => ref.read(ordersPrepFilterProvider.notifier).state = '',
                          ),
                          _MiniChip(
                            label: 'مؤكد ✓',
                            icon: Icons.verified_rounded,
                            selected: prepFilter == 'confirmed',
                            color: AppColors.confirmed,
                            onTap: () => ref.read(ordersPrepFilterProvider.notifier).state = 'confirmed',
                          ),
                          _MiniChip(
                            label: 'بانتظار التأكيد',
                            icon: Icons.pending_actions_rounded,
                            selected: prepFilter == 'pending_confirm',
                            color: AppColors.pending,
                            onTap: () => ref.read(ordersPrepFilterProvider.notifier).state = 'pending_confirm',
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 14),
                    Text('مصدر الطلب', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark))),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _MiniChip(label: 'كل المصادر', icon: Icons.apps_rounded, selected: sourceFilter.isEmpty, color: AppColors.primary, onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = ''),
                        _MiniChip(label: 'شورجة', icon: Icons.storefront_rounded, selected: sourceFilter == 'shorja', color: AppColors.shorja, onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'shorja'),
                        _MiniChip(label: 'مندوبين', icon: Icons.local_shipping_outlined, selected: sourceFilter == 'delegate', color: AppColors.accent, onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'delegate'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.icon, required this.label, required this.value, required this.color});

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.16)),
        ),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.w900, height: 1)),
                  Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.78), fontSize: 10, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusSegmented extends StatelessWidget {
  const _StatusSegmented({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final bg = themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark);
    final items = const [
      _SegItem(id: 'pending', label: 'انتظار', icon: Icons.schedule_rounded, color: AppColors.pending),
      _SegItem(id: 'processing', label: 'مجهّز', icon: Icons.check_circle_outline_rounded, color: AppColors.processing),
      _SegItem(id: 'rejected', label: 'مرفوض', icon: Icons.cancel_outlined, color: AppColors.rejected),
      _SegItem(id: '', label: 'الكل', icon: Icons.all_inbox_rounded, color: AppColors.muted),
    ];

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Row(
        children: items.map((item) {
          final selected = value == item.id;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Material(
                color: selected ? item.color.withValues(alpha: isDark(context) ? 0.28 : 0.14) : Colors.transparent,
                borderRadius: BorderRadius.circular(10),
                child: InkWell(
                  onTap: () => onChanged(item.id),
                  borderRadius: BorderRadius.circular(10),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Column(
                      children: [
                        Icon(item.icon, size: 16, color: selected ? item.color : themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                        const SizedBox(height: 4),
                        Text(
                          item.label,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: selected ? item.color : themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _SegItem {
  const _SegItem({required this.id, required this.label, required this.icon, required this.color});
  final String id;
  final String label;
  final IconData icon;
  final Color color;
}

class _MiniChip extends StatelessWidget {
  const _MiniChip({
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
    return Material(
      color: selected ? color.withValues(alpha: isDark(context) ? 0.24 : 0.12) : themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? color.withValues(alpha: 0.45) : themed(context, light: AppColors.border, dark: AppColors.borderDark)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: selected ? color : themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
              const SizedBox(width: 6),
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: selected ? color : themed(context, light: AppColors.text, dark: AppColors.textDark))),
            ],
          ),
        ),
      ),
    );
  }
}

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

  static const _statuses = [
    _StatusItem('pending', 'انتظار', Icons.schedule_rounded, AppColors.pending),
    _StatusItem('processing', 'مجهّز', Icons.inventory_2_outlined, AppColors.processing),
    _StatusItem('rejected', 'مرفوض', Icons.block_rounded, AppColors.rejected),
    _StatusItem('', 'الكل', Icons.all_inbox_rounded, AppColors.primary),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(ordersFilterProvider);
    final sourceFilter = ref.watch(ordersSourceFilterProvider);
    final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);
    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    final alt = themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark);

    int countFor(String id) {
      if (stats == null) return 0;
      return switch (id) {
        'pending' => stats!.pending,
        'processing' => stats!.processing,
        'rejected' => stats!.rejected,
        '' => stats!.total,
        _ => 0,
      };
    }

    return Column(
      children: [
        Container(
          width: double.infinity,
          decoration: const BoxDecoration(gradient: AppColors.headerGradient),
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
                    ),
                    child: Center(
                      child: Text(
                        employeeName.trim().isNotEmpty ? employeeName.trim()[0] : 'م',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 22),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(employeeName, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                        const SizedBox(height: 2),
                        Text(
                          stats != null ? '${stats!.todaySubmitted} طلب ورد اليوم' : 'طلبات التجهيز',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w600, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  IconButton.filledTonal(
                    onPressed: onRefresh,
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white),
                    style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.15)),
                  ),
                ],
              ),
            ),
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -24),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              decoration: BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.circular(AppColors.radius),
                border: Border.all(color: border),
                boxShadow: isDark(context) ? null : [BoxShadow(color: AppColors.shadow, blurRadius: 20, offset: const Offset(0, 8))],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: BoxDecoration(color: alt, borderRadius: BorderRadius.circular(14)),
                      child: Row(
                        children: _statuses.map((item) {
                          final selected = filter == item.id;
                          final count = countFor(item.id);
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 2),
                              child: Material(
                                color: selected ? surface : Colors.transparent,
                                elevation: selected ? 1 : 0,
                                shadowColor: AppColors.shadow,
                                borderRadius: BorderRadius.circular(11),
                                child: InkWell(
                                  onTap: () => ref.read(ordersFilterProvider.notifier).state = item.id,
                                  borderRadius: BorderRadius.circular(11),
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 180),
                                    padding: const EdgeInsets.symmetric(vertical: 10),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(11),
                                      border: selected ? Border.all(color: item.color.withValues(alpha: 0.35)) : null,
                                    ),
                                    child: Column(
                                      children: [
                                        Icon(item.icon, size: 18, color: selected ? item.color : muted),
                                        const SizedBox(height: 4),
                                        Text(
                                          '$count',
                                          style: TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.w900,
                                            color: selected ? item.color : themed(context, light: AppColors.text, dark: AppColors.textDark),
                                            height: 1,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          item.label,
                                          style: TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w800,
                                            color: selected ? item.color : muted,
                                          ),
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
                    ),
                  ),
                  if (filter == 'processing')
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: AppColors.confirmedSoft,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: AppColors.confirmed.withValues(alpha: 0.25)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 22,
                              height: 22,
                              decoration: const BoxDecoration(color: AppColors.confirmed, shape: BoxShape.circle),
                              child: const Icon(Icons.check_rounded, color: Colors.white, size: 14),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'البطاقة الخضراء = طلب مؤكّد · البيضاء = بانتظار التأكيد',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.confirmed.withValues(alpha: 0.9)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: TextField(
                      controller: searchController,
                      decoration: InputDecoration(
                        hintText: 'بحث برقم الطلب، الزبون، الفرع…',
                        prefixIcon: const Icon(Icons.search_rounded),
                        filled: true,
                        fillColor: alt,
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
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                      ),
                    ),
                  ),
                  Divider(height: 1, color: border),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: _SourceTab(
                            label: 'الكل',
                            selected: sourceFilter.isEmpty,
                            color: AppColors.primary,
                            onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = '',
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: _SourceTab(
                            label: 'شورجة',
                            icon: Icons.storefront_rounded,
                            selected: sourceFilter == 'shorja',
                            color: AppColors.shorja,
                            onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'shorja',
                          ),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: _SourceTab(
                            label: 'مندوبين',
                            icon: Icons.local_shipping_outlined,
                            selected: sourceFilter == 'delegate',
                            color: AppColors.accent,
                            onTap: () => ref.read(ordersSourceFilterProvider.notifier).state = 'delegate',
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
    );
  }
}

class _StatusItem {
  const _StatusItem(this.id, this.label, this.icon, this.color);
  final String id;
  final String label;
  final IconData icon;
  final Color color;
}

class _SourceTab extends StatelessWidget {
  const _SourceTab({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
    this.icon,
  });

  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    return Material(
      color: selected ? color.withValues(alpha: isDark(context) ? 0.2 : 0.1) : themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: selected ? color.withValues(alpha: 0.4) : themed(context, light: AppColors.border, dark: AppColors.borderDark)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 15, color: selected ? color : muted),
                const SizedBox(width: 4),
              ],
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: selected ? color : muted)),
            ],
          ),
        ),
      ),
    );
  }
}

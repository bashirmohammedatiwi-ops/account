import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import 'commerce_screens.dart';
import 'commerce_theme.dart';

/// الخطوة الأولى — اختيار القسم الرئيسي (فرع الكتالوج)
class ShopBranchPickerScreen extends ConsumerWidget {
  const ShopBranchPickerScreen({super.key});

  static const _icons = [
    Icons.storefront_rounded,
    Icons.spa_outlined,
    Icons.local_pharmacy_outlined,
    Icons.cleaning_services_outlined,
    Icons.face_retouching_natural_outlined,
    Icons.inventory_2_outlined,
  ];

  static const _tints = [
    Color(0xFFEFF6FF),
    Color(0xFFECFDF5),
    Color(0xFFFFF7ED),
    Color(0xFFFDF2F8),
    Color(0xFFF5F3FF),
    Color(0xFFE0F2FE),
  ];

  static const _colors = [
    AppColors.moduleShop,
    AppColors.accentTeal,
    AppColors.warning,
    AppColors.modulePromo,
    AppColors.moduleOrders,
    AppColors.info,
  ];

  Future<void> _openBranch(BuildContext context, WidgetRef ref, CatalogBranch branch) async {
    final sections = await ref.read(catalogSectionsProvider(branch.id).future);
    final sectionId = sections.isNotEmpty ? sections.first.id : null;
    final agentId = ref.read(authProvider).agent?.id;
    final notifier = ref.read(invoiceDraftProvider.notifier);
    notifier.branchId = branch.id;
    notifier.sectionId = sectionId;
    notifier.branchName = branch.name;
    notifier.sectionName = sections.isNotEmpty ? sections.first.name : null;
    if (agentId != null) await notifier.persist(agentId);
    if (!context.mounted) return;

    if (sectionId != null) {
      context.go('/shop/${branch.id}/sections/$sectionId/products');
    } else {
      context.go('/shop/${branch.id}/sections');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(catalogBranchesProvider);
    final layout = EdLayout.of(context);

    return AppPage(
      title: 'المنتجات',
      kicker: 'الكتالوج',
      subtitle: 'اختر القسم الرئيسي',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: branchesAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الأقسام...'),
          error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(catalogBranchesProvider)),
          data: (branches) {
            if (branches.isEmpty) {
              return const EmptyState(message: 'لا توجد أقسام متاحة', icon: Icons.inventory_2_outlined);
            }

            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        gradient: AppColors.homeSkyGradient,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: AppColors.borderLight),
                        boxShadow: AppColors.softShadow,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: AppColors.surface,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.15)),
                            ),
                            child: const Icon(Icons.category_rounded, color: EdCommerceTheme.accent, size: 28),
                          ),
                          const SizedBox(width: 14),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ما القسم الذي تريد العمل عليه؟',
                                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF1E293B)),
                                ),
                                SizedBox(height: 4),
                                Text(
                                  'بعد الاختيار تظهر المنتجات والأقسام الفرعية',
                                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(20, 0, 20, layout.isPhone ? 100 : 24),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: layout.isDesktop ? 3 : layout.isTablet ? 2 : 2,
                      crossAxisSpacing: 14,
                      mainAxisSpacing: 14,
                      childAspectRatio: layout.isTablet ? 1.15 : 0.92,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final b = branches[i];
                        final color = _colors[i % _colors.length];
                        final tint = _tints[i % _tints.length];
                        final icon = _icons[i % _icons.length];
                        return _BranchCard(
                          branch: b,
                          color: color,
                          tint: tint,
                          icon: icon,
                          onTap: () => _openBranch(context, ref, b),
                        );
                      },
                      childCount: branches.length,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({
    required this.branch,
    required this.color,
    required this.tint,
    required this.icon,
    required this.onTap,
  });

  final CatalogBranch branch;
  final Color color;
  final Color tint;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                height: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.4)]),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: tint,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: color.withValues(alpha: 0.12)),
                        ),
                        child: Icon(icon, color: color, size: 28),
                      ),
                      const Spacer(),
                      Text(
                        branch.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF1E293B), height: 1.3),
                      ),
                      if (branch.description != null && branch.description!.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          branch.description!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Text('دخول', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
                          const Spacer(),
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(10)),
                            child: Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: color),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_kit.dart';
import '../../core/widgets/ed_page_scroll.dart';
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


  static const _colors = [
    AppColors.moduleShop,
    AppColors.moduleAccounts,
    AppColors.warning,
    AppColors.modulePromo,
    AppColors.moduleOrders,
    AppColors.info,
  ];

  Future<void> _openBranch(BuildContext context, WidgetRef ref, CatalogBranch branch) async {
    try {
      final agentId = ref.read(authProvider).agent?.id;
      final notifier = ref.read(invoiceDraftProvider.notifier);
      if (notifier.branchId != null && notifier.branchId != branch.id) {
        notifier.clear();
      }
      notifier.branchId = branch.id;
      notifier.branchName = branch.name;
      notifier.sectionId = null;
      notifier.sectionName = null;
      if (agentId != null) await notifier.persist(agentId);
      if (!context.mounted) return;
      context.go('/shop/${branch.id}/sections');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذّر فتح القسم: $e'), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(catalogBranchesProvider);

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

            return ListView(
              padding: EdgeInsets.fromLTRB(EdContent.hPad(context), 20, EdContent.hPad(context), EdPageInsets.bottom(context, extra: 20)),
              children: [
                const EdSectionTitle(
                  title: 'اختر القسم الرئيسي',
                  subtitle: 'بعد الاختيار تظهر الأقسام الفرعية والمنتجات',
                ),
                EdResponsiveGrid(
                  minItemWidth: 260,
                  maxColumns: 3,
                  children: [
                    for (var i = 0; i < branches.length; i++)
                      EdActionTile(
                        icon: _icons[i % _icons.length],
                        color: _colors[i % _colors.length],
                        title: branches[i].name,
                        subtitle: (branches[i].description ?? '').trim().isNotEmpty ? branches[i].description : 'فتح القسم',
                        onTap: () => _openBranch(context, ref, branches[i]),
                      ),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

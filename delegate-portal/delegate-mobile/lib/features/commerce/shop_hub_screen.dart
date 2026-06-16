import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import 'commerce_screens.dart';

/// iPad: فروع | أقسام | منتجات في شاشة واحدة
class ShopHubScreen extends ConsumerWidget {
  const ShopHubScreen({super.key, this.branchId, this.sectionId});

  final int? branchId;
  final int? sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layout = EdLayout.of(context);

    if (layout.isWide) {
      return AppPage(
        title: 'المنتجات',
        kicker: 'عرض وطلب',
        subtitle: 'فروع · أقسام · عرض وطلب',
        showBack: true,
        onBack: () => context.go('/home'),
        actions: [
          EdHeaderIconButton(
            icon: Icons.refresh_rounded,
            tooltip: 'تحديث',
            onPressed: () {
              ref.invalidate(catalogBranchesProvider);
              if (branchId != null) ref.invalidate(catalogSectionsProvider(branchId!));
              if (sectionId != null) ref.invalidate(catalogProductsProvider(sectionId!));
            },
          ),
        ],
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: layout.sidePanelWidth,
              child: _BranchesPanel(
                selectedId: branchId,
                onSelect: (id) => context.go('/shop/$id/sections'),
              ),
            ),
            const VerticalDivider(width: 1, color: AppColors.border),
            SizedBox(
              width: layout.sidePanelWidth,
              child: branchId == null
                  ? const EmptyState(message: 'اختر فرعاً', icon: Icons.store_mall_directory_outlined)
                  : _SectionsPanel(
                      branchId: branchId!,
                      selectedId: sectionId,
                      onSelect: (sid) => context.go('/shop/$branchId/sections/$sid/products'),
                    ),
            ),
            const VerticalDivider(width: 1, color: AppColors.border),
            Expanded(
              child: branchId != null && sectionId != null
                  ? ShopProductsPanel(branchId: branchId!, sectionId: sectionId!, embedded: true)
                  : const EmptyState(message: 'اختر قسماً', icon: Icons.category_outlined),
            ),
          ],
        ),
      );
    }

    if (branchId != null && sectionId != null) {
      return ShopProductsScreen(branchId: branchId!, sectionId: sectionId!);
    }
    if (branchId != null) return ShopSectionsScreen(branchId: branchId!);
    return const ShopBranchesScreen();
  }
}

class _BranchesPanel extends ConsumerWidget {
  const _BranchesPanel({required this.onSelect, this.selectedId});

  final ValueChanged<int> onSelect;
  final int? selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(catalogBranchesProvider);

    return ColoredBox(
      color: AppColors.surfaceMuted,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const EdSectionHeader(title: 'الفروع', subtitle: 'فرع المنتجات'),
          Expanded(
            child: branchesAsync.when(
              loading: () => const LoadingView(),
              error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogBranchesProvider)),
              data: (branches) {
                if (branches.isEmpty) return const EmptyState(message: 'لا توجد فروع');
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                  itemCount: branches.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final b = branches[i];
                    return EdSideNavItem(
                      icon: Icons.store_mall_directory_outlined,
                      title: b.name,
                      subtitle: b.description,
                      accent: AppColors.moduleShop,
                      selected: b.id == selectedId,
                      onTap: () => onSelect(b.id),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionsPanel extends ConsumerWidget {
  const _SectionsPanel({required this.branchId, required this.onSelect, this.selectedId});

  final int branchId;
  final ValueChanged<int> onSelect;
  final int? selectedId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sectionsAsync = ref.watch(catalogSectionsProvider(branchId));

    return ColoredBox(
      color: AppColors.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const EdSectionHeader(title: 'الأقسام'),
          Expanded(
            child: sectionsAsync.when(
              loading: () => const LoadingView(),
              error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogSectionsProvider(branchId))),
              data: (sections) {
                if (sections.isEmpty) return const EmptyState(message: 'لا توجد أقسام');
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                  itemCount: sections.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final s = sections[i];
                    return EdSideNavItem(
                      icon: Icons.category_outlined,
                      title: s.name,
                      accent: AppColors.moduleShop,
                      selected: s.id == selectedId,
                      onTap: () {
                        ref.read(invoiceDraftProvider.notifier).branchId = branchId;
                        onSelect(s.id);
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

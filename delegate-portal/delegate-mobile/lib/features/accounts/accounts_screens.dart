import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_session.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';

final childrenProvider = FutureProvider.family<List<BranchAccount>, String>((ref, seq) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getChildren(seq));
});

class TreesScreen extends ConsumerWidget {
  const TreesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treesAsync = ref.watch(treesProvider);

    return AppPage(
      title: 'كشوف الحساب',
      kicker: 'الحسابات',
      subtitle: 'اختر شجرة الزبائن',
      showBack: true,
      onBack: () => context.go('/home'),
      actions: [
        EdHeaderIconButton(
          icon: Icons.refresh_rounded,
          tooltip: 'تحديث',
          onPressed: () => ref.invalidate(treesProvider),
        ),
      ],
      child: treesAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الأشجار...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(treesProvider)),
        data: (trees) {
          if (trees.isEmpty) return const EmptyState(message: 'لا توجد أشجار مسموحة', icon: Icons.account_tree_outlined);
          return LayoutBuilder(
            builder: (context, c) {
              final cols = EdLayoutData(width: c.maxWidth, height: 0).gridColumns(phone: 1, tablet: 2, wide: 2);
              return GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: cols == 2 ? 1.35 : 1.25,
                ),
                itemCount: trees.length,
                itemBuilder: (_, i) {
                  final t = trees[i];
                  return EdTreeCard(
                    index: i + 1,
                    accountNum: t.accountNum,
                    name: t.name1,
                    meta: '${t.directChildren} زبون',
                    onTap: () => context.go('/accounts/${t.seq}/branches'),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}

class BranchesScreen extends ConsumerStatefulWidget {
  const BranchesScreen({super.key, required this.treeSeq});
  final String treeSeq;

  @override
  ConsumerState<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends ConsumerState<BranchesScreen> {
  String _filter = 'all';
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(childrenProvider(widget.treeSeq));

    return AppPage(
      title: 'الزبائن',
      kicker: 'كشوف الحساب',
      subtitle: 'اختر زبوناً لعرض الكشف',
      showBack: true,
      toolbar: Container(
        color: AppColors.surface,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.border)),
        ),
        child: Column(
          children: [
            EdSearchField(
              hint: 'بحث بالاسم أو الرقم...',
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            ),
            const SizedBox(height: 10),
            EdFilterChips(selected: _filter, onChanged: (v) => setState(() => _filter = v)),
          ],
        ),
      ),
      actions: [
        EdHeaderIconButton(
          icon: Icons.refresh_rounded,
          tooltip: 'تحديث',
          onPressed: () => ref.invalidate(childrenProvider(widget.treeSeq)),
        ),
      ],
      child: branchesAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الزبائن...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
        data: (branches) {
          final filtered = branches.where((b) {
            if (!b.matchesBranchFilter(_filter)) return false;
            if (_search.isEmpty) return true;
            return b.name1.toLowerCase().contains(_search) || b.accountNum.contains(_search);
          }).toList();

          if (filtered.isEmpty) {
            return EmptyState(
              message: branches.isEmpty ? 'لا يوجد زبائن في هذه الشجرة' : 'لا توجد نتائج — غيّر البحث أو الفلتر',
              icon: Icons.people_outline,
            );
          }

          return LayoutBuilder(
            builder: (context, c) {
              final cols = EdLayoutData(width: c.maxWidth, height: 0).gridColumns(phone: 1, tablet: 2, wide: 2);
              return GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: cols == 2 ? 1.15 : 1.05,
                ),
                itemCount: filtered.length,
                itemBuilder: (_, i) {
                  final b = filtered[i];
                  final variant = branchVariantFor(bal: b.bal, debtAmount: b.debtAmount);
                  final debt = b.debtAmount ?? 0;
                  return EdBranchCard(
                    name: b.name1,
                    accountNum: b.accountNum,
                    debtLabel: 'الديون',
                    debtAmount: debt > 0 ? fmtNumAlways(debt) : '0',
                    variant: variant,
                    onTap: () => context.go('/accounts/${widget.treeSeq}/statement/${b.seq}'),
                  );
                },
              );
            },
          );
        },
      ),
    );
  }
}

final statementProvider = FutureProvider.family<AccountStatement, String>((ref, seq) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getStatement(seq));
});

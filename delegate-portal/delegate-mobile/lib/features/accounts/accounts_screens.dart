import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_session.dart';
import '../../core/utils/debounce.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'account_ui.dart';
import 'branches_ui.dart';

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
      kicker: 'Edari · الشجرات',
      subtitle: 'اختر شجرة للمتابعة',
      showBack: true,
      onBack: () => context.go('/home'),
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(treesProvider)),
      ],
      child: treesAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الأشجار...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(treesProvider)),
        data: (trees) {
          if (trees.isEmpty) {
            return const EmptyState(message: 'لا توجد شجرات معيّنة — تواصل مع الإدارة', icon: Icons.account_tree_outlined);
          }
          final customers = trees.fold<int>(0, (s, t) => s + t.directChildren);
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              EdFlowSteps(current: 0),
              EdSectionMeta(text: '${trees.length} شجرة · ${fmtNumAlways(customers)} زبون'),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: trees.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => EdTreeRowCard(
                    index: i + 1,
                    tree: trees[i],
                    onTap: () => context.go('/accounts/${trees[i].seq}/branches'),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class BranchesScreen extends ConsumerStatefulWidget {
  const BranchesScreen({super.key, required this.treeSeq, this.tree});
  final String treeSeq;
  final AccountTree? tree;

  @override
  ConsumerState<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends ConsumerState<BranchesScreen> {
  String _filter = 'all';
  String _searchApplied = '';
  final _debouncer = Debouncer();

  @override
  void dispose() {
    _debouncer.dispose();
    super.dispose();
  }

  AccountTree? _resolveTree(List<AccountTree> trees) {
    if (widget.tree != null) return widget.tree;
    for (final t in trees) {
      if (t.seq == widget.treeSeq) return t;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(childrenProvider(widget.treeSeq));
    final treesAsync = ref.watch(treesProvider);
    final tree = treesAsync.maybeWhen(data: _resolveTree, orElse: () => widget.tree);

    return AppPage(
      title: 'الزبائن',
      kicker: 'كشوف الحساب',
      subtitle: tree?.name1 ?? '',
      showBack: true,
      onBack: () => context.go('/accounts'),
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(childrenProvider(widget.treeSeq))),
      ],
      child: branchesAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل الزبائن...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
        data: (branches) {
          final filtered = branches.where((b) {
            if (!b.matchesBranchFilter(_filter)) return false;
            if (_searchApplied.isEmpty) return true;
            return b.name1.toLowerCase().contains(_searchApplied) || b.accountNum.contains(_searchApplied);
          }).toList()
            ..sort((a, b) {
              final debtCmp = resolveBranchDebt(b).compareTo(resolveBranchDebt(a));
              if (debtCmp != 0) return debtCmp;
              return a.name1.compareTo(b.name1);
            });

          final treeForBanner = tree ?? AccountTree(seq: widget.treeSeq, accountNum: '—', name1: '—', bal: 0, subCount: 0, directChildren: branches.length);

          return EdBranchesContent(
            tree: treeForBanner,
            branches: branches,
            filtered: filtered,
            filter: _filter,
            onSearchChanged: (v) {
              final q = v.trim().toLowerCase();
              _debouncer.run(() {
                if (mounted) setState(() => _searchApplied = q);
              });
            },
            onFilterChanged: (v) => setState(() => _filter = v),
            onBranchTap: (b) => context.go('/accounts/${widget.treeSeq}/statement/${b.seq}'),
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'accounts_screens.dart';
import 'statement_panel.dart';

final searchProvider = FutureProvider.family<List<BranchAccount>, String>((ref, q) async {
  if (q.trim().length < 2) return [];
  return withAuth(ref, () => ref.read(apiClientProvider).searchAccounts(q));
});

class AccountsHubScreen extends ConsumerWidget {
  const AccountsHubScreen({super.key, this.treeSeq, this.accSeq});

  final String? treeSeq;
  final String? accSeq;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = EdLayout.of(context).isWide;

    if (wide) {
      return AppPage(
        title: 'كشوف الحساب',
        kicker: 'الحسابات',
        subtitle: 'الأشجار · الزبائن · الكشف',
        showBack: true,
        onBack: () => context.go('/home'),
        actions: [
          EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(treesProvider)),
        ],
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              flex: 2,
              child: _TreesPanel(selectedSeq: treeSeq, onSelect: (seq) => context.go('/accounts/$seq/branches')),
            ),
            const VerticalDivider(width: 1, color: AppColors.border),
            Expanded(
              flex: 2,
              child: treeSeq == null
                  ? const EmptyState(message: 'اختر شجرة', icon: Icons.account_tree_outlined)
                  : _BranchesPanel(
                      treeSeq: treeSeq!,
                      selectedAccSeq: accSeq,
                      onSelect: (seq) => context.go('/accounts/$treeSeq/statement/$seq'),
                    ),
            ),
            const VerticalDivider(width: 1, color: AppColors.border),
            Expanded(
              flex: 3,
              child: accSeq == null
                  ? const EmptyState(message: 'اختر زبوناً', icon: Icons.person_outline)
                  : StatementPanel(accSeq: accSeq!, treeSeq: treeSeq, compact: true),
            ),
          ],
        ),
      );
    }

    if (accSeq != null && treeSeq != null) {
      return AppPage(
        title: 'كشف الحساب',
        kicker: 'الحركات',
        showBack: true,
        child: StatementPanel(accSeq: accSeq!, treeSeq: treeSeq),
      );
    }

    if (treeSeq != null) return BranchesScreen(treeSeq: treeSeq!);

    return const TreesScreen();
  }
}

class _TreesPanel extends ConsumerWidget {
  const _TreesPanel({required this.onSelect, this.selectedSeq});
  final ValueChanged<String> onSelect;
  final String? selectedSeq;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treesAsync = ref.watch(treesProvider);
    return ColoredBox(
      color: AppColors.surfaceMuted,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const EdSectionHeader(title: 'الأشجار', subtitle: 'مجموعات الزبائن'),
          Expanded(
            child: treesAsync.when(
              loading: () => const LoadingView(),
              error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(treesProvider)),
              data: (trees) => ListView.separated(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                itemCount: trees.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final t = trees[i];
                  return EdTreeCard(
                    index: i + 1,
                    accountNum: t.accountNum,
                    name: t.name1,
                    meta: '${t.directChildren} زبون',
                    selected: t.seq == selectedSeq,
                    onTap: () => onSelect(t.seq),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BranchesPanel extends ConsumerStatefulWidget {
  const _BranchesPanel({required this.treeSeq, required this.onSelect, this.selectedAccSeq});
  final String treeSeq;
  final ValueChanged<String> onSelect;
  final String? selectedAccSeq;

  @override
  ConsumerState<_BranchesPanel> createState() => _BranchesPanelState();
}

class _BranchesPanelState extends ConsumerState<_BranchesPanel> {
  String _filter = 'all';
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(childrenProvider(widget.treeSeq));

    return ColoredBox(
      color: AppColors.bg,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Column(
              children: [
                EdSearchField(hint: 'بحث بالاسم أو الرقم...', onChanged: (v) => setState(() => _search = v.trim().toLowerCase())),
                const SizedBox(height: 8),
                EdFilterChips(selected: _filter, onChanged: (v) => setState(() => _filter = v)),
              ],
            ),
          ),
          const EdSectionHeader(title: 'الزبائن'),
          Expanded(
            child: branchesAsync.when(
              loading: () => const LoadingView(),
              error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
              data: (branches) {
                final filtered = branches.where((b) {
                  if (!b.matchesBranchFilter(_filter)) return false;
                  if (_search.isEmpty) return true;
                  return b.name1.toLowerCase().contains(_search) || b.accountNum.contains(_search);
                }).toList();
                if (filtered.isEmpty) return const EmptyState(message: 'لا توجد نتائج');
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
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
                      selected: b.seq == widget.selectedAccSeq,
                      onTap: () => widget.onSelect(b.seq),
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'accounts_screens.dart';
import 'statement_panel.dart';

final searchProvider = FutureProvider.family<List<BranchAccount>, String>((ref, q) async {
  if (q.trim().length < 2) return [];
  return withAuth(ref, () => ref.read(apiClientProvider).searchAccounts(q));
});

/// تخطيط كشوف الحساب — ثلاثي على الآيباد، متسلسل على الهاتف
class AccountsHubScreen extends ConsumerWidget {
  const AccountsHubScreen({super.key, this.treeSeq, this.accSeq});

  final String? treeSeq;
  final String? accSeq;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wide = MediaQuery.sizeOf(context).width >= 1000;

    if (wide) {
      return AppPage(
        title: 'كشوف الحساب',
        subtitle: 'الأشجار · الزبائن · الكشف',
        actions: [
          IconButton(onPressed: () => ref.invalidate(treesProvider), icon: const Icon(Icons.refresh_rounded)),
        ],
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              flex: 2,
              child: _TreesPanel(
                selectedSeq: treeSeq,
                onSelect: (seq) => context.go('/accounts/$seq/branches'),
              ),
            ),
            const VerticalDivider(width: 1),
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
            const VerticalDivider(width: 1),
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
        showBack: true,
        child: StatementPanel(accSeq: accSeq!, treeSeq: treeSeq),
      );
    }

    if (treeSeq != null) {
      return BranchesScreen(treeSeq: treeSeq!);
    }

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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text('الأشجار', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ),
        Expanded(
          child: treesAsync.when(
            loading: () => const LoadingView(),
            error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(treesProvider)),
            data: (trees) => ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              itemCount: trees.length,
              separatorBuilder: (_, _) => const SizedBox(height: 4),
              itemBuilder: (_, i) {
                final t = trees[i];
                final selected = t.seq == selectedSeq;
                return ListTile(
                  selected: selected,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  title: Text(t.name1, maxLines: 2, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${t.accountNum} · ${t.directChildren} زبون'),
                  onTap: () => onSelect(t.seq),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _BranchesPanel extends ConsumerStatefulWidget {
  const _BranchesPanel({
    required this.treeSeq,
    required this.onSelect,
    this.selectedAccSeq,
  });

  final String treeSeq;
  final ValueChanged<String> onSelect;
  final String? selectedAccSeq;

  @override
  ConsumerState<_BranchesPanel> createState() => _BranchesPanelState();
}

class _BranchesPanelState extends ConsumerState<_BranchesPanel> {
  String _filter = 'all';
  String _search = '';
  bool _globalSearch = false;

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(childrenProvider(widget.treeSeq));
    final globalAsync = _globalSearch && _search.length >= 2
        ? ref.watch(searchProvider(_search))
        : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Text('الزبائن', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(
                decoration: InputDecoration(
                  hintText: _globalSearch ? 'بحث في كل الحسابات...' : 'بحث بالاسم أو الرقم...',
                  prefixIcon: const Icon(Icons.search),
                  isDense: true,
                  suffixIcon: IconButton(
                    tooltip: _globalSearch ? 'بحث محلي' : 'بحث شامل',
                    icon: Icon(_globalSearch ? Icons.filter_list : Icons.travel_explore),
                    onPressed: () => setState(() => _globalSearch = !_globalSearch),
                  ),
                ),
                onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
              ),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'all', label: Text('الكل')),
                  ButtonSegment(value: 'debit', label: Text('مدين')),
                  ButtonSegment(value: 'credit', label: Text('دائن')),
                ],
                selected: {_filter},
                onSelectionChanged: (s) => setState(() => _filter = s.first),
              ),
            ],
          ),
        ),
        Expanded(
          child: _globalSearch && _search.length >= 2
              ? globalAsync!.when(
                  loading: () => const LoadingView(),
                  error: (e, _) => ErrorView(message: '$e'),
                  data: (results) => _branchList(results),
                )
              : branchesAsync.when(
                  loading: () => const LoadingView(),
                  error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
                  data: (branches) {
                    final filtered = branches.where((b) {
                      if (_filter != 'all' && b.debtStatus != _filter) return false;
                      if (_search.isEmpty) return true;
                      return b.name1.toLowerCase().contains(_search) || b.accountNum.contains(_search);
                    }).toList();
                    return _branchList(filtered);
                  },
                ),
        ),
      ],
    );
  }

  Widget _branchList(List<BranchAccount> branches) {
    if (branches.isEmpty) return const EmptyState(message: 'لا توجد نتائج');
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      itemCount: branches.length,
      separatorBuilder: (_, _) => const SizedBox(height: 4),
      itemBuilder: (_, i) {
        final b = branches[i];
        return ListTile(
          selected: b.seq == widget.selectedAccSeq,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          title: Text(b.name1, style: const TextStyle(fontWeight: FontWeight.w600)),
          subtitle: Text('${b.accountNum}${b.summary != null ? ' · ${b.summary}' : ''}'),
          trailing: b.debtAmount != null && b.debtAmount != 0
              ? Text(fmtNumAlways(b.debtAmount), style: TextStyle(color: AppTheme.debtColor(b.debtStatus), fontWeight: FontWeight.w700))
              : null,
          onTap: () => widget.onSelect(b.seq),
        );
      },
    );
  }
}

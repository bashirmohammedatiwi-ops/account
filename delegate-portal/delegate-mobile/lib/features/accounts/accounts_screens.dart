import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'statement_panel.dart';

final childrenProvider = FutureProvider.family<List<BranchAccount>, String>((ref, seq) {
  return ref.watch(apiClientProvider).getChildren(seq);
});

class TreesScreen extends ConsumerWidget {
  const TreesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treesAsync = ref.watch(treesProvider);

    return AppPage(
      title: 'كشوف الحساب',
      subtitle: 'اختر شجرة الحساب',
      actions: [
        IconButton(onPressed: () => ref.invalidate(treesProvider), icon: const Icon(Icons.refresh_rounded)),
      ],
      child: treesAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(treesProvider)),
        data: (trees) {
          if (trees.isEmpty) return const EmptyState(message: 'لا توجد أشجار مخصصة');
          return LayoutBuilder(
            builder: (context, c) {
              final cols = c.maxWidth >= 1100 ? 3 : (c.maxWidth >= 600 ? 2 : 1);
              return GridView.builder(
                padding: const EdgeInsets.all(20),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 1.6,
                ),
                itemCount: trees.length,
                itemBuilder: (_, i) => _TreeCard(tree: trees[i]),
              );
            },
          );
        },
      ),
    );
  }
}

class _TreeCard extends StatelessWidget {
  const _TreeCard({required this.tree});
  final AccountTree tree;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.go('/accounts/${tree.seq}/branches'),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.account_tree_rounded, color: Theme.of(context).colorScheme.primary),
                  const Spacer(),
                  Text(tree.accountNum, style: Theme.of(context).textTheme.labelLarge),
                ],
              ),
              const SizedBox(height: 12),
              Text(tree.name1, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
              const Spacer(),
              Text('${tree.directChildren} زبون', style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
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
      subtitle: 'اختر حساباً لعرض كشفه',
      showBack: true,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    decoration: const InputDecoration(
                      hintText: 'بحث بالاسم أو الرقم...',
                      prefixIcon: Icon(Icons.search),
                      isDense: true,
                    ),
                    onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
                  ),
                ),
                const SizedBox(width: 12),
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
            child: branchesAsync.when(
              loading: () => const LoadingView(),
              error: (e, _) => ErrorView(message: '$e', onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
              data: (branches) {
                final filtered = branches.where((b) {
                  if (_filter != 'all' && b.debtStatus != _filter) return false;
                  if (_search.isEmpty) return true;
                  return b.name1.toLowerCase().contains(_search) || b.accountNum.contains(_search);
                }).toList();
                if (filtered.isEmpty) return const EmptyState(message: 'لا توجد نتائج');

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final b = filtered[i];
                    return Card(
                      child: ListTile(
                        title: Text(b.name1, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${b.accountNum}${b.summary != null ? ' · ${b.summary}' : ''}'),
                        trailing: b.debtAmount != null && b.debtAmount != 0
                            ? Text(fmtNumAlways(b.debtAmount), style: TextStyle(color: AppTheme.debtColor(b.debtStatus), fontWeight: FontWeight.w700))
                            : null,
                        onTap: () => context.go('/accounts/${widget.treeSeq}/statement/${b.seq}'),
                      ),
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

final statementProvider = FutureProvider.family<AccountStatement, String>((ref, seq) {
  return ref.watch(apiClientProvider).getStatement(seq);
});

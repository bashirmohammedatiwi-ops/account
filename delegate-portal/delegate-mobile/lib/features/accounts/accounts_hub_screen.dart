import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'accounts_screens.dart';
import 'statement_panel.dart';

final searchProvider = FutureProvider.family<List<BranchAccount>, String>((ref, q) async {
  if (q.trim().length < 2) return [];
  return withAuth(ref, () => ref.read(apiClientProvider).searchAccounts(q));
});

/// توجيه فقط — كل مستوى في صفحة منفصلة (مثل الويب)
class AccountsHubScreen extends ConsumerWidget {
  const AccountsHubScreen({super.key, this.treeSeq, this.accSeq});

  final String? treeSeq;
  final String? accSeq;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treesAsync = ref.watch(treesProvider);
    final tree = treeSeq != null
        ? treesAsync.maybeWhen(
            data: (trees) {
              for (final t in trees) {
                if (t.seq == treeSeq) return t;
              }
              return null;
            },
            orElse: () => null,
          )
        : null;

    if (accSeq != null && treeSeq != null) {
      return StatementScreen(
        accSeq: accSeq!,
        treeSeq: treeSeq!,
        treeName: tree?.name1,
        treeNum: tree?.accountNum,
      );
    }

    if (treeSeq != null) {
      return BranchesScreen(treeSeq: treeSeq!, tree: tree);
    }

    return const TreesScreen();
  }
}

class StatementScreen extends ConsumerWidget {
  const StatementScreen({
    super.key,
    required this.accSeq,
    required this.treeSeq,
    this.treeName,
    this.treeNum,
  });

  final String accSeq;
  final String treeSeq;
  final String? treeName;
  final String? treeNum;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: 'كشف الحساب',
      kicker: 'Edari · الكشف',
      subtitle: treeName != null ? 'شجرة $treeName' : '',
      showBack: true,
      onBack: () => context.go('/accounts/$treeSeq/branches'),
      child: StatementPanel(
        accSeq: accSeq,
        treeSeq: treeSeq,
        treeName: treeName,
        treeNum: treeNum,
      ),
    );
  }
}

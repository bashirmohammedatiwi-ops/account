import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../theme/app_colors.dart';
import '../utils/debounce.dart';
import '../../models/models.dart';
import 'adaptive_shell.dart';

/// اختيار شجرة ثم زبون — واجهة مميزة للهاتف والتابلت
Future<PickedCustomer?> showCustomerPicker(
  BuildContext context,
  WidgetRef ref, {
  bool includePending = true,
}) {
  return showModalBottomSheet<PickedCustomer>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _CustomerPickerSheet(ref: ref, includePending: includePending),
  );
}

/// اختصار لاختيار زبون فقط (للفواتير والطلبات)
Future<BranchAccount?> pickBranchCustomer(
  BuildContext context,
  WidgetRef ref, {
  bool includePending = true,
}) async {
  final picked = await showCustomerPicker(context, ref, includePending: includePending);
  return picked?.customer;
}

class _CustomerPickerSheet extends ConsumerStatefulWidget {
  const _CustomerPickerSheet({required this.ref, required this.includePending});

  final WidgetRef ref;
  final bool includePending;

  @override
  ConsumerState<_CustomerPickerSheet> createState() => _CustomerPickerSheetState();
}

class _CustomerPickerSheetState extends ConsumerState<_CustomerPickerSheet> {
  AccountTree? _tree;
  List<AccountTree>? _trees;
  List<BranchAccount>? _branches;
  bool _loading = true;
  String? _error;
  String _search = '';
  final _debounce = Debouncer();
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadTrees();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _debounce.dispose();
    super.dispose();
  }

  Future<void> _loadTrees() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final trees = await ref.read(apiClientProvider).getTrees();
      if (!mounted) return;
      setState(() {
        _trees = trees;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _selectTree(AccountTree tree) async {
    setState(() {
      _tree = tree;
      _loading = true;
      _error = null;
      _search = '';
      _searchCtrl.clear();
    });
    try {
      final api = ref.read(apiClientProvider);
      final branches = widget.includePending
          ? await api.getPickableCustomers(tree.seq)
          : await api.getChildren(tree.seq);
      if (!mounted) return;
      setState(() {
        _branches = branches;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _searchRemote(String q) async {
    if (q.trim().length < 2) {
      if (_tree != null) await _selectTree(_tree!);
      return;
    }
    setState(() => _loading = true);
    try {
      final results = await ref.read(apiClientProvider).searchAccounts(q.trim());
      if (!mounted) return;
      setState(() {
        _branches = results;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  List<BranchAccount> get _filteredBranches {
    final list = _branches ?? [];
    if (_search.isEmpty) return list;
    final q = _search.toLowerCase();
    return list.where((b) {
      return b.name1.toLowerCase().contains(q) ||
          (b.accountNum).contains(q) ||
          (b.address ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.92;

    return Padding(
      padding: EdgeInsets.only(top: MediaQuery.paddingOf(context).top > 0 ? 8 : 24),
      child: Container(
        constraints: BoxConstraints(maxHeight: maxH),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(99)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
              child: Row(
                children: [
                  if (_tree != null)
                    IconButton(
                      onPressed: () => setState(() {
                        _tree = null;
                        _branches = null;
                        _search = '';
                        _searchCtrl.clear();
                      }),
                      icon: const Icon(Icons.arrow_forward_rounded, color: AppColors.navy),
                    ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _tree == null ? 'اختر الشجرة' : 'اختر الزبون',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy),
                        ),
                        if (_tree != null)
                          Text(
                            _tree!.name1,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                      ],
                    ),
                  ),
                  IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
                ],
              ),
            ),
            if (_tree != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'بحث بالاسم أو الرقم...',
                    prefixIcon: const Icon(Icons.search_rounded, size: 22),
                    filled: true,
                    fillColor: AppColors.surfaceAlt,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                  ),
                  onChanged: (v) {
                    setState(() => _search = v);
                    _debounce.run(() => _searchRemote(v));
                  },
                ),
              ),
            const SizedBox(height: 8),
            Flexible(
              child: _loading
                  ? const LoadingView(message: 'جاري التحميل...')
                  : _error != null
                      ? ErrorView(message: _error!, onRetry: _tree == null ? _loadTrees : () => _selectTree(_tree!))
                      : _tree == null
                          ? _treeList()
                          : _branchList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _treeList() {
    final trees = _trees ?? [];
    if (trees.isEmpty) {
      return const EmptyState(message: 'لا توجد شجرات معيّنة لحسابك', icon: Icons.account_tree_outlined);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: trees.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final t = trees[i];
        return Material(
          color: AppColors.surfaceAlt,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => _selectTree(t),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.moduleAccounts.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.account_tree_rounded, color: AppColors.moduleAccounts),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.name1, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
                        Text(
                          '${t.directChildren} زبون · ${t.accountNum}',
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_left_rounded, color: AppColors.muted),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _branchList() {
    final branches = _filteredBranches;
    if (branches.isEmpty) {
      return const EmptyState(message: 'لا يوجد زبائن في هذه الشجرة', icon: Icons.person_off_outlined);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: branches.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (context, i) {
        final b = branches[i];
        return Material(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () {
              if (!widget.includePending && b.isPending) return;
              Navigator.pop(context, PickedCustomer(customer: b, tree: _tree!));
            },
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: AppColors.accentSoft,
                    child: Text(
                      b.name1.isNotEmpty ? b.name1.characters.first : 'ز',
                      style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.accent),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(b.name1, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
                        if (b.isPending)
                          Text(
                            'بانتظار الترحيل${b.pendingLabel != null ? ' · ${b.pendingLabel}' : ''}',
                            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.warning),
                          ),
                        if (b.address != null && b.address!.isNotEmpty)
                          Text(b.address!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.muted)),
                        Text(b.accountNum, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.moduleAccounts)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/delegate_api.dart';
import '../theme/app_colors.dart';
import 'governorate_ui.dart';
import '../utils/debounce.dart';
import '../utils/branch_search.dart';
import '../../models/models.dart';
import '../layout/breakpoints.dart';
import 'adaptive_shell.dart';

/// اختيار شجرة ثم زبون — واجهة مميزة للهاتف والتابلت
Future<PickedCustomer?> showCustomerPicker(
  BuildContext context,
  WidgetRef ref, {
  bool includePending = true,
}) {
  // آيباد: نافذة وسط الشاشة بدل لوح بطول الشاشة.
  if (EdLayout.of(context).isWide) {
    final h = MediaQuery.sizeOf(context).height;
    return showDialog<PickedCustomer>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(32),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 560, maxHeight: h * 0.8, minHeight: h * 0.5),
          child: Directionality(
            textDirection: TextDirection.rtl,
            child: _CustomerPickerSheet(ref: ref, includePending: includePending, inDialog: true),
          ),
        ),
      ),
    );
  }
  return showModalBottomSheet<PickedCustomer>(
    context: context,
    useRootNavigator: true,
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
  const _CustomerPickerSheet({required this.ref, required this.includePending, this.inDialog = false});

  final WidgetRef ref;
  final bool includePending;
  final bool inDialog;

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
  bool _remoteSearchActive = false;
  bool _pickableSearchActive = false;
  /// فلتر المحافظة داخل الشجرة (null = الكل).
  String? _gov;
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
      // المحلي أولاً — فوري حتى مع شبكة ضعيفة.
      final api = ref.read(apiClientProvider);
      final trees = await api.cacheOnly(() => api.getTrees()) ?? await api.getTrees();
      if (!mounted) return;
      setState(() {
        _trees = trees;
        _loading = false;
      });
      // شجرة واحدة فقط: ننتقل مباشرة لاختيار الزبون.
      if (trees.length == 1 && _tree == null) {
        await _selectTree(trees.first);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _loadTreeBranches() async {
    final tree = _tree;
    if (tree == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      Future<List<BranchAccount>> fetch() => widget.includePending
          ? api.getPickableCustomers(tree.seq)
          : api.getChildren(tree.seq);
      final cached = await api.cacheOnly(fetch);
      final branches = cached ?? await fetch();
      if (!mounted) return;
      setState(() {
        _branches = branches;
        _loading = false;
        _remoteSearchActive = false;
        _pickableSearchActive = false;
      });
      if (cached != null) {
        // تحديث صامت من الخادم إن كان متاحاً.
        fetch().then((fresh) {
          if (!mounted || _tree?.seq != tree.seq || _search.trim().isNotEmpty) return;
          setState(() => _branches = fresh);
        }).catchError((_) {});
      }
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
      _search = '';
      _searchCtrl.clear();
      _remoteSearchActive = false;
      _pickableSearchActive = false;
    });
    await _loadTreeBranches();
  }

  Future<void> _searchPickable(String q) async {
    final tree = _tree;
    if (tree == null) return;
    final trimmed = q.trim();
    if (trimmed.length < 2) {
      if (_pickableSearchActive) {
        await _loadTreeBranches();
      }
      return;
    }
    setState(() => _loading = true);
    try {
      final results = await ref.read(apiClientProvider).getPickableCustomers(tree.seq, q: trimmed);
      if (!mounted) return;
      setState(() {
        _branches = results;
        _loading = false;
        _pickableSearchActive = true;
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
    final trimmed = q.trim();
    if (trimmed.length < 2) {
      // أقل من حرفين: تصفية محلية فقط — لا نعيد تحميل الشجرة ولا نمسح النص.
      if (_remoteSearchActive) {
        await _loadTreeBranches();
      }
      return;
    }
    setState(() => _loading = true);
    try {
      final results = await ref.read(apiClientProvider).searchAccounts(trimmed);
      if (!mounted) return;
      setState(() {
        _branches = results;
        _loading = false;
        _remoteSearchActive = true;
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
    final list = (_branches ?? []).where((b) => b.matchesGovernorate(_gov)).toList();
    if (_search.isEmpty || _pickableSearchActive || _remoteSearchActive) return list;
    return filterBranchesForSearch(list, _search);
  }

  Widget _governorateBar() {
    final all = _branches ?? const <BranchAccount>[];
    final counts = countByGovernorate(all);
    if (counts.keys.every((k) => k == kUnclassifiedGovernorate)) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: EdGovernorateFilterBar(
        counts: counts,
        total: all.where((b) => b.hasPostedAccount).length,
        selected: _gov != null && (counts[_gov] ?? 0) > 0 ? _gov : null,
        onSelected: (code) => setState(() => _gov = code),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.sizeOf(context).height * 0.92;

    return Padding(
      padding: EdgeInsets.only(top: widget.inDialog ? 0 : (MediaQuery.paddingOf(context).top > 0 ? 8 : 24)),
      child: Container(
        constraints: BoxConstraints(maxHeight: maxH),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: widget.inDialog ? null : const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!widget.inDialog) ...[
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(99)),
              ),
            ],
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
              child: Row(
                children: [
                  if (_tree != null)
                    IconButton(
                      onPressed: () => setState(() {
                        _tree = null;
                        _branches = null;
                        _gov = null;
                        _search = '';
                        _searchCtrl.clear();
                        _remoteSearchActive = false;
                        _pickableSearchActive = false;
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
                    if (widget.includePending) {
                      _debounce.run(() => _searchPickable(v));
                    } else {
                      _debounce.run(() => _searchRemote(v));
                    }
                  },
                ),
              ),
            if (_tree != null && !_loading && _error == null) _governorateBar(),
            const SizedBox(height: 8),
            Flexible(
              child: _loading
                  ? const LoadingView(message: 'جاري التحميل...')
                  : _error != null
                      ? ErrorView(message: _error!, onRetry: _tree == null ? _loadTrees : _loadTreeBranches)
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
      separatorBuilder: (_, _) => const SizedBox(height: 8),
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
      final message = _search.trim().isNotEmpty
          ? 'لا نتائج مطابقة لـ «${_search.trim()}»'
          : 'لا يوجد زبائن في هذه الشجرة';
      return EmptyState(message: message, icon: Icons.person_off_outlined);
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: branches.length,
      separatorBuilder: (_, _) => const SizedBox(height: 6),
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 19,
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
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.warning),
                          ),
                        Text(
                          [b.accountNum, if ((b.address ?? '').trim().isNotEmpty) b.address!.trim()].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                        if (b.governorateName != null) ...[
                          const SizedBox(height: 3),
                          EdGovernorateBadge(branch: b),
                        ],
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/delegate_api.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/debounce.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../core/widgets/ed_kit.dart';
import '../../core/widgets/governorate_ui.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'account_ui.dart';
import 'accounts_theme.dart';
import 'branches_ui.dart';
import 'trees_ui.dart';

final childrenProvider = StreamProvider.family<List<BranchAccount>, String>((ref, seq) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getChildren(seq)));
});

class TreesScreen extends ConsumerWidget {
  const TreesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final treesAsync = ref.watch(treesProvider);
    final agentName = ref.watch(authProvider).agent?.name ?? 'مندوب';

    return AppPage(
      title: 'كشوف الحساب',
      subtitle: 'اختر شجرة للمتابعة',
      showBack: true,
      onBack: () => context.go('/home'),
      toolbar: const EdFlowSteps(current: 0),
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(treesProvider)),
      ],
      child: ColoredBox(
      color: EdAccountsTheme.pageBg,
        child: treesAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الأشجار...'),
          error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(treesProvider)),
          data: (trees) => RefreshIndicator(
            color: AppColors.primary,
            onRefresh: () async => ref.invalidate(treesProvider),
            child: EdTreesPage(
              trees: trees,
              agentName: agentName,
              onTreeTap: (t) => context.go('/accounts/${t.seq}/branches'),
            ),
          ),
        ),
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

  /// فلتر المحافظة (null = الكل) — يُحفظ لكل شجرة على حدة.
  String? _gov;
  bool _selecting = false;
  final Set<String> _selected = {};
  bool _saving = false;

  String get _govPrefsKey => 'edari_gov_filter:${widget.treeSeq}';

  @override
  void initState() {
    super.initState();
    _restoreGovFilter();
  }

  Future<void> _restoreGovFilter() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_govPrefsKey);
      if (saved != null && saved.isNotEmpty && mounted) setState(() => _gov = saved);
    } catch (_) {}
  }

  Future<void> _setGov(String? code) async {
    setState(() => _gov = code);
    try {
      final prefs = await SharedPreferences.getInstance();
      if (code == null) {
        await prefs.remove(_govPrefsKey);
      } else {
        await prefs.setString(_govPrefsKey, code);
      }
    } catch (_) {}
  }

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

  void _startSelecting([BranchAccount? first]) {
    setState(() {
      _selecting = true;
      _selected.clear();
      if (first != null && first.hasPostedAccount) _selected.add(first.seq);
    });
  }

  void _stopSelecting() => setState(() {
        _selecting = false;
        _selected.clear();
      });

  void _toggle(BranchAccount b) {
    if (!b.hasPostedAccount) return;
    setState(() => _selected.contains(b.seq) ? _selected.remove(b.seq) : _selected.add(b.seq));
  }

  Future<void> _classify(List<BranchAccount> targets, Map<String, int> counts) async {
    if (targets.isEmpty || _saving) return;
    final single = targets.length == 1 ? targets.first : null;
    final pick = await showGovernoratePicker(
      context,
      title: single != null ? 'محافظة الزبون' : 'تصنيف ${targets.length} زبون',
      subtitle: single?.name1 ?? 'اختر المحافظة لكل الزبائن المحددين',
      current: single?.governorateCode,
      allowClear: targets.any((b) => b.governorateCode != null),
      counts: counts,
    );
    if (pick == null || !mounted) return;
    if (single != null && pick.code == single.governorateCode) return;

    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(apiClientProvider).setCustomerGovernorate(targets.map((b) => b.seq).toList(), pick.code);
      ref.invalidate(childrenProvider(widget.treeSeq));
      if (!mounted) return;
      final what = single != null ? single.name1 : '${targets.length} زبون';
      messenger.showSnackBar(SnackBar(
        content: Text(pick.code == null ? 'أُزيل تصنيف $what' : 'صُنّف $what في ${iraqGovernorateName(pick.code!)}'),
      ));
      if (_selecting) _stopSelecting();
    } catch (e) {
      if (mounted) messenger.showSnackBar(SnackBar(content: Text(e.displayMessage)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(childrenProvider(widget.treeSeq));
    final treesAsync = ref.watch(treesProvider);
    final tree = treesAsync.maybeWhen(data: _resolveTree, orElse: () => widget.tree);
    // التصنيف للرئيسي؛ الثانوي يرى الفلتر فقط.
    final canClassify = ref.watch(authProvider.select((s) => s.agent?.isPrimary ?? false));

    return PopScope(
      canPop: !_selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _selecting) _stopSelecting();
      },
      child: AppPage(
        title: _selecting ? 'تصنيف الزبائن' : 'الزبائن',
        kicker: 'كشوف الحساب',
        subtitle: tree?.name1 ?? '',
        showBack: true,
        onBack: () => _selecting ? _stopSelecting() : context.go('/accounts'),
        toolbar: const EdFlowSteps(current: 1),
        actions: [
          EdHeaderIconButton(
            icon: Icons.refresh_rounded,
            tooltip: 'تحديث',
            onPressed: () => ref.invalidate(childrenProvider(widget.treeSeq)),
          ),
        ],
        child: branchesAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الزبائن...'),
          error: (e, _) =>
              ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(childrenProvider(widget.treeSeq))),
          data: (branches) {
            final counts = countByGovernorate(branches);
            // محافظة محفوظة لم يعد فيها زبائن — نعرض الكل بدل قائمة فارغة.
            final gov = _gov != null && (counts[_gov] ?? 0) > 0 ? _gov : null;
            final inGov = branches.where((b) => b.matchesGovernorate(gov)).toList();
            final filtered = inGov.where((b) {
              if (!b.matchesBranchFilter(_filter)) return false;
              if (_searchApplied.isEmpty) return true;
              return b.name1.toLowerCase().contains(_searchApplied) || b.accountNum.contains(_searchApplied);
            }).toList()
              ..sort((a, b) {
                final debtCmp = resolveBranchDebt(b).compareTo(resolveBranchDebt(a));
                if (debtCmp != 0) return debtCmp;
                return a.name1.compareTo(b.name1);
              });

            final treeForBanner = tree ??
                AccountTree(
                  seq: widget.treeSeq,
                  accountNum: '—',
                  name1: '—',
                  bal: 0,
                  subCount: 0,
                  directChildren: branches.length,
                );

            final content = EdBranchesContent(
              tree: treeForBanner,
              branches: inGov,
              filtered: filtered,
              filter: _filter,
              governorateBar: EdGovernorateFilterBar(
                counts: counts,
                total: branches.where((b) => b.hasPostedAccount).length,
                selected: gov,
                onSelected: _setGov,
                onClassify: canClassify && !_selecting ? () => _startSelecting() : null,
              ),
              selecting: _selecting,
              selected: _selected,
              onBranchLongPress: canClassify ? (b) => _selecting ? _toggle(b) : _startSelecting(b) : null,
              onGovernorateTap: canClassify ? (b) => _classify([b], counts) : null,
              onSearchChanged: (v) {
                final q = v.trim().toLowerCase();
                _debouncer.run(() {
                  if (mounted) setState(() => _searchApplied = q);
                });
              },
              onFilterChanged: (v) => setState(() => _filter = v),
              onBranchTap: (b) =>
                  _selecting ? _toggle(b) : context.go('/accounts/${widget.treeSeq}/statement/${b.seq}'),
            );

            if (!_selecting) return content;
            final visible = filtered.where((b) => b.hasPostedAccount).map((b) => b.seq).toSet();
            final allVisibleSelected = visible.isNotEmpty && _selected.containsAll(visible);
            return Stack(
              children: [
                Positioned.fill(child: content),
                PositionedDirectional(
                  start: 0,
                  end: 0,
                  bottom: 0,
                  child: _SelectionBar(
                    count: _selected.length,
                    saving: _saving,
                    allVisibleSelected: allVisibleSelected,
                    onToggleAll: () => setState(() {
                      if (allVisibleSelected) {
                        _selected.removeAll(visible);
                      } else {
                        _selected.addAll(visible);
                      }
                    }),
                    onCancel: _stopSelecting,
                    onAssign: () => _classify(
                      branches.where((b) => _selected.contains(b.seq)).toList(),
                      counts,
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// شريط سفلي لوضع التصنيف الجماعي.
class _SelectionBar extends StatelessWidget {
  const _SelectionBar({
    required this.count,
    required this.saving,
    required this.allVisibleSelected,
    required this.onToggleAll,
    required this.onCancel,
    required this.onAssign,
  });

  final int count;
  final bool saving;
  final bool allVisibleSelected;
  final VoidCallback onToggleAll;
  final VoidCallback onCancel;
  final VoidCallback onAssign;

  @override
  Widget build(BuildContext context) {
    final pad = EdContent.hPad(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(pad, 8, pad, 12),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Container(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
              decoration: BoxDecoration(
                color: AppColors.navy,
                borderRadius: BorderRadius.circular(AppColors.radiusXl),
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 8))],
              ),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'إلغاء',
                    onPressed: onCancel,
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          count == 0 ? 'حدّد الزبائن' : 'تم تحديد $count',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                        InkWell(
                          onTap: onToggleAll,
                          child: Text(
                            allVisibleSelected ? 'إلغاء تحديد الظاهرين' : 'تحديد كل الظاهرين',
                            style: const TextStyle(color: Color(0xFF9EC3FF), fontWeight: FontWeight.w700, fontSize: 12.5),
                          ),
                        ),
                      ],
                    ),
                  ),
                  FilledButton.icon(
                    onPressed: count == 0 || saving ? null : onAssign,
                    icon: saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.place_rounded, size: 18),
                    label: const Text('تحديد المحافظة'),
                    style: FilledButton.styleFrom(
                      backgroundColor: kGovernorateColor,
                      disabledBackgroundColor: Colors.white.withValues(alpha: 0.12),
                      disabledForegroundColor: Colors.white54,
                      minimumSize: const Size(0, 44),
                      textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800, fontSize: 13.5),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

final statementProvider = StreamProvider.family<AccountStatement, String>((ref, seq) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getStatement(seq)));
});

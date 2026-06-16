import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import 'account_ui.dart';
import 'accounts_theme.dart';

class EdBranchesContent extends StatelessWidget {
  const EdBranchesContent({
    super.key,
    required this.tree,
    required this.branches,
    required this.filtered,
    required this.filter,
    required this.onSearchChanged,
    required this.onFilterChanged,
    required this.onBranchTap,
  });

  final AccountTree tree;
  final List<BranchAccount> branches;
  final List<BranchAccount> filtered;
  final String filter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onFilterChanged;
  final ValueChanged<BranchAccount> onBranchTap;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final summary = summarizeBranches(branches);
    final isFiltered = filter != 'all' || filtered.length != branches.length;
    final cols = layout.gridColumns(phone: 1, tablet: 2, wide: 2, desktop: 3);

    return Container(
      color: EdAccountsTheme.pageBg,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _SoftTreeCard(tree: tree, summary: summary),
                const SizedBox(height: 18),
                _SoftSearchBar(
                  filter: filter,
                  onSearchChanged: onSearchChanged,
                  onFilterChanged: onFilterChanged,
                ),
                const SizedBox(height: 18),
                _SoftSectionTitle(
                  count: filtered.length,
                  total: branches.length,
                  isFiltered: isFiltered,
                ),
                const SizedBox(height: 14),
              ]),
            ),
          ),
          if (filtered.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: const EdgeInsets.all(40),
                child: EmptyState(
                  message: branches.isEmpty ? 'لا يوجد زبائن في هذه الشجرة' : 'لا توجد نتائج مطابقة',
                  icon: Icons.people_outline,
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 32),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: cols,
                  crossAxisSpacing: 14,
                  mainAxisSpacing: 14,
                  mainAxisExtent: _SoftBranchCard.height,
                ),
                delegate: SliverChildBuilderDelegate(
                  (context, i) => _SoftBranchCard(
                    branch: filtered[i],
                    onTap: () => onBranchTap(filtered[i]),
                  ),
                  childCount: filtered.length,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Tree card ───

class _SoftTreeCard extends StatelessWidget {
  const _SoftTreeCard({required this.tree, required this.summary});

  final AccountTree tree;
  final BranchDebtSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: EdAccountsTheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: EdAccountsTheme.line),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 3))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: EdAccountsTheme.accent),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: EdAccountsTheme.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: EdAccountsTheme.line),
                      ),
                      child: const Icon(Icons.account_tree_rounded, color: EdAccountsTheme.accent, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tree.name1,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.3),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'شجرة ${tree.accountNum}',
                            textDirection: TextDirection.ltr,
                            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: EdAccountsTheme.cardTint,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: EdAccountsTheme.line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('إجمالي ديون الشجرة', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      const SizedBox(height: 4),
                      Text(
                        fmtNumAlways(summary.totalDebt),
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _SoftPill(label: 'زبائن', value: '${summary.total}', fg: AppColors.navy),
                    _SoftPill(label: 'مدين', value: '${summary.withDebt}', fg: EdAccountsTheme.debit),
                    _SoftPill(label: 'دائن', value: '${summary.credit}', fg: EdAccountsTheme.credit),
                    _SoftPill(label: 'متعادل', value: '${summary.clear}', fg: EdAccountsTheme.neutral),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SoftPill extends StatelessWidget {
  const _SoftPill({required this.label, required this.value, required this.fg});

  final String label;
  final String value;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: EdAccountsTheme.cardTint,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: fg)),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
        ],
      ),
    );
  }
}

// ─── Search ───

class _SoftSearchBar extends StatelessWidget {
  const _SoftSearchBar({
    required this.filter,
    required this.onSearchChanged,
    required this.onFilterChanged,
  });

  final String filter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onFilterChanged;

  static const _filters = [('all', 'الكل'), ('debit', 'مدين'), ('credit', 'دائن')];

  Color _filterColor(String key, {required bool selected}) {
    return EdAccountsTheme.filterStyle(key, selected: selected).fg;
  }

  Color _filterBg(String key, {required bool selected}) {
    return EdAccountsTheme.filterStyle(key, selected: selected).bg;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: EdAccountsTheme.line),
            boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.03), blurRadius: 12, offset: const Offset(0, 4))],
          ),
          child: EdSearchField(hint: 'ابحث عن زبون...', onChanged: onSearchChanged),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (var i = 0; i < _filters.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _SoftFilterChip(
                  label: _filters[i].$2,
                  selected: filter == _filters[i].$1,
                  fg: _filterColor(_filters[i].$1, selected: filter == _filters[i].$1),
                  bg: _filterBg(_filters[i].$1, selected: filter == _filters[i].$1),
                  onTap: () => onFilterChanged(_filters[i].$1),
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _SoftFilterChip extends StatelessWidget {
  const _SoftFilterChip({required this.label, required this.selected, required this.fg, required this.bg, required this.onTap});

  final String label;
  final bool selected;
  final Color fg;
  final Color bg;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? fg.withValues(alpha: 0.35) : EdAccountsTheme.line),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: fg),
        ),
      ),
    );
  }
}

class _SoftSectionTitle extends StatelessWidget {
  const _SoftSectionTitle({required this.count, required this.total, required this.isFiltered});

  final int count;
  final int total;
  final bool isFiltered;

  @override
  Widget build(BuildContext context) {
    final t = isFiltered ? '$count من $total زبون' : '$count زبون';
    return Text(t, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.textSecondary));
  }
}

// ─── Branch card ───

class _SoftBranchCard extends StatelessWidget {
  const _SoftBranchCard({required this.branch, required this.onTap});

  final BranchAccount branch;
  final VoidCallback onTap;

  static const height = 148.0;

  @override
  Widget build(BuildContext context) {
    final variant = branchVariant(branch);
    final debt = resolveBranchDebt(branch);
    final status = branch.summaryLabel ?? branchStatusLabel(variant);
    final style = EdAccountsTheme.variantStyle(variant);
    final address = branch.address?.trim();
    final hasAddress = address != null && address.isNotEmpty;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          height: height,
          decoration: BoxDecoration(
            color: EdAccountsTheme.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: EdAccountsTheme.line),
            boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.03), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Stack(
            children: [
              PositionedDirectional(
                start: 0,
                top: 10,
                bottom: 10,
                child: Container(
                  width: 3,
                  decoration: BoxDecoration(
                    color: style.fg.withValues(alpha: 0.65),
                    borderRadius: const BorderRadiusDirectional.horizontal(start: Radius.circular(16)),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            branch.name1,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.25),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: style.bg,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: style.border),
                          ),
                          child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: style.fg)),
                        ),
                      ],
                    ),
                    if (hasAddress) ...[
                      const SizedBox(height: 6),
                      Text(
                        address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: AppColors.textSecondary),
                      ),
                    ],
                    const Spacer(),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('الديون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.muted)),
                              const SizedBox(height: 2),
                              Text(
                                debt > 0 ? fmtNumAlways(debt) : '0',
                                textDirection: TextDirection.ltr,
                                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: style.fg),
                              ),
                            ],
                          ),
                        ),
                        Icon(Icons.chevron_left_rounded, size: 20, color: style.fg.withValues(alpha: 0.7)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

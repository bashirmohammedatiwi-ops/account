import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../core/widgets/ed_page_decor.dart';
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
    final cols = layout.gridColumns(phone: 2, tablet: 2, wide: 3, desktop: 3);
    final pad = edPageHorizontalPadding(context);
    final cardExtent = edFormalCardExtent(layout, phone: 132, tablet: 148);

    return ColoredBox(
      color: Colors.white,
      child: Stack(
        children: [
          const EdModernBackdrop(variant: EdBackdropVariant.accounts),
        CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(pad, 12, pad, 0),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  _BranchTreeHero(tree: tree, summary: summary),
                  const SizedBox(height: 16),
                  _BranchSearchPanel(
                    filter: filter,
                    onSearchChanged: onSearchChanged,
                    onFilterChanged: onFilterChanged,
                  ),
                  const SizedBox(height: 16),
                  _BranchSectionTitle(
                    count: filtered.length,
                    total: branches.length,
                    isFiltered: isFiltered,
                  ),
                  const SizedBox(height: 12),
                ]),
              ),
            ),
            if (filtered.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: EmptyState(
                    message: branches.isEmpty ? 'لا يوجد زبائن في هذه الشجرة' : 'لا توجد نتائج مطابقة',
                    icon: Icons.people_outline,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(pad, 0, pad, 32),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: cols,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    mainAxisExtent: cardExtent,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _BranchTileEntrance(
                      index: i,
                      child: _BranchUniformCard(
                        branch: filtered[i],
                        onTap: () => onBranchTap(filtered[i]),
                        large: layout.isTablet,
                      ),
                    ),
                    childCount: filtered.length,
                  ),
                ),
              ),
          ],
        ),
      ],
      ),
    );
  }
}

class _BranchTreeHero extends StatelessWidget {
  const _BranchTreeHero({required this.tree, required this.summary});

  final AccountTree tree;
  final BranchDebtSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          EdCardDecorStrip(
            child: Row(
              children: [
                const Icon(Icons.account_tree_rounded, size: 16, color: Colors.white70),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    tree.name1,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white),
                  ),
                ),
                Text(
                  tree.accountNum,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.65)),
                ),
              ],
            ),
          ),
          Container(
            color: AppColors.surface,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('إجمالي الديون', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                            const SizedBox(height: 4),
                            Text(
                              fmtNumAlways(summary.totalDebt),
                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.borderLight),
                        ),
                        child: Column(
                          children: [
                            Text('${summary.total}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
                            const Text('زبون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(child: _SummaryChip(label: 'مدين', value: '${summary.withDebt}', color: EdAccountsTheme.debit)),
                    const SizedBox(width: 8),
                    Expanded(child: _SummaryChip(label: 'دائن', value: '${summary.credit}', color: EdAccountsTheme.credit)),
                    const SizedBox(width: 8),
                    Expanded(child: _SummaryChip(label: 'متعادل', value: '${summary.clear}', color: AppColors.muted)),
                  ],
                ),
              ],
            ),
          ),
          ),
        ],
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Column(
        children: [
          Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: color)),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class _BranchSearchPanel extends StatelessWidget {
  const _BranchSearchPanel({
    required this.filter,
    required this.onSearchChanged,
    required this.onFilterChanged,
  });

  final String filter;
  final ValueChanged<String> onSearchChanged;
  final ValueChanged<String> onFilterChanged;

  static const _filters = [('all', 'الكل'), ('debit', 'مدين'), ('credit', 'دائن')];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: EdSearchField(hint: 'ابحث عن زبون بالاسم أو الرقم...', onChanged: onSearchChanged),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var i = 0; i < _filters.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: _FilterPill(
                  label: _filters[i].$2,
                  selected: filter == _filters[i].$1,
                  style: EdAccountsTheme.filterStyle(_filters[i].$1, selected: filter == _filters[i].$1),
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

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.style,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final ({Color fg, Color bg}) style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? style.bg : AppColors.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? style.fg.withValues(alpha: 0.35) : AppColors.borderLight),
        ),
        alignment: Alignment.center,
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: selected ? style.fg : AppColors.muted)),
      ),
    );
  }
}

class _BranchSectionTitle extends StatelessWidget {
  const _BranchSectionTitle({required this.count, required this.total, required this.isFiltered});

  final int count;
  final int total;
  final bool isFiltered;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: const Icon(Icons.people_outline_rounded, size: 18, color: AppColors.accentTeal),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            isFiltered ? '$count من $total زبون' : '$count زبون',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy),
          ),
        ),
      ],
    );
  }
}

class _BranchTileEntrance extends StatefulWidget {
  const _BranchTileEntrance({required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<_BranchTileEntrance> createState() => _BranchTileEntranceState();
}

class _BranchTileEntranceState extends State<_BranchTileEntrance> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 360));
    Future.delayed(Duration(milliseconds: 25 * widget.index), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: _ctrl, curve: Curves.easeOut),
      child: widget.child,
    );
  }
}

class _BranchUniformCard extends StatefulWidget {
  const _BranchUniformCard({required this.branch, required this.onTap, this.large = false});

  final BranchAccount branch;
  final VoidCallback onTap;
  final bool large;

  @override
  State<_BranchUniformCard> createState() => _BranchUniformCardState();
}

class _BranchUniformCardState extends State<_BranchUniformCard> {
  bool _pressed = false;
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
    final variant = branchVariant(widget.branch);
    final debt = resolveBranchDebt(widget.branch);
    final status = widget.branch.summaryLabel ?? branchStatusLabel(variant);
    final style = EdAccountsTheme.variantStyle(variant);
    final scale = _pressed ? 0.96 : (_hovered ? 1.02 : 1.0);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.onTap,
        child: AnimatedScale(
          scale: scale,
          duration: const Duration(milliseconds: 130),
          curve: Curves.easeOutCubic,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Material(
              color: AppColors.surface,
              child: Ink(
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.borderLight),
                  boxShadow: _hovered ? AppColors.softShadow : null,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(width: 3, color: style.fg.withValues(alpha: 0.65)),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.all(large ? 12 : 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              widget.branch.name1,
                              maxLines: 4,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.3),
                            ),
                            if (widget.branch.accountNum.trim().isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                widget.branch.accountNum.trim(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.mutedLight),
                              ),
                            ],
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: style.bg,
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(color: style.border),
                                  ),
                                  child: Text(status, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: style.fg)),
                                ),
                                const Spacer(),
                                Text(
                                  debt > 0 ? fmtNumAlways(debt) : '0',
                                  style: TextStyle(fontSize: large ? 16 : 14, fontWeight: FontWeight.w800, color: style.fg),
                                ),
                                const SizedBox(width: 4),
                                Icon(Icons.chevron_left_rounded, size: 18, color: style.fg.withValues(alpha: 0.55)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

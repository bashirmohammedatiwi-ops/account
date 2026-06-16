import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import 'account_ui.dart';

/// ألوان حية — Jewel Edari
abstract final class _Soft {
  static const bg = Color(0xFFE4E9F0);
  static const text = AppColors.navy;
  static const textSoft = AppColors.muted;
  static const line = AppColors.borderStrong;

  static const heroStart = Color(0xFF0F172A);
  static const heroMid = Color(0xFF1A365D);
  static const heroEnd = Color(0xFF0F766E);
  static const heroOnDark = Colors.white;
  static const heroOnDarkSoft = Color(0xFFCBD5E1);
  static const heroIconBg = Color(0x28FFFFFF);
  static const heroIcon = Color(0xFFFCD34D);

  static const debtTotal = Color(0xFFFDE68A);

  static const chipBg = Color(0xFF2563EB);
  static const chipText = Colors.white;

  static const debitChip = Color(0xFFEA580C);
  static const debitAccent = Colors.white;

  static const creditChip = Color(0xFF059669);
  static const creditAccent = Colors.white;

  static const clearChip = Color(0xFF6366F1);
  static const clearAccent = Colors.white;

  static const debitBg = Color(0xFFFFF7ED);
  static const debitMain = Color(0xFFC2410C);
  static const debitChipLight = Color(0xFFFFEDD5);
  static const debitBorder = Color(0xFFFDBA74);

  static const creditBg = Color(0xFFECFDF5);
  static const creditMain = Color(0xFF047857);
  static const creditChipLight = Color(0xFFD1FAE5);
  static const creditBorder = Color(0xFF6EE7B7);

  static const clearBg = Color(0xFFEEF2FF);
  static const clearMain = Color(0xFF4338CA);
  static const clearChipLight = Color(0xFFE0E7FF);
  static const clearBorder = Color(0xFFA5B4FC);
}

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
      color: _Soft.bg,
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
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [_Soft.heroStart, _Soft.heroMid, _Soft.heroEnd],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        boxShadow: [
          BoxShadow(color: _Soft.heroEnd.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10)),
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.2), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: _Soft.heroIconBg,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: const Icon(Icons.account_tree_rounded, color: _Soft.heroIcon, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tree.name1,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: _Soft.heroOnDark, height: 1.3),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'شجرة ${tree.accountNum}',
                      textDirection: TextDirection.ltr,
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _Soft.heroOnDarkSoft.withValues(alpha: 0.95)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _Soft.debtTotal.withValues(alpha: 0.45)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('إجمالي ديون الشجرة', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: _Soft.debtTotal.withValues(alpha: 0.85))),
                const SizedBox(height: 6),
                Text(
                  fmtNumAlways(summary.totalDebt),
                  textDirection: TextDirection.ltr,
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: _Soft.debtTotal, letterSpacing: -0.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _SoftPill(label: 'زبائن', value: '${summary.total}', bg: _Soft.chipBg, fg: _Soft.chipText),
              _SoftPill(label: 'مدين', value: '${summary.withDebt}', bg: _Soft.debitChip, fg: _Soft.debitAccent),
              _SoftPill(label: 'دائن', value: '${summary.credit}', bg: _Soft.creditChip, fg: _Soft.creditAccent),
              _SoftPill(label: 'متعادل', value: '${summary.clear}', bg: _Soft.clearChip, fg: _Soft.clearAccent),
            ],
          ),
        ],
      ),
    );
  }
}

class _SoftPill extends StatelessWidget {
  const _SoftPill({required this.label, required this.value, required this.bg, required this.fg});

  final String label;
  final String value;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.25)),
        boxShadow: [BoxShadow(color: bg.withValues(alpha: 0.4), blurRadius: 8, offset: const Offset(0, 3))],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: fg)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg.withValues(alpha: 0.9))),
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
    if (!selected) return AppColors.surface;
    return switch (key) {
      'debit' => _Soft.debitMain,
      'credit' => _Soft.creditMain,
      _ => AppColors.navy,
    };
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
            border: Border.all(color: _Soft.line),
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
                  color: _filterColor(_filters[i].$1, selected: filter == _filters[i].$1),
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
  const _SoftFilterChip({required this.label, required this.selected, required this.color, required this.onTap});

  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? color : _Soft.line),
          boxShadow: selected ? [BoxShadow(color: color.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4))] : null,
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: selected ? Colors.white : _Soft.textSoft),
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

  static const height = 156.0;

  @override
  Widget build(BuildContext context) {
    final variant = branchVariant(branch);
    final debt = resolveBranchDebt(branch);
    final status = branch.summaryLabel ?? branchStatusLabel(variant);
    final palette = _palette(variant);
    final address = branch.address?.trim();
    final hasAddress = address != null && address.isNotEmpty;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          height: height,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [palette.bg, Colors.white],
            ),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: palette.border, width: 1.5),
            boxShadow: [BoxShadow(color: palette.accent.withValues(alpha: 0.18), blurRadius: 18, offset: const Offset(0, 7))],
          ),
          child: Stack(
            children: [
              PositionedDirectional(
                start: 0,
                top: 12,
                bottom: 12,
                child: Container(
                  width: 5,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [palette.accent, palette.accent.withValues(alpha: 0.55)],
                    ),
                    borderRadius: const BorderRadiusDirectional.horizontal(start: Radius.circular(5)),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 14, 14),
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
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: _Soft.text, height: 1.25),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: palette.accent,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [BoxShadow(color: palette.accent.withValues(alpha: 0.35), blurRadius: 6, offset: const Offset(0, 2))],
                          ),
                          child: Text(status, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: palette.onAccent)),
                        ),
                      ],
                    ),
                    if (hasAddress) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(Icons.location_on_outlined, size: 13, color: palette.accent.withValues(alpha: 0.75)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              address,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: palette.accent.withValues(alpha: 0.8), height: 1.2),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: palette.chip,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: palette.border),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('الديون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: palette.accent.withValues(alpha: 0.75))),
                                const SizedBox(height: 2),
                                Text(
                                  debt > 0 ? fmtNumAlways(debt) : '0',
                                  textDirection: TextDirection.ltr,
                                  style: TextStyle(fontSize: 19, fontWeight: FontWeight.w900, color: palette.accent, letterSpacing: -0.3),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            width: 34,
                            height: 34,
                            decoration: BoxDecoration(
                              color: palette.accent,
                              shape: BoxShape.circle,
                              boxShadow: [BoxShadow(color: palette.accent.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 3))],
                            ),
                            child: Icon(Icons.chevron_left_rounded, size: 22, color: palette.onAccent),
                          ),
                        ],
                      ),
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

  ({Color bg, Color accent, Color chip, Color border, Color onAccent}) _palette(BranchCardVariant v) => switch (v) {
        BranchCardVariant.debit => (
            bg: _Soft.debitBg,
            accent: _Soft.debitMain,
            chip: _Soft.debitChipLight,
            border: _Soft.debitBorder,
            onAccent: Colors.white,
          ),
        BranchCardVariant.credit => (
            bg: _Soft.creditBg,
            accent: _Soft.creditMain,
            chip: _Soft.creditChipLight,
            border: _Soft.creditBorder,
            onAccent: Colors.white,
          ),
        BranchCardVariant.clear => (
            bg: _Soft.clearBg,
            accent: _Soft.clearMain,
            chip: _Soft.clearChipLight,
            border: _Soft.clearBorder,
            onAccent: Colors.white,
          ),
      };
}

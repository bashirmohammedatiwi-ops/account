import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../core/widgets/ed_kit.dart';
import '../../core/widgets/ed_page_scroll.dart';
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
    final summary = summarizeBranches(branches);
    final isFiltered = filter != 'all' || filtered.length != branches.length;
    final pad = EdContent.hPad(context);

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(pad, 18, pad, 0),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _BranchTreeHero(tree: tree, summary: summary, filter: filter, onFilterChanged: onFilterChanged),
              const SizedBox(height: 16),
              _BranchSearchPanel(
                filter: filter,
                onSearchChanged: onSearchChanged,
                onFilterChanged: onFilterChanged,
              ),
              const SizedBox(height: 18),
              _BranchSectionTitle(
                count: filtered.length,
                total: branches.length,
                isFiltered: isFiltered,
              ),
              const SizedBox(height: 10),
            ]),
          ),
        ),
        if (filtered.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              message: branches.isEmpty ? 'لا يوجد زبائن في هذه الشجرة' : 'لا توجد نتائج مطابقة',
              subtitle: branches.isEmpty ? null : 'جرّب كلمة أخرى أو اختر «الكل»',
              icon: branches.isEmpty ? Icons.people_outline : Icons.search_off_rounded,
            ),
          )
        else
          SliverPadding(
            padding: EdgeInsets.fromLTRB(pad, 0, pad, EdPageInsets.bottom(context, extra: 20)),
            sliver: DecoratedSliver(
              decoration: AppColors.card(),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, i) => Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
                      _BranchRow(
                        branch: filtered[i],
                        onTap: () => onBranchTap(filtered[i]),
                        first: i == 0,
                        last: i == filtered.length - 1,
                      ),
                    ],
                  ),
                  childCount: filtered.length,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// صف زبون: الحرف الأول، الاسم والرقم، الحالة والرصيد.
class _BranchRow extends StatelessWidget {
  const _BranchRow({required this.branch, required this.onTap, required this.first, required this.last});

  final BranchAccount branch;
  final VoidCallback onTap;
  final bool first;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final variant = branchVariant(branch);
    final debt = resolveBranchDebt(branch);
    final status = branch.summaryLabel ?? branchStatusLabel(variant);
    final style = EdAccountsTheme.variantStyle(variant);
    final name = branch.name1.trim();
    final meta = [
      if (branch.accountNum.trim().isNotEmpty) branch.accountNum.trim(),
      if ((branch.address ?? '').trim().isNotEmpty) branch.address!.trim(),
    ].join(' · ');
    final radius = BorderRadius.vertical(
      top: first ? const Radius.circular(AppColors.radiusLg) : Radius.zero,
      bottom: last ? const Radius.circular(AppColors.radiusLg) : Radius.zero,
    );

    return Material(
      color: Colors.transparent,
      borderRadius: radius,
      child: InkWell(
        borderRadius: radius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: style.bg,
                child: Text(
                  name.isEmpty ? '؟' : name.characters.first,
                  style: TextStyle(fontWeight: FontWeight.w800, color: style.fg, fontSize: 15),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.text),
                    ),
                    if (meta.isNotEmpty)
                      Text(
                        meta,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    fmtNumAlways(debt > 0 ? debt : 0),
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: debt > 0 ? style.fg : AppColors.mutedLight,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 2),
                  EdPill(label: status, color: style.fg),
                ],
              ),
              const SizedBox(width: 6),
              const Icon(Icons.chevron_left_rounded, size: 20, color: AppColors.mutedLight),
            ],
          ),
        ),
      ),
    );
  }
}

class _BranchTreeHero extends StatelessWidget {
  const _BranchTreeHero({required this.tree, required this.summary, required this.filter, required this.onFilterChanged});

  final AccountTree tree;
  final BranchDebtSummary summary;
  final String filter;
  final ValueChanged<String> onFilterChanged;

  @override
  Widget build(BuildContext context) {
    return EdResponsiveGrid(
      minItemWidth: 150,
      maxColumns: 4,
      children: [
        EdKpiCard(
          label: 'إجمالي الديون',
          value: fmtNumAlways(summary.totalDebt),
          caption: tree.name1,
          icon: Icons.account_balance_wallet_outlined,
          color: EdAccountsTheme.debit,
        ),
        EdKpiCard(
          label: 'الزبائن',
          value: '${summary.total}',
          caption: 'عرض الكل',
          icon: Icons.people_alt_outlined,
          color: AppColors.primary,
          onTap: () => onFilterChanged('all'),
        ),
        EdKpiCard(
          label: 'مدين',
          value: '${summary.withDebt}',
          caption: 'زبائن عليهم ديون',
          icon: Icons.trending_up_rounded,
          color: EdAccountsTheme.debit,
          onTap: () => onFilterChanged('debit'),
        ),
        EdKpiCard(
          label: 'دائن',
          value: '${summary.credit}',
          caption: 'متعادل: ${summary.clear}',
          icon: Icons.verified_outlined,
          color: EdAccountsTheme.credit,
          onTap: () => onFilterChanged('credit'),
        ),
      ],
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


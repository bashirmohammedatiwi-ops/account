import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/statement_helpers.dart';
import '../../models/models.dart';
import 'accounts_theme.dart';

// ── Helpers ──

String branchInitial(String? name) {
  final n = (name ?? '؟').trim();
  return n.isNotEmpty ? n.characters.first : '؟';
}

num resolveBranchDebt(BranchAccount b) {
  if (b.debtAmount != null) return (b.debtAmount! > 0) ? b.debtAmount! : 0;
  if (b.bal < 0) return b.bal.abs();
  return 0;
}

BranchCardVariant branchVariant(BranchAccount b) {
  final debt = resolveBranchDebt(b);
  if (debt > 0) return BranchCardVariant.debit;
  if (b.bal > 0) return BranchCardVariant.credit;
  return BranchCardVariant.clear;
}

class BranchDebtSummary {
  const BranchDebtSummary({required this.totalDebt, required this.withDebt, required this.credit, required this.clear, required this.total});
  final num totalDebt;
  final int withDebt;
  final int credit;
  final int clear;
  final int total;
}

BranchDebtSummary summarizeBranches(List<BranchAccount> list) {
  var withDebt = 0, credit = 0, clear = 0;
  num totalDebt = 0;
  for (final b in list) {
    final debt = resolveBranchDebt(b);
    if (debt > 0) {
      withDebt++;
      totalDebt += debt;
    } else if (b.bal > 0) {
      credit++;
    } else {
      clear++;
    }
  }
  return BranchDebtSummary(totalDebt: totalDebt, withDebt: withDebt, credit: credit, clear: clear, total: list.length);
}

String fmtBalance(num? v) {
  if (v == null || v == 0) return '—';
  return fmtNumAlways(v.abs());
}

String statementAccountTitle(Map<String, dynamic> acc) {
  final num = '${acc['num'] ?? ''}'.trim();
  final name = [acc['name1'], acc['name2']].whereType<String>().where((s) => s.isNotEmpty).join(' - ');
  final address = '${acc['address'] ?? ''}'.trim();
  var title = name.isEmpty ? '—' : name;
  if (num.isNotEmpty) title = '$title / $num';
  if (address.isNotEmpty) title = '$title · العنوان: $address';
  return title;
}

// ── مؤشر الخطوات ──

class EdFlowSteps extends StatelessWidget {
  const EdFlowSteps({super.key, required this.current});
  final int current;

  static const _steps = ['الشجرة', 'الزبون', 'الكشف'];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Row(
        children: [
          for (var i = 0; i < _steps.length; i++) ...[
            if (i > 0) Expanded(child: Container(height: 2, color: i <= current ? EdAccountsTheme.accent : AppColors.border)),
            _dot(i, _steps[i]),
          ],
        ],
      ),
    );
  }

  Widget _dot(int i, String label) {
    final active = i == current;
    final done = i < current;
    final color = active || done ? EdAccountsTheme.accent : AppColors.border;
    return Column(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(shape: BoxShape.circle, color: active || done ? color.withValues(alpha: 0.15) : AppColors.surfaceMuted, border: Border.all(color: color, width: 2)),
          child: Text('${i + 1}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: active || done ? color : AppColors.muted)),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: active ? EdAccountsTheme.accent : AppColors.muted)),
      ],
    );
  }
}

class EdFlowBreadcrumb extends StatelessWidget {
  const EdFlowBreadcrumb({super.key, required this.items});
  final List<({String label, VoidCallback? onTap})> items;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const Padding(padding: EdgeInsets.symmetric(horizontal: 6), child: Icon(Icons.chevron_left, size: 14, color: AppColors.muted)),
            InkWell(
              onTap: items[i].onTap,
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                child: Text(items[i].label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: items[i].onTap != null ? EdAccountsTheme.accent : AppColors.textSecondary)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class EdSectionMeta extends StatelessWidget {
  const EdSectionMeta({super.key, required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
      child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w600)),
    );
  }
}

// ── بطاقة شجرة — صف أفقي واضح ──

class EdTreeRowCard extends StatelessWidget {
  const EdTreeRowCard({super.key, required this.index, required this.tree, required this.onTap});

  final int index;
  final AccountTree tree;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          constraints: const BoxConstraints(minHeight: 88),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.accentTeal.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Text(index.toString().padLeft(2, '0'), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.accentTeal)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(tree.name1, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy)),
                    const SizedBox(height: 4),
                    Text('رقم ${tree.accountNum}', style: const TextStyle(fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('${fmtNumAlways(tree.directChildren)} زبون', style: const TextStyle(fontSize: 13, color: AppColors.accentTeal, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: AppColors.accentTeal),
            ],
          ),
        ),
      ),
    );
  }
}

class EdTreeContextBanner extends StatelessWidget {
  const EdTreeContextBanner({super.key, required this.tree, required this.branches});
  final AccountTree tree;
  final List<BranchAccount> branches;

  @override
  Widget build(BuildContext context) {
    final s = summarizeBranches(branches);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      decoration: BoxDecoration(
        color: EdAccountsTheme.card,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: EdAccountsTheme.accent),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: EdAccountsTheme.accentSoft,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: EdAccountsTheme.line),
                  ),
                  child: const Icon(Icons.account_tree_rounded, color: EdAccountsTheme.accent),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('شجرة ${tree.accountNum}', style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 11)),
                      Text(tree.name1, maxLines: 2, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w800, fontSize: 17)),
                      Text('${fmtNumAlways(s.total)} زبون · ${fmtNumAlways(s.withDebt)} مدين', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('إجمالي الديون', style: TextStyle(color: AppColors.muted, fontSize: 10, fontWeight: FontWeight.w600)),
                    Text(fmtNumAlways(s.totalDebt), textDirection: TextDirection.ltr, style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w800, fontSize: 18)),
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

class EdBranchStatsBar extends StatelessWidget {
  const EdBranchStatsBar({super.key, required this.summary});
  final BranchDebtSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(AppColors.radiusSm), border: Border.all(color: AppColors.border)),
      child: Row(
        children: [
          _cell(fmtNumAlways(summary.totalDebt), 'الديون', EdAccountsTheme.debt),
          _div(),
          _cell('${summary.withDebt}', 'مدين', EdAccountsTheme.debit),
          _div(),
          _cell('${summary.credit}', 'دائن', EdAccountsTheme.credit),
          _div(),
          _cell('${summary.clear}', 'متعادل', EdAccountsTheme.neutral),
        ],
      ),
    );
  }

  Widget _div() => Container(width: 1, height: 32, color: AppColors.border);
  Widget _cell(String v, String l, Color c) => Expanded(child: Column(children: [Text(v, textDirection: TextDirection.ltr, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: c)), Text(l, style: const TextStyle(fontSize: 9, color: AppColors.muted, fontWeight: FontWeight.w700))]));
}

// ── بطاقة زبون — كل التفاصيل ظاهرة ──

class EdBranchRowCard extends StatelessWidget {
  const EdBranchRowCard({super.key, required this.branch, required this.onTap});

  final BranchAccount branch;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final variant = branchVariant(branch);
    final accent = AppTheme.branchAccent(variant);
    final debt = resolveBranchDebt(branch);
    final initial = branchInitial(branch.name1);
    final balLabel = branch.summaryLabel ?? branchStatusLabel(variant);

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          constraints: const BoxConstraints(minHeight: 96),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: accent.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                      child: Text(initial, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: accent)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(branch.name1, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                          const SizedBox(height: 4),
                          Text('حساب ${branch.accountNum}', style: const TextStyle(fontSize: 13, color: AppColors.muted, fontWeight: FontWeight.w600)),
                          if (branch.address != null && branch.address!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(branch.address!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                          ],
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: accent.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
                            child: Text(balLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: accent)),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        const Text('الديون', style: TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
                        Text(debt > 0 ? fmtNumAlways(debt) : '0', textDirection: TextDirection.ltr, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: accent)),
                        if (branch.bal != 0) ...[
                          const SizedBox(height: 4),
                          Text('رصيد ${fmtBalance(branch.bal)}', textDirection: TextDirection.ltr, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: balanceColor(branch.bal))),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: AppColors.surfaceMuted, border: Border(top: BorderSide(color: AppColors.border))),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('عرض كشف الحساب', style: TextStyle(fontWeight: FontWeight.w800, color: accent, fontSize: 13)),
                    Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: accent),
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

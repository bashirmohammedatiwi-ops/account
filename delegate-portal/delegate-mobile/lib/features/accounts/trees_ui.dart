import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';
import 'accounts_theme.dart';

class EdTreesPage extends StatelessWidget {
  const EdTreesPage({
    super.key,
    required this.trees,
    required this.agentName,
    required this.onTreeTap,
  });

  final List<AccountTree> trees;
  final String agentName;
  final ValueChanged<AccountTree> onTreeTap;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final pad = edPageHorizontalPadding(context);
    final customers = trees.fold<int>(0, (s, t) => s + t.directChildren);
    final bottomPad = layout.isPhone ? kPhoneBottomInset : 24.0;

    if (trees.isEmpty) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final minH = constraints.maxHeight.isFinite && constraints.maxHeight > 0 ? constraints.maxHeight : 400.0;
          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: minH),
              child: Padding(
                padding: EdgeInsets.all(pad),
                child: const EdTreesEmptyState(),
              ),
            ),
          );
        },
      );
    }

    final gridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
      crossAxisCount: layout.gridColumns(phone: 1, tablet: 2, wide: 2, desktop: 3),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      mainAxisExtent: layout.isPhone ? 200 : 210,
    );

    final gridSliver = SliverPadding(
      padding: EdgeInsets.fromLTRB(pad, 0, pad, bottomPad),
      sliver: SliverGrid(
        gridDelegate: gridDelegate,
        delegate: SliverChildBuilderDelegate(
          (context, i) => EdTreeCard(
            index: i + 1,
            tree: trees[i],
            onTap: () => onTreeTap(trees[i]),
          ),
          childCount: trees.length,
        ),
      ),
    );

    if (layout.isTablet) {
      return CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: EdgeInsets.fromLTRB(pad, 18, pad, 0),
            sliver: SliverToBoxAdapter(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                textDirection: TextDirection.ltr,
                children: [
                  SizedBox(
                    width: layout.isDesktop ? 300 : 280,
                    child: EdTreesSidePanel(
                      agentName: agentName,
                      treeCount: trees.length,
                      customerCount: customers,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        EdTreesContentHead(treeCount: trees.length, customerCount: customers),
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          gridSliver,
        ],
      );
    }

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(pad, 8, pad, 12),
          sliver: SliverToBoxAdapter(
            child: EdTreesContentHead(treeCount: trees.length, customerCount: customers),
          ),
        ),
        gridSliver,
      ],
    );
  }
}

class EdTreesSidePanel extends StatelessWidget {
  const EdTreesSidePanel({
    super.key,
    required this.agentName,
    required this.treeCount,
    required this.customerCount,
  });

  final String agentName;
  final int treeCount;
  final int customerCount;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = name.characters.first;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            color: AppColors.surfaceAlt,
            child: const Text(
              'ملخص المندوب',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted, letterSpacing: 0.4),
            ),
          ),
          Padding(
            padding: EdgeInsets.fromLTRB(18, layout.isTablet ? 22 : 20, 18, layout.isTablet ? 12 : 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _avatar(initial),
                const SizedBox(height: 14),
                _welcomeText(name),
              ],
            ),
          ),
          Container(
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: AppColors.borderLight)),
            ),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  Expanded(child: _metric('$treeCount', 'الشجرات', AppColors.navy)),
                  const VerticalDivider(width: 1, thickness: 1, color: EdAccountsTheme.line),
                  Expanded(child: _metric(fmtNumAlways(customerCount), 'الزبائن', AppColors.navy)),
                  const VerticalDivider(width: 1, thickness: 1, color: EdAccountsTheme.line),
                  Expanded(child: _metric('●', 'الحالة', EdAccountsTheme.credit, compact: true)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _avatar(String initial) {
    return Container(
      width: 64,
      height: 64,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: EdAccountsTheme.cardTint,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: EdAccountsTheme.line),
      ),
      child: Text(initial, style: const TextStyle(color: AppColors.navy, fontSize: 22, fontWeight: FontWeight.w800)),
    );
  }

  Widget _welcomeText(String name) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy)),
        const SizedBox(height: 8),
        const Text(
          'اختر شجرة حساب لعرض الزبائن',
          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.5),
        ),
      ],
    );
  }

  Widget _metric(String value, String label, Color color, {bool compact = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      child: Column(
        children: [
          Text(
            value,
            textAlign: TextAlign.center,
            textDirection: compact ? TextDirection.ltr : TextDirection.rtl,
            style: TextStyle(fontSize: compact ? 16 : 18, fontWeight: FontWeight.w800, color: color, height: 1.1),
          ),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class EdTreesContentHead extends StatelessWidget {
  const EdTreesContentHead({super.key, required this.treeCount, required this.customerCount});

  final int treeCount;
  final int customerCount;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('الشجرات المعيّنة', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy)),
              const SizedBox(height: 4),
              Text(
                '$treeCount شجرة · ${fmtNumAlways(customerCount)} زبون',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
            ],
          ),
        ),
        Container(
          constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: EdAccountsTheme.accentSoft,
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            border: Border.all(color: EdAccountsTheme.line),
          ),
          alignment: Alignment.center,
          child: Text('$treeCount', style: const TextStyle(color: EdAccountsTheme.accent, fontSize: 16, fontWeight: FontWeight.w800)),
        ),
      ],
    );
  }
}

class EdTreeCard extends StatelessWidget {
  const EdTreeCard({super.key, required this.index, required this.tree, required this.onTap});

  final int index;
  final AccountTree tree;
  final VoidCallback onTap;

  String get _title {
    final name = tree.name1.trim();
    return name.isEmpty ? '—' : name;
  }

  String get _num {
    final num = tree.accountNum.trim();
    return num.isEmpty ? '—' : num;
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        side: const BorderSide(color: AppColors.borderLight),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    index.toString().padLeft(2, '0'),
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted),
                  ),
                  Text(
                    _num,
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted),
                  ),
                ],
              ),
              Text(
                _title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.35),
              ),
              Text(
                '${fmtNumAlways(tree.directChildren)} حساب فرعي',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: EdAccountsTheme.cardTint,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: EdAccountsTheme.line),
                ),
                child: Row(
                  children: [
                    Icon(Icons.people_outline_rounded, size: 16, color: EdAccountsTheme.accent),
                    const SizedBox(width: 6),
                    Text(
                      'استعراض الزبائن',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: EdAccountsTheme.accent),
                    ),
                    const Spacer(),
                    Icon(Icons.arrow_back_ios_new_rounded, size: 12, color: EdAccountsTheme.accent),
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

class EdTreesEmptyState extends StatelessWidget {
  const EdTreesEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      constraints: const BoxConstraints(minHeight: 220),
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.accentSoft,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.account_tree_outlined, size: 28, color: AppColors.accentTeal),
          ),
          const SizedBox(height: 14),
          const Text(
            'لا توجد شجرات — تواصل مع الإدارة',
            textAlign: TextAlign.center,
            style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

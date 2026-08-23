import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/ed_page_decor.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';
import 'accounts_theme.dart';

class EdTreesPage extends StatefulWidget {
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
  State<EdTreesPage> createState() => _EdTreesPageState();
}

class _EdTreesPageState extends State<EdTreesPage> {
  String _query = '';

  List<AccountTree> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.trees;
    return widget.trees
        .where((t) => t.name1.toLowerCase().contains(q) || t.accountNum.toLowerCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final pad = edPageHorizontalPadding(context);
    final customers = widget.trees.fold<int>(0, (s, t) => s + t.directChildren);
    final bottomPad = layout.isPhone ? kPhoneBottomInset : 28.0;
    final filtered = _filtered;
    final cols = layout.isDesktop ? 3 : layout.isTablet ? 2 : 2;
    final cardExtent = edFormalCardExtent(layout, phone: 156, tablet: 168);

    if (widget.trees.isEmpty) {
      return LayoutBuilder(
        builder: (context, constraints) {
          final minH = constraints.maxHeight.isFinite && constraints.maxHeight > 0 ? constraints.maxHeight : 400.0;
          return SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: minH),
              child: Padding(padding: EdgeInsets.all(pad), child: const EdTreesEmptyState()),
            ),
          );
        },
      );
    }

    final gridSliver = SliverPadding(
      padding: EdgeInsets.fromLTRB(pad, 0, pad, bottomPad),
      sliver: filtered.isEmpty
          ? SliverToBoxAdapter(
              child: _TreesSearchEmpty(query: _query),
            )
          : SliverGrid(
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: cols,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                mainAxisExtent: cardExtent,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, i) => _TileEntrance(
                  index: i,
                  child: EdTreeCard(
                    index: widget.trees.indexOf(filtered[i]) + 1,
                    tree: filtered[i],
                    onTap: () => widget.onTreeTap(filtered[i]),
                    large: layout.isTablet,
                  ),
                ),
                childCount: filtered.length,
              ),
            ),
    );

    return ColoredBox(
      color: Colors.white,
      child: Stack(
        children: [
          const EdModernBackdrop(variant: EdBackdropVariant.accounts),
        CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(pad, layout.isTablet ? 16 : 10, pad, 0),
              sliver: SliverToBoxAdapter(
                child: layout.isTablet
                    ? Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        textDirection: TextDirection.ltr,
                        children: [
                          SizedBox(
                            width: layout.isDesktop ? 280 : 260,
                            child: EdTreesSidePanel(
                              agentName: widget.agentName,
                              treeCount: widget.trees.length,
                              customerCount: customers,
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                EdSectionHeader(
                                  title: 'الشجرات المعيّنة',
                                  subtitle: _query.isNotEmpty
                                      ? 'عرض ${filtered.length} من ${widget.trees.length} شجرة'
                                      : '${widget.trees.length} شجرة · ${fmtNumAlways(customers)} زبون',
                                  icon: Icons.account_tree_outlined,
                                  iconColor: EdAccountsTheme.accent,
                                ),
                                const SizedBox(height: 12),
                                EdModernSearchField(
                                  hint: 'ابحث عن شجرة...',
                                  hasText: _query.isNotEmpty,
                                  onChanged: (v) => setState(() => _query = v),
                                  onClear: () => setState(() => _query = ''),
                                ),
                              ],
                            ),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          EdSectionHeader(
                            title: 'الشجرات المعيّنة',
                            subtitle: _query.isNotEmpty
                                ? 'عرض ${filtered.length} من ${widget.trees.length} شجرة'
                                : '${widget.trees.length} شجرة · ${fmtNumAlways(customers)} زبون',
                            icon: Icons.account_tree_outlined,
                            iconColor: EdAccountsTheme.accent,
                          ),
                          const SizedBox(height: 12),
                          EdModernSearchField(
                            hint: 'ابحث عن شجرة...',
                            hasText: _query.isNotEmpty,
                            onChanged: (v) => setState(() => _query = v),
                            onClear: () => setState(() => _query = ''),
                          ),
                        ],
                      ),
              ),
            ),
            SliverPadding(padding: EdgeInsets.only(top: layout.isTablet ? 16 : 14)),
            gridSliver,
          ],
        ),
      ],
      ),
    );
  }
}

class _TreesSearchEmpty extends StatelessWidget {
  const _TreesSearchEmpty({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        children: [
          const Icon(Icons.search_off_rounded, size: 32, color: AppColors.mutedLight),
          const SizedBox(height: 8),
          Text('لا نتائج لـ «$query»', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
        ],
      ),
    );
  }
}

class _TileEntrance extends StatefulWidget {
  const _TileEntrance({required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<_TileEntrance> createState() => _TileEntranceState();
}

class _TileEntranceState extends State<_TileEntrance> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
    Future.delayed(Duration(milliseconds: 30 * widget.index), () {
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
      child: SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic)),
        child: widget.child,
      ),
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
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = name.characters.first;

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
        mainAxisSize: MainAxisSize.min,
        children: [
          EdCardDecorStrip(
            child: const Row(
              children: [
                Icon(Icons.account_tree_outlined, size: 16, color: Colors.white70),
                SizedBox(width: 8),
                Text('ملخص الشجرات', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white70)),
              ],
            ),
          ),
          Container(
            color: AppColors.surface,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  EdGradientAvatar(label: initial, size: 48),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                        const SizedBox(height: 4),
                        const Text('اختر شجرة لعرض الزبائن', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          Container(
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.borderLight))),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  Expanded(child: _sideMetric('$treeCount', 'شجرة')),
                  const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
                  Expanded(child: _sideMetric(fmtNumAlways(customerCount), 'زبون')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sideMetric(String value, String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        children: [
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}

class EdTreesContentHead extends StatelessWidget {
  const EdTreesContentHead({
    super.key,
    required this.treeCount,
    required this.customerCount,
    this.filtered,
    this.hasQuery = false,
  });

  final int treeCount;
  final int customerCount;
  final int? filtered;
  final bool hasQuery;

  @override
  Widget build(BuildContext context) {
    final subtitle = hasQuery && filtered != null
        ? 'عرض $filtered من $treeCount شجرة'
        : '$treeCount شجرة · ${fmtNumAlways(customerCount)} زبون';

    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: const Icon(Icons.account_tree_outlined, size: 18, color: AppColors.accentTeal),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('الشجرات المعيّنة', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy)),
              Text(subtitle, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
            ],
          ),
        ),
      ],
    );
  }
}

class EdTreeCard extends StatefulWidget {
  const EdTreeCard({super.key, required this.index, required this.tree, required this.onTap, this.large = false});

  final int index;
  final AccountTree tree;
  final VoidCallback onTap;
  final bool large;

  @override
  State<EdTreeCard> createState() => _EdTreeCardState();
}

class _EdTreeCardState extends State<EdTreeCard> {
  bool _pressed = false;
  bool _hovered = false;

  String get _title {
    final name = widget.tree.name1.trim();
    return name.isEmpty ? '—' : name;
  }

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
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
                  boxShadow: [
                    BoxShadow(color: AppColors.navy.withValues(alpha: _hovered ? 0.08 : 0.05), blurRadius: 18, offset: const Offset(0, 6)),
                  ],
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Row(
                      children: [
                        Container(width: 3, color: EdAccountsTheme.accent.withValues(alpha: 0.75)),
                        Expanded(
                          child: Padding(
                            padding: EdgeInsets.all(large ? 14 : 12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      widget.index.toString().padLeft(2, '0'),
                                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.mutedLight),
                                    ),
                                    const Spacer(),
                                    Text(
                                      widget.tree.accountNum.trim().isEmpty ? '—' : widget.tree.accountNum.trim(),
                                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.muted),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Center(
                                  child: EdGradientIconBox(
                                    icon: Icons.account_tree_outlined,
                                    color: EdAccountsTheme.accent,
                                    bgColor: EdAccountsTheme.accentSoft,
                                    size: large ? 44 : 40,
                                    iconSize: 20,
                                  ),
                                ),
                                SizedBox(height: large ? 8 : 6),
                                Text(
                                  _title,
                                  textAlign: TextAlign.center,
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.25),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${fmtNumAlways(widget.tree.directChildren)} زبون',
                                  style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.muted),
                                ),
                                const Spacer(),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text('عرض الفروع', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
                                    const SizedBox(width: 4),
                                    Icon(Icons.arrow_forward_ios_rounded, size: 10, color: EdAccountsTheme.accent.withValues(alpha: 0.7)),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
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
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(14)),
            child: const Icon(Icons.account_tree_outlined, size: 28, color: AppColors.accentTeal),
          ),
          const SizedBox(height: 14),
          const Text('لا توجد شجرات — تواصل مع الإدارة', textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

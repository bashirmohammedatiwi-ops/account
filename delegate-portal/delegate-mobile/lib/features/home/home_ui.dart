import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ed_page_decor.dart';
import '../../core/widgets/phone_ui.dart';

class EdHomeApp {
  const EdHomeApp({
    required this.icon,
    required this.name,
    required this.hint,
    required this.iconColor,
    required this.iconBg,
    required this.onTap,
    this.badge,
    this.category = 'الخدمات',
    this.featured = false,
  });

  final IconData icon;
  final String name;
  final String hint;
  final Color iconColor;
  final Color iconBg;
  final VoidCallback onTap;
  final String? badge;
  final String category;
  final bool featured;
}

class EdHomePage extends StatefulWidget {
  const EdHomePage({
    super.key,
    required this.agentName,
    required this.apps,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    this.avatarText,
    this.pendingReceipts,
    this.pendingCustomers,
    this.pendingPromoVisits,
    this.onRefresh,
    this.onSettings,
    this.onLogout,
    this.roleLabel,
    this.isSecondary = false,
    this.secondaryCount = 0,
  });

  final String agentName;
  final String? avatarText;
  final List<EdHomeApp> apps;
  final String treeCount;
  final String customerCount;
  final String orderCount;
  final String? pendingReceipts;
  final String? pendingCustomers;
  final String? pendingPromoVisits;
  final VoidCallback? onRefresh;
  final VoidCallback? onSettings;
  final VoidCallback? onLogout;
  final String? roleLabel;
  final bool isSecondary;
  final int secondaryCount;

  @override
  State<EdHomePage> createState() => _EdHomePageState();
}

class _EdHomePageState extends State<EdHomePage> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  static const _categoryOrder = [
    'التجارة والطلبات',
    'الميدان والزبائن',
    'الحسابات والتقارير',
  ];

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<EdHomeApp> _filteredApps() {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return widget.apps;
    return widget.apps
        .where((a) => a.name.toLowerCase().contains(q) || a.hint.toLowerCase().contains(q))
        .toList();
  }

  Map<String, List<EdHomeApp>> _grouped(List<EdHomeApp> apps) {
    final map = <String, List<EdHomeApp>>{};
    for (final app in apps) {
      map.putIfAbsent(app.category, () => []).add(app);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final pendingR = int.tryParse(widget.pendingReceipts ?? '') ?? 0;
    final pendingC = int.tryParse(widget.pendingCustomers ?? '') ?? 0;
    final pendingP = int.tryParse(widget.pendingPromoVisits ?? '') ?? 0;
    final pendingTotal = pendingR + pendingC + pendingP;
    final pagePad = layout.isDesktop ? 32.0 : layout.isTablet ? 24.0 : EdSpacing.page;
    final top = MediaQuery.paddingOf(context).top;
    final cols = layout.isDesktop ? 4 : layout.isTablet ? 3 : 2;
    final gap = layout.isTablet ? 14.0 : 12.0;
    final tileExtent = edFormalTileExtent(layout, phone: 158, tablet: 176, desktop: 168);
    final filtered = _filteredApps();
    final grouped = _grouped(filtered);
    final featured = widget.apps.where((a) => a.featured).toList();
    final searching = _query.trim().isNotEmpty;

    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppColors.pageGradient),
      child: Stack(
        children: [
          _HomeAmbientLayer(),
          CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(pagePad, top + 8, pagePad, 0),
                  child: _ProHeroHeader(
                    agentName: widget.agentName,
                    avatarText: widget.avatarText,
                    treeCount: widget.treeCount,
                    customerCount: widget.customerCount,
                    orderCount: widget.orderCount,
                    pendingTotal: pendingTotal,
                    onRefresh: widget.onRefresh,
                    onSettings: widget.onSettings,
                    onLogout: widget.onLogout,
                    roleLabel: widget.roleLabel,
                    isSecondary: widget.isSecondary,
                    secondaryCount: widget.secondaryCount,
                    large: layout.isTablet,
                  ),
                ),
              ),
              if (pendingTotal > 0)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(pagePad, 14, pagePad, 0),
                    child: _ProPendingBanner(
                      message: _pendingMessage(widget.pendingReceipts, widget.pendingCustomers, widget.pendingPromoVisits),
                      large: layout.isTablet,
                    ),
                  ),
                ),
              if (!searching && featured.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(pagePad, 18, pagePad, 0),
                    child: _QuickActionsStrip(apps: featured, large: layout.isTablet),
                  ),
                ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(pagePad, 20, pagePad, 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ProSectionTitle(
                        title: 'جميع الخدمات',
                        subtitle: searching
                            ? 'عرض ${filtered.length} من ${widget.apps.length}'
                            : '${widget.apps.length} قسم · ابحث أو اختر ما تحتاج',
                        large: layout.isTablet,
                      ),
                      const SizedBox(height: 12),
                      _ProSearchField(
                        controller: _searchCtrl,
                        hint: 'ابحث عن خدمة...',
                        large: layout.isTablet,
                        hasText: _query.isNotEmpty,
                        onChanged: (v) => setState(() => _query = v),
                        onClear: () {
                          _searchCtrl.clear();
                          setState(() => _query = '');
                        },
                      ),
                    ],
                  ),
                ),
              ),
              if (filtered.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(pagePad, 20, pagePad, 0),
                    child: _ProEmptySearch(query: _query),
                  ),
                )
              else if (searching)
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(pagePad, 8, pagePad, layout.isPhone ? kPhoneBottomInset : 36),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      mainAxisSpacing: gap,
                      crossAxisSpacing: gap,
                      mainAxisExtent: tileExtent,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => _TileEntrance(
                        index: index,
                        child: _ProServiceTile(
                          app: filtered[index],
                          large: layout.isTablet,
                        ),
                      ),
                      childCount: filtered.length,
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, sectionIndex) {
                      final category = _categoryOrder[sectionIndex];
                      final sectionApps = grouped[category];
                      if (sectionApps == null || sectionApps.isEmpty) return const SizedBox.shrink();

                      return Padding(
                        padding: EdgeInsets.only(bottom: sectionIndex == _categoryOrder.length - 1 ? (layout.isPhone ? kPhoneBottomInset : 36) : 8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Padding(
                              padding: EdgeInsets.fromLTRB(pagePad, 12, pagePad, 10),
                              child: _CategoryLabel(title: category, count: sectionApps.length, large: layout.isTablet),
                            ),
                            Padding(
                              padding: EdgeInsets.symmetric(horizontal: pagePad),
                              child: GridView.builder(
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: cols,
                                  mainAxisSpacing: gap,
                                  crossAxisSpacing: gap,
                                  mainAxisExtent: tileExtent,
                                ),
                                itemCount: sectionApps.length,
                                itemBuilder: (context, i) => _TileEntrance(
                                  index: i + sectionIndex * 3,
                                  child: _ProServiceTile(
                                    app: sectionApps[i],
                                    large: layout.isTablet,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                    childCount: _categoryOrder.length,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  static String _pendingMessage(String? receipts, String? customers, String? promo) {
    final r = int.tryParse(receipts ?? '') ?? 0;
    final c = int.tryParse(customers ?? '') ?? 0;
    final p = int.tryParse(promo ?? '') ?? 0;
    final parts = <String>[];
    if (r > 0) parts.add('$r سند قبض');
    if (c > 0) parts.add('$c زبون جديد');
    if (p > 0) parts.add('$p زيارة ترويجية');
    return parts.join(' · ');
  }
}

/// خلفية ضوئية ناعمة للصفحة الرئيسية
class _HomeAmbientLayer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(top: -90, right: -50, child: _orb(200, AppColors.accentTeal, 0.11)),
          Positioned(top: 180, left: -70, child: _orb(160, AppColors.accentBlue, 0.09)),
          Positioned(bottom: 120, right: 30, child: _orb(120, AppColors.accentViolet, 0.07)),
        ],
      ),
    );
  }

  Widget _orb(double size, Color color, double alpha) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [color.withValues(alpha: alpha), color.withValues(alpha: 0)],
        ),
      ),
    );
  }
}

/// هيرو احترافي — تدرج، زجاج، إحصائيات
class _ProHeroHeader extends StatelessWidget {
  const _ProHeroHeader({
    required this.agentName,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    required this.pendingTotal,
    this.avatarText,
    this.onRefresh,
    this.onSettings,
    this.onLogout,
    this.roleLabel,
    this.isSecondary = false,
    this.secondaryCount = 0,
    this.large = false,
  });

  final String agentName;
  final String? avatarText;
  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;
  final VoidCallback? onRefresh;
  final VoidCallback? onSettings;
  final VoidCallback? onLogout;
  final String? roleLabel;
  final bool isSecondary;
  final int secondaryCount;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = _HomeIdentity.initial(avatarText ?? name);
    final greeting = _HomeIdentity.greeting();
    final dateLabel = DateFormat('EEEE، d MMMM', 'ar').format(DateTime.now());
    final radius = large ? 30.0 : 26.0;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: AppColors.brandGradient,
        boxShadow: [
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.28), blurRadius: 32, offset: const Offset(0, 16)),
          BoxShadow(color: AppColors.accentTeal.withValues(alpha: 0.2), blurRadius: 24, offset: const Offset(0, 8)),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(top: -30, right: -20, child: _heroOrb(140, 0.12)),
          Positioned(bottom: -40, left: -30, child: _heroOrb(120, 0.08)),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(large ? 22 : 18, large ? 18 : 16, large ? 18 : 16, 0),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.asset('assets/logo.png', width: 28, height: 28),
                    ),
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        'Edari Delegate',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white70),
                      ),
                    ),
                    _HeroStatusPill(),
                    if (onRefresh != null) ...[
                      const SizedBox(width: 6),
                      _HeroIconBtn(icon: Icons.refresh_rounded, onTap: onRefresh!),
                    ],
                    if (onSettings != null) ...[
                      const SizedBox(width: 4),
                      _HeroIconBtn(icon: Icons.settings_outlined, onTap: onSettings!),
                    ],
                    if (onLogout != null) ...[
                      const SizedBox(width: 4),
                      _HeroIconBtn(icon: Icons.logout_rounded, onTap: onLogout!, muted: true),
                    ],
                  ],
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(large ? 22 : 18, large ? 20 : 16, large ? 22 : 18, large ? 20 : 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _ProAvatar(label: initial, size: large ? 62 : 54),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.75)),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: large ? 28 : 24,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: -0.6,
                              height: 1.1,
                            ),
                          ),
                          const SizedBox(height: 8),
                          _RoleChip(label: roleLabel, isSecondary: isSecondary, secondaryCount: secondaryCount, onDark: true),
                          const SizedBox(height: 6),
                          Text(
                            dateLabel,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.55)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              ClipRRect(
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                  child: Container(
                    padding: EdgeInsets.symmetric(horizontal: large ? 16 : 12, vertical: large ? 14 : 12),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.12))),
                    ),
                    child: _ProStatsStrip(
                      treeCount: treeCount,
                      customerCount: customerCount,
                      orderCount: orderCount,
                      pendingTotal: pendingTotal,
                      large: large,
                      onDark: true,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroOrb(double size, double alpha) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: alpha),
      ),
    );
  }
}

class _HeroStatusPill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: AppColors.accentTealLight,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: AppColors.accentTealLight.withValues(alpha: 0.8), blurRadius: 6)],
            ),
          ),
          const SizedBox(width: 6),
          Text('متصل', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white.withValues(alpha: 0.92))),
        ],
      ),
    );
  }
}

class _HeroIconBtn extends StatelessWidget {
  const _HeroIconBtn({required this.icon, required this.onTap, this.muted = false});

  final IconData icon;
  final VoidCallback onTap;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: muted ? 0.08 : 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 36,
          height: 36,
          child: Icon(icon, size: 18, color: Colors.white.withValues(alpha: muted ? 0.55 : 0.95)),
        ),
      ),
    );
  }
}

class _ProAvatar extends StatelessWidget {
  const _ProAvatar({required this.label, this.size = 54});

  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(2.5),
      decoration: const BoxDecoration(
        shape: BoxShape.circle,
        gradient: AppColors.avatarRingGradient,
      ),
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.navy.withValues(alpha: 0.85),
          border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
        ),
        child: Text(label, style: TextStyle(color: Colors.white, fontSize: size * 0.34, fontWeight: FontWeight.w800)),
      ),
    );
  }
}

class _RoleChip extends StatelessWidget {
  const _RoleChip({
    this.label,
    required this.isSecondary,
    required this.secondaryCount,
    this.onDark = false,
  });

  final String? label;
  final bool isSecondary;
  final int secondaryCount;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final text = (label ?? '').trim().isEmpty
        ? (isSecondary ? 'مندوب ثانوي' : 'مندوب رئيسي')
        : label!.trim();
    final extra = !isSecondary && secondaryCount > 0 ? ' · $secondaryCount ثانوي' : '';
    final color = isSecondary ? AppColors.warning : AppColors.accentTealLight;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: onDark ? Colors.white.withValues(alpha: 0.14) : color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: onDark ? Colors.white.withValues(alpha: 0.2) : color.withValues(alpha: 0.28)),
      ),
      child: Text(
        '$text$extra',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: onDark ? Colors.white.withValues(alpha: 0.92) : color,
        ),
      ),
    );
  }
}

class _ProStatsStrip extends StatelessWidget {
  const _ProStatsStrip({
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    required this.pendingTotal,
    this.large = false,
    this.onDark = false,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;
  final bool large;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _StatPill(icon: Icons.account_tree_outlined, value: treeCount, label: 'شجرة', large: large, onDark: onDark)),
        const SizedBox(width: 8),
        Expanded(child: _StatPill(icon: Icons.people_outline_rounded, value: customerCount, label: 'زبون', large: large, onDark: onDark)),
        const SizedBox(width: 8),
        Expanded(child: _StatPill(icon: Icons.shopping_bag_outlined, value: orderCount, label: 'طلب', large: large, onDark: onDark)),
        if (pendingTotal > 0) ...[
          const SizedBox(width: 8),
          Expanded(
            child: _StatPill(
              icon: Icons.pending_actions_outlined,
              value: '$pendingTotal',
              label: 'بانتظار',
              large: large,
              highlight: true,
              onDark: onDark,
            ),
          ),
        ],
      ],
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({
    required this.icon,
    required this.value,
    required this.label,
    this.large = false,
    this.highlight = false,
    this.onDark = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final bool large;
  final bool highlight;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final accent = highlight ? AppColors.warning : AppColors.accentTealLight;
    final textColor = onDark ? Colors.white : AppColors.navy;
    final mutedColor = onDark ? Colors.white.withValues(alpha: 0.65) : AppColors.muted;

    return Container(
      padding: EdgeInsets.symmetric(vertical: large ? 10 : 8, horizontal: 6),
      decoration: BoxDecoration(
        color: onDark ? Colors.white.withValues(alpha: highlight ? 0.16 : 0.1) : AppColors.surface.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: onDark
              ? Colors.white.withValues(alpha: highlight ? 0.25 : 0.12)
              : (highlight ? AppColors.warning.withValues(alpha: 0.3) : AppColors.borderLight),
        ),
      ),
      child: Column(
        children: [
          Icon(icon, size: large ? 15 : 13, color: onDark ? accent : accent),
          SizedBox(height: large ? 6 : 4),
          Text(
            value,
            style: TextStyle(
              fontSize: large ? 20 : 17,
              fontWeight: FontWeight.w800,
              color: highlight && !onDark ? AppColors.warning : textColor,
              height: 1,
            ),
          ),
          Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: mutedColor)),
        ],
      ),
    );
  }
}

/// إجراءات سريعة — أهم الخدمات في شريط عرض
class _QuickActionsStrip extends StatelessWidget {
  const _QuickActionsStrip({required this.apps, this.large = false});

  final List<EdHomeApp> apps;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'وصول سريع',
          style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.navy),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: large ? 88 : 80,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: apps.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, i) => _QuickActionChip(app: apps[i], large: large),
          ),
        ),
      ],
    );
  }
}

class _QuickActionChip extends StatelessWidget {
  const _QuickActionChip({required this.app, this.large = false});

  final EdHomeApp app;
  final bool large;

  bool get _showBadge {
    final b = app.badge;
    return b != null && b != '—' && b != '0';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          app.onTap();
        },
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          width: large ? 132 : 118,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                app.iconColor.withValues(alpha: 0.14),
                AppColors.surface,
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: app.iconColor.withValues(alpha: 0.22)),
            boxShadow: AppColors.softShadow,
          ),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: large ? 36 : 32,
                      height: large ? 36 : 32,
                      decoration: BoxDecoration(
                        gradient: AppColors.moduleGradient(app.iconColor),
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(color: app.iconColor.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 3)),
                        ],
                      ),
                      child: Icon(app.icon, color: Colors.white, size: large ? 18 : 16),
                    ),
                    const Spacer(),
                    if (_showBadge)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: app.iconColor,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(app.badge!, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                      ),
                  ],
                ),
                const Spacer(),
                Text(
                  app.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProSectionTitle extends StatelessWidget {
  const _ProSectionTitle({required this.title, required this.subtitle, this.large = false});

  final String title;
  final String subtitle;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 4,
          height: large ? 32 : 28,
          decoration: BoxDecoration(
            gradient: AppColors.accentGradient,
            borderRadius: BorderRadius.circular(99),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: TextStyle(fontSize: large ? 18 : 17, fontWeight: FontWeight.w800, color: AppColors.navy, letterSpacing: -0.3)),
              Text(subtitle, style: TextStyle(fontSize: large ? 12 : 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
            ],
          ),
        ),
      ],
    );
  }
}

class _CategoryLabel extends StatelessWidget {
  const _CategoryLabel({required this.title, required this.count, this.large = false});

  final String title;
  final int count;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(title, style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Text('$count', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted)),
        ),
      ],
    );
  }
}

class _ProSearchField extends StatelessWidget {
  const _ProSearchField({
    required this.hint,
    required this.hasText,
    required this.onChanged,
    required this.onClear,
    this.controller,
    this.large = false,
  });

  final String hint;
  final bool hasText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final TextEditingController? controller;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w600, color: AppColors.navy),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w600, color: AppColors.mutedLight),
          prefixIcon: Container(
            margin: const EdgeInsets.all(8),
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.accentTeal.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.search_rounded, size: 18, color: AppColors.accentTeal),
          ),
          suffixIcon: hasText
              ? IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: onClear, color: AppColors.muted)
              : null,
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(horizontal: 4, vertical: large ? 14 : 12),
        ),
      ),
    );
  }
}

class _ProPendingBanner extends StatelessWidget {
  const _ProPendingBanner({required this.message, this.large = false});

  final String message;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 16 : 14, vertical: large ? 14 : 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.warningSoft, AppColors.surface],
          begin: Alignment.centerRight,
          end: Alignment.centerLeft,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
        boxShadow: [
          BoxShadow(color: AppColors.warning.withValues(alpha: 0.12), blurRadius: 16, offset: const Offset(0, 6)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [AppColors.warning, AppColors.warning.withValues(alpha: 0.75)]),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.notifications_active_rounded, size: 20, color: Colors.white),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('يتطلب انتباهك', style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w800, color: AppColors.navy)),
                const SizedBox(height: 2),
                Text(message, style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.textSecondary, height: 1.35)),
              ],
            ),
          ),
          Icon(Icons.chevron_left_rounded, color: AppColors.warning.withValues(alpha: 0.7)),
        ],
      ),
    );
  }
}

class _ProEmptySearch extends StatelessWidget {
  const _ProEmptySearch({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.surfaceAlt,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.search_off_rounded, size: 28, color: AppColors.mutedLight),
          ),
          const SizedBox(height: 12),
          Text('لا نتائج لـ «$query»', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
          const SizedBox(height: 4),
          const Text('جرّب كلمات أخرى', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.muted, fontSize: 12)),
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
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 480));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    Future.delayed(Duration(milliseconds: 40 * math.min(widget.index, 8)), () {
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
      opacity: _fade,
      child: SlideTransition(position: _slide, child: widget.child),
    );
  }
}

/// بطاقة خدمة احترافية — تدرج، أيقونة بارزة، شارة
class _ProServiceTile extends StatefulWidget {
  const _ProServiceTile({required this.app, this.large = false});

  final EdHomeApp app;
  final bool large;

  @override
  State<_ProServiceTile> createState() => _ProServiceTileState();
}

class _ProServiceTileState extends State<_ProServiceTile> {
  bool _pressed = false;

  bool get _showBadge {
    final b = widget.app.badge;
    return b != null && b != '—' && b != '0';
  }

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
    final radius = large ? 22.0 : 20.0;
    final scale = _pressed ? 0.97 : 1.0;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: () {
        HapticFeedback.selectionClick();
        widget.app.onTap();
      },
      child: AnimatedScale(
        scale: scale,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [
                widget.app.iconColor.withValues(alpha: 0.1),
                AppColors.surface,
                AppColors.surface,
              ],
            ),
            border: Border.all(color: widget.app.iconColor.withValues(alpha: 0.15)),
            boxShadow: _pressed ? null : AppColors.cardShadow,
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              Padding(
                padding: EdgeInsets.all(large ? 14 : 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: large ? 46 : 42,
                          height: large ? 46 : 42,
                          decoration: BoxDecoration(
                            gradient: AppColors.moduleGradient(widget.app.iconColor),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: [
                              BoxShadow(color: widget.app.iconColor.withValues(alpha: 0.35), blurRadius: 10, offset: const Offset(0, 4)),
                            ],
                          ),
                          child: Icon(widget.app.icon, color: Colors.white, size: large ? 22 : 20),
                        ),
                        const Spacer(),
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(9),
                            border: Border.all(color: AppColors.borderLight),
                          ),
                          child: Icon(Icons.arrow_forward_rounded, size: 14, color: widget.app.iconColor),
                        ),
                      ],
                    ),
                    SizedBox(height: large ? 12 : 10),
                    Text(
                      widget.app.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      widget.app.hint,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.3),
                    ),
                  ],
                ),
              ),
              if (_showBadge)
                Positioned(
                  top: 10,
                  left: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: widget.app.iconColor,
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [BoxShadow(color: widget.app.iconColor.withValues(alpha: 0.4), blurRadius: 6)],
                    ),
                    child: Text(
                      widget.app.badge!,
                      style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w800, color: Colors.white),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

abstract final class _HomeIdentity {
  static String initial(String text) {
    final t = text.trim();
    if (t.isEmpty) return 'م';
    return t.characters.first;
  }

  static String greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'صباح الخير';
    if (h < 17) return 'نهارك سعيد';
    return 'مساء الخير';
  }
}

/// ألوان خلفية أيقونات التطبيقات
abstract final class EdHomeThemes {
  static const accountsBg = Color(0xFFE6F7F5);
  static const shopBg = Color(0xFFEFF6FF);
  static const ordersBg = Color(0xFFFFF7ED);
  static const reportsBg = Color(0xFFF5F3FF);
  static const receiptsBg = Color(0xFFECFDF5);
  static const customersBg = Color(0xFFFFF1F2);
  static const promoBg = Color(0xFFFDF2F8);
}

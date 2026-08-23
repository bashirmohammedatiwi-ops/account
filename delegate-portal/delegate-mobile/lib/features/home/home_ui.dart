import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
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
  });

  final IconData icon;
  final String name;
  final String hint;
  final Color iconColor;
  final Color iconBg;
  final VoidCallback onTap;
  final String? badge;
  final String category;
}

class EdHomePage extends StatelessWidget {
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

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);

    if (layout.isTablet) {
      return LayoutBuilder(
        builder: (context, constraints) => CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Padding(
                padding: EdgeInsets.fromLTRB(layout.isDesktop ? 28 : 22, 16, layout.isDesktop ? 28 : 22, 24),
                child: SizedBox(
                  height: constraints.maxHeight,
                  child: Row(
                    textDirection: TextDirection.ltr,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(
                        width: layout.isDesktop ? 320 : 300,
                        child: EdHomeSidePanel(
                          agentName: agentName,
                          avatarText: avatarText,
                          treeCount: treeCount,
                          customerCount: customerCount,
                          orderCount: orderCount,
                          pendingReceipts: pendingReceipts,
                          pendingCustomers: pendingCustomers,
                          pendingPromoVisits: pendingPromoVisits,
                        ),
                      ),
                      const SizedBox(width: 20),
                      Expanded(child: _HomeMainColumn(apps: apps)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    final pendingR = int.tryParse(pendingReceipts ?? '') ?? 0;
    final pendingC = int.tryParse(pendingCustomers ?? '') ?? 0;
    final pendingP = int.tryParse(pendingPromoVisits ?? '') ?? 0;
    final pendingTotal = pendingR + pendingC + pendingP;
    final grouped = _groupApps(apps);

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: EdPhoneHomeHero(
            agentName: agentName,
            avatarText: avatarText,
            onRefresh: onRefresh,
            onSettings: onSettings,
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 16),
            child: EdHomeStatsBento(
              treeCount: treeCount,
              customerCount: customerCount,
              orderCount: orderCount,
              pendingTotal: pendingTotal,
            ),
          ),
        ),
        if (pendingTotal > 0)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 16),
              child: _PendingBanner(
                message: _pendingMessage(pendingReceipts, pendingCustomers, pendingPromoVisits),
              ),
            ),
          ),
        for (final group in grouped.entries) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(EdSpacing.page, 8, EdSpacing.page, 12),
              child: _HomeSectionLabel(title: group.key),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 8),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, i) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: EdHomeServiceTile(app: group.value[i]),
                ),
                childCount: group.value.length,
              ),
            ),
          ),
        ],
        SliverPadding(
          padding: const EdgeInsets.only(bottom: kPhoneBottomInset),
          sliver: const SliverToBoxAdapter(child: SizedBox.shrink()),
        ),
      ],
    );
  }

  static Map<String, List<EdHomeApp>> _groupApps(List<EdHomeApp> apps) {
    final map = <String, List<EdHomeApp>>{};
    for (final app in apps) {
      map.putIfAbsent(app.category, () => []).add(app);
    }
    return map;
  }

  static String _pendingMessage(String? receipts, String? customers, String? promo) {
    final r = int.tryParse(receipts ?? '') ?? 0;
    final c = int.tryParse(customers ?? '') ?? 0;
    final p = int.tryParse(promo ?? '') ?? 0;
    final parts = <String>[];
    if (r > 0) parts.add('$r سند قبض');
    if (c > 0) parts.add('$c زبون جديد');
    if (p > 0) parts.add('$p زيارة ترويجية');
    return 'بانتظار المراجعة: ${parts.join(' · ')}';
  }
}

class _HomeMainColumn extends StatelessWidget {
  const _HomeMainColumn({required this.apps});

  final List<EdHomeApp> apps;

  @override
  Widget build(BuildContext context) {
    final grouped = EdHomePage._groupApps(apps);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const EdHomeSectionHead(tablet: true),
        const SizedBox(height: 16),
        Expanded(
          child: ListView(
            padding: EdgeInsets.zero,
            children: [
              for (final group in grouped.entries) ...[
                _HomeSectionLabel(title: group.key),
                const SizedBox(height: 12),
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 14,
                    mainAxisSpacing: 14,
                    mainAxisExtent: 168,
                  ),
                  itemCount: group.value.length,
                  itemBuilder: (context, i) => EdHomeFeatureCard(app: group.value[i]),
                ),
                const SizedBox(height: 20),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class EdHomeSidePanel extends StatelessWidget {
  const EdHomeSidePanel({
    super.key,
    required this.agentName,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    this.avatarText,
    this.pendingReceipts,
    this.pendingCustomers,
    this.pendingPromoVisits,
  });

  final String agentName;
  final String? avatarText;
  final String treeCount;
  final String customerCount;
  final String orderCount;
  final String? pendingReceipts;
  final String? pendingCustomers;
  final String? pendingPromoVisits;

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = _initial(avatarText ?? name);
    final pendingR = int.tryParse(pendingReceipts ?? '') ?? 0;
    final pendingC = int.tryParse(pendingCustomers ?? '') ?? 0;
    final pendingP = int.tryParse(pendingPromoVisits ?? '') ?? 0;
    final pendingTotal = pendingR + pendingC + pendingP;

    return Container(
      height: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusXl),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(22, 28, 22, 24),
            decoration: const BoxDecoration(gradient: AppColors.homeSkyGradient),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _avatar(initial),
                const SizedBox(height: 16),
                Text(name, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF1E293B))),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.accentTeal.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.2)),
                  ),
                  child: const Text(
                    'بوابة المندوب',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accentTeal),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'اختر الخدمة وابدأ العمل',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.5),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
            child: EdHomeStatsBento(
              treeCount: treeCount,
              customerCount: customerCount,
              orderCount: orderCount,
              pendingTotal: pendingTotal,
              compact: true,
            ),
          ),
          if (pendingTotal > 0)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: _PendingBanner(
                message: EdHomePage._pendingMessage(pendingReceipts, pendingCustomers, pendingPromoVisits),
              ),
            ),
          const Spacer(),
        ],
      ),
    );
  }

  Widget _avatar(String initial) {
    return Container(
      width: 72,
      height: 72,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: AppColors.homeSunGradient,
        boxShadow: [BoxShadow(color: AppColors.accentTeal.withValues(alpha: 0.2), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.surface,
          border: Border.all(color: AppColors.borderLight),
        ),
        child: Text(initial, style: const TextStyle(color: AppColors.accentTeal, fontSize: 26, fontWeight: FontWeight.w800)),
      ),
    );
  }

  static String _initial(String text) {
    final t = text.trim();
    if (t.isEmpty) return 'م';
    return t.characters.first;
  }
}

class EdHomeSectionHead extends StatelessWidget {
  const EdHomeSectionHead({super.key, this.tablet = false});

  final bool tablet;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'لوحة الخدمات',
                style: TextStyle(fontSize: tablet ? 20 : 18, fontWeight: FontWeight.w800, color: const Color(0xFF1E293B)),
              ),
              const SizedBox(height: 4),
              Text(
                tablet ? 'كل ما تحتاجه في مكان واحد' : 'اضغط على الخدمة للدخول',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
            ],
          ),
        ),
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            gradient: AppColors.homeIconGradient(AppColors.accentTeal),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.15)),
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.grid_view_rounded, size: 22, color: AppColors.accentTeal),
        ),
      ],
    );
  }
}

class EdHomePageBackground extends StatelessWidget {
  const EdHomePageBackground({super.key});

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;

    return Stack(
      children: [
        Positioned(
          top: -40,
          right: -20,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 48, sigmaY: 48),
            child: Container(
              width: 200,
              height: 200,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.accentTeal.withValues(alpha: 0.12)),
            ),
          ),
        ),
        Positioned(
          top: h * 0.12,
          left: -30,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 48, sigmaY: 48),
            child: Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.moduleShop.withValues(alpha: 0.1)),
            ),
          ),
        ),
        Positioned(
          bottom: h * 0.15,
          right: 20,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 48, sigmaY: 48),
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.moduleReports.withValues(alpha: 0.08)),
            ),
          ),
        ),
      ],
    );
  }
}

class EdHomeStatsBento extends StatelessWidget {
  const EdHomeStatsBento({
    super.key,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    this.pendingTotal = 0,
    this.compact = false,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cells = [
          _StatCell(value: treeCount, label: 'شجرة', color: AppColors.accentTeal, icon: Icons.account_tree_outlined, bg: EdHomeThemes.accountsBg),
          _StatCell(value: customerCount, label: 'زبون', color: AppColors.accentBlue, icon: Icons.people_alt_outlined, bg: EdHomeThemes.shopBg),
          _StatCell(value: orderCount, label: 'طلب', color: AppColors.moduleOrders, icon: Icons.shopping_bag_outlined, bg: EdHomeThemes.ordersBg),
          if (pendingTotal > 0)
            _StatCell(value: '$pendingTotal', label: 'بانتظار', color: AppColors.warning, icon: Icons.schedule_rounded, bg: AppColors.warningSoft),
        ];

        if (compact) {
          return Row(
            children: [
              for (var i = 0; i < cells.length; i++) ...[
                Expanded(child: _bentoTile(cells[i], compact: true)),
                if (i < cells.length - 1) const SizedBox(width: 8),
              ],
            ],
          );
        }

        return GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.55,
          children: cells.map((c) => _bentoTile(c)).toList(),
        );
      },
    );
  }

  Widget _bentoTile(_StatCell cell, {bool compact = false}) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 8 : 14, vertical: compact ? 12 : 16),
      decoration: BoxDecoration(
        color: cell.bg,
        borderRadius: BorderRadius.circular(compact ? 16 : 20),
        border: Border.all(color: cell.color.withValues(alpha: 0.12)),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: compact ? 32 : 36,
            height: compact ? 32 : 36,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: cell.color.withValues(alpha: 0.15)),
            ),
            child: Icon(cell.icon, size: compact ? 16 : 18, color: cell.color),
          ),
          SizedBox(height: compact ? 8 : 12),
          Text(
            cell.value,
            style: TextStyle(fontSize: compact ? 18 : 24, fontWeight: FontWeight.w800, color: cell.color, height: 1),
          ),
          const SizedBox(height: 2),
          Text(
            cell.label,
            style: TextStyle(fontSize: compact ? 10 : 12, fontWeight: FontWeight.w700, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}

class _StatCell {
  const _StatCell({required this.value, required this.label, required this.color, required this.icon, required this.bg});
  final String value;
  final String label;
  final Color color;
  final IconData icon;
  final Color bg;
}

class EdHomeServiceTile extends StatelessWidget {
  const EdHomeServiceTile({super.key, required this.app});

  final EdHomeApp app;

  bool get _showBadge {
    final b = app.badge;
    return b != null && b != '—' && b != '0';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: app.onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          decoration: BoxDecoration(
            gradient: AppColors.homeCardWash,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: app.iconBg,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: app.iconColor.withValues(alpha: 0.12)),
                  ),
                  child: Icon(app.icon, color: app.iconColor, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        app.name,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Color(0xFF1E293B)),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        app.hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                if (_showBadge)
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: app.iconColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: app.iconColor.withValues(alpha: 0.2)),
                    ),
                    child: Text(app.badge!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: app.iconColor)),
                  ),
                const SizedBox(width: 8),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: app.iconBg,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: app.iconColor),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class EdHomeFeatureCard extends StatelessWidget {
  const EdHomeFeatureCard({super.key, required this.app});

  final EdHomeApp app;

  bool get _showBadge {
    final b = app.badge;
    return b != null && b != '—' && b != '0';
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(22),
        side: BorderSide(color: AppColors.borderLight),
      ),
      child: InkWell(
        onTap: app.onTap,
        child: Ink(
          decoration: BoxDecoration(
            gradient: AppColors.homeCardWash,
            borderRadius: BorderRadius.circular(22),
            boxShadow: AppColors.softShadow,
          ),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: app.iconBg,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: app.iconColor.withValues(alpha: 0.12)),
                      ),
                      child: Icon(app.icon, color: app.iconColor, size: 26),
                    ),
                    const Spacer(),
                    if (_showBadge)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: app.iconColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: app.iconColor.withValues(alpha: 0.2)),
                        ),
                        child: Text(app.badge!, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: app.iconColor)),
                      ),
                  ],
                ),
                const Spacer(),
                Text(
                  app.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF1E293B), height: 1.3),
                ),
                const SizedBox(height: 4),
                Text(
                  app.hint,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.35),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Text('فتح', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: app.iconColor)),
                    const Spacer(),
                    Icon(Icons.arrow_back_ios_new_rounded, size: 12, color: app.iconColor),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HomeSectionLabel extends StatelessWidget {
  const _HomeSectionLabel({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.accentTeal.withValues(alpha: 0.35),
            boxShadow: [BoxShadow(color: AppColors.accentTeal.withValues(alpha: 0.25), blurRadius: 6)],
          ),
        ),
        const SizedBox(width: 10),
        Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF334155))),
        const SizedBox(width: 8),
        Expanded(
          child: Container(
            height: 1,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.borderLight, AppColors.borderLight.withValues(alpha: 0)],
              ),
            ),
          ),
        ),
      ],
    );
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

class _PendingBanner extends StatelessWidget {
  const _PendingBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.warningSoft,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFFDE68A)),
        boxShadow: AppColors.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.warning.withValues(alpha: 0.2)),
            ),
            child: const Icon(Icons.notifications_active_outlined, color: AppColors.warning, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFFB45309), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

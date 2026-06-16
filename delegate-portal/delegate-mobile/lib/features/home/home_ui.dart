import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../accounts/accounts_theme.dart';

abstract final class _Home {
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0F172A), Color(0xFF1E3A5F), Color(0xFF0F766E)],
    stops: [0.0, 0.55, 1.0],
  );
  static const avatarRing = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF2DD4BF), Color(0xFF60A5FA), Color(0xFFC084FC)],
  );
}

class EdHomeApp {
  const EdHomeApp({
    required this.icon,
    required this.name,
    required this.hint,
    required this.iconColor,
    required this.iconBg,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String name;
  final String hint;
  final Color iconColor;
  final Color iconBg;
  final VoidCallback onTap;
  final String? badge;
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
  });

  final String agentName;
  final String? avatarText;
  final List<EdHomeApp> apps;
  final String treeCount;
  final String customerCount;
  final String orderCount;

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
                        width: layout.isDesktop ? 300 : 280,
                        child: EdHomeSidePanel(
                          agentName: agentName,
                          avatarText: avatarText,
                          treeCount: treeCount,
                          customerCount: customerCount,
                          orderCount: orderCount,
                        ),
                      ),
                      const SizedBox(width: 20),
                      Expanded(child: _HomeMainColumn(apps: apps, compact: false)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    return CustomScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              EdHomeHeroCard(agentName: agentName, avatarText: avatarText),
              const SizedBox(height: 22),
              const EdHomeSectionHead(),
              const SizedBox(height: 14),
            ]),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              mainAxisExtent: 168,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) => EdHomeFeatureCard(app: apps[i]),
              childCount: apps.length,
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
          sliver: SliverToBoxAdapter(
            child: EdHomeStatsBar(
              treeCount: treeCount,
              customerCount: customerCount,
              orderCount: orderCount,
            ),
          ),
        ),
      ],
    );
  }
}

class _HomeMainColumn extends StatelessWidget {
  const _HomeMainColumn({required this.apps, required this.compact});

  final List<EdHomeApp> apps;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const EdHomeSectionHead(tablet: true),
        const SizedBox(height: 16),
        Expanded(
          child: GridView.builder(
            padding: EdgeInsets.zero,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 14,
              mainAxisSpacing: 14,
              mainAxisExtent: compact ? 156 : 172,
            ),
            itemCount: apps.length,
            itemBuilder: (context, i) => EdHomeFeatureCard(app: apps[i]),
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
  });

  final String agentName;
  final String? avatarText;
  final String treeCount;
  final String customerCount;
  final String orderCount;

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = _initial(avatarText ?? name);

    return Container(
      height: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.border),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
            padding: const EdgeInsets.fromLTRB(18, 24, 18, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _avatar(initial),
                const SizedBox(height: 14),
                Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
                const SizedBox(height: 8),
                const Text(
                  'اختر تطبيقاً للبدء',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.5),
                ),
              ],
            ),
          ),
          Container(
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
            child: IntrinsicHeight(
              child: Row(
                children: [
                  Expanded(child: _metric(treeCount, 'الشجرات', AppColors.navy)),
                  const VerticalDivider(width: 1, thickness: 1, color: EdAccountsTheme.line),
                  Expanded(child: _metric(customerCount, 'الزبائن', AppColors.navy)),
                  const VerticalDivider(width: 1, thickness: 1, color: EdAccountsTheme.line),
                  Expanded(child: _metric(orderCount, 'الطلبات', const Color(0xFFD97706))),
                ],
              ),
            ),
          ),
          Container(
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.border))),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
              child: Column(
                children: [
                  Text(
                    treeCount == '—' || treeCount == '0' ? '—' : '●',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: treeCount == '—' || treeCount == '0' ? AppColors.muted : EdAccountsTheme.credit,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    treeCount == '—' || treeCount == '0' ? 'غير نشط' : 'نشط',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted),
                  ),
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
      width: 68,
      height: 68,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: _Home.avatarRing,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Container(
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.navy.withValues(alpha: 0.92)),
        child: Text(initial, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
      ),
    );
  }

  Widget _metric(String value, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
      child: Column(
        children: [
          Text(
            value,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: color, height: 1.1),
          ),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
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
                tablet ? 'التطبيقات' : 'التطبيقات',
                style: TextStyle(fontSize: tablet ? 18 : 16, fontWeight: FontWeight.w800, color: AppColors.navy),
              ),
              const SizedBox(height: 4),
              Text(
                tablet ? 'اختر وحدة العمل للمتابعة' : 'اضغط على بطاقة للدخول',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
            ],
          ),
        ),
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: EdAccountsTheme.accentSoft,
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            border: Border.all(color: EdAccountsTheme.line),
          ),
          alignment: Alignment.center,
          child: const Icon(Icons.apps_rounded, size: 20, color: EdAccountsTheme.accent),
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
          top: -50,
          left: 0,
          right: 0,
          child: Center(
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 56, sigmaY: 56),
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.accentTeal.withValues(alpha: 0.16)),
              ),
            ),
          ),
        ),
        Positioned(
          top: h * 0.1,
          right: -50,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 56, sigmaY: 56),
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.moduleShop.withValues(alpha: 0.1)),
            ),
          ),
        ),
        Positioned(
          bottom: h * 0.12,
          left: -40,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 56, sigmaY: 56),
            child: Container(
              width: 150,
              height: 150,
              decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.moduleReports.withValues(alpha: 0.1)),
            ),
          ),
        ),
      ],
    );
  }
}

class EdHomeHeroCard extends StatelessWidget {
  const EdHomeHeroCard({super.key, required this.agentName, this.avatarText});

  final String agentName;
  final String? avatarText;

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = EdHomeSidePanel._initial(avatarText ?? name);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
      decoration: BoxDecoration(
        gradient: _Home.heroGradient,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.16), blurRadius: 40, offset: const Offset(0, 16))],
      ),
      child: Row(
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 72,
                height: 72,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: _Home.avatarRing,
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.22), blurRadius: 20, offset: const Offset(0, 8))],
                ),
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: AppColors.navy.withValues(alpha: 0.92)),
                  child: Text(initial, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                ),
              ),
              Positioned(
                bottom: 2,
                right: 2,
                child: Container(
                  width: 13,
                  height: 13,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF4ADE80),
                    border: Border.all(color: AppColors.navy, width: 2.5),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Edari · بوابة المندوب',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                ),
                const SizedBox(height: 4),
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800, height: 1.35),
                ),
                const SizedBox(height: 6),
                Text(
                  'مرحباً — اختر تطبيقاً للبدء',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontSize: 13, fontWeight: FontWeight.w600, height: 1.45),
                ),
              ],
            ),
          ),
        ],
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
      color: AppColors.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: AppColors.border),
      ),
      child: InkWell(
        onTap: app.onTap,
        child: Stack(
          children: [
            Positioned(
              top: 0,
              right: 0,
              child: Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.topRight,
                    radius: 1,
                    colors: [app.iconBg.withValues(alpha: 0.55), Colors.transparent],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: app.iconBg,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.border.withValues(alpha: 0.6)),
                        ),
                        child: Icon(app.icon, color: app.iconColor, size: 24),
                      ),
                      const Spacer(),
                      if (_showBadge)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                          decoration: BoxDecoration(
                            color: app.iconBg,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: app.iconColor.withValues(alpha: 0.25)),
                          ),
                          child: Text(
                            app.badge!,
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: app.iconColor),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    app.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.35),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    app.hint,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textSecondary, height: 1.4),
                  ),
                  Container(
                    padding: const EdgeInsets.only(top: 10),
                    decoration: BoxDecoration(
                      border: Border(top: BorderSide(color: AppColors.border.withValues(alpha: 0.85))),
                    ),
                    child: Row(
                      children: [
                        Text('فتح', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: app.iconColor)),
                        const Spacer(),
                        Container(
                          width: 30,
                          height: 30,
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppColors.border),
                          ),
                          child: Icon(Icons.arrow_back_ios_new_rounded, size: 12, color: app.iconColor),
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
    );
  }
}

class EdHomeStatsBar extends StatelessWidget {
  const EdHomeStatsBar({
    super.key,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;

  @override
  Widget build(BuildContext context) {
    final active = treeCount != '—' && treeCount != '0';

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          children: [
            _cell(treeCount, 'شجرة', AppColors.accentTeal),
            _divider(),
            _cell(customerCount, 'زبون', AppColors.navy),
            _divider(),
            _cell(orderCount, 'طلب', const Color(0xFFD97706)),
            _divider(),
            _cell(active ? '●' : '—', active ? 'نشط' : '—', active ? EdAccountsTheme.credit : AppColors.muted, compact: true),
          ],
        ),
      ),
    );
  }

  Widget _divider() => const VerticalDivider(width: 1, thickness: 1, color: AppColors.border);

  Widget _cell(String value, String label, Color color, {bool compact = false}) {
    return Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
        child: Column(
          children: [
            Text(
              value,
              textAlign: TextAlign.center,
              textDirection: compact ? TextDirection.ltr : TextDirection.rtl,
              style: TextStyle(fontSize: compact ? 16 : 17, fontWeight: FontWeight.w800, color: color, height: 1.1),
            ),
            const SizedBox(height: 4),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

/// ألوان خلفية أيقونات التطبيقات
abstract final class EdHomeThemes {
  static const accountsBg = Color(0xFFECFDF5);
  static const shopBg = Color(0xFFEFF6FF);
  static const ordersBg = Color(0xFFFFFBEB);
  static const reportsBg = Color(0xFFF5F3FF);
}

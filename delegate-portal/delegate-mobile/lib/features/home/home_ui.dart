import 'dart:ui';

import 'package:flutter/material.dart';

import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/phone_ui.dart';
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
    this.pendingReceipts,
    this.pendingCustomers,
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
                        width: layout.isDesktop ? 300 : 280,
                        child: EdHomeSidePanel(
                          agentName: agentName,
                          avatarText: avatarText,
                          treeCount: treeCount,
                          customerCount: customerCount,
                          orderCount: orderCount,
                          pendingReceipts: pendingReceipts,
                          pendingCustomers: pendingCustomers,
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

    final pendingTotal = (int.tryParse(pendingReceipts ?? '') ?? 0) + (int.tryParse(pendingCustomers ?? '') ?? 0);

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
          child: Transform.translate(
            offset: const Offset(0, -22),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
              child: EdPhoneStatsCard(
                treeCount: treeCount,
                customerCount: customerCount,
                orderCount: orderCount,
                pendingTotal: pendingTotal,
              ),
            ),
          ),
        ),
        if (pendingTotal > 0)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 12),
              child: _PendingBanner(
                message: _pendingMessage(pendingReceipts, pendingCustomers),
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.fromLTRB(EdSpacing.page, pendingTotal > 0 ? 4 : 8, EdSpacing.page, EdSpacing.md),
            child: const Row(
              children: [
                _SectionAccent(),
                SizedBox(width: 10),
                Text('الخدمات', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, kPhoneBottomInset),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.92,
            ),
            delegate: SliverChildBuilderDelegate(
              (context, i) => EdPhoneServiceCard(
                app: EdPhoneAppData(
                  icon: apps[i].icon,
                  name: apps[i].name,
                  hint: apps[i].hint,
                  iconColor: apps[i].iconColor,
                  iconBg: apps[i].iconBg,
                  badge: apps[i].badge,
                  onTap: apps[i].onTap,
                ),
              ),
              childCount: apps.length,
            ),
          ),
        ),
        SliverFillRemaining(
          hasScrollBody: false,
          fillOverscroll: true,
          child: const SizedBox.shrink(),
        ),
      ],
    );
  }

  static String _pendingMessage(String? receipts, String? customers) {
    final r = int.tryParse(receipts ?? '') ?? 0;
    final c = int.tryParse(customers ?? '') ?? 0;
    final parts = <String>[];
    if (r > 0) parts.add('$r سند قبض');
    if (c > 0) parts.add('$c زبون جديد');
    return 'بانتظار المراجعة: ${parts.join(' · ')}';
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
              crossAxisCount: apps.length > 4 ? 3 : 2,
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
    this.pendingReceipts,
    this.pendingCustomers,
  });

  final String agentName;
  final String? avatarText;
  final String treeCount;
  final String customerCount;
  final String orderCount;
  final String? pendingReceipts;
  final String? pendingCustomers;

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
              padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
              child: Builder(
                builder: (context) {
                  final pendingR = int.tryParse(pendingReceipts ?? '') ?? 0;
                  final pendingC = int.tryParse(pendingCustomers ?? '') ?? 0;
                  final pendingTotal = pendingR + pendingC;
                  if (pendingTotal > 0) {
                    return Column(
                      children: [
                        Text(
                          '$pendingTotal',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFFD97706)),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'بانتظار المراجعة',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted),
                        ),
                      ],
                    );
                  }
                  return Column(
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
                  );
                },
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
    this.pendingReceipts,
    this.pendingCustomers,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final String? pendingReceipts;
  final String? pendingCustomers;

  @override
  Widget build(BuildContext context) {
    final active = treeCount != '—' && treeCount != '0';
    final pendingR = int.tryParse(pendingReceipts ?? '') ?? 0;
    final pendingC = int.tryParse(pendingCustomers ?? '') ?? 0;
    final pendingTotal = pendingR + pendingC;

    return Column(
      children: [
        Container(
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
                if (pendingTotal > 0)
                  _cell('$pendingTotal', 'بانتظار', const Color(0xFFD97706))
                else
                  _cell(active ? '●' : '—', active ? 'نشط' : '—', active ? EdAccountsTheme.credit : AppColors.muted, compact: true),
              ],
            ),
          ),
        ),
        if (pendingTotal > 0) ...[
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFFFBEB),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFFDE68A)),
            ),
            child: Text(
              'بانتظار المراجعة: ${pendingR > 0 ? '$pendingR سند' : ''}${pendingR > 0 && pendingC > 0 ? ' · ' : ''}${pendingC > 0 ? '$pendingC زبون' : ''}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFB45309)),
            ),
          ),
        ],
      ],
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
  static const accountsBg = Color(0xFFE6F7F5);
  static const shopBg = Color(0xFFEFF6FF);
  static const ordersBg = Color(0xFFFFF7ED);
  static const reportsBg = Color(0xFFF5F3FF);
  static const receiptsBg = Color(0xFFECFDF5);
  static const customersBg = Color(0xFFFFF1F2);
}

class _SectionAccent extends StatelessWidget {
  const _SectionAccent();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 4,
      height: 18,
      decoration: BoxDecoration(
        color: AppColors.accentTeal,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}

class _PendingBanner extends StatelessWidget {
  const _PendingBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.warningSoft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.notifications_active_outlined, color: Color(0xFFB45309), size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFFB45309), height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}

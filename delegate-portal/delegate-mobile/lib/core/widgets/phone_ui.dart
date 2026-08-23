import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';

const kPhoneBottomInset = 100.0;

const _tabRoots = {
  '/home',
  '/accounts',
  '/shop',
  '/orders',
  '/receipts',
  '/customers',
  '/promotional-visits',
  '/reports',
  '/settings',
};

bool isPhoneTabRoot(String location) => _tabRoots.contains(location);

bool shouldShowPhoneBack(BuildContext context, {bool showBack = false}) {
  if (!EdLayout.of(context).isPhone) return showBack;
  final loc = GoRouterState.of(context).matchedLocation;
  if (isPhoneTabRoot(loc)) return false;
  return showBack || GoRouter.of(context).canPop();
}

/// رأس صفحة موحّد للهاتف
class EdPhoneHeader extends StatelessWidget {
  const EdPhoneHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.kicker,
    this.showBack = false,
    this.onBack,
    this.actions,
    this.compact = false,
  });

  final String title;
  final String? subtitle;
  final String? kicker;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Widget>? actions;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final back = shouldShowPhoneBack(context, showBack: showBack);

    return ClipRect(
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(bottom: BorderSide(color: AppColors.borderLight)),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(EdSpacing.sm, compact ? 6 : 10, EdSpacing.lg, compact ? 12 : 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                SizedBox(
                  width: 48,
                  child: back && onBack != null
                      ? _HeaderIconBtn(icon: Icons.arrow_forward_rounded, onTap: onBack!)
                      : null,
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (kicker != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            kicker!,
                            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted),
                          ),
                        ),
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: compact ? 18 : 20, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2),
                      ),
                      if (subtitle != null && subtitle!.isNotEmpty)
                        Text(
                          subtitle!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                    ],
                  ),
                ),
                  if (actions != null)
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        for (var i = 0; i < actions!.length; i++) ...[
                          if (i > 0) const SizedBox(width: 6),
                          actions![i],
                        ],
                      ],
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HeaderIconBtn extends StatelessWidget {
  const _HeaderIconBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceAlt,
      borderRadius: BorderRadius.circular(AppColors.radiusSm),
      elevation: 0,
      shadowColor: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: SizedBox(width: 42, height: 42, child: Icon(icon, color: AppColors.navy, size: 20)),
        ),
      ),
    );
  }
}

/// بطاقة خدمة — شبكة ثنائية الأعمدة
class EdPhoneServiceCard extends StatelessWidget {
  const EdPhoneServiceCard({super.key, required this.app});

  final EdPhoneAppData app;

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
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.cardShadow,
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: 4,
                  decoration: BoxDecoration(gradient: AppColors.moduleGradient(app.iconColor)),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                gradient: AppColors.moduleSoftGradient(app.iconColor),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: app.iconColor.withValues(alpha: 0.12)),
                                boxShadow: [BoxShadow(color: app.iconColor.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 4))],
                              ),
                              child: Icon(app.icon, color: app.iconColor, size: 24),
                            ),
                            const Spacer(),
                            if (_showBadge)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                                decoration: BoxDecoration(
                                  gradient: AppColors.moduleSoftGradient(app.iconColor),
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
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.3),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          app.hint,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted),
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
    );
  }
}

/// بطاقة خدمة أفقية
class EdPhoneServiceTile extends StatelessWidget {
  const EdPhoneServiceTile({super.key, required this.app});

  final EdPhoneAppData app;

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
        borderRadius: BorderRadius.circular(AppColors.radiusXl),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppColors.radiusXl),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: Padding(
            padding: const EdgeInsets.all(EdSpacing.lg),
            child: Row(
              children: [
                Container(
                  width: 54,
                  height: 54,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topRight,
                      end: Alignment.bottomLeft,
                      colors: [app.iconBg, app.iconBg.withValues(alpha: 0.5)],
                    ),
                    borderRadius: BorderRadius.circular(AppColors.radius),
                    border: Border.all(color: app.iconColor.withValues(alpha: 0.12)),
                  ),
                  child: Icon(app.icon, color: app.iconColor, size: 26),
                ),
                const SizedBox(width: EdSpacing.lg),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(app.name, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.25)),
                      const SizedBox(height: 3),
                      Text(app.hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                    ],
                  ),
                ),
                if (_showBadge) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: app.iconColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: app.iconColor.withValues(alpha: 0.2)),
                    ),
                    child: Text(app.badge!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: app.iconColor)),
                  ),
                  const SizedBox(width: 8),
                ],
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(10)),
                  child: Icon(Icons.chevron_left_rounded, color: app.iconColor.withValues(alpha: 0.8), size: 20),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class EdPhoneAppData {
  const EdPhoneAppData({
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

/// إحصائيات — بطاقة واحدة أنيقة
class EdPhoneStatsCard extends StatelessWidget {
  const EdPhoneStatsCard({
    super.key,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    this.pendingTotal = 0,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            height: 3,
            decoration: const BoxDecoration(gradient: AppColors.accentGradient),
          ),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(child: _cell(treeCount, 'شجرة', AppColors.accentTeal, Icons.account_tree_outlined)),
                const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
                Expanded(child: _cell(customerCount, 'زبون', AppColors.navy, Icons.people_alt_outlined)),
                const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
                Expanded(child: _cell(orderCount, 'طلب', AppColors.warning, Icons.shopping_bag_outlined)),
                if (pendingTotal > 0) ...[
                  const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
                  Expanded(child: _cell('$pendingTotal', 'بانتظار', AppColors.warning, Icons.schedule_rounded)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _cell(String value, String label, Color color, IconData icon) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsets.only(bottom: 6),
            decoration: BoxDecoration(
              gradient: AppColors.moduleSoftGradient(color),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 16, color: color),
          ),
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color, height: 1)),
          const SizedBox(height: 3),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
        ],
      ),
    );
  }
}

/// إحصائيات أفقية
class EdPhoneStatsRow extends StatelessWidget {
  const EdPhoneStatsRow({
    super.key,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    this.pendingTotal = 0,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
      child: Row(
        children: [
          _statCard(treeCount, 'شجرة', AppColors.accentTeal, Icons.account_tree_outlined),
          _statCard(customerCount, 'زبون', AppColors.navy, Icons.people_alt_outlined),
          _statCard(orderCount, 'طلب', AppColors.warning, Icons.shopping_bag_outlined),
          if (pendingTotal > 0)
            _statCard('$pendingTotal', 'بانتظار', const Color(0xFFB45309), Icons.schedule_rounded, highlight: true),
        ],
      ),
    );
  }

  Widget _statCard(String value, String label, Color color, IconData icon, {bool highlight = false}) {
    return Container(
      margin: const EdgeInsetsDirectional.only(end: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      constraints: const BoxConstraints(minWidth: 110),
      decoration: BoxDecoration(
        color: highlight ? AppColors.warningSoft : AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: highlight ? const Color(0xFFFDE68A) : AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color, height: 1)),
              const SizedBox(height: 2),
              Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
            ],
          ),
        ],
      ),
    );
  }
}

/// بطل الشاشة الرئيسية — فاتح وأنيق
class EdPhoneHomeHero extends StatelessWidget {
  const EdPhoneHomeHero({
    super.key,
    required this.agentName,
    this.avatarText,
    this.onSettings,
    this.onRefresh,
  });

  final String agentName;
  final String? avatarText;
  final VoidCallback? onSettings;
  final VoidCallback? onRefresh;

  static String _initial(String text) {
    final t = text.trim();
    if (t.isEmpty) return 'م';
    return t.characters.first;
  }

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = _initial(avatarText ?? name);
    final top = MediaQuery.paddingOf(context).top;

    return Container(
      width: double.infinity,
      padding: EdgeInsets.fromLTRB(EdSpacing.page, top + 10, EdSpacing.page, 20),
      decoration: const BoxDecoration(
        gradient: AppColors.homeSkyGradient,
      ),
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned(
            top: 0,
            right: -24,
            child: IgnorePointer(
              child: Container(
                width: 110,
                height: 110,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.accentTeal.withValues(alpha: 0.1),
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -10,
            left: -16,
            child: IgnorePointer(
              child: Container(
                width: 90,
                height: 90,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.accentBlue.withValues(alpha: 0.08),
                ),
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.borderLight),
                      boxShadow: AppColors.softShadow,
                    ),
                    child: Image.asset('assets/logo.png', width: 26, height: 26),
                  ),
                  const SizedBox(width: 10),
                  const Text(
                    'Edari',
                    style: TextStyle(color: Color(0xFF334155), fontSize: 16, fontWeight: FontWeight.w800, letterSpacing: 0.4),
                  ),
                  const Spacer(),
                  if (onRefresh != null) _heroBtn(Icons.refresh_rounded, onRefresh!),
                  if (onSettings != null) ...[
                    const SizedBox(width: 8),
                    _heroBtn(Icons.settings_outlined, onSettings!),
                  ],
                ],
              ),
              const SizedBox(height: 24),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: AppColors.homeSunGradient,
                      boxShadow: [BoxShadow(color: AppColors.accentTeal.withValues(alpha: 0.18), blurRadius: 14, offset: const Offset(0, 5))],
                    ),
                    child: Container(
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.surface,
                        border: Border.all(color: AppColors.borderLight),
                      ),
                      child: Text(initial, style: const TextStyle(color: AppColors.accentTeal, fontSize: 24, fontWeight: FontWeight.w800)),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'مرحباً بك',
                          style: TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Color(0xFF1E293B), fontSize: 26, fontWeight: FontWeight.w800, height: 1.2, letterSpacing: -0.3),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppColors.accentTeal.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.18)),
                          ),
                          child: const Text(
                            'بوابة المندوب',
                            style: TextStyle(color: AppColors.accentTeal, fontSize: 11, fontWeight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroBtn(IconData icon, VoidCallback onTap) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      elevation: 0,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.softShadow,
          ),
          child: SizedBox(width: 44, height: 44, child: Icon(icon, color: const Color(0xFF475569), size: 21)),
        ),
      ),
    );
  }
}

/// شريط تنقل سفلي
class EdPhoneDock extends StatelessWidget {
  const EdPhoneDock({super.key, required this.selected, required this.onSelect});

  final int selected;
  final ValueChanged<int> onSelect;

  static const _items = [
    (icon: Icons.home_rounded, activeIcon: Icons.home, label: 'الرئيسية'),
    (icon: Icons.menu_book_outlined, activeIcon: Icons.menu_book_rounded, label: 'الحسابات'),
    (icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2_rounded, label: 'المنتجات'),
    (icon: Icons.shopping_bag_outlined, activeIcon: Icons.shopping_bag_rounded, label: 'الطلبات'),
    (icon: Icons.grid_view_rounded, activeIcon: Icons.apps_rounded, label: 'المزيد'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.borderLight)),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, -2))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 6),
          child: Row(
            children: List.generate(_items.length, (i) {
              final item = _items[i];
              final active = i == selected;
              return Expanded(
                child: GestureDetector(
                  onTap: () => onSelect(i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                          decoration: BoxDecoration(
                            color: active ? AppColors.surfaceAlt : Colors.transparent,
                            borderRadius: BorderRadius.circular(10),
                            border: active ? Border.all(color: AppColors.borderLight) : null,
                          ),
                          child: Icon(active ? item.activeIcon : item.icon, size: 22, color: active ? AppColors.navy : AppColors.mutedLight),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? AppColors.navy : AppColors.mutedLight),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

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

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(EdSpacing.sm, compact ? 6 : 10, EdSpacing.lg, compact ? 12 : 16),
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
                      Text(
                        kicker!,
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accentTeal, letterSpacing: 0.4),
                      ),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: compact ? 18 : 21, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty)
                      Text(
                        subtitle!,
                        maxLines: 1,
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
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        child: SizedBox(width: 42, height: 42, child: Icon(icon, color: AppColors.navy, size: 20)),
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
            boxShadow: AppColors.softShadow,
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: app.iconBg,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: app.iconColor.withValues(alpha: 0.1)),
                      ),
                      child: Icon(app.icon, color: app.iconColor, size: 24),
                    ),
                    const Spacer(),
                    if (_showBadge)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: app.iconColor.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(999),
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
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.06), blurRadius: 20, offset: const Offset(0, 8))],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(child: _cell(treeCount, 'شجرة', AppColors.accentTeal)),
            const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
            Expanded(child: _cell(customerCount, 'زبون', AppColors.navy)),
            const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
            Expanded(child: _cell(orderCount, 'طلب', AppColors.warning)),
            if (pendingTotal > 0) ...[
              const VerticalDivider(width: 1, thickness: 1, color: AppColors.borderLight),
              Expanded(child: _cell('$pendingTotal', 'بانتظار', const Color(0xFFB45309))),
            ],
          ],
        ),
      ),
    );
  }

  Widget _cell(String value, String label, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 6),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: color, height: 1)),
          const SizedBox(height: 4),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
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

/// بطل الشاشة الرئيسية
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
      padding: EdgeInsets.fromLTRB(EdSpacing.page, top + 12, EdSpacing.page, 44),
      decoration: const BoxDecoration(
        gradient: AppColors.brandGradient,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Image.asset('assets/logo.png', width: 24, height: 24),
              ),
              const SizedBox(width: 8),
              Text(
                'Edari',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 0.6),
              ),
              const Spacer(),
              if (onRefresh != null) _heroBtn(Icons.refresh_rounded, onRefresh!),
              if (onSettings != null) ...[
                const SizedBox(width: 6),
                _heroBtn(Icons.settings_outlined, onSettings!),
              ],
            ],
          ),
          const SizedBox(height: 24),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 56,
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                ),
                child: Text(initial, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'مرحباً بك',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.25),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'بوابة المندوب',
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _heroBtn(IconData icon, VoidCallback onTap) {
    return Material(
      color: Colors.white.withValues(alpha: 0.1),
      borderRadius: BorderRadius.circular(AppColors.radiusSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        child: SizedBox(width: 42, height: 42, child: Icon(icon, color: Colors.white, size: 21)),
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
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.borderLight)),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
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
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: active ? AppColors.accentSoft : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppColors.radiusSm),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(active ? item.activeIcon : item.icon, size: 22, color: active ? AppColors.accentTeal : AppColors.mutedLight),
                        const SizedBox(height: 3),
                        Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: active ? AppColors.accentTeal : AppColors.mutedLight),
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

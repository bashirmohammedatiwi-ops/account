import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';
import 'ed_components.dart';
import 'ed_page_background.dart';
import 'phone_ui.dart';

class _NavItem {
  const _NavItem({required this.icon, required this.label, required this.path});

  final IconData icon;
  final String label;
  final String path;
}

const _tabletNavItems = [
  _NavItem(icon: Icons.home_rounded, label: 'الرئيسية', path: '/home'),
  _NavItem(icon: Icons.menu_book_rounded, label: 'الحسابات', path: '/accounts'),
  _NavItem(icon: Icons.inventory_2_outlined, label: 'المنتجات', path: '/shop'),
  _NavItem(icon: Icons.shopping_bag_outlined, label: 'الطلبات', path: '/orders'),
  _NavItem(icon: Icons.receipt_long_rounded, label: 'سند قبض', path: '/receipts'),
  _NavItem(icon: Icons.person_add_alt_1_rounded, label: 'زبون جديد', path: '/customers'),
  _NavItem(icon: Icons.bar_chart_rounded, label: 'التقارير', path: '/reports'),
  _NavItem(icon: Icons.settings_outlined, label: 'الإعدادات', path: '/settings'),
];

const _phoneNavItems = [
  _NavItem(icon: Icons.home_rounded, label: 'الرئيسية', path: '/home'),
  _NavItem(icon: Icons.menu_book_rounded, label: 'الحسابات', path: '/accounts'),
  _NavItem(icon: Icons.inventory_2_outlined, label: 'المنتجات', path: '/shop'),
  _NavItem(icon: Icons.shopping_bag_outlined, label: 'الطلبات', path: '/orders'),
];

const _moreRoutes = ['/receipts', '/customers', '/promotional-visits', '/reports', '/settings'];

int _tabletSelectedIndex(String location) {
  for (var i = _tabletNavItems.length - 1; i >= 0; i--) {
    final p = _tabletNavItems[i].path;
    if (location == p || location.startsWith('$p/')) return i;
  }
  return 0;
}

int _phoneSelectedIndex(String location) {
  for (var i = 0; i < _phoneNavItems.length; i++) {
    final p = _phoneNavItems[i].path;
    if (location == p || location.startsWith('$p/')) return i;
  }
  for (final p in _moreRoutes) {
    if (location == p || location.startsWith('$p/')) return _phoneNavItems.length;
  }
  if (location.startsWith('/invoice')) return _phoneNavItems.length;
  return 0;
}

void showMoreNavSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppColors.radius2xl)),
        boxShadow: AppColors.elevatedShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(99)),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(24, 20, 24, 16),
            child: Align(
              alignment: Alignment.centerRight,
              child: Text('المزيد', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.35,
              children: [
                _MoreNavCard(icon: Icons.receipt_long_rounded, label: 'سند قبض', color: AppColors.moduleReceipts, onTap: () {
                  Navigator.pop(ctx);
                  context.go('/receipts');
                }),
                _MoreNavCard(icon: Icons.person_add_alt_1_rounded, label: 'زبون جديد', color: AppColors.moduleCustomers, onTap: () {
                  Navigator.pop(ctx);
                  context.go('/customers');
                }),
                _MoreNavCard(icon: Icons.campaign_rounded, label: 'الزيادات الترويجية', color: AppColors.modulePromo, onTap: () {
                  Navigator.pop(ctx);
                  context.go('/promotional-visits');
                }),
                _MoreNavCard(icon: Icons.bar_chart_rounded, label: 'التقارير', color: AppColors.moduleReports, onTap: () {
                  Navigator.pop(ctx);
                  context.go('/reports');
                }),
                _MoreNavCard(icon: Icons.settings_outlined, label: 'الإعدادات', color: AppColors.navy, onTap: () {
                  Navigator.pop(ctx);
                  context.go('/settings');
                }),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    ),
  );
}

class _MoreNavCard extends StatelessWidget {
  const _MoreNavCard({required this.icon, required this.label, required this.color, required this.onTap});

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surfaceAlt,
      borderRadius: BorderRadius.circular(AppColors.radiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            border: Border.all(color: AppColors.borderLight),
            gradient: LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [color.withValues(alpha: 0.08), AppColors.surface],
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: AppColors.moduleSoftGradient(color),
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [BoxShadow(color: color.withValues(alpha: 0.15), blurRadius: 12, offset: const Offset(0, 4))],
                ),
                child: Icon(icon, color: color, size: 26),
              ),
              const SizedBox(height: 12),
              Text(label, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy, fontSize: 13)),
            ],
          ),
        ),
      ),
    );
  }
}

/// غلاف التطبيق — شريط جانبي على التابلت، شريط سفلي على الهاتف
class AdaptiveShell extends StatelessWidget {
  const AdaptiveShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final location = GoRouterState.of(context).matchedLocation;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: EdPageBackground(
          child: layout.isWide
              ? Row(
                  children: [
                    Expanded(child: child),
                    _TabletNavRail(selected: _tabletSelectedIndex(location)),
                  ],
                )
              : SizedBox.expand(child: child),
        ),
        bottomNavigationBar: layout.isWide
            ? null
            : EdPhoneDock(
                selected: _phoneSelectedIndex(location),
                onSelect: (i) {
                  if (i == _phoneNavItems.length) {
                    showMoreNavSheet(context);
                  } else {
                    context.go(_phoneNavItems[i].path);
                  }
                },
              ),
      ),
    );
  }
}

class _TabletNavRail extends StatelessWidget {
  const _TabletNavRail({required this.selected});

  final int selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 88,
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.96),
        border: Border(left: BorderSide(color: AppColors.borderLight)),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 16, offset: const Offset(-4, 0))],
      ),
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 12),
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: AppColors.heroGradient,
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: const Text('E', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 4),
                itemCount: _tabletNavItems.length,
                itemBuilder: (context, i) {
                  final item = _tabletNavItems[i];
                  final active = i == selected;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    child: Material(
                      color: active ? null : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => context.go(item.path),
                        child: Ink(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(14),
                            gradient: active ? AppColors.moduleSoftGradient(AppColors.accentTeal) : null,
                            border: active ? Border.all(color: AppColors.accentTeal.withValues(alpha: 0.15)) : null,
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(item.icon, size: 22, color: active ? AppColors.accentTeal : AppColors.muted),
                                const SizedBox(height: 4),
                                Text(
                                  item.label,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w800,
                                    height: 1.2,
                                    color: active ? AppColors.accentTeal : AppColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.title,
    required this.child,
    this.actions,
    this.floatingActionButton,
    this.subtitle,
    this.kicker,
    this.showBack = false,
    this.onBack,
    this.toolbar,
    this.useHeader = false,
    this.showNavBar = true,
  });

  final String title;
  final String? subtitle;
  final String? kicker;
  final Widget child;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final bool showBack;
  final VoidCallback? onBack;
  final Widget? toolbar;
  final bool useHeader;
  final bool showNavBar;

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.of(context);
    final layout = EdLayout.of(context);
    final canPop = showBack || router.canPop();
    final back = onBack ?? () => router.pop();
    final hideBackOnTablet = layout.isWide && !showBack;
    final phoneBack = shouldShowPhoneBack(context, showBack: showBack);

    if (layout.isPhone) {
      return Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: AppColors.bg,
          floatingActionButton: floatingActionButton,
          body: EdPageBackground(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (showNavBar)
                  EdPhoneHeader(
                    title: title,
                    subtitle: subtitle,
                    kicker: kicker,
                    showBack: phoneBack,
                    onBack: phoneBack ? back : null,
                    actions: actions,
                  ),
                if (toolbar != null) toolbar!,
                Expanded(child: child),
              ],
            ),
          ),
        ),
      );
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        appBar: useHeader
            ? EdAppHeader(
                title: title,
                kicker: kicker,
                subtitle: subtitle,
                showBack: canPop && !hideBackOnTablet,
                onBack: canPop ? back : null,
                actions: actions,
              )
            : null,
        floatingActionButton: floatingActionButton,
        body: EdPageBackground(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (!useHeader && showNavBar && !hideBackOnTablet)
                EdPageNavBar(showBack: canPop, onBack: canPop ? back : null, actions: actions),
              if (toolbar != null) toolbar!,
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message = 'جاري التحميل...'});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppColors.radiusLg),
              border: Border.all(color: AppColors.borderLight),
              boxShadow: AppColors.cardShadow,
            ),
            child: const CircularProgressIndicator(strokeWidth: 3, color: AppColors.accentTeal),
          ),
          const SizedBox(height: EdSpacing.lg),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.surface.withValues(alpha: 0.8),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: AppColors.borderLight),
            ),
            child: Text(message, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppColors.radiusXl),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.cardShadow,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [AppColors.dangerSoft, AppColors.danger.withValues(alpha: 0.08)],
                  ),
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.15)),
                ),
                child: const Icon(Icons.error_outline_rounded, size: 32, color: AppColors.danger),
              ),
              const SizedBox(height: 16),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.navy)),
              if (onRetry != null) ...[
                const SizedBox(height: 18),
                EdPrimaryButton(label: 'إعادة المحاولة', onPressed: onRetry, fullWidth: false, gradient: true, icon: Icons.refresh_rounded),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.accentTeal;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 4,
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              gradient: AppColors.moduleGradient(c),
              borderRadius: BorderRadius.circular(99),
            ),
          ),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon = Icons.inbox_outlined, this.subtitle});

  final String message;
  final String? subtitle;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(EdSpacing.xxl),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppColors.radiusXl),
            border: Border.all(color: AppColors.borderLight),
            boxShadow: AppColors.cardShadow,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  gradient: AppColors.moduleSoftGradient(AppColors.muted),
                  borderRadius: BorderRadius.circular(AppColors.radiusLg),
                  border: Border.all(color: AppColors.borderLight),
                ),
                child: Icon(icon, size: 36, color: AppColors.muted),
              ),
              const SizedBox(height: EdSpacing.lg),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.navy)),
              if (subtitle != null) ...[
                const SizedBox(height: 8),
                Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.muted, height: 1.4)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

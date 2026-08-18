import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';
import 'ed_components.dart';
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

const _moreRoutes = ['/receipts', '/customers', '/reports', '/settings'];

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
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
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
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: Icon(icon, color: color, size: 26),
              ),
              const SizedBox(height: 10),
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
        body: layout.isWide
            ? Row(
                children: [
                  Expanded(child: child),
                  _TabletNavRail(selected: _tabletSelectedIndex(location)),
                ],
              )
            : child,
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
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(left: BorderSide(color: AppColors.border)),
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
                      color: active ? AppColors.accentSoft : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(14),
                        onTap: () => context.go(item.path),
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
          body: Column(
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
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (!useHeader && showNavBar && !hideBackOnTablet)
              EdPageNavBar(showBack: canPop, onBack: canPop ? back : null, actions: actions),
            if (toolbar != null) toolbar!,
            Expanded(child: child),
          ],
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
            width: 52,
            height: 52,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppColors.radiusLg),
              boxShadow: AppColors.softShadow,
            ),
            child: const CircularProgressIndicator(strokeWidth: 3, color: AppColors.accentTeal),
          ),
          const SizedBox(height: EdSpacing.lg),
          Text(message, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700, fontSize: 14)),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppColors.dangerSoft, shape: BoxShape.circle),
              child: const Icon(Icons.error_outline, size: 36, color: AppColors.danger),
            ),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              EdPrimaryButton(label: 'إعادة المحاولة', onPressed: onRetry, fullWidth: false),
            ],
          ],
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
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color ?? AppColors.text),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.surfaceAlt,
                borderRadius: BorderRadius.circular(AppColors.radiusXl),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: Icon(icon, size: 32, color: AppColors.mutedLight),
            ),
            const SizedBox(height: EdSpacing.lg),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: AppColors.navy)),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.muted)),
            ],
          ],
        ),
      ),
    );
  }
}

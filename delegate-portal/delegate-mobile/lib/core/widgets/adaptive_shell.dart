import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_provider.dart';
import '../layout/breakpoints.dart';
import '../navigation/ed_page_transition.dart';
import '../offline/offline_banner.dart';
import '../theme/app_colors.dart';
import '../../features/team/team_hub.dart';
import 'ed_components.dart';
import 'ed_page_background.dart';
import 'ed_page_scroll.dart';
import 'phone_ui.dart';

class _NavItem {
  const _NavItem({required this.icon, required this.label, required this.path, this.isReceipt = false});

  final IconData icon;
  final String label;
  final String path;
  final bool isReceipt;
}

const _tabletNavItemsBase = [
  _NavItem(icon: Icons.home_rounded, label: 'الرئيسية', path: '/home'),
  _NavItem(icon: Icons.menu_book_rounded, label: 'الحسابات', path: '/accounts'),
  _NavItem(icon: Icons.inventory_2_outlined, label: 'المنتجات', path: '/shop'),
  _NavItem(icon: Icons.shopping_bag_outlined, label: 'الطلبات', path: '/orders'),
  _NavItem(icon: Icons.receipt_long_rounded, label: 'سند قبض', path: '/receipts', isReceipt: true),
  _NavItem(icon: Icons.person_add_alt_1_rounded, label: 'زبون جديد', path: '/customers'),
  _NavItem(icon: Icons.bar_chart_rounded, label: 'التقارير', path: '/reports'),
  _NavItem(icon: Icons.settings_outlined, label: 'الإعدادات', path: '/settings'),
];

List<_NavItem> _tabletNavItems(WidgetRef ref) {
  final agent = ref.watch(authProvider.select((s) => s.agent));
  final secondary = agent?.isSecondary ?? false;
  final hasTeam = ref.watch(hasTeamProvider);
  final items = <_NavItem>[];
  for (final item in _tabletNavItemsBase) {
    if (item.isReceipt) {
      items.add(_NavItem(icon: item.icon, label: secondary ? 'وصل قبض' : 'سند قبض', path: item.path, isReceipt: true));
      if (hasTeam) {
        items.add(const _NavItem(icon: Icons.groups_rounded, label: 'الفريق', path: '/team'));
      }
    } else {
      items.add(item);
    }
  }
  return items;
}

String _receiptNavLabel(WidgetRef ref) {
  final secondary = ref.read(authProvider.select((s) => s.agent?.isSecondary ?? false));
  return secondary ? 'وصل قبض' : 'سند قبض';
}

const _phoneNavItems = [
  _NavItem(icon: Icons.home_rounded, label: 'الرئيسية', path: '/home'),
  _NavItem(icon: Icons.menu_book_rounded, label: 'الحسابات', path: '/accounts'),
  _NavItem(icon: Icons.inventory_2_outlined, label: 'المنتجات', path: '/shop'),
  _NavItem(icon: Icons.shopping_bag_outlined, label: 'الطلبات', path: '/orders'),
];

const _moreRoutes = ['/receipts', '/team', '/customers', '/promotional-visits', '/reports', '/settings'];

int _tabletSelectedIndex(String location, List<_NavItem> items) {
  for (var i = items.length - 1; i >= 0; i--) {
    final p = items[i].path;
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

void showMoreNavSheet(BuildContext context, WidgetRef ref) {
  final receiptLabel = _receiptNavLabel(ref);
  final agent = ref.read(authProvider.select((s) => s.agent));
  final showTeam = ref.watch(hasTeamProvider);
  HapticFeedback.selectionClick();
  showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        boxShadow: AppColors.elevatedShadow,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(99)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 18, 24, 8),
              child: Row(
                children: [
                  const Expanded(
                    child: Text('المزيد', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.navy)),
                  ),
                  if ((agent?.delegateRoleLabel ?? '').isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: (agent!.isSecondary ? AppColors.warning : AppColors.accentTeal).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        agent.delegateRoleLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: agent.isSecondary ? AppColors.warning : AppColors.accentTeal,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.42,
                children: [
                  _MoreNavCard(icon: Icons.receipt_long_rounded, label: receiptLabel, color: AppColors.moduleReceipts, onTap: () {
                    Navigator.pop(ctx);
                    context.go('/receipts');
                  }),
                  if (showTeam)
                    _MoreNavCard(icon: Icons.groups_rounded, label: 'متابعة الفريق', color: AppColors.accentBlue, onTap: () {
                      Navigator.pop(ctx);
                      context.go('/team');
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
            const SizedBox(height: 16),
          ],
        ),
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
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            border: Border.all(color: AppColors.borderLight),
            color: AppColors.surface,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderLight),
                ),
                child: Icon(icon, color: color, size: 24),
              ),
              const SizedBox(height: 10),
              Text(label, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

/// غلاف التطبيق — شريط جانبي على التابلت، شريط سفلي على الهاتف
class AdaptiveShell extends ConsumerWidget {
  const AdaptiveShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layout = EdLayout.of(context);
    final location = GoRouterState.of(context).matchedLocation;
    final tabletItems = _tabletNavItems(ref);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: EdPageBackground(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const OfflineBanner(),
              Expanded(
                child: layout.isWide
                    ? Row(
                        children: [
                          Expanded(
                            child: AnimatedSwitcher(
                              duration: const Duration(milliseconds: 260),
                              switchInCurve: Curves.easeOutCubic,
                              switchOutCurve: Curves.easeIn,
                              layoutBuilder: (current, previous) => Stack(
                                fit: StackFit.expand,
                                children: [
                                  ...previous,
                                  if (current != null) current,
                                ],
                              ),
                              transitionBuilder: edTabTransition,
                              child: KeyedSubtree(
                                key: ValueKey<String>(location),
                                child: child,
                              ),
                            ),
                          ),
                          _TabletNavRail(selected: _tabletSelectedIndex(location, tabletItems), items: tabletItems),
                        ],
                      )
                    : AnimatedSwitcher(
                        duration: const Duration(milliseconds: 260),
                        switchInCurve: Curves.easeOutCubic,
                        switchOutCurve: Curves.easeIn,
                        layoutBuilder: (current, previous) => Stack(
                          fit: StackFit.expand,
                          children: [
                            ...previous,
                            if (current != null) current,
                          ],
                        ),
                        transitionBuilder: edTabTransition,
                        child: KeyedSubtree(
                          key: ValueKey<String>(location),
                          child: SizedBox.expand(child: child),
                        ),
                      ),
              ),
            ],
          ),
        ),
        bottomNavigationBar: layout.isWide
            ? null
            : EdPhoneDock(
                selected: _phoneSelectedIndex(location),
                onSelect: (i) {
                  if (i == _phoneNavItems.length) {
                    showMoreNavSheet(context, ref);
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
  const _TabletNavRail({required this.selected, required this.items});

  final int selected;
  final List<_NavItem> items;

  @override
  Widget build(BuildContext context) {
    final layout = EdLayout.of(context);
    final railWidth = layout.isDesktop ? 108.0 : 96.0;
    return Container(
      width: railWidth,
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.98),
        border: Border(left: BorderSide(color: AppColors.borderLight)),
        boxShadow: [
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.06), blurRadius: 20, offset: const Offset(-4, 0)),
        ],
      ),
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 14),
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: AppColors.brandGradient,
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(color: AppColors.accentTeal.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4)),
                ],
              ),
              alignment: Alignment.center,
              child: const Text('E', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 4),
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final item = items[i];
                  final active = i == selected;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    child: Material(
                      color: Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: () {
                          HapticFeedback.selectionClick();
                          context.go(item.path);
                        },
                        child: Container(
                          decoration: BoxDecoration(
                            color: active ? AppColors.accentTeal.withValues(alpha: 0.1) : Colors.transparent,
                            borderRadius: BorderRadius.circular(14),
                            border: active ? Border.all(color: AppColors.accentTeal.withValues(alpha: 0.25)) : null,
                          ),
                          child: Stack(
                            children: [
                              if (active)
                                Positioned(
                                  right: 0,
                                  top: 10,
                                  bottom: 10,
                                  child: Container(
                                    width: 3,
                                    decoration: BoxDecoration(
                                      color: AppColors.accentTeal,
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                  ),
                                ),
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(item.icon, size: 23, color: active ? AppColors.accentTeal : AppColors.muted),
                                    const SizedBox(height: 5),
                                    Text(
                                      item.label,
                                      textAlign: TextAlign.center,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w800,
                                        height: 1.2,
                                        color: active ? AppColors.navy : AppColors.muted,
                                      ),
                                    ),
                                  ],
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
    this.unifiedScroll = true,
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
  /// على الهاتف: رأس يطفو مع المحتوى بدل تثبيته — يحرّر مساحة الشاشة.
  final bool unifiedScroll;

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.of(context);
    final layout = EdLayout.of(context);
    final canPop = showBack || router.canPop();
    final back = onBack ?? () => router.pop();
    final hideBackOnTablet = layout.isWide && !showBack;
    final phoneBack = shouldShowPhoneBack(context, showBack: showBack);

    if (layout.isPhone) {
      final loc = GoRouterState.of(context).matchedLocation;
      final tabRoot = isPhoneTabRoot(loc);
      final useFloatingHeader = unifiedScroll && showNavBar;

      Widget body;
      if (useFloatingHeader) {
        body = NestedScrollView(
          floatHeaderSlivers: true,
          physics: edPageScrollPhysics,
          headerSliverBuilder: (context, innerBoxIsScrolled) => [
            SliverAppBar(
              floating: true,
              snap: true,
              pinned: false,
              automaticallyImplyLeading: false,
              backgroundColor: AppColors.surface.withValues(alpha: 0.92),
              surfaceTintColor: Colors.transparent,
              shadowColor: AppColors.borderLight,
              scrolledUnderElevation: 0.6,
              elevation: 0,
              toolbarHeight: tabRoot && !showBack ? 52 : 56,
              title: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy),
              ),
              leading: phoneBack
                  ? IconButton(
                      icon: const Icon(Icons.arrow_forward_rounded, color: AppColors.navy),
                      onPressed: back,
                    )
                  : null,
              actions: actions,
              bottom: toolbar != null
                  ? PreferredSize(
                      preferredSize: const Size.fromHeight(52),
                      child: Material(
                        color: AppColors.surface.withValues(alpha: 0.92),
                        child: toolbar!,
                      ),
                    )
                  : null,
            ),
            if (subtitle != null && subtitle!.trim().isNotEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 8),
                  child: Text(
                    subtitle!,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                  ),
                ),
              ),
          ],
          body: child,
        );
      } else {
        body = Column(
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
                compact: true,
              ),
            if (toolbar != null) toolbar!,
            Expanded(child: child),
          ],
        );
      }

      return Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: Colors.transparent,
          floatingActionButton: floatingActionButton,
          body: EdPageBackground(child: body),
        ),
      );
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.transparent,
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
              if (!useHeader && showNavBar)
                EdTabletPageChrome(
                  title: title,
                  subtitle: subtitle,
                  kicker: kicker,
                  showBack: canPop && !hideBackOnTablet,
                  onBack: canPop ? back : null,
                  actions: actions,
                  large: layout.isDesktop,
                ),
              if (toolbar != null) toolbar!,
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

/// رأس موحّد للآيباد والتابلت — عنوان واضح مع إجراءات.
class EdTabletPageChrome extends StatelessWidget {
  const EdTabletPageChrome({
    super.key,
    required this.title,
    this.subtitle,
    this.kicker,
    this.showBack = false,
    this.onBack,
    this.actions,
    this.large = false,
  });

  final String title;
  final String? subtitle;
  final String? kicker;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Widget>? actions;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(large ? 28 : 20, 14, large ? 28 : 20, 12),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.85),
        border: Border(bottom: BorderSide(color: AppColors.borderLight)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (showBack && onBack != null) ...[
            EdHeaderIconButton(
              icon: Icons.arrow_forward_rounded,
              tooltip: 'رجوع',
              onPressed: onBack!,
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ((kicker ?? '').trim().isNotEmpty)
                  Text(
                    kicker!.trim(),
                    style: TextStyle(fontSize: large ? 12 : 11, fontWeight: FontWeight.w700, color: AppColors.accentTeal),
                  ),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: large ? 26 : 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.navy,
                    letterSpacing: -0.4,
                    height: 1.1,
                  ),
                ),
                if ((subtitle ?? '').trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    subtitle!.trim(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                  ),
                ],
              ],
            ),
          ),
          if (actions != null) ...actions!,
        ],
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
                  color: AppColors.dangerSoft,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.danger.withValues(alpha: 0.15)),
                ),
                child: const Icon(Icons.error_outline_rounded, size: 32, color: AppColors.danger),
              ),
              const SizedBox(height: 16),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.navy)),
              if (onRetry != null) ...[
                const SizedBox(height: 18),
                EdPrimaryButton(label: 'إعادة المحاولة', onPressed: onRetry, fullWidth: false, gradient: false, icon: Icons.refresh_rounded),
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
              color: c,
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
                  color: AppColors.surfaceAlt,
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

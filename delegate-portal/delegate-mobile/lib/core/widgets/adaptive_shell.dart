import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_provider.dart';
import '../layout/breakpoints.dart';
import '../offline/sync_center.dart';
import '../theme/app_colors.dart';
import '../../features/receipts/receipts_hub.dart';
import '../../features/team/team_hub.dart';
import 'ed_components.dart';
import 'ed_page_background.dart';
import 'ed_page_scroll.dart';
import 'phone_ui.dart';

/// عنصر تنقل في الشريط الجانبي / السفلي.
class _NavItem {
  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.path,
    this.section = 0,
    this.badge,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String path;
  /// 0: العمل اليومي · 1: الميدان · 2: أخرى
  final int section;
  final String? badge;
}

const _sectionTitles = ['العمل اليومي', 'الميدان والفريق', 'أخرى'];

String? _countBadge(int n) => n > 0 ? (n > 99 ? '99+' : '$n') : null;

List<_NavItem> _navItems(WidgetRef ref) {
  final agent = ref.watch(authProvider.select((s) => s.agent));
  final secondary = agent?.isSecondary ?? false;
  final hasTeam = ref.watch(hasTeamProvider);
  final deliveries = ref.watch(deliveriesListNotifierProvider).valueOrNull ?? const [];
  final receiptBadge = secondary
      ? deliveries.where((d) => d.status == 'issued' && !d.handoverReceived).length
      : deliveries.where((d) => d.canCreateReceipt).length;
  final teamBadge = hasTeam
      ? (ref.watch(teamOverviewProvider).valueOrNull?.totalPendingHandoverCount ?? 0)
      : 0;

  return [
    const _NavItem(icon: Icons.space_dashboard_outlined, activeIcon: Icons.space_dashboard_rounded, label: 'الرئيسية', path: '/home'),
    _NavItem(
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long_rounded,
      label: secondary ? 'وصل قبض' : 'سند قبض',
      path: '/receipts',
      badge: _countBadge(receiptBadge),
    ),
    const _NavItem(icon: Icons.menu_book_outlined, activeIcon: Icons.menu_book_rounded, label: 'الحسابات', path: '/accounts'),
    const _NavItem(icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2_rounded, label: 'المنتجات', path: '/shop'),
    const _NavItem(icon: Icons.shopping_bag_outlined, activeIcon: Icons.shopping_bag_rounded, label: 'الطلبات', path: '/orders'),
    if (hasTeam)
      _NavItem(
        icon: Icons.groups_outlined,
        activeIcon: Icons.groups_rounded,
        label: 'الفريق',
        path: '/team',
        section: 1,
        badge: _countBadge(teamBadge),
      ),
    const _NavItem(icon: Icons.person_add_alt_outlined, activeIcon: Icons.person_add_alt_1_rounded, label: 'زبون جديد', path: '/customers', section: 1),
    const _NavItem(icon: Icons.campaign_outlined, activeIcon: Icons.campaign_rounded, label: 'زيارات ترويجية', path: '/promotional-visits', section: 1),
    const _NavItem(icon: Icons.insights_outlined, activeIcon: Icons.insights_rounded, label: 'التقارير', path: '/reports', section: 2),
  ];
}

const _settingsItem = _NavItem(icon: Icons.settings_outlined, activeIcon: Icons.settings_rounded, label: 'الإعدادات', path: '/settings', section: 2);

bool _matches(String location, String path) => location == path || location.startsWith('$path/');

/// المسارات الظاهرة في الشريط السفلي للهاتف (الباقي تحت «المزيد»).
const _phoneDockPaths = ['/home', '/accounts', '/receipts', '/shop'];

int _phoneSelectedIndex(String location) {
  for (var i = 0; i < _phoneDockPaths.length; i++) {
    if (_matches(location, _phoneDockPaths[i])) return i;
  }
  return _phoneDockPaths.length;
}

void showMoreNavSheet(BuildContext context, WidgetRef ref) {
  HapticFeedback.selectionClick();
  final items = [..._navItems(ref).where((i) => !_phoneDockPaths.contains(i.path)), _settingsItem];
  showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    isScrollControlled: true,
    builder: (ctx) => Directionality(
      textDirection: TextDirection.rtl,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(color: AppColors.borderStrong, borderRadius: BorderRadius.circular(99)),
                ),
              ),
              const _SidebarAgentCard(compact: false),
              const SizedBox(height: 12),
              GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 3,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.15,
                children: [
                  for (final item in items)
                    _MoreNavCard(
                      item: item,
                      onTap: () {
                        Navigator.pop(ctx);
                        context.go(item.path);
                      },
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _MoreNavCard extends StatelessWidget {
  const _MoreNavCard({required this.item, required this.onTap});

  final _NavItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: AppColors.border),
          ),
          child: Stack(
            children: [
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(12)),
                      child: Icon(item.activeIcon, color: AppColors.primary, size: 22),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      item.label,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              if (item.badge != null) PositionedDirectional(top: 8, end: 8, child: _NavBadge(text: item.badge!)),
            ],
          ),
        ),
      ),
    );
  }
}

class _NavBadge extends StatelessWidget {
  const _NavBadge({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: AppColors.danger,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w800,
          color: Colors.white,
          height: 1.4,
        ),
      ),
    );
  }
}

/// غلاف التطبيق — شريط جانبي (يمين) على الآيباد، شريط سفلي على الهاتف.
class AdaptiveShell extends ConsumerWidget {
  const AdaptiveShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layout = EdLayout.of(context);
    final location = GoRouterState.of(context).matchedLocation;

    if (layout.isWide) {
      final expanded = layout.width >= EdLayout.sidebarExpandedMin;
      return Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: AppColors.bg,
          body: Row(
            children: [
              _Sidebar(location: location, expanded: expanded),
              Expanded(child: EdPageBackground(child: child)),
            ],
          ),
        ),
      );
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: EdPageBackground(child: child),
        bottomNavigationBar: EdPhoneDock(
          selected: _phoneSelectedIndex(location),
          moreBadge: _navItems(ref).where((i) => !_phoneDockPaths.contains(i.path) && i.badge != null).isNotEmpty,
          receiptLabel: _navItems(ref).firstWhere((i) => i.path == '/receipts').label,
          receiptBadge: _navItems(ref).firstWhere((i) => i.path == '/receipts').badge,
          onSelect: (i) {
            if (i == _phoneDockPaths.length) {
              showMoreNavSheet(context, ref);
            } else {
              context.go(_phoneDockPaths[i]);
            }
          },
        ),
      ),
    );
  }
}

class _Sidebar extends ConsumerWidget {
  const _Sidebar({required this.location, required this.expanded});

  final String location;
  final bool expanded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = _navItems(ref);
    final width = expanded ? 256.0 : 92.0;

    final children = <Widget>[];
    var lastSection = -1;
    for (final item in items) {
      if (item.section != lastSection) {
        lastSection = item.section;
        if (expanded) {
          children.add(Padding(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 6),
            child: Text(
              _sectionTitles[item.section],
              style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.mutedLight, letterSpacing: 0.2),
            ),
          ));
        } else if (children.isNotEmpty) {
          children.add(const Padding(
            padding: EdgeInsets.symmetric(horizontal: 22, vertical: 8),
            child: Divider(height: 1),
          ));
        }
      }
      children.add(_SidebarItem(item: item, active: _matches(location, item.path), expanded: expanded));
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      width: width,
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: BorderDirectional(end: BorderSide(color: AppColors.border)),
      ),
      child: SafeArea(
        right: false,
        left: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(expanded ? 18 : 0, 14, expanded ? 18 : 0, 6),
              child: expanded
                  ? Row(
                      children: [
                        const _BrandMark(size: 38),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Edari', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.text, height: 1.1)),
                              Text('بوابة المندوب', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                            ],
                          ),
                        ),
                      ],
                    )
                  : const Center(child: _BrandMark(size: 42)),
            ),
            if (expanded)
              const Padding(
                padding: EdgeInsets.fromLTRB(12, 10, 12, 0),
                child: _SidebarAgentCard(compact: false),
              ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(expanded ? 10 : 8, 4, expanded ? 10 : 8, 8),
                children: children,
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: EdgeInsets.fromLTRB(expanded ? 10 : 8, 8, expanded ? 10 : 8, 4),
              child: _SidebarItem(item: _settingsItem, active: _matches(location, '/settings'), expanded: expanded),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(expanded ? 12 : 8, 4, expanded ? 12 : 8, 12),
              child: _SidebarSyncCard(expanded: expanded),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: AppColors.border),
        boxShadow: AppColors.softShadow,
      ),
      child: Image.asset('assets/logo.png', fit: BoxFit.contain),
    );
  }
}

class _SidebarAgentCard extends ConsumerWidget {
  const _SidebarAgentCard({required this.compact});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agent = ref.watch(authProvider.select((s) => s.agent));
    final name = agent?.name ?? 'مندوب';
    final role = agent?.delegateRoleLabel ?? '';
    final initial = name.trim().isNotEmpty ? name.trim().characters.first : 'م';
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: AppColors.primarySoft,
            child: Text(initial, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.text)),
                if (role.isNotEmpty)
                  Text(role, maxLines: 1, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({required this.item, required this.active, required this.expanded});

  final _NavItem item;
  final bool active;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final fg = active ? AppColors.primary : AppColors.textSecondary;
    final content = expanded
        ? Row(
            children: [
              Icon(active ? item.activeIcon : item.icon, size: 21, color: fg),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: active ? FontWeight.w800 : FontWeight.w600, color: active ? AppColors.text : AppColors.textSecondary),
                ),
              ),
              if (item.badge != null) _NavBadge(text: item.badge!),
            ],
          )
        : Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(active ? item.activeIcon : item.icon, size: 23, color: fg),
                  if (item.badge != null)
                    PositionedDirectional(top: -6, end: -14, child: _NavBadge(text: item.badge!)),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                item.label,
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 10.5, height: 1.2, fontWeight: active ? FontWeight.w800 : FontWeight.w600, color: active ? AppColors.text : AppColors.muted),
              ),
            ],
          );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Tooltip(
        message: expanded ? '' : item.label,
        child: Material(
          color: active ? AppColors.primarySoft : Colors.transparent,
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            onTap: () {
              HapticFeedback.selectionClick();
              context.go(item.path);
            },
            child: Padding(
              padding: expanded ? const EdgeInsets.symmetric(horizontal: 12, vertical: 10) : const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
              child: content,
            ),
          ),
        ),
      ),
    );
  }
}

class _SidebarSyncCard extends ConsumerWidget {
  const _SidebarSyncCard({required this.expanded});

  final bool expanded;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!expanded) {
      return const Center(child: SyncStatusChip(iconOnly: true));
    }
    return const Align(alignment: AlignmentDirectional.centerStart, child: SyncStatusChip());
  }
}

/// صفحة داخل الغلاف — رأس موحّد (يحترم شريط الحالة) + محتوى.
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
    final back = onBack ?? () => router.pop();

    if (layout.isPhone) {
      final phoneBack = shouldShowPhoneBack(context, showBack: showBack);
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
              backgroundColor: AppColors.surface,
              surfaceTintColor: Colors.transparent,
              shadowColor: AppColors.border,
              scrolledUnderElevation: 0.5,
              elevation: 0,
              toolbarHeight: 56,
              titleSpacing: phoneBack ? 0 : 16,
              title: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text),
                  ),
                  if ((subtitle ?? '').trim().isNotEmpty)
                    Text(
                      subtitle!.trim(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                    ),
                ],
              ),
              leading: phoneBack
                  ? IconButton(
                      icon: const Icon(Icons.arrow_forward_rounded, color: AppColors.text),
                      onPressed: back,
                    )
                  : null,
              actions: [
                ...?actions,
                const SizedBox(width: 8),
              ],
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Container(height: 1, color: AppColors.borderLight),
              ),
            ),
            const SliverToBoxAdapter(child: OfflineStrip()),
            if (toolbar != null)
              SliverToBoxAdapter(
                child: Material(color: AppColors.surface, child: toolbar!),
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
            const OfflineStrip(),
            ?toolbar,
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

    final canPop = showBack || router.canPop();
    // على الآيباد: الشريط الجانبي يغني عن زر الرجوع في الصفحات الرئيسية.
    final isRoot = isPhoneTabRoot(GoRouterState.of(context).matchedLocation);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        floatingActionButton: floatingActionButton,
        body: EdPageBackground(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (showNavBar)
                EdTabletPageChrome(
                  title: title,
                  subtitle: subtitle,
                  kicker: kicker,
                  showBack: canPop && showBack && !isRoot,
                  onBack: canPop ? back : null,
                  actions: actions,
                  large: layout.isDesktop,
                )
              else
                SizedBox(height: MediaQuery.paddingOf(context).top),
              const OfflineStrip(),
              ?toolbar,
              Expanded(child: child),
            ],
          ),
        ),
      ),
    );
  }
}

/// رأس موحّد للآيباد — يحترم شريط الحالة، عنوان واضح مع إجراءات.
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
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      padding: EdgeInsets.fromLTRB(large ? 28 : 24, top + 12, large ? 28 : 24, 14),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
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
            const SizedBox(width: 14),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if ((kicker ?? '').trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      kicker!.trim(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primary),
                    ),
                  ),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: large ? 24 : 22,
                    fontWeight: FontWeight.w800,
                    color: AppColors.text,
                    height: 1.2,
                  ),
                ),
                if ((subtitle ?? '').trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      subtitle!.trim(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
                    ),
                  ),
              ],
            ),
          ),
          if (actions != null)
            for (var i = 0; i < actions!.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              actions![i],
            ],
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
          const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.6)),
          const SizedBox(height: 14),
          Text(message, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
        ],
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  bool get _isOffline =>
      message.contains('اتصال') || message.contains('الشبكة') || message.contains('نسخة محلية');

  @override
  Widget build(BuildContext context) {
    final color = _isOffline ? AppColors.warning : AppColors.danger;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.1), shape: BoxShape.circle),
                child: Icon(_isOffline ? Icons.cloud_off_rounded : Icons.error_outline_rounded, size: 28, color: color),
              ),
              const SizedBox(height: 14),
              Text(
                _isOffline ? 'لا يوجد اتصال' : 'تعذّر التحميل',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text),
              ),
              const SizedBox(height: 6),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.muted, height: 1.5),
              ),
              if (onRetry != null) ...[
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded, size: 19),
                  label: const Text('إعادة المحاولة'),
                ),
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
    final c = color ?? AppColors.text;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppColors.card(radius: AppColors.radius),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: c, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon = Icons.inbox_outlined, this.subtitle, this.action});

  final String message;
  final String? subtitle;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(EdSpacing.xxl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.border),
                ),
                child: Icon(icon, size: 28, color: AppColors.mutedLight),
              ),
              const SizedBox(height: 14),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text)),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.muted, height: 1.5)),
              ],
              if (action != null) ...[
                const SizedBox(height: 16),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

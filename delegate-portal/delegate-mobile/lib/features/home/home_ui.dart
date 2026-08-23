import 'package:flutter/material.dart';
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

  @override
  State<EdHomePage> createState() => _EdHomePageState();
}

class _EdHomePageState extends State<EdHomePage> {
  final _searchCtrl = TextEditingController();
  String _query = '';

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
    final tileExtent = edFormalTileExtent(layout, phone: 172, tablet: 208, desktop: 195);
    final filtered = _filteredApps();

    return ColoredBox(
      color: Colors.white,
      child: Stack(
        children: [
          const EdModernBackdrop(variant: EdBackdropVariant.home),
        CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(pagePad, top + 10, pagePad, 0),
                child: _AtelierHeader(
                  agentName: widget.agentName,
                  avatarText: widget.avatarText,
                  treeCount: widget.treeCount,
                  customerCount: widget.customerCount,
                  orderCount: widget.orderCount,
                  pendingTotal: pendingTotal,
                  onRefresh: widget.onRefresh,
                  onSettings: widget.onSettings,
                  onLogout: widget.onLogout,
                  large: layout.isTablet,
                  wide: layout.isWide,
                ),
              ),
            ),
            if (pendingTotal > 0)
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(pagePad, 16, pagePad, 0),
                  child: _AtelierPendingNote(
                    message: _pendingMessage(widget.pendingReceipts, widget.pendingCustomers, widget.pendingPromoVisits),
                    large: layout.isTablet,
                  ),
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(pagePad, 22, pagePad, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    EdSectionHeader(
                      title: 'لوحة الخدمات',
                      subtitle: _query.isNotEmpty
                          ? 'عرض ${filtered.length} من ${widget.apps.length}'
                          : '${widget.apps.length} أقسام متساوية الحجم',
                      icon: Icons.grid_view_rounded,
                      large: layout.isTablet,
                    ),
                    const SizedBox(height: 12),
                    EdModernSearchField(
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
                  padding: EdgeInsets.fromLTRB(pagePad, 24, pagePad, 0),
                  child: _AtelierEmptySearch(query: _query),
                ),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(pagePad, 4, pagePad, layout.isPhone ? kPhoneBottomInset : 36),
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
                      child: _AtelierTile(
                        app: filtered[index],
                        index: widget.apps.indexOf(filtered[index]),
                        large: layout.isTablet,
                      ),
                    ),
                    childCount: filtered.length,
                  ),
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

class _AtelierHeader extends StatelessWidget {
  const _AtelierHeader({
    required this.agentName,
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    required this.pendingTotal,
    this.avatarText,
    this.onRefresh,
    this.onSettings,
    this.onLogout,
    this.large = false,
    this.wide = false,
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
  final bool large;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    final name = agentName.trim().isEmpty ? 'مندوب' : agentName.trim();
    final initial = _HomeIdentity.initial(avatarText ?? name);
    final greeting = _HomeIdentity.greeting();
    final dateLabel = DateFormat('EEEE، d MMMM yyyy', 'ar').format(DateTime.now());
    final radius = large ? 26.0 : 22.0;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          EdCardDecorStrip(
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.asset('assets/logo.png', width: 26, height: 26),
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Edari Delegate',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white70),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.accentTealLight, shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      Text('جاهز', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Colors.white.withValues(alpha: 0.9))),
                    ],
                  ),
                ),
                if (onRefresh != null) ...[
                  const SizedBox(width: 8),
                  _HeaderIconBtn(icon: Icons.refresh_rounded, onTap: onRefresh!, light: true),
                ],
                if (onSettings != null) ...[
                  const SizedBox(width: 6),
                  _HeaderIconBtn(icon: Icons.settings_outlined, onTap: onSettings!, light: true),
                ],
                if (onLogout != null) ...[
                  const SizedBox(width: 6),
                  _HeaderIconBtn(icon: Icons.logout_rounded, onTap: onLogout!, light: true, muted: true),
                ],
              ],
            ),
          ),
          Container(
            color: AppColors.surface,
            child: Padding(
              padding: EdgeInsets.all(large ? 22 : 18),
              child: wide
                  ? Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        EdGradientAvatar(label: initial, size: large ? 64 : 56),
                        const SizedBox(width: 18),
                        Expanded(
                          flex: 5,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(greeting, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.muted)),
                              const SizedBox(height: 6),
                              Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: large ? 32 : 26, fontWeight: FontWeight.w800, color: AppColors.navy, letterSpacing: -0.8, height: 1.05),
                              ),
                              const SizedBox(height: 8),
                              Text(dateLabel, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.mutedLight)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 20),
                        Expanded(
                          flex: 6,
                          child: _StatsPanel(
                            treeCount: treeCount,
                            customerCount: customerCount,
                            orderCount: orderCount,
                            pendingTotal: pendingTotal,
                            large: true,
                          ),
                        ),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            EdGradientAvatar(label: initial, size: large ? 54 : 48),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(greeting, style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                                  const SizedBox(height: 4),
                                  Text(
                                    name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(fontSize: large ? 26 : 22, fontWeight: FontWeight.w800, color: AppColors.navy, letterSpacing: -0.6, height: 1.05),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(dateLabel, style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.mutedLight)),
                                ],
                              ),
                            ),
                          ],
                        ),
                        SizedBox(height: large ? 18 : 14),
                        _StatsPanel(
                          treeCount: treeCount,
                          customerCount: customerCount,
                          orderCount: orderCount,
                          pendingTotal: pendingTotal,
                          large: large,
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderIconBtn extends StatelessWidget {
  const _HeaderIconBtn({required this.icon, required this.onTap, this.light = false, this.muted = false});

  final IconData icon;
  final VoidCallback onTap;
  final bool light;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: light ? Colors.white.withValues(alpha: muted ? 0.08 : 0.14) : AppColors.surfaceAlt,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: BorderSide(color: light ? Colors.white.withValues(alpha: 0.12) : AppColors.borderLight),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(
            icon,
            size: 17,
            color: light ? Colors.white.withValues(alpha: muted ? 0.55 : 0.95) : AppColors.navy,
          ),
        ),
      ),
    );
  }
}

class _StatsPanel extends StatelessWidget {
  const _StatsPanel({
    required this.treeCount,
    required this.customerCount,
    required this.orderCount,
    required this.pendingTotal,
    this.large = false,
  });

  final String treeCount;
  final String customerCount;
  final String orderCount;
  final int pendingTotal;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(large ? 14 : 12),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: [
          BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4)),
        ],
      ),
      child: Row(
        children: [
          Expanded(child: _StatCell(icon: Icons.account_tree_outlined, value: treeCount, label: 'شجرة', large: large)),
          _statDivider(),
          Expanded(child: _StatCell(icon: Icons.people_outline_rounded, value: customerCount, label: 'زبون', large: large)),
          _statDivider(),
          Expanded(child: _StatCell(icon: Icons.shopping_bag_outlined, value: orderCount, label: 'طلب', large: large)),
          if (pendingTotal > 0) ...[
            _statDivider(),
            Expanded(child: _StatCell(icon: Icons.pending_actions_outlined, value: '$pendingTotal', label: 'بانتظار', large: large, highlight: true)),
          ],
        ],
      ),
    );
  }

  Widget _statDivider() => Container(width: 1, height: 36, margin: const EdgeInsets.symmetric(horizontal: 6), color: AppColors.borderLight);
}

class _StatCell extends StatelessWidget {
  const _StatCell({
    required this.icon,
    required this.value,
    required this.label,
    this.large = false,
    this.highlight = false,
  });

  final IconData icon;
  final String value;
  final String label;
  final bool large;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final accent = highlight ? AppColors.warning : AppColors.accentTeal;
    return Column(
      children: [
        Container(
          width: large ? 28 : 26,
          height: large ? 28 : 26,
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Icon(icon, size: large ? 14 : 12, color: accent),
        ),
        SizedBox(height: large ? 8 : 6),
        Text(
          value,
          style: TextStyle(fontSize: large ? 24 : 20, fontWeight: FontWeight.w800, color: highlight ? AppColors.warning : AppColors.navy, height: 1),
        ),
        const SizedBox(height: 2),
        Text(label, style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
      ],
    );
  }
}

class _AtelierEmptySearch extends StatelessWidget {
  const _AtelierEmptySearch({required this.query});

  final String query;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        children: [
          Icon(Icons.search_off_rounded, size: 36, color: AppColors.mutedLight),
          const SizedBox(height: 10),
          Text('لا نتائج لـ «$query»', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
          const SizedBox(height: 4),
          const Text('جرّب كلمات أخرى', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.muted, fontSize: 12)),
        ],
      ),
    );
  }
}

class _AtelierPendingNote extends StatelessWidget {
  const _AtelierPendingNote({required this.message, this.large = false});

  final String message;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: large ? 16 : 14, vertical: large ? 14 : 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.goldLine),
        boxShadow: AppColors.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.goldSoft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.notifications_active_outlined, size: 18, color: AppColors.warning),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('بانتظار المراجعة', style: TextStyle(fontSize: large ? 13 : 12, fontWeight: FontWeight.w800, color: AppColors.navy)),
                const SizedBox(height: 2),
                Text(message, style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.textSecondary, height: 1.35)),
              ],
            ),
          ),
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
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
    _fade = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
    _slide = Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    Future.delayed(Duration(milliseconds: 35 * widget.index), () {
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

class _AtelierTile extends StatefulWidget {
  const _AtelierTile({required this.app, required this.index, this.large = false});

  final EdHomeApp app;
  final int index;
  final bool large;

  @override
  State<_AtelierTile> createState() => _AtelierTileState();
}

class _AtelierTileState extends State<_AtelierTile> {
  bool _pressed = false;
  bool _hovered = false;

  bool get _showBadge {
    final b = widget.app.badge;
    return b != null && b != '—' && b != '0';
  }

  String get _indexLabel => (widget.index + 1).toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final large = widget.large;
    final radius = large ? 22.0 : 20.0;
    final scale = _pressed ? 0.96 : (_hovered ? 1.02 : 1.0);

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) => setState(() => _pressed = false),
        onTapCancel: () => setState(() => _pressed = false),
        onTap: widget.app.onTap,
        child: AnimatedScale(
          scale: scale,
          duration: const Duration(milliseconds: 140),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: AppColors.borderLight),
              boxShadow: _pressed ? null : AppColors.softShadow,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: Material(
                color: AppColors.surface,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Row(
                      children: [
                        Container(width: 3, color: widget.app.iconColor.withValues(alpha: 0.75)),
                        Expanded(
                          child: Padding(
                            padding: EdgeInsets.fromLTRB(large ? 14 : 12, large ? 14 : 12, large ? 14 : 12, large ? 12 : 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Center(
                                  child: EdGradientIconBox(
                                    icon: widget.app.icon,
                                    color: widget.app.iconColor,
                                    bgColor: widget.app.iconBg,
                                    size: large ? 50 : 44,
                                    iconSize: large ? 22 : 20,
                                  ),
                                ),
                                SizedBox(height: large ? 10 : 8),
                                Text(
                                  widget.app.name,
                                  textAlign: TextAlign.center,
                                  maxLines: large ? 3 : 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.25),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  widget.app.hint,
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: large ? 11 : 10, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.3),
                                ),
                                const Spacer(),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      _indexLabel,
                                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.mutedLight),
                                    ),
                                    const SizedBox(width: 6),
                                    Icon(Icons.arrow_forward_ios_rounded, size: 10, color: AppColors.mutedLight),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    if (_showBadge)
                      Positioned(
                        top: 8,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.navy,
                            borderRadius: BorderRadius.circular(999),
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

/// ألوان خلفية أيقونات التطبيقات (للتوافق مع home_screen)
abstract final class EdHomeThemes {
  static const accountsBg = Color(0xFFE6F7F5);
  static const shopBg = Color(0xFFEFF6FF);
  static const ordersBg = Color(0xFFFFF7ED);
  static const reportsBg = Color(0xFFF5F3FF);
  static const receiptsBg = Color(0xFFECFDF5);
  static const customersBg = Color(0xFFFFF1F2);
  static const promoBg = Color(0xFFFDF2F8);
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';
import '../models/models.dart';
import 'app_widgets.dart';

class PremiumBottomNav extends StatelessWidget {
  const PremiumBottomNav({
    super.key,
    required this.index,
    required this.pendingCount,
    required this.onChanged,
  });

  final int index;
  final int pendingCount;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);

    return Container(
      decoration: BoxDecoration(
        color: surface,
        border: Border(top: BorderSide(color: border)),
        boxShadow: [
          BoxShadow(color: AppColors.shadow, blurRadius: 24, offset: const Offset(0, -6)),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(
            children: [
              _NavItem(
                selected: index == 0,
                icon: Icons.inbox_rounded,
                label: 'الطلبات',
                badge: pendingCount > 0 ? '$pendingCount' : null,
                onTap: () => _tap(context, 0),
              ),
              _NavItem(
                selected: index == 1,
                icon: Icons.insights_rounded,
                label: 'الإحصائيات',
                onTap: () => _tap(context, 1),
              ),
              _NavItem(
                selected: index == 2,
                icon: Icons.person_rounded,
                label: 'حسابي',
                onTap: () => _tap(context, 2),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _tap(BuildContext context, int i) {
    HapticFeedback.lightImpact();
    onChanged(i);
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
    this.badge,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: selected ? AppColors.primary.withValues(alpha: 0.1) : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Icon(icon, color: selected ? AppColors.primary : themed(context, light: AppColors.muted, dark: AppColors.mutedDark), size: 24),
                    if (badge != null)
                      Positioned(
                        right: -10,
                        top: -6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.rejected, borderRadius: BorderRadius.circular(999)),
                          child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: selected ? FontWeight.w900 : FontWeight.w600,
                    color: selected ? AppColors.primary : themed(context, light: AppColors.muted, dark: AppColors.mutedDark),
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

class EventTimeline extends StatelessWidget {
  const EventTimeline({super.key, required this.events});

  final List<OrderEvent> events;

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) {
      return const EmptyState(
        icon: Icons.history_rounded,
        title: 'لا يوجد سجل بعد',
        subtitle: 'ستظهر هنا تحركات حالة الطلب',
      );
    }

    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
  final items = events.reversed.toList();

    return Column(
      children: List.generate(items.length, (i) {
        final e = items[i];
        final to = e.toStatus;
        final label = statusLabelAr(to.isEmpty ? 'pending' : (to == 'submitted' ? 'pending' : to));
        final isLast = i == items.length - 1;
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              children: [
                Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                ),
                if (!isLast)
                  Container(width: 2, height: 48, color: AppColors.border),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label, style: const TextStyle(fontWeight: FontWeight.w900)),
                        if (e.note.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(e.note, style: TextStyle(color: muted, fontWeight: FontWeight.w600)),
                        ],
                        const SizedBox(height: 6),
                        Text(formatTimeAgo(e.createdAt), style: TextStyle(fontSize: 11, color: muted)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      }),
    );
  }
}

class PrepConfirmBar extends StatelessWidget {
  const PrepConfirmBar({
    super.key,
    required this.confirmed,
    required this.busy,
    required this.onToggle,
  });

  final bool confirmed;
  final bool busy;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: themed(context, light: confirmed ? AppColors.confirmedSoft : AppColors.processingSoft, dark: AppColors.surfaceAltDark),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: themed(context, light: AppColors.border, dark: AppColors.borderDark)),
      ),
      child: Material(
          color: confirmed ? AppColors.confirmed : AppColors.processing,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            onTap: busy ? null : onToggle,
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      busy ? Icons.hourglass_top_rounded : (confirmed ? Icons.verified_rounded : Icons.check_circle_rounded),
                      color: Colors.white,
                      size: 26,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          confirmed ? 'تم تأكيد اكتمال التجهيز' : 'تأكيد اكتمال التجهيز',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          confirmed ? 'اضغط لإلغاء التأكيد' : 'اضغط بعد الانتهاء من تجهيز كل البنود',
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontWeight: FontWeight.w600, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  Icon(confirmed ? Icons.undo_rounded : Icons.chevron_left_rounded, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
    );
  }
}

class QuickStatusBar extends StatelessWidget {
  const QuickStatusBar({super.key, required this.current, required this.busy, required this.onSelect});

  final String current;
  final bool busy;
  final ValueChanged<String> onSelect;

  static const _options = [
    _StatusOption('pending', 'قيد الانتظار', 'إرجاع للانتظار', Icons.schedule_rounded, AppColors.pending),
    _StatusOption('processing', 'تم التجهيز', 'تحديد كمجهّز', Icons.inventory_2_rounded, AppColors.processing),
    _StatusOption('rejected', 'مرفوض', 'رفض الطلب', Icons.block_rounded, AppColors.rejected),
  ];

  @override
  Widget build(BuildContext context) {
    final currentOpt = _options.firstWhere((o) => o.status == current, orElse: () => _options.first);
    final others = _options.where((o) => o.status != current).toList();
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);
    final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
            Text('حالة الطلب', style: TextStyle(fontWeight: FontWeight.w900, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontSize: 12)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: currentOpt.color.withValues(alpha: isDark(context) ? 0.15 : 0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: currentOpt.color.withValues(alpha: 0.35)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(color: currentOpt.color, borderRadius: BorderRadius.circular(12)),
                    child: Icon(currentOpt.icon, color: Colors.white, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('الحالة الحالية', style: TextStyle(color: currentOpt.color, fontWeight: FontWeight.w700, fontSize: 11)),
                        Text(currentOpt.label, style: TextStyle(color: currentOpt.color, fontWeight: FontWeight.w900, fontSize: 17)),
                      ],
                    ),
                  ),
                  Icon(Icons.check_circle_rounded, color: currentOpt.color, size: 24),
                ],
              ),
            ),
            if (others.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('تغيير إلى', style: TextStyle(fontWeight: FontWeight.w900, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontSize: 12)),
              const SizedBox(height: 8),
              ...others.map((opt) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _StatusActionTile(option: opt, busy: busy, onTap: () => onSelect(opt.status)),
                  )),
            ],
        ],
        ),
      ),
    );
  }
}

class _StatusOption {
  const _StatusOption(this.status, this.label, this.hint, this.icon, this.color);
  final String status;
  final String label;
  final String hint;
  final IconData icon;
  final Color color;
}

class _StatusActionTile extends StatelessWidget {
  const _StatusActionTile({required this.option, required this.busy, required this.onTap});

  final _StatusOption option;
  final bool busy;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: busy
            ? null
            : () {
                HapticFeedback.mediumImpact();
                onTap();
              },
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: themed(context, light: AppColors.border, dark: AppColors.borderDark)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: option.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(option.icon, color: option.color, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(option.label, style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: option.color)),
                    Text(option.hint, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 11, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark))),
                  ],
                ),
              ),
              Icon(Icons.arrow_back_ios_new_rounded, size: 16, color: option.color),
            ],
          ),
        ),
      ),
    );
  }
}

class StatsBarChart extends StatelessWidget {
  const StatsBarChart({super.key, required this.pending, required this.processing, required this.rejected});

  final int pending;
  final int processing;
  final int rejected;

  @override
  Widget build(BuildContext context) {
    final max = [pending, processing, rejected, 1].reduce((a, b) => a > b ? a : b).toDouble();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _Bar(label: 'انتظار', value: pending, max: max, color: AppColors.pending),
            const SizedBox(width: 16),
            _Bar(label: 'مجهّز', value: processing, max: max, color: AppColors.processing),
            const SizedBox(width: 16),
            _Bar(label: 'مرفوض', value: rejected, max: max, color: AppColors.rejected),
          ],
        ),
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  const _Bar({required this.label, required this.value, required this.max, required this.color});

  final String label;
  final int value;
  final double max;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final h = (value / max * 120).clamp(12.0, 120.0);
    return Expanded(
      child: Column(
        children: [
          Text('$value', style: TextStyle(fontWeight: FontWeight.w900, color: color, fontSize: 18)),
          const SizedBox(height: 8),
          AnimatedContainer(
            duration: const Duration(milliseconds: 500),
            curve: Curves.easeOutCubic,
            height: h,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          const SizedBox(height: 8),
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark))),
        ],
      ),
    );
  }
}

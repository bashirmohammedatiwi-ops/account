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
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      color: themed(context, light: confirmed ? AppColors.confirmedSoft : AppColors.processingSoft, dark: AppColors.surfaceDark),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(
                  confirmed ? Icons.verified_rounded : Icons.fact_check_outlined,
                  color: confirmed ? AppColors.confirmed : AppColors.processing,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    confirmed ? 'تم تأكيد اكتمال التجهيز' : 'بعد الانتهاء، أكّد التجهيز بوضع علامة ✓',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: confirmed ? AppColors.confirmed : AppColors.processing,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: busy ? null : onToggle,
              icon: Icon(confirmed ? Icons.undo_rounded : Icons.check_circle_rounded),
              label: Text(confirmed ? 'إلغاء التأكيد' : 'تأكيد اكتمال التجهيز ✓'),
              style: FilledButton.styleFrom(
                backgroundColor: confirmed ? AppColors.confirmed : AppColors.processing,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ],
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

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      decoration: BoxDecoration(
        color: themed(context, light: AppColors.surface, dark: AppColors.surfaceDark),
        border: Border(top: BorderSide(color: themed(context, light: AppColors.border, dark: AppColors.borderDark))),
        boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 20, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('تحديث سريع للحالة', style: TextStyle(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            Row(
              children: [
                _QuickBtn(label: 'انتظار', status: 'pending', current: current, busy: busy, color: AppColors.pending, onSelect: onSelect),
                const SizedBox(width: 8),
                _QuickBtn(label: 'مجهّز ✓', status: 'processing', current: current, busy: busy, color: AppColors.processing, onSelect: onSelect),
                const SizedBox(width: 8),
                _QuickBtn(label: 'مرفوض', status: 'rejected', current: current, busy: busy, color: AppColors.rejected, onSelect: onSelect),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickBtn extends StatelessWidget {
  const _QuickBtn({
    required this.label,
    required this.status,
    required this.current,
    required this.busy,
    required this.color,
    required this.onSelect,
  });

  final String label;
  final String status;
  final String current;
  final bool busy;
  final Color color;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final active = current == status;
    return Expanded(
      child: FilledButton(
        onPressed: busy || active ? null : () {
          HapticFeedback.mediumImpact();
          onSelect(status);
        },
        style: FilledButton.styleFrom(
          backgroundColor: active ? color : color.withValues(alpha: 0.12),
          foregroundColor: active ? Colors.white : color,
          padding: const EdgeInsets.symmetric(vertical: 14),
        ),
        child: Text(active ? '$label ✓' : label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
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

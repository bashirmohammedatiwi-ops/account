import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/models.dart';
import 'receipts_hub.dart';
import 'thermal_print_service.dart';

String receiptAgentStatusLabel(Receipt receipt) {
  switch (receipt.status) {
    case 'posted':
      return 'تم تسليم المبلغ للشركة';
    case 'pending':
      return 'بانتظار مراجعة الإدارة';
    case 'reviewed':
      return 'جاهز للترحيل — قيد المعالجة';
    case 'rejected':
      return 'مرفوض من الإدارة';
    default:
      return receipt.statusLabel;
  }
}

IconData receiptAgentStatusIcon(String status) {
  switch (status) {
    case 'posted':
      return Icons.verified_rounded;
    case 'rejected':
      return Icons.cancel_outlined;
    case 'reviewed':
      return Icons.hourglass_top_rounded;
    default:
      return Icons.schedule_rounded;
  }
}

enum ReceiptsPeriod { all, today, week, month }

extension ReceiptsPeriodLabel on ReceiptsPeriod {
  String get label => switch (this) {
        ReceiptsPeriod.all => 'الكل',
        ReceiptsPeriod.today => 'اليوم',
        ReceiptsPeriod.week => 'آخر ٧ أيام',
        ReceiptsPeriod.month => 'هذا الشهر',
      };

  /// أقدم تاريخ مقبول ضمن الفترة، أو null لعرض كل السجل.
  DateTime? get since {
    final now = DateTime.now();
    return switch (this) {
      ReceiptsPeriod.all => null,
      ReceiptsPeriod.today => DateTime(now.year, now.month, now.day),
      ReceiptsPeriod.week => DateTime(now.year, now.month, now.day).subtract(const Duration(days: 6)),
      ReceiptsPeriod.month => DateTime(now.year, now.month),
    };
  }
}

/// نطاق زمني (من — إلى) لسجل سندات القبض.
class ReceiptsDateRange {
  const ReceiptsDateRange({this.from, this.to});

  final DateTime? from;
  final DateTime? to;

  bool get isAll => from == null && to == null;

  static ReceiptsDateRange all() => const ReceiptsDateRange();

  static ReceiptsDateRange forPeriod(ReceiptsPeriod period) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return switch (period) {
      ReceiptsPeriod.all => all(),
      ReceiptsPeriod.today => ReceiptsDateRange(from: today, to: today),
      ReceiptsPeriod.week => ReceiptsDateRange(from: today.subtract(const Duration(days: 6)), to: today),
      ReceiptsPeriod.month => ReceiptsDateRange(from: DateTime(now.year, now.month), to: today),
    };
  }

  ReceiptsPeriod? matchingQuickPeriod() {
    if (isAll) return ReceiptsPeriod.all;
    for (final p in ReceiptsPeriod.values) {
      if (p == ReceiptsPeriod.all) continue;
      final preset = forPeriod(p);
      if (_sameDay(preset.from, from) && _sameDay(preset.to, to)) return p;
    }
    return null;
  }

  String get label {
    if (isAll) return 'الكل';
    final quick = matchingQuickPeriod();
    if (quick != null) return quick.label;
    return '${_fmtDay(from)} — ${_fmtDay(to)}';
  }

  static String _fmtDay(DateTime? d) {
    if (d == null) return '—';
    return '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
  }

  static bool _sameDay(DateTime? a, DateTime? b) {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return a.year == b.year && a.month == b.month && a.day == b.day;
  }
}

DateTime? _parseReceiptDay(String? rawDate) {
  final raw = (rawDate ?? '').trim();
  if (raw.isEmpty) return null;
  final cleaned = raw.replaceAll(' 00:00:00', '');
  final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(cleaned);
  if (iso != null) {
    return DateTime(int.parse(iso.group(1)!), int.parse(iso.group(2)!), int.parse(iso.group(3)!));
  }
  final parsed = DateTime.tryParse(cleaned);
  if (parsed != null) return DateTime(parsed.year, parsed.month, parsed.day);
  return null;
}

bool receiptsMatchesPeriod(String? rawDate, ReceiptsPeriod period) {
  return receiptsMatchesDateRange(rawDate, ReceiptsDateRange.forPeriod(period));
}

bool receiptsMatchesDateRange(String? rawDate, ReceiptsDateRange range) {
  if (range.isAll) return true;
  final day = _parseReceiptDay(rawDate);
  if (day == null) return true;
  if (range.from != null && day.isBefore(range.from!)) return false;
  if (range.to != null && day.isAfter(range.to!)) return false;
  return true;
}

/// شريط البحث والفترة أعلى السجل — يجعل الحركات القديمة قابلة للوصول.
class ReceiptsHistoryFilter extends StatelessWidget {
  const ReceiptsHistoryFilter({
    super.key,
    required this.controller,
    required this.period,
    required this.onPeriodChanged,
    required this.onQueryChanged,
    this.hintText = 'ابحث برقم الوصل أو اسم الزبون',
  });

  final TextEditingController controller;
  final ReceiptsPeriod period;
  final ValueChanged<ReceiptsPeriod> onPeriodChanged;
  final ValueChanged<String> onQueryChanged;
  final String hintText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          onChanged: onQueryChanged,
          textInputAction: TextInputAction.search,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            isDense: true,
            hintText: hintText,
            hintStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
            prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.muted),
            suffixIcon: controller.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    color: AppColors.muted,
                    onPressed: () {
                      controller.clear();
                      onQueryChanged('');
                    },
                  ),
            filled: true,
            fillColor: AppColors.surface,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderLight),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderLight),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.accentTeal, width: 1.4),
            ),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 32,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: ReceiptsPeriod.values.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (context, index) {
              final value = ReceiptsPeriod.values[index];
              final active = value == period;
              return GestureDetector(
                onTap: () => onPeriodChanged(value),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: active ? AppColors.navy : AppColors.surface,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: active ? AppColors.navy : AppColors.borderLight),
                  ),
                  child: Text(
                    value.label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: active ? Colors.white : AppColors.muted,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

/// فلتر زمني من — إلى مع اختصارات سريعة، مخصص لسندات القبض.
class ReceiptsDateRangeFilter extends StatelessWidget {
  const ReceiptsDateRangeFilter({
    super.key,
    required this.controller,
    required this.dateRange,
    required this.onDateRangeChanged,
    required this.onQueryChanged,
    this.hintText = 'ابحث برقم السند أو اسم الزبون',
  });

  final TextEditingController controller;
  final ReceiptsDateRange dateRange;
  final ValueChanged<ReceiptsDateRange> onDateRangeChanged;
  final ValueChanged<String> onQueryChanged;
  final String hintText;

  Future<void> _pickDate(BuildContext context, {required bool isFrom}) async {
    final now = DateTime.now();
    final initial = isFrom ? (dateRange.from ?? now) : (dateRange.to ?? dateRange.from ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2010),
      lastDate: DateTime(2100),
      helpText: isFrom ? 'اختر تاريخ البداية' : 'اختر تاريخ النهاية',
    );
    if (picked == null) return;
    final day = DateTime(picked.year, picked.month, picked.day);
    if (isFrom) {
      final to = dateRange.to;
      onDateRangeChanged(ReceiptsDateRange(from: day, to: to != null && to.isBefore(day) ? day : to));
    } else {
      final from = dateRange.from;
      onDateRangeChanged(ReceiptsDateRange(from: from != null && from.isAfter(day) ? day : from, to: day));
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeQuick = dateRange.matchingQuickPeriod();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: controller,
          onChanged: onQueryChanged,
          textInputAction: TextInputAction.search,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          decoration: InputDecoration(
            isDense: true,
            hintText: hintText,
            hintStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
            prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.muted),
            suffixIcon: controller.text.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    color: AppColors.muted,
                    onPressed: () {
                      controller.clear();
                      onQueryChanged('');
                    },
                  ),
            filled: true,
            fillColor: AppColors.surface,
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderLight),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.borderLight),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(14),
              borderSide: const BorderSide(color: AppColors.accentTeal, width: 1.4),
            ),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 32,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: ReceiptsPeriod.values.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (context, index) {
              final value = ReceiptsPeriod.values[index];
              final active = activeQuick == value;
              return GestureDetector(
                onTap: () => onDateRangeChanged(ReceiptsDateRange.forPeriod(value)),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: active ? AppColors.navy : AppColors.surface,
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: active ? AppColors.navy : AppColors.borderLight),
                  ),
                  child: Text(
                    value.label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: active ? Colors.white : AppColors.muted,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _ReceiptDateChip(
                label: 'من',
                value: dateRange.from,
                onTap: () => _pickDate(context, isFrom: true),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _ReceiptDateChip(
                label: 'إلى',
                value: dateRange.to,
                onTap: () => _pickDate(context, isFrom: false),
              ),
            ),
            if (!dateRange.isAll) ...[
              const SizedBox(width: 4),
              IconButton(
                tooltip: 'إظهار الكل',
                onPressed: () => onDateRangeChanged(ReceiptsDateRange.all()),
                icon: const Icon(Icons.filter_alt_off_outlined, size: 18),
                color: AppColors.muted,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _ReceiptDateChip extends StatelessWidget {
  const _ReceiptDateChip({required this.label, required this.value, required this.onTap});

  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = value == null
        ? '—'
        : '${value!.day.toString().padLeft(2, '0')}/${value!.month.toString().padLeft(2, '0')}/${value!.year}';
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Row(
            children: [
              Icon(Icons.calendar_today_rounded, size: 14, color: AppColors.muted.withValues(alpha: 0.9)),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.muted)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  text,
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// ملخص المبلغ المسلّم للشركة والمبلغ الذي لم يُسلّم بعد — ضمن الفترة المحددة.
class ReceiptAmountSummaryPanel extends StatelessWidget {
  const ReceiptAmountSummaryPanel({
    super.key,
    required this.totals,
    required this.periodLabel,
  });

  final ReceiptAmountTotals totals;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            color: AppColors.surfaceAlt,
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined, size: 16, color: AppColors.navy),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'ملخص المبالغ',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.navy.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    periodLabel,
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.navy),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                Expanded(
                  child: _AmountSummaryTile(
                    icon: Icons.verified_rounded,
                    label: 'مسلّم للشركة',
                    hint: 'تم ترحيله للإدارة',
                    amount: totals.postedAmount,
                    count: totals.postedCount,
                    color: AppColors.success,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _AmountSummaryTile(
                    icon: Icons.schedule_rounded,
                    label: 'لم يُسلّم بعد',
                    hint: 'قيد المراجعة أو الترحيل',
                    amount: totals.unpostedAmount,
                    count: totals.unpostedCount,
                    color: AppColors.warning,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AmountSummaryTile extends StatelessWidget {
  const _AmountSummaryTile({
    required this.icon,
    required this.label,
    required this.hint,
    required this.amount,
    required this.count,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String hint;
  final num amount;
  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            fmtMoney(amount),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.1),
          ),
          const Text('د.ع', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
          const SizedBox(height: 6),
          Text(hint, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.3)),
          const SizedBox(height: 4),
          Text(
            '$count ${count == 1 ? 'سند' : 'سندات'}',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color.withValues(alpha: 0.95)),
          ),
        ],
      ),
    );
  }
}

/// نموذج قابل للطي — يبقى السجل ظاهراً فور فتح القسم.
class CollapsibleFormPanel extends StatelessWidget {
  const CollapsibleFormPanel({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.expanded,
    required this.onToggle,
    required this.child,
    this.accent = AppColors.accentTeal,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool expanded;
  final VoidCallback onToggle;
  final Widget child;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    if (expanded) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          child,
          const SizedBox(height: 8),
          Center(
            child: TextButton.icon(
              onPressed: onToggle,
              icon: const Icon(Icons.keyboard_arrow_up_rounded, size: 18),
              label: const Text('إخفاء النموذج'),
            ),
          ),
        ],
      );
    }

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onToggle,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: accent.withValues(alpha: 0.35)),
            color: accent.withValues(alpha: 0.05),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: accent, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy)),
                    Text(subtitle, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                  ],
                ),
              ),
              Icon(Icons.add_circle_outline_rounded, color: accent, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class ReceiptsSectionHeader extends StatelessWidget {
  const ReceiptsSectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.count,
    this.accent,
  });

  final String title;
  final String? subtitle;
  final int? count;
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? AppColors.navy;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
                if (subtitle != null)
                  Text(subtitle!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ),
          if (count != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$count', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: color)),
            ),
        ],
      ),
    );
  }
}

class PendingDeliveriesPanel extends StatelessWidget {
  const PendingDeliveriesPanel({
    super.key,
    required this.items,
    required this.onTap,
  });

  final List<DeliveryReceipt> items;
  final ValueChanged<DeliveryReceipt> onTap;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.28)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ReceiptsSectionHeader(
            title: 'وصولات بانتظار سند قبض',
            subtitle: 'اضغط على الوصل لإنشاء السند تلقائياً',
            count: items.length,
            accent: AppColors.warning,
          ),
          ...items.map(
            (d) => PendingDeliveryTile(item: d, onTap: () => onTap(d)),
          ),
        ],
      ),
    );
  }
}

class PendingDeliveryTile extends StatelessWidget {
  const PendingDeliveryTile({super.key, required this.item, required this.onTap});

  final DeliveryReceipt item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.warning.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.touch_app_rounded, color: AppColors.warning, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.deliveryNo, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy)),
                    Text(item.customerName ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(fmtMoney(item.amount), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.navy)),
                  const Text('إنشاء سند', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.accentTeal)),
                ],
              ),
              const SizedBox(width: 4),
              const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

class ReceiptsStatsHeader extends StatelessWidget {
  const ReceiptsStatsHeader({
    super.key,
    required this.deliveryCount,
    required this.pendingDeliveryReceipt,
    required this.receiptCount,
    required this.pendingReceipts,
    this.large = false,
  });

  final int deliveryCount;
  final int pendingDeliveryReceipt;
  final int receiptCount;
  final int pendingReceipts;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF0A1020), Color(0xFF1A3352)]),
            ),
            child: Row(
              children: [
                const Icon(Icons.receipt_long_rounded, size: 16, color: Colors.white70),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('سند قبض وتحصيل', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
                Text('وصل → سند داخلي', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.65))),
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.all(large ? 16 : 14),
            child: Row(
              children: [
                Expanded(child: _StatBox(value: '$deliveryCount', label: 'وصول قبض', hint: pendingDeliveryReceipt > 0 ? '$pendingDeliveryReceipt بانتظار سند' : null)),
                const SizedBox(width: 10),
                Expanded(child: _StatBox(value: '$receiptCount', label: 'سندات قبض', hint: pendingReceipts > 0 ? '$pendingReceipts قيد المراجعة' : null)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.value, required this.label, this.hint});

  final String value;
  final String label;
  final String? hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
          if (hint != null) ...[
            const SizedBox(height: 4),
            Text(hint!, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.accentTeal)),
          ],
        ],
      ),
    );
  }
}

class ReceiptsFlowBanner extends StatelessWidget {
  const ReceiptsFlowBanner({super.key, required this.step});

  final int step; // 0 delivery, 1 receipt

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _stepDot(1, 'وصل قبض', step == 0),
              Expanded(child: Container(height: 2, color: AppColors.borderLight)),
              _stepDot(2, 'سند قبض', step == 1),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'يمكنك إصدار عدة وصول قبض ثم إنشاء سند قبض لاحقاً — أو إرسال سند بدون وصل',
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.muted.withValues(alpha: 0.95), height: 1.35),
          ),
        ],
      ),
    );
  }

  Widget _stepDot(int n, String label, bool active) {
    final color = active ? AppColors.accentTeal : AppColors.mutedLight;
    return Column(
      children: [
        Container(
          width: 26,
          height: 26,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? AppColors.accentTeal.withValues(alpha: 0.12) : AppColors.surfaceAlt,
            border: Border.all(color: color, width: 2),
          ),
          child: Text('$n', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: active ? AppColors.accentTeal : AppColors.muted)),
        ),
        const SizedBox(height: 4),
        Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: active ? AppColors.navy : AppColors.muted)),
      ],
    );
  }
}

class ReceiptLinkedBanner extends StatelessWidget {
  const ReceiptLinkedBanner({
    super.key,
    required this.deliveryNo,
    required this.customerName,
    required this.amount,
    required this.onClear,
  });

  final String deliveryNo;
  final String customerName;
  final num amount;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.accentSoft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.link_rounded, color: AppColors.accentTeal, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('مرتبط بوصل قبض', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                Text(deliveryNo, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy)),
                Text('$customerName · ${fmtMoney(amount)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
              ],
            ),
          ),
          IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: onClear, color: AppColors.muted),
        ],
      ),
    );
  }
}

class DeliveryReceiptCard extends StatelessWidget {
  const DeliveryReceiptCard({
    super.key,
    required this.item,
    required this.onReprint,
    required this.onCreateReceipt,
    this.onMarkHandover,
    this.showPrint = true,
    this.isReprinting = false,
    this.isMarkingHandover = false,
  });

  final DeliveryReceipt item;
  final VoidCallback? onReprint;
  final VoidCallback? onCreateReceipt;
  final VoidCallback? onMarkHandover;
  final bool showPrint;
  final bool isReprinting;
  final bool isMarkingHandover;

  @override
  Widget build(BuildContext context) {
    final linked = item.status == 'linked' || item.receiptId != null;
    final accent = linked ? AppColors.success : AppColors.accentTeal;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border(
          top: const BorderSide(color: AppColors.borderLight),
          bottom: const BorderSide(color: AppColors.borderLight),
          left: const BorderSide(color: AppColors.borderLight),
          right: BorderSide(color: accent.withValues(alpha: 0.9), width: 3.5),
        ),
        boxShadow: AppColors.softShadow,
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: accent.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Icon(linked ? Icons.check_circle_outline_rounded : Icons.print_outlined, color: accent, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item.customerName ?? '—',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy),
                            ),
                            const SizedBox(height: 3),
                            Text(item.deliveryNo, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(fmtMoney(item.amount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.navy)),
                          const Text('د.ع', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _MetaChip(icon: Icons.event_rounded, label: fmtDate(item.receiptDate)),
                      _MetaChip(
                        icon: linked ? Icons.link_rounded : Icons.pending_outlined,
                        label: item.statusLabel,
                        color: accent,
                      ),
                      if (item.linkedReceiptNo != null && item.linkedReceiptNo!.isNotEmpty)
                        _MetaChip(icon: Icons.receipt_long_rounded, label: item.linkedReceiptNo!),
                      if (item.isTeamDelivery && (item.agentName ?? '').isNotEmpty)
                        _MetaChip(icon: Icons.person_outline_rounded, label: item.agentName!),
                      if (item.handoverStatusLabel.isNotEmpty)
                        _MetaChip(
                          icon: item.handoverReceived ? Icons.verified_rounded : Icons.hourglass_top_rounded,
                          label: item.handoverStatusLabel,
                          color: item.handoverReceived ? AppColors.success : AppColors.warning,
                        ),
                      if (item.printedAt != null && item.printedAt!.isNotEmpty)
                        const _MetaChip(icon: Icons.print_rounded, label: 'طُبع'),
                    ],
                  ),
                  if ((showPrint && onReprint != null)
                      || (item.canCreateReceipt && onCreateReceipt != null)
                      || (item.canMarkHandover && onMarkHandover != null)) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (showPrint && onReprint != null)
                          OutlinedButton.icon(
                            onPressed: isReprinting ? null : onReprint,
                            icon: isReprinting
                                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.print_rounded, size: 16),
                            label: Text(isReprinting ? 'جاري الطباعة...' : 'إعادة طباعة'),
                          ),
                        if (item.canMarkHandover && onMarkHandover != null) ...[
                          if (showPrint && onReprint != null) const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: isMarkingHandover ? null : onMarkHandover,
                              icon: isMarkingHandover
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.payments_outlined, size: 18),
                              label: Text(isMarkingHandover ? 'جاري التأكيد...' : 'استلمت المبلغ'),
                            ),
                          ),
                        ],
                        if (item.canCreateReceipt && onCreateReceipt != null) ...[
                          if ((showPrint && onReprint != null) || (item.canMarkHandover && onMarkHandover != null)) const SizedBox(width: 8),
                          Expanded(
                            child: FilledButton.icon(
                              onPressed: onCreateReceipt,
                              style: FilledButton.styleFrom(backgroundColor: AppColors.navy, foregroundColor: Colors.white),
                              icon: const Icon(Icons.receipt_long_rounded, size: 18),
                              label: const Text('إنشاء سند قبض'),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: c),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: c)),
        ],
      ),
    );
  }
}

class InternalReceiptCard extends StatelessWidget {
  const InternalReceiptCard({super.key, required this.receipt});

  final Receipt receipt;

  Color get _statusColor => switch (receipt.status) {
        'posted' => AppColors.success,
        'rejected' => AppColors.danger,
        'reviewed' => AppColors.moduleShop,
        _ => AppColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    final color = _statusColor;
    final label = receiptAgentStatusLabel(receipt);
    final icon = receiptAgentStatusIcon(receipt.status);
    final isPosted = receipt.status == 'posted';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border(
          top: BorderSide(color: isPosted ? AppColors.success.withValues(alpha: 0.35) : AppColors.borderLight),
          bottom: BorderSide(color: isPosted ? AppColors.success.withValues(alpha: 0.35) : AppColors.borderLight),
          left: BorderSide(color: isPosted ? AppColors.success.withValues(alpha: 0.35) : AppColors.borderLight),
          right: BorderSide(color: color.withValues(alpha: 0.9), width: 3.5),
        ),
        boxShadow: AppColors.softShadow,
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Icon(icon, color: color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        receipt.customerName ?? '—',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy),
                      ),
                      const SizedBox(height: 3),
                      Text(receipt.receiptNo, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(fmtMoney(receipt.amount), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: color)),
                    const Text('د.ع', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                _MetaChip(icon: Icons.event_rounded, label: fmtDate(receipt.receiptDate ?? receipt.createdAt)),
                _MetaChip(icon: icon, label: label, color: color),
                if (receipt.commission > 0)
                  _MetaChip(icon: Icons.percent_rounded, label: 'عمولة ${fmtMoney(receipt.commission)}'),
                if (receipt.discount > 0)
                  _MetaChip(icon: Icons.discount_outlined, label: 'خصم ${fmtMoney(receipt.discount)}'),
              ],
            ),
            if (isPosted)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'أُرسل المبلغ للشركة عبر الإدارة',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.success.withValues(alpha: 0.9)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class ReceiptsBackdrop extends StatelessWidget {
  const ReceiptsBackdrop({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class PrinterStatusBanner extends StatelessWidget {
  const PrinterStatusBanner({
    super.key,
    required this.status,
    required this.onConfigure,
    this.onRefresh,
  });

  final PrinterStatus status;
  final VoidCallback onConfigure;
  final VoidCallback? onRefresh;

  @override
  Widget build(BuildContext context) {
    final Color color;
    final IconData icon;
    if (!status.permissionGranted) {
      color = AppColors.warning;
      icon = Icons.bluetooth_disabled_rounded;
    } else if (!status.bluetoothOn) {
      color = AppColors.warning;
      icon = Icons.bluetooth_disabled_rounded;
    } else if (status.connected) {
      color = AppColors.success;
      icon = Icons.bluetooth_connected_rounded;
    } else if (status.hasSavedPrinter) {
      color = AppColors.warning;
      icon = Icons.bluetooth_searching_rounded;
    } else {
      color = AppColors.muted;
      icon = Icons.print_outlined;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(status.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.navy)),
          ),
          if (onRefresh != null)
            IconButton(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              color: AppColors.muted,
              tooltip: 'تحديث حالة الاتصال',
            ),
          TextButton(onPressed: onConfigure, child: const Text('إعدادات الطابعة')),
        ],
      ),
    );
  }
}

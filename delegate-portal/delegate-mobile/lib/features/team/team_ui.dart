import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../receipts/receipts_ui.dart';
import 'team_models.dart';

/// شريط إحصائي علوي لنظرة الفريق — يعرض المبالغ المعلّقة والمستلمة وعدد المندوبين.
class TeamOverviewHeader extends StatelessWidget {
  const TeamOverviewHeader({
    super.key,
    required this.overview,
    this.large = false,
    this.periodLabel,
  });

  final TeamOverview overview;
  final bool large;
  final String? periodLabel;

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
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF0A1020), Color(0xFF1A3352)]),
            ),
            child: Row(
              children: [
                const Icon(Icons.groups_rounded, size: 17, color: Colors.white70),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('متابعة الفريق',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
                ),
                Text('${fmtNumAlways(overview.totalSecondaries)} مندوب ثانوي',
                    style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.7))),
                if (periodLabel != null && periodLabel!.trim().isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
                    ),
                    child: Text(periodLabel!,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: EdgeInsets.all(large ? 16 : 14),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: _TeamStatBox(
                        value: fmtMoney(overview.totalPendingHandoverAmount),
                        label: 'بانتظار التسليم',
                        hint: overview.totalPendingHandoverCount > 0
                            ? '${fmtNumAlways(overview.totalPendingHandoverCount)} وصل · ${fmtNumAlways(overview.secondariesWithPending)} مندوب'
                            : 'لا مبالغ معلّقة',
                        color: AppColors.warning,
                        emphasize: overview.totalPendingHandoverCount > 0,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _TeamStatBox(
                        value: fmtMoney(overview.totalReceivedAmount),
                        label: 'مبالغ مستلمة',
                        hint: 'من الفريق',
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _TeamStatBox(
                        value: fmtNumAlways(overview.totalTeamDeliveries),
                        label: 'وصولات الفريق',
                        color: AppColors.accentTeal,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _TeamStatBox(
                        value: fmtMoney(overview.totalTeamAmount),
                        label: 'إجمالي التحصيل',
                        color: AppColors.accentBlue,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamStatBox extends StatelessWidget {
  const _TeamStatBox({
    required this.value,
    required this.label,
    this.hint,
    this.color,
    this.emphasize = false,
  });

  final String value;
  final String label;
  final String? hint;
  final Color? color;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.navy;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: emphasize ? c.withValues(alpha: 0.06) : AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: emphasize ? c.withValues(alpha: 0.3) : AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: c)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
          if (hint != null) ...[
            const SizedBox(height: 3),
            Text(hint!, style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: AppColors.mutedLight)),
          ],
        ],
      ),
    );
  }
}

/// بطاقة مندوب ثانوي — تعرض ملخصه وتفتح تفاصيله عند الضغط.
class SecondaryAgentCard extends StatelessWidget {
  const SecondaryAgentCard({super.key, required this.summary, required this.onTap});

  final SecondaryAgentSummary summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pending = summary.hasPendingHandover;
    final accent = pending ? AppColors.warning : AppColors.success;
    final initial = summary.agentName.trim().isNotEmpty
        ? summary.agentName.trim().characters.first
        : '؟';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 18, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(initial,
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(summary.agentName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 14.5, color: AppColors.navy)),
                          const SizedBox(height: 3),
                          Text(
                            '${fmtNumAlways(summary.deliveryCount)} وصل · إجمالي ${fmtMoney(summary.totalAmount)} د.ع',
                            style: const TextStyle(
                                fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.chevron_left_rounded, color: AppColors.mutedLight),
                  ],
                ),
                const SizedBox(height: 11),
                Row(
                  children: [
                    Expanded(
                      child: _MiniStat(
                        icon: Icons.hourglass_top_rounded,
                        label: 'بانتظار التسليم',
                        value: '${fmtMoney(summary.handoverPendingAmount)} د.ع',
                        sub: '${fmtNumAlways(summary.handoverPendingCount)} وصل',
                        color: summary.handoverPendingCount > 0 ? AppColors.warning : AppColors.mutedLight,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _MiniStat(
                        icon: Icons.verified_rounded,
                        label: 'مستلم',
                        value: '${fmtMoney(summary.handoverReceivedAmount)} د.ع',
                        sub: '${fmtNumAlways(summary.handoverReceivedCount)} وصل',
                        color: AppColors.success,
                      ),
                    ),
                  ],
                ),
                if (summary.awaitingReceiptCount > 0) ...[
                  const SizedBox(height: 9),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                    decoration: BoxDecoration(
                      color: AppColors.navy.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.receipt_long_rounded, size: 14, color: AppColors.navy),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '${fmtNumAlways(summary.awaitingReceiptCount)} وصل جاهز لإنشاء سند قبض',
                            style: const TextStyle(
                                fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.navy),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
          ),
          Positioned(
            top: 0,
            bottom: 0,
            right: 0,
            width: 4,
            child: ColoredBox(color: accent.withValues(alpha: 0.92)),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    required this.sub,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final String sub;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 13, color: color),
              const SizedBox(width: 5),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, color: AppColors.muted)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color)),
          Text(sub, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: AppColors.mutedLight)),
        ],
      ),
    );
  }
}

/// فلتر تاريخ الفريق — اختصارات سريعة + من/إلى؛ يؤثر على الإحصائيات وكل مندوب ثانوي.
class TeamDateRangeFilter extends StatelessWidget {
  const TeamDateRangeFilter({
    super.key,
    required this.dateRange,
    required this.onDateRangeChanged,
  });

  final ReceiptsDateRange dateRange;
  final ValueChanged<ReceiptsDateRange> onDateRangeChanged;

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

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.date_range_rounded, size: 16, color: AppColors.accentTeal),
              const SizedBox(width: 6),
              const Expanded(
                child: Text('فلتر التاريخ',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ),
              if (!dateRange.isAll)
                Text(dateRange.label,
                    style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.accentTeal)),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 34,
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
                      color: active ? AppColors.navy : AppColors.surfaceAlt,
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
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _TeamDateChip(
                  label: 'من',
                  value: dateRange.from,
                  onTap: () => _pickDate(context, isFrom: true),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _TeamDateChip(
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
      ),
    );
  }
}

class _TeamDateChip extends StatelessWidget {
  const _TeamDateChip({required this.label, required this.value, required this.onTap});

  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = value == null
        ? 'اختر'
        : '${value!.day.toString().padLeft(2, '0')}/${value!.month.toString().padLeft(2, '0')}/${value!.year}';
    return Material(
      color: AppColors.surfaceAlt,
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
              Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppColors.muted)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(text,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ),
              const Icon(Icons.calendar_today_rounded, size: 13, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}

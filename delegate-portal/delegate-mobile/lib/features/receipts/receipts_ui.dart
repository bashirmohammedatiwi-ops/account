import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/models.dart';

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
                Expanded(child: _StatBox(value: '$deliveryCount', label: 'وصول استلام', hint: pendingDeliveryReceipt > 0 ? '$pendingDeliveryReceipt بانتظار سند' : null)),
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
      child: Row(
        children: [
          _stepDot(1, 'وصل استلام', step == 0),
          Expanded(child: Container(height: 2, color: step >= 1 ? AppColors.accentTeal : AppColors.borderLight)),
          _stepDot(2, 'سند قبض', step == 1),
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
                const Text('مرتبط بوصل استلام', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
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
    this.showPrint = true,
  });

  final DeliveryReceipt item;
  final VoidCallback? onReprint;
  final VoidCallback? onCreateReceipt;
  final bool showPrint;

  @override
  Widget build(BuildContext context) {
    final linked = item.status == 'linked' || item.receiptId != null;
    final accent = linked ? AppColors.success : AppColors.accentTeal;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(width: 3, color: accent.withValues(alpha: 0.75)),
          Expanded(
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
                            Text(item.deliveryNo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy)),
                            const SizedBox(height: 2),
                            Text(item.customerName ?? '—', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                            const SizedBox(height: 4),
                            Text(item.statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: accent)),
                            if (item.linkedReceiptNo != null)
                              Text('سند: ${item.linkedReceiptNo}', style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                          ],
                        ),
                      ),
                      Text(fmtMoney(item.amount), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      if (showPrint && onReprint != null)
                        OutlinedButton.icon(
                          onPressed: onReprint,
                          icon: const Icon(Icons.print_rounded, size: 16),
                          label: const Text('طباعة'),
                        ),
                      if (item.canCreateReceipt && onCreateReceipt != null) ...[
                        if (showPrint && onReprint != null) const SizedBox(width: 8),
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
              ),
            ),
          ),
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
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(width: 3, color: color.withValues(alpha: 0.65)),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                    child: Icon(Icons.receipt_long_rounded, color: color, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(receipt.receiptNo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy)),
                        const SizedBox(height: 2),
                        Text('${receipt.customerName ?? '—'} · ${fmtMoney(receipt.amount)}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
                          child: Text(receipt.statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: color)),
                        ),
                      ],
                    ),
                  ),
                  Text(fmtMoney(receipt.amount), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: color)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ReceiptsBackdrop extends StatelessWidget {
  const ReceiptsBackdrop({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/app_widgets.dart';
import 'orders_providers.dart';

class OrderCard extends ConsumerWidget {
  const OrderCard({
    super.key,
    required this.order,
    this.onPrepToggled,
  });

  final PurchaseOrder order;
  final VoidCallback? onPrepToggled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final giftCount = order.lines.fold<num>(0, (s, l) => s + l.bonus);
    final testerCount = order.lines.fold<num>(0, (s, l) => s + l.tester);
    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    final confirmed = order.prepConfirmed && order.status == 'processing';
    final borderColor = confirmed
        ? AppColors.confirmed
        : themed(context, light: AppColors.border, dark: AppColors.borderDark);
    final surface = confirmed
        ? (isDark(context) ? AppColors.confirmed.withValues(alpha: 0.08) : AppColors.confirmedSoft)
        : themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);

    return Material(
      color: surface,
      elevation: 0,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppColors.radius),
        onTap: () => context.push('/orders/${order.id}'),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: borderColor, width: confirmed ? 2 : 1),
            boxShadow: isDark(context)
                ? null
                : [
                    BoxShadow(
                      color: confirmed ? AppColors.confirmed.withValues(alpha: 0.18) : AppColors.shadow,
                      blurRadius: confirmed ? 20 : 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
          ),
          child: Stack(
            children: [
              if (confirmed)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    height: 4,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(colors: [AppColors.confirmed, Color(0xFF34D399)]),
                      borderRadius: BorderRadius.vertical(top: Radius.circular(AppColors.radius)),
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17))),
                        if (confirmed) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.confirmed,
                              borderRadius: BorderRadius.circular(999),
                              boxShadow: [BoxShadow(color: AppColors.confirmed.withValues(alpha: 0.35), blurRadius: 8, offset: const Offset(0, 2))],
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.check_rounded, color: Colors.white, size: 14),
                                SizedBox(width: 4),
                                Text('مؤكد', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 11)),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        SourceBadge(isShorja: order.isShorja),
                        const SizedBox(width: 8),
                        StatusBadge(status: order.status, compact: true),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Icon(Icons.person_outline_rounded, size: 16, color: muted),
                        const SizedBox(width: 6),
                        Expanded(child: Text(order.customerName ?? 'بدون زبون', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      order.isShorja
                          ? '${order.shorjaBranchName ?? 'فرع الشورجة'}${order.shorjaInvoiceNo != null && order.shorjaInvoiceNo!.isNotEmpty ? ' · فاتورة ${order.shorjaInvoiceNo}' : ''}'
                          : '${order.agentName ?? '—'}${order.catalogBranchName != null ? ' · ${order.catalogBranchName}' : ''}',
                      style: TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _MiniStat(icon: Icons.inventory_2_outlined, label: '${order.lines.length} بند'),
                        const SizedBox(width: 12),
                        _MiniStat(icon: Icons.payments_outlined, label: '${formatMoney(order.totalAmount)} د.ع'),
                        if (giftCount > 0) ...[
                          const SizedBox(width: 12),
                          _MiniStat(icon: Icons.card_giftcard_rounded, label: '$giftCount هدية', color: AppColors.gift),
                        ],
                        if (testerCount > 0) ...[
                          const SizedBox(width: 12),
                          _MiniStat(icon: Icons.science_outlined, label: '$testerCount تيستر', color: AppColors.tester),
                        ],
                        const Spacer(),
                        Text(formatTimeAgo(order.submittedAt), style: TextStyle(color: muted, fontSize: 11, fontWeight: FontWeight.w600)),
                      ],
                    ),
                    if (order.status == 'processing') ...[
                      const SizedBox(height: 12),
                      _PrepConfirmButton(order: order, onDone: onPrepToggled),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PrepConfirmButton extends ConsumerStatefulWidget {
  const _PrepConfirmButton({required this.order, this.onDone});

  final PurchaseOrder order;
  final VoidCallback? onDone;

  @override
  ConsumerState<_PrepConfirmButton> createState() => _PrepConfirmButtonState();
}

class _PrepConfirmButtonState extends ConsumerState<_PrepConfirmButton> {
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;
    final next = !widget.order.prepConfirmed;
    if (!next) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('إلغاء التأكيد'),
          content: const Text('إلغاء علامة تأكيد التجهيز عن هذا الطلب؟'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('لا')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('نعم')),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() => _busy = true);
    try {
      HapticFeedback.mediumImpact();
      await ref.read(apiClientProvider).setPrepConfirmed(widget.order.id, confirmed: next);
      ref.invalidate(ordersListProvider);
      ref.invalidate(orderStatsProvider);
      widget.onDone?.call();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next ? 'تم تأكيد التجهيز ✓' : 'تم إلغاء التأكيد')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final confirmed = widget.order.prepConfirmed;
    return SizedBox(
      width: double.infinity,
      child: FilledButton.tonalIcon(
        onPressed: _busy ? null : _toggle,
        icon: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : Icon(confirmed ? Icons.undo_rounded : Icons.check_circle_rounded),
        label: Text(confirmed ? 'إلغاء تأكيد التجهيز' : 'تأكيد اكتمال التجهيز ✓'),
        style: FilledButton.styleFrom(
          backgroundColor: confirmed ? AppColors.confirmed.withValues(alpha: 0.14) : AppColors.processing.withValues(alpha: 0.12),
          foregroundColor: confirmed ? AppColors.confirmed : AppColors.processing,
          padding: const EdgeInsets.symmetric(vertical: 12),
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: c),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: c)),
      ],
    );
  }
}

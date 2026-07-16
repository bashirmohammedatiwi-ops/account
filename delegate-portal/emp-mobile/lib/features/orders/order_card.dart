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
    this.onChanged,
  });

  final PurchaseOrder order;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final giftCount = order.lines.fold<num>(0, (s, l) => s + l.bonus);
    final testerCount = order.lines.fold<num>(0, (s, l) => s + l.tester);
    final muted = themed(context, light: AppColors.muted, dark: AppColors.mutedDark);
    final confirmed = order.prepConfirmed && order.status == 'processing';
    final showPrepCheck = order.status == 'processing';
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
      clipBehavior: Clip.antiAlias,
      child: DecoratedBox(
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (confirmed)
              Container(
                height: 4,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [AppColors.confirmed, Color(0xFF34D399)]),
                ),
              ),
            InkWell(
              onTap: () => context.push('/orders/${order.id}'),
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, 16, 16, showPrepCheck ? 10 : 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17))),
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
                  ],
                ),
              ),
            ),
            if (showPrepCheck)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: _PrepCheckRow(order: order, onChanged: onChanged),
              ),
          ],
        ),
      ),
    );
  }
}

class _PrepCheckRow extends ConsumerStatefulWidget {
  const _PrepCheckRow({required this.order, this.onChanged});

  final PurchaseOrder order;
  final VoidCallback? onChanged;

  @override
  ConsumerState<_PrepCheckRow> createState() => _PrepCheckRowState();
}

class _PrepCheckRowState extends ConsumerState<_PrepCheckRow> {
  bool _busy = false;

  Future<void> _toggle() async {
    if (_busy) return;
    final next = !widget.order.prepConfirmed;
    if (!next) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('إلغاء التأكيد'),
          content: const Text('إلغاء علامة تأكيد التجهيز؟'),
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
      ref.invalidate(pendingCountProvider);
      ref.invalidate(orderStatsProvider);
      widget.onChanged?.call();
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
    final border = themed(context, light: AppColors.border, dark: AppColors.borderDark);

    return Material(
      color: confirmed
          ? AppColors.confirmed.withValues(alpha: isDark(context) ? 0.15 : 0.1)
          : themed(context, light: AppColors.surfaceAlt, dark: AppColors.surfaceAltDark),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: _busy ? null : _toggle,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: confirmed ? AppColors.confirmed.withValues(alpha: 0.4) : border),
          ),
          child: Row(
            children: [
              _CheckCircle(busy: _busy, confirmed: confirmed),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                          confirmed ? 'تم تأكيد التجهيز' : 'تأكيد اكتمال التجهيز',
                      style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 13,
                        color: confirmed ? AppColors.confirmed : themed(context, light: AppColors.text, dark: AppColors.textDark),
                      ),
                    ),
                    Text(
                      confirmed ? 'اضغط لإلغاء التأكيد' : 'اضغط عند الانتهاء من التجهيز',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                    ),
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

class _CheckCircle extends StatelessWidget {
  const _CheckCircle({required this.busy, required this.confirmed});

  final bool busy;
  final bool confirmed;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: confirmed ? AppColors.confirmed : Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: confirmed ? AppColors.confirmed : AppColors.confirmed.withValues(alpha: 0.35), width: 2),
        boxShadow: confirmed ? [BoxShadow(color: AppColors.confirmed.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 2))] : null,
      ),
      child: busy
          ? Padding(
              padding: const EdgeInsets.all(8),
              child: CircularProgressIndicator(strokeWidth: 2, color: confirmed ? Colors.white : AppColors.confirmed),
            )
          : Icon(
              Icons.check_rounded,
              size: 22,
              color: confirmed ? Colors.white : AppColors.confirmed.withValues(alpha: 0.5),
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

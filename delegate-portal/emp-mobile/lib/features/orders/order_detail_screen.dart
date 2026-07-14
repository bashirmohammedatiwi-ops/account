import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import 'orders_screen.dart' show ordersListProvider;

final orderDetailProvider = FutureProvider.autoDispose.family<PurchaseOrder, int>((ref, id) async {
  return ref.read(apiClientProvider).getOrder(id);
});

class OrderDetailScreen extends ConsumerStatefulWidget {
  const OrderDetailScreen({super.key, required this.orderId});

  final int orderId;

  @override
  ConsumerState<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends ConsumerState<OrderDetailScreen> {
  bool _busy = false;

  Future<void> _reload() async {
    ref.invalidate(orderDetailProvider(widget.orderId));
    ref.invalidate(ordersListProvider);
  }

  Future<void> _setStatus(String status) async {
    final label = statusLabelAr(status);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تغيير الحالة'),
        content: Text('تغيير حالة الطلب إلى «$label»؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تأكيد')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).setOrderStatus(widget.orderId, status);
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تم التحديث إلى $label')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _editLine(OrderLine line) async {
    final quantCtrl = TextEditingController(text: line.quant.toString());
    final bonusCtrl = TextEditingController(text: line.bonus.toString());
    final testerCtrl = TextEditingController(text: line.tester.toString());

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(line.matName, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 16),
              TextField(
                controller: quantCtrl,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                decoration: const InputDecoration(labelText: 'كمية البيع'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: bonusCtrl,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                decoration: const InputDecoration(labelText: 'كمية الهدية'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: testerCtrl,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                decoration: const InputDecoration(labelText: 'كمية التيستر'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('حفظ التعديل'),
              ),
            ],
          ),
        );
      },
    );

    if (saved != true || line.id == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).updateLine(
            widget.orderId,
            line.id!,
            quant: num.tryParse(quantCtrl.text) ?? line.quant,
            bonus: num.tryParse(bonusCtrl.text) ?? line.bonus,
            tester: num.tryParse(testerCtrl.text) ?? line.tester,
          );
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تحديث البند')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      quantCtrl.dispose();
      bonusCtrl.dispose();
      testerCtrl.dispose();
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteLine(OrderLine line) async {
    if (line.id == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف المنتج'),
        content: Text('حذف «${line.matName}» من الطلب؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).deleteLine(widget.orderId, line.id!);
      await _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حذف البند')));
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showImage(String? url, String name) {
    if (url == null || url.isEmpty) return;
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(name, style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            InteractiveViewer(
              child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain),
            ),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إغلاق')),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orderAsync = ref.watch(orderDetailProvider(widget.orderId));

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: () => context.pop()),
          title: const Text('تفاصيل الطلب'),
          actions: [
            if (_busy) const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
            IconButton(onPressed: _busy ? null : _reload, icon: const Icon(Icons.refresh)),
          ],
        ),
        body: orderAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text(e is ApiException ? e.message : 'خطأ')),
          data: (order) {
            final giftLines = order.lines.where((l) => l.bonus > 0).length;
            final testerLines = order.lines.where((l) => l.tester > 0).length;
            return ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(child: Text(order.orderNo, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: statusColor(order.status).withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(statusLabelAr(order.status), style: TextStyle(color: statusColor(order.status), fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(order.customerName ?? 'بدون زبون', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${order.agentName ?? '—'}${order.catalogBranchName != null ? ' · ${order.catalogBranchName}' : ''}',
                            style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 10,
                          children: [
                            Chip(label: Text('${order.lines.length} بند')),
                            Chip(label: Text('${formatMoney(order.totalAmount)} د.ع')),
                            if (giftLines > 0) Chip(label: Text('$giftLines بند هدايا'), backgroundColor: AppColors.warnSoft),
                            if (testerLines > 0) Chip(label: Text('$testerLines بند تيستر'), backgroundColor: AppColors.okSoft),
                          ],
                        ),
                        if (order.notes != null && order.notes!.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Text('ملاحظات: ${order.notes}', style: const TextStyle(color: AppColors.muted)),
                        ],
                      ],
                    ),
                  ),
                ),
                if (order.hasGifts)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.warnSoft, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.warn.withValues(alpha: 0.3))),
                    child: const Text('يحتوي الطلب على هدايا — جهّز الكمية + الهدية', style: TextStyle(color: AppColors.warn, fontWeight: FontWeight.w700)),
                  ),
                if (order.hasTesters)
                  Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.okSoft, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.ok.withValues(alpha: 0.3))),
                    child: const Text('يحتوي الطلب على تيستر — أضفه مع الكمية للتسليم', style: TextStyle(color: AppColors.ok, fontWeight: FontWeight.w700)),
                  ),
                if (order.editable)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text('اضغط على البند لتعديل الكمية أو الحذف', style: TextStyle(color: AppColors.muted.withValues(alpha: 0.9), fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ...order.lines.map((line) => _LineCard(
                      line: line,
                      editable: order.editable,
                      onTapImage: () => _showImage(line.imageUrl, line.matName),
                      onEdit: () => _editLine(line),
                      onDelete: () => _deleteLine(line),
                    )),
                const SizedBox(height: 12),
                _StatusBar(current: order.status, busy: _busy, onSelect: _setStatus),
                const SizedBox(height: 24),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.line,
    required this.editable,
    required this.onTapImage,
    required this.onEdit,
    required this.onDelete,
  });

  final OrderLine line;
  final bool editable;
  final VoidCallback onTapImage;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final hasGift = line.bonus > 0;
    final hasTester = line.tester > 0;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: hasGift ? const Color(0xFFFFFBF7) : hasTester ? const Color(0xFFF8FCFF) : null,
      child: InkWell(
        onTap: editable ? onEdit : null,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: onTapImage,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: line.imageUrl != null && line.imageUrl!.isNotEmpty
                      ? CachedNetworkImage(imageUrl: line.imageUrl!, width: 72, height: 72, fit: BoxFit.cover)
                      : Container(
                          width: 72,
                          height: 72,
                          color: AppColors.border,
                          alignment: Alignment.center,
                          child: const Icon(Icons.inventory_2_outlined, color: AppColors.muted),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(line.matName, style: const TextStyle(fontWeight: FontWeight.w800))),
                        if (hasGift)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.gift, borderRadius: BorderRadius.circular(6)),
                            child: Text('+${line.bonus} هدية', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                          ),
                        if (hasTester)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.ok, borderRadius: BorderRadius.circular(6)),
                            child: Text('+${line.tester} تيستر', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                          ),
                      ],
                    ),
                    if (line.barcode != null && line.barcode!.isNotEmpty)
                      Text(line.barcode!, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                    const SizedBox(height: 6),
                    Text('بيع ${line.quant} · هدية ${line.bonus} · تيستر ${line.tester} · للتسليم ${line.deliverQty}',
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                    Text('${formatMoney(line.lineTotal)} د.ع', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              if (editable)
                PopupMenuButton<String>(
                  onSelected: (v) {
                    if (v == 'edit') onEdit();
                    if (v == 'delete') onDelete();
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'edit', child: Text('تعديل الكمية')),
                    PopupMenuItem(value: 'delete', child: Text('حذف المنتج')),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.current, required this.busy, required this.onSelect});

  final String current;
  final bool busy;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('تحديث حالة الطلب', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            _StatusBtn(label: 'قيد الانتظار', status: 'pending', current: current, busy: busy, onSelect: onSelect),
            const SizedBox(height: 8),
            _StatusBtn(label: 'تم التجهيز', status: 'processing', current: current, busy: busy, onSelect: onSelect),
            const SizedBox(height: 8),
            _StatusBtn(label: 'مرفوض', status: 'rejected', current: current, busy: busy, onSelect: onSelect, danger: true),
          ],
        ),
      ),
    );
  }
}

class _StatusBtn extends StatelessWidget {
  const _StatusBtn({
    required this.label,
    required this.status,
    required this.current,
    required this.busy,
    required this.onSelect,
    this.danger = false,
  });

  final String label;
  final String status;
  final String current;
  final bool busy;
  final ValueChanged<String> onSelect;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final active = current == status;
    return OutlinedButton(
      onPressed: busy || active ? null : () => onSelect(status),
      style: OutlinedButton.styleFrom(
        foregroundColor: danger ? AppColors.danger : AppColors.primary,
        side: BorderSide(color: active ? AppColors.primary : AppColors.border, width: active ? 2 : 1),
        padding: const EdgeInsets.symmetric(vertical: 14),
      ),
      child: Text(active ? '$label (الحالية)' : label, style: const TextStyle(fontWeight: FontWeight.w800)),
    );
  }
}

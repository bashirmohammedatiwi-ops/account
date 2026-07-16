import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/order_action_result.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/app_widgets.dart';
import '../../widgets/premium_widgets.dart';
import '../../widgets/product_barcode_sheet.dart';
import 'orders_providers.dart';

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
    ref.invalidate(orderStatsProvider);
    ref.invalidate(pendingCountProvider);
  }

  Future<void> _setStatus(String status) async {
    final label = statusLabelAr(status);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text('تغيير الحالة', style: TextStyle(fontWeight: FontWeight.w900)),
        content: Text('تغيير حالة الطلب إلى «$label»؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تأكيد')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(apiClientProvider).setOrderStatus(widget.orderId, status);
      await _reload();
      if (mounted) {
        final notifyMsg = status == 'processing' ? notifyUserMessage(result.notify) : '';
        final isError = status == 'processing' && result.notify != null && result.notify!['ok'] != true;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(notifyMsg.isNotEmpty ? notifyMsg : 'تم التحديث إلى $label'),
            duration: Duration(seconds: isError ? 6 : 3),
            backgroundColor: isError ? AppColors.rejected : null,
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _togglePrepConfirm(PurchaseOrder order) async {
    final next = !order.prepConfirmed;
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
      await ref.read(apiClientProvider).setPrepConfirmed(widget.orderId, confirmed: next);
      await _reload();
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

  Future<void> _editLine(OrderLine line) async {
    final quantCtrl = TextEditingController(text: line.quant.toString());
    final bonusCtrl = TextEditingController(text: line.bonus.toString());
    final testerCtrl = TextEditingController(text: line.tester.toString());

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: themed(context, light: AppColors.surface, dark: AppColors.surfaceDark),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(999))),
              ),
              const SizedBox(height: 16),
              Text(line.matName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(height: 18),
              _QtyField(controller: quantCtrl, label: 'كمية البيع', icon: Icons.shopping_cart_outlined),
              const SizedBox(height: 12),
              _QtyField(controller: bonusCtrl, label: 'كمية الهدية', icon: Icons.card_giftcard_outlined, color: AppColors.gift),
              const SizedBox(height: 12),
              _QtyField(controller: testerCtrl, label: 'كمية التيستر', icon: Icons.science_outlined, color: AppColors.tester),
              const SizedBox(height: 22),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ التعديل')),
            ],
          ),
        );
      },
    );

    if (saved != true || line.id == null) {
      quantCtrl.dispose();
      bonusCtrl.dispose();
      testerCtrl.dispose();
      return;
    }
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم تحديث البند')));
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
            style: FilledButton.styleFrom(backgroundColor: AppColors.rejected),
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حذف البند')));
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
        backgroundColor: themed(context, light: AppColors.surface, dark: AppColors.surfaceDark),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(padding: const EdgeInsets.all(16), child: Text(name, style: const TextStyle(fontWeight: FontWeight.w900))),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: InteractiveViewer(child: CachedNetworkImage(imageUrl: url, fit: BoxFit.contain)),
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
        backgroundColor: themed(context, light: AppColors.bg, dark: AppColors.bgDark),
        body: orderAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text(e is ApiException ? e.message : 'خطأ')),
          data: (order) => DefaultTabController(
            length: 3,
            child: NestedScrollView(
              headerSliverBuilder: (context, innerBoxIsScrolled) => [
                      SliverAppBar(
                        expandedHeight: 188,
                        pinned: true,
                        backgroundColor: AppColors.primaryDeep,
                        leading: IconButton(
                          icon: const Icon(Icons.arrow_forward_rounded, color: Colors.white),
                          onPressed: () => context.pop(),
                        ),
                        actions: [
                          if (_busy)
                            const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                          else
                            IconButton(onPressed: _reload, icon: const Icon(Icons.refresh_rounded, color: Colors.white)),
                        ],
                        flexibleSpace: FlexibleSpaceBar(
                          background: Container(
                            decoration: const BoxDecoration(gradient: AppColors.headerGradient),
                            padding: const EdgeInsets.fromLTRB(20, 88, 20, 16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.end,
                              children: [
                                Hero(
                                  tag: 'order-${order.id}',
                                  child: Material(
                                    color: Colors.transparent,
                                    child: Text(order.orderNo, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(order.customerName ?? 'بدون زبون', style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                Row(children: [
                                  SourceBadge(isShorja: order.isShorja),
                                  const SizedBox(width: 8),
                                  StatusBadge(status: order.status),
                                  if (order.prepConfirmed && order.status == 'processing') ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                      decoration: BoxDecoration(
                                        color: AppColors.confirmed,
                                        borderRadius: BorderRadius.circular(999),
                                      ),
                                      child: const Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(Icons.check_rounded, color: Colors.white, size: 13),
                                          SizedBox(width: 4),
                                          Text('مؤكد', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 11)),
                                        ],
                                      ),
                                    ),
                                  ],
                                ]),
                              ],
                            ),
                          ),
                        ),
                      ),
                      SliverPersistentHeader(
                        pinned: true,
                        delegate: _TabBarDelegate(
                          TabBar(
                            labelStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
                            tabs: const [
                              Tab(text: 'البنود', icon: Icon(Icons.inventory_2_outlined, size: 18)),
                              Tab(text: 'التفاصيل', icon: Icon(Icons.info_outline_rounded, size: 18)),
                              Tab(text: 'السجل', icon: Icon(Icons.history_rounded, size: 18)),
                            ],
                          ),
                          themed(context, light: AppColors.surface, dark: AppColors.surfaceDark),
                        ),
                      ),
                    ],
                    body: TabBarView(
                      children: [
                        _LinesTab(
                          order: order,
                          onEdit: _editLine,
                          onDelete: _deleteLine,
                          onImage: _showImage,
                          onBarcode: (line, lineNo) => showProductBarcodeSheet(context, line, lineNo: lineNo),
                        ),
                        _InfoTab(
                          order: order,
                          busy: _busy,
                          onSetStatus: _setStatus,
                          onTogglePrep: () => _togglePrepConfirm(order),
                        ),
                        ListView(padding: const EdgeInsets.all(16), children: [EventTimeline(events: order.events)]),
                      ],
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  _TabBarDelegate(this.tabBar, this.bg);

  final TabBar tabBar;
  final Color bg;

  @override
  double get minExtent => 56;
  @override
  double get maxExtent => 56;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(color: bg, child: tabBar);
  }

  @override
  bool shouldRebuild(covariant _TabBarDelegate oldDelegate) => false;
}

class _LinesTab extends StatelessWidget {
  const _LinesTab({
    required this.order,
    required this.onEdit,
    required this.onDelete,
    required this.onImage,
    required this.onBarcode,
  });

  final PurchaseOrder order;
  final void Function(OrderLine) onEdit;
  final void Function(OrderLine) onDelete;
  final void Function(String?, String) onImage;
  final void Function(OrderLine line, int lineNo) onBarcode;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (order.hasGifts)
          Padding(padding: const EdgeInsets.only(bottom: 10), child: _AlertBanner(color: AppColors.gift, soft: AppColors.giftSoft, icon: Icons.card_giftcard_rounded, text: 'يحتوي الطلب على هدايا')),
        if (order.editable)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              'اضغط على البند لعرض الباركود · التعديل والحذف من القائمة ⋮',
              style: TextStyle(color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontSize: 12, fontWeight: FontWeight.w600),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              'اضغط على البند لعرض باركود المنتج',
              style: TextStyle(color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ...order.lines.asMap().entries.map((entry) => _LineCard(
              lineNo: entry.key + 1,
              line: entry.value,
              editable: order.editable,
              onTapImage: () => onImage(entry.value.imageUrl, entry.value.matName),
              onShowBarcode: () => onBarcode(entry.value, entry.key + 1),
              onEdit: () => onEdit(entry.value),
              onDelete: () => onDelete(entry.value),
            )),
      ],
    );
  }
}

class _InfoTab extends StatelessWidget {
  const _InfoTab({
    required this.order,
    required this.busy,
    required this.onSetStatus,
    required this.onTogglePrep,
  });

  final PurchaseOrder order;
  final bool busy;
  final ValueChanged<String> onSetStatus;
  final VoidCallback onTogglePrep;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (order.isShorja)
          _AlertBanner(
            color: AppColors.shorja,
            soft: AppColors.shorjaSoft,
            icon: Icons.storefront_rounded,
            text: '${order.shorjaBranchName ?? 'فرع الشورجة'}${order.shorjaInvoiceNo != null ? ' · فاتورة ${order.shorjaInvoiceNo}' : ''}',
          ),
        if (!order.isShorja)
          _AlertBanner(
            color: AppColors.accent,
            soft: const Color(0xFFEEF2FF),
            icon: Icons.local_shipping_outlined,
            text: '${order.agentName ?? '—'}${order.catalogBranchName != null ? ' · ${order.catalogBranchName}' : ''}',
          ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _MetricTile(label: 'البنود', value: '${order.lines.length}', icon: Icons.inventory_2_outlined)),
            const SizedBox(width: 10),
            Expanded(child: _MetricTile(label: 'الإجمالي', value: formatMoney(order.totalAmount), icon: Icons.payments_outlined)),
            const SizedBox(width: 10),
            Expanded(child: _MetricTile(label: 'الوقت', value: formatTimeAgo(order.submittedAt), icon: Icons.access_time_rounded)),
          ],
        ),
        if (order.hasTesters)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: _AlertBanner(color: AppColors.tester, soft: AppColors.testerSoft, icon: Icons.science_outlined, text: 'يحتوي الطلب على تيستر'),
          ),
        if (order.notes != null && order.notes!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.notes_rounded, color: AppColors.primary),
                  const SizedBox(width: 10),
                  Expanded(child: Text(order.notes!, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.5))),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(height: 24),
        if (order.status == 'processing') ...[
          PrepConfirmBar(confirmed: order.prepConfirmed, busy: busy, onToggle: onTogglePrep),
          const SizedBox(height: 16),
        ],
        QuickStatusBar(current: order.status, busy: busy, onSelect: onSetStatus),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value, required this.icon});

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: AppColors.primary, size: 20),
            const SizedBox(height: 6),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
            Text(label, style: TextStyle(fontSize: 11, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _AlertBanner extends StatelessWidget {
  const _AlertBanner({required this.color, required this.soft, required this.icon, required this.text});

  final Color color;
  final Color soft;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isDark(context) ? color.withValues(alpha: 0.15) : soft,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }
}

class _QtyField extends StatelessWidget {
  const _QtyField({required this.controller, required this.label, required this.icon, this.color});

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, color: color ?? AppColors.primary),
      ),
    );
  }
}

class _LineCard extends StatelessWidget {
  const _LineCard({
    required this.lineNo,
    required this.line,
    required this.editable,
    required this.onTapImage,
    required this.onShowBarcode,
    required this.onEdit,
    required this.onDelete,
  });

  final int lineNo;
  final OrderLine line;
  final bool editable;
  final VoidCallback onTapImage;
  final VoidCallback onShowBarcode;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final hasGift = line.bonus > 0;
    final hasTester = line.tester > 0;
    final hasBarcode = line.barcode != null && line.barcode!.trim().isNotEmpty;
    void onCardTap() {
      if (hasBarcode) {
        onShowBarcode();
      } else if (editable) {
        onEdit();
      }
    }
    Color? tint;
    if (hasGift) tint = AppColors.giftSoft;
    if (hasTester) tint = AppColors.testerSoft;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: isDark(context) ? null : tint,
      child: InkWell(
        onTap: onCardTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LineNumberBadge(number: lineNo),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: onTapImage,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: line.imageUrl != null && line.imageUrl!.isNotEmpty
                          ? CachedNetworkImage(imageUrl: line.imageUrl!, width: 78, height: 78, fit: BoxFit.cover)
                          : Container(
                              width: 78,
                              height: 78,
                              color: themed(context, light: AppColors.border, dark: AppColors.borderDark),
                              child: Icon(Icons.inventory_2_outlined, color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                            ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text('بند $lineNo', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900, fontSize: 11)),
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(line.matName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15))),
                      ],
                    ),
                    if (line.barcode != null && line.barcode!.isNotEmpty)
                      Row(
                        children: [
                          Icon(Icons.qr_code_2_rounded, size: 14, color: themed(context, light: AppColors.primary, dark: AppColors.primary)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              line.barcode!,
                              style: TextStyle(color: themed(context, light: AppColors.primary, dark: AppColors.primary), fontSize: 12, fontWeight: FontWeight.w800),
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _QtyChip(label: 'بيع', value: '${line.quant}', color: AppColors.primary),
                        _QtyChip(label: 'هدية', value: '${line.bonus}', color: AppColors.gift),
                        _QtyChip(label: 'تيستر', value: '${line.tester}', color: AppColors.tester),
                        _QtyChip(label: 'تسليم', value: '${line.deliverQty}', color: AppColors.processing),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text('${formatMoney(line.lineTotal)} د.ع', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w900)),
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

class _LineNumberBadge extends StatelessWidget {
  const _LineNumberBadge({required this.number});

  final int number;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        gradient: AppColors.cardGradient,
        borderRadius: BorderRadius.circular(10),
        boxShadow: [BoxShadow(color: AppColors.primary.withValues(alpha: 0.25), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Center(
        child: Text(
          '$number',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 15),
        ),
      ),
    );
  }
}

class _QtyChip extends StatelessWidget {
  const _QtyChip({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text('$label $value', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

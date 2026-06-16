import 'package:flutter/material.dart';

import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/invoice_helpers.dart';
import '../../models/models.dart';
import 'commerce_theme.dart';

class OrderInvoiceLineData {
  const OrderInvoiceLineData({
    required this.productId,
    required this.matName,
    required this.barcode,
    required this.unitPrice,
    required this.quant,
    required this.bonus,
  });

  final int productId;
  final String matName;
  final String barcode;
  final num unitPrice;
  final num quant;
  final num bonus;

  num get lineTotal => (quant * unitPrice).round();
}

List<OrderInvoiceLineData> buildOrderInvoiceLines(List<Product> products, Map<int, ({num quant, num bonus})> draft) {
  final lines = <OrderInvoiceLineData>[];
  for (final p in products) {
    final d = draft[p.id];
    if (d == null || (d.quant <= 0 && d.bonus <= 0)) continue;
    lines.add(OrderInvoiceLineData(
      productId: p.id,
      matName: p.name,
      barcode: p.barcode ?? p.skuNum ?? '—',
      unitPrice: p.price,
      quant: d.quant,
      bonus: d.bonus,
    ));
  }
  return lines;
}

List<OrderInvoiceLineData> orderLinesToInvoiceData(List<OrderLine> lines) {
  return lines
      .map((l) => OrderInvoiceLineData(
            productId: l.productId,
            matName: l.matName,
            barcode: l.barcode ?? '—',
            unitPrice: l.unitPrice,
            quant: l.quant,
            bonus: l.bonus,
          ))
      .toList();
}


/// عرض فاتورة طلب مُرسَل (تفاصيل الطلب)
class EdOrderInvoiceDetailView extends StatelessWidget {
  const EdOrderInvoiceDetailView({super.key, required this.order, required this.statusLabel, required this.statusColor});

  final Order order;
  final String statusLabel;
  final Color statusColor;

  @override
  Widget build(BuildContext context) {
    final lines = orderLinesToInvoiceData(order.lines);
    final total = order.totalAmount ?? lines.fold<num>(0, (s, l) => s + l.lineTotal);
    final qtySum = lines.fold<num>(0, (s, l) => s + l.quant);
    final bonusSum = lines.fold<num>(0, (s, l) => s + l.bonus);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
          child: Text(statusLabel, style: TextStyle(color: statusColor, fontWeight: FontWeight.w800)),
        ),
        const SizedBox(height: 14),
        EdOrderInvoiceDocPanel(
          title: 'فاتورة طلب',
          docNum: '#${order.id}',
          dateLabel: fmtDate(order.createdAt),
          customerName: order.customerName ?? '—',
          customerNum: order.customerAccSeq,
          branchName: order.catalogBranchName,
          remarks: order.notes ?? '',
          lineCount: lines.length,
          qtySum: qtySum,
          bonusSum: bonusSum,
          total: total,
        ),
        const SizedBox(height: 16),
        EdOrderInvoiceLinesSection(lines: lines, editable: false),
        if (order.notes != null && order.notes!.trim().isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: EdCommerceTheme.card,
              borderRadius: BorderRadius.circular(AppColors.radiusSm),
              border: Border.all(color: EdCommerceTheme.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('ملاحظات', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                const SizedBox(height: 6),
                Text(order.notes!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.text, height: 1.45)),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class EdOrderInvoiceSheetHeader extends StatelessWidget {
  const EdOrderInvoiceSheetHeader({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('فاتورة حية', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                  const SizedBox(height: 2),
                  const Text('فاتورة الطلب — للعرض على الزبون', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                ],
              ),
            ),
            IconButton(onPressed: onClose, icon: const Icon(Icons.close_rounded), tooltip: 'إغلاق'),
          ],
        ),
      ),
    );
  }
}

class EdOrderInvoiceCustomerBar extends StatelessWidget {
  const EdOrderInvoiceCustomerBar({super.key, required this.customer, required this.onPick});

  final BranchAccount? customer;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final hasCustomer = customer != null;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: hasCustomer ? EdCommerceTheme.accentSoft : EdCommerceTheme.cardTint,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: hasCustomer ? EdCommerceTheme.accent.withValues(alpha: 0.35) : EdCommerceTheme.line),
      ),
      child: Row(
        children: [
          Icon(Icons.person_outline_rounded, color: hasCustomer ? EdCommerceTheme.accent : AppColors.muted, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasCustomer ? customer!.name1 : 'لم يُختر زبون',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: hasCustomer ? AppColors.navy : AppColors.textSecondary),
                ),
                if (hasCustomer && customer!.accountNum.isNotEmpty)
                  Text(customer!.accountNum, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ),
          TextButton(onPressed: onPick, child: const Text('اختر زبون', style: TextStyle(fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }
}

class EdOrderInvoiceDocPanel extends StatelessWidget {
  const EdOrderInvoiceDocPanel({
    super.key,
    required this.title,
    required this.docNum,
    required this.dateLabel,
    required this.customerName,
    this.customerNum,
    this.branchName,
    this.remarks = '',
    required this.lineCount,
    required this.qtySum,
    required this.bonusSum,
    required this.total,
  });

  final String title;
  final String docNum;
  final String dateLabel;
  final String customerName;
  final String? customerNum;
  final String? branchName;
  final String remarks;
  final int lineCount;
  final num qtySum;
  final num bonusSum;
  final num total;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: EdCommerceTheme.line),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: EdCommerceTheme.accent),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Image.asset('assets/logo.png', width: 36, height: 36),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('شركة ديما الحياة', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdCommerceTheme.accent)),
                      Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, height: 1.35, color: AppColors.navy)),
                      Text('رقم $docNum · $dateLabel', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                      if (branchName != null && branchName!.isNotEmpty)
                        Text(branchName!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      if (remarks.isNotEmpty)
                        Text(remarks, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.4)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(customerName, textAlign: TextAlign.left, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.text)),
                      if (customerNum != null && customerNum!.isNotEmpty)
                        Text(customerNum!, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: Table(
              border: TableBorder.all(color: EdCommerceTheme.line),
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              columnWidths: const {
                0: FlexColumnWidth(),
                1: FlexColumnWidth(),
                2: FlexColumnWidth(),
                3: FlexColumnWidth(),
                4: FlexColumnWidth(),
                5: FlexColumnWidth(),
                6: FlexColumnWidth(),
                7: FlexColumnWidth(),
              },
              children: [
                TableRow(
                  children: [
                    _metaTh('عدد البنود'),
                    _metaTd('$lineCount'),
                    _metaTh('إجمالي الكمية'),
                    _metaTd(fmtInvInt(qtySum)),
                    _metaTh('إجمالي الهدايا'),
                    _metaTd(fmtInvInt(bonusSum)),
                    _metaTh('إجمالي الفاتورة'),
                    _metaTd(fmtInvInt(total), highlight: true),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _metaTh(String t) => Container(
        color: EdCommerceTheme.cardTint,
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
        child: Text(t, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.muted)),
      );

  Widget _metaTd(String t, {bool highlight = false}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
        child: Text(
          t,
          textAlign: TextAlign.center,
          textDirection: TextDirection.ltr,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: highlight ? EdCommerceTheme.accent : AppColors.text),
        ),
      );
}

class EdOrderInvoiceLinesSection extends StatelessWidget {
  const EdOrderInvoiceLinesSection({
    super.key,
    required this.lines,
    this.editable = false,
    this.onAdjust,
  });

  final List<OrderInvoiceLineData> lines;
  final bool editable;
  final void Function(int productId, {required bool quant, required int delta})? onAdjust;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Text('بنود الفاتورة', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: EdCommerceTheme.accentSoft,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: EdCommerceTheme.line),
              ),
              child: Text('${lines.length} بند', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdCommerceTheme.accent)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (lines.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 36),
            decoration: BoxDecoration(
              color: EdCommerceTheme.card,
              borderRadius: BorderRadius.circular(AppColors.radiusSm),
              border: Border.all(color: EdCommerceTheme.line),
            ),
            child: Column(
              children: [
                Icon(Icons.receipt_long_outlined, size: 32, color: AppColors.muted.withValues(alpha: 0.6)),
                const SizedBox(height: 10),
                const Text('الفاتورة فارغة — أضف منتجات', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
              ],
            ),
          )
        else
          EdOrderInvoiceLinesTable(lines: lines, editable: editable, onAdjust: onAdjust),
      ],
    );
  }
}

class EdOrderInvoiceLinesTable extends StatelessWidget {
  const EdOrderInvoiceLinesTable({super.key, required this.lines, required this.editable, this.onAdjust});

  final List<OrderInvoiceLineData> lines;
  final bool editable;
  final void Function(int productId, {required bool quant, required int delta})? onAdjust;

  @override
  Widget build(BuildContext context) {
    final total = lines.fold<num>(0, (s, l) => s + l.lineTotal);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: EdCommerceTheme.line),
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        color: EdCommerceTheme.card,
      ),
      clipBehavior: Clip.antiAlias,
      child: EdFullWidthTable(
        minWidth: 620,
        builder: (_) => Table(
          border: TableBorder.all(color: EdCommerceTheme.line),
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          columnWidths: const {
            0: FixedColumnWidth(32),
            1: FixedColumnWidth(84),
            2: FlexColumnWidth(3),
            3: FixedColumnWidth(72),
            4: FixedColumnWidth(72),
            5: FlexColumnWidth(1.1),
            6: FlexColumnWidth(1.1),
          },
          children: [
            TableRow(
              children: [
                _th('م'),
                _th('الباركود'),
                _th('اسم المادة'),
                _th('الكمية'),
                _th('هدية'),
                _th('سعر الوحدة'),
                _th('المبلغ'),
              ],
            ),
            ...lines.asMap().entries.map((e) => _lineRow(e.key, e.value)),
            _sumRow('إجمالي الفاتورة', fmtInvInt(total)),
            _sumRow('الصافي للدفع', fmtInvInt(total), highlight: true),
          ],
        ),
      ),
    );
  }

  TableRow _lineRow(int index, OrderInvoiceLineData line) {
    return TableRow(
      decoration: BoxDecoration(color: index.isEven ? EdCommerceTheme.cardTint : EdCommerceTheme.card),
      children: [
        _cell('${index + 1}', align: TextAlign.center, muted: true, bold: true),
        _cell(line.barcode, align: TextAlign.center, mono: true, size: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
          child: Text(line.matName, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, height: 1.3)),
        ),
        editable
            ? _qtyStepperCell(line.productId, line.quant, quant: true)
            : _cell(fmtQty(line.quant), align: TextAlign.center, bold: true),
        editable
            ? _qtyStepperCell(line.productId, line.bonus, quant: false)
            : _cell(fmtQty(line.bonus), align: TextAlign.center, bold: true),
        _moneyCell(line.unitPrice),
        _moneyCell(line.lineTotal, net: true),
      ],
    );
  }

  TableRow _sumRow(String label, String value, {bool highlight = false}) {
    return TableRow(
      decoration: BoxDecoration(color: highlight ? const Color(0xFFECFDF5) : EdCommerceTheme.cardTint),
      children: [
        _cell(''),
        _cell(''),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Text(label, textAlign: TextAlign.right, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: highlight ? AppColors.navy : AppColors.textSecondary)),
        ),
        _cell(''),
        _cell(''),
        _cell(''),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(value, textAlign: TextAlign.center, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: highlight ? EdCommerceTheme.accent : AppColors.text)),
        ),
      ],
    );
  }

  Widget _th(String text) {
    return Container(
      color: EdCommerceTheme.cardTint,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.navy, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  Widget _cell(String text, {TextAlign align = TextAlign.right, bool muted = false, bool bold = false, bool mono = false, double size = 11}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        text,
        textAlign: align,
        textDirection: text.contains('-') || RegExp(r'^\d').hasMatch(text) ? TextDirection.ltr : TextDirection.rtl,
        style: TextStyle(fontSize: size, fontWeight: bold ? FontWeight.w800 : FontWeight.w600, color: muted ? AppColors.muted : AppColors.text, fontFamily: mono ? 'monospace' : null),
      ),
    );
  }

  Widget _moneyCell(num v, {bool net = false}) {
    if (v == 0) return _cell('—', align: TextAlign.center, muted: true);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        fmtInvInt(v),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        style: TextStyle(fontSize: net ? 12 : 11, fontWeight: FontWeight.w800, color: net ? EdCommerceTheme.accent : AppColors.text),
      ),
    );
  }

  Widget _qtyStepperCell(int productId, num value, {required bool quant}) {
    final gift = !quant;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2, vertical: 4),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 4),
        decoration: BoxDecoration(
          color: gift ? EdCommerceTheme.giftBg : EdCommerceTheme.cardTint,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: gift ? EdCommerceTheme.giftBorder : EdCommerceTheme.line),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _stepBtn(Icons.remove_rounded, () => onAdjust?.call(productId, quant: quant, delta: -1)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(fmtQty(value), textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
            ),
            _stepBtn(Icons.add_rounded, () => onAdjust?.call(productId, quant: quant, delta: 1)),
          ],
        ),
      ),
    );
  }

  Widget _stepBtn(IconData icon, VoidCallback onTap) {
    return Material(
      color: EdCommerceTheme.card,
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: SizedBox(width: 28, height: 28, child: Icon(icon, size: 16, color: AppColors.navy)),
      ),
    );
  }
}

class EdOrderInvoiceSheetFooter extends StatelessWidget {
  const EdOrderInvoiceSheetFooter({
    super.key,
    required this.total,
    required this.lineCount,
    required this.submitting,
    required this.onClear,
    required this.onSubmit,
  });

  final num total;
  final int lineCount;
  final bool submitting;
  final VoidCallback onClear;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        border: Border(top: BorderSide(color: EdCommerceTheme.line)),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Text('إجمالي الفاتورة', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                const Spacer(),
                Text(fmtInvInt(total), textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: submitting ? null : onClear,
                    style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                    child: const Text('تفريغ', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: lineCount > 0 && !submitting ? onSubmit : null,
                    style: FilledButton.styleFrom(
                      backgroundColor: EdCommerceTheme.accent,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: submitting
                        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('إرسال للوحة التحكم', style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

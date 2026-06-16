import 'package:flutter/material.dart';

import '../accounts/accounts_theme.dart';
import '../../core/layout/ed_table_wrap.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/invoice_helpers.dart';
import '../../models/models.dart';

class EdInvoiceExportBar extends StatelessWidget {
  const EdInvoiceExportBar({super.key, required this.label, required this.onExport, this.loading = false});

  final String label;
  final VoidCallback? onExport;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: loading ? null : onExport,
          borderRadius: BorderRadius.circular(10),
          child: Ink(
            decoration: BoxDecoration(
              color: EdAccountsTheme.card,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: EdAccountsTheme.accent.withValues(alpha: 0.35)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (loading)
                  const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: EdAccountsTheme.accent))
                else
                  const Icon(Icons.download_rounded, size: 17, color: EdAccountsTheme.accent),
                const SizedBox(width: 6),
                Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: EdAccountsTheme.accent)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class EdInvoiceDocPanel extends StatelessWidget {
  const EdInvoiceDocPanel({super.key, required this.detail});

  final InvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    final inv = reconcileInvoiceTotals(detail.invoice, detail.lines);
    final lines = detail.lines;
    final qtySum = lines.fold<num>(0, (s, l) => s + ((l['quant'] ?? l['qty'] ?? 0) as num));
    final customer = invoiceCustomerName(detail.invoice, detail.customer);
    final remarks = '${inv['remarks'] ?? ''}'.trim();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: EdAccountsTheme.card,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: EdAccountsTheme.line),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(height: 3, color: EdAccountsTheme.accent),
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
                      const Text('شركة ديما الحياة', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
                      Text(
                        '${inv['kindLabel'] ?? 'فاتورة مبيعات'}',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, height: 1.35, color: AppColors.navy),
                      ),
                      Text(
                        'رقم ${inv['num'] ?? '—'} · ${fmtDate(inv['date']?.toString())}',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary, height: 1.45),
                      ),
                      if (remarks.isNotEmpty)
                        Text(
                          remarks,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.45),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    customer,
                    textAlign: TextAlign.left,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, height: 1.35, color: AppColors.text),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
            child: Table(
              border: TableBorder.all(color: EdAccountsTheme.line),
              defaultVerticalAlignment: TableCellVerticalAlignment.middle,
              columnWidths: const {0: FlexColumnWidth(), 1: FlexColumnWidth(), 2: FlexColumnWidth(), 3: FlexColumnWidth(), 4: FlexColumnWidth(), 5: FlexColumnWidth(), 6: FlexColumnWidth(), 7: FlexColumnWidth()},
              children: [
                TableRow(
                  children: [
                    _metaTh('عدد البنود'),
                    _metaTd('${lines.length}'),
                    _metaTh('إجمالي الكمية'),
                    _metaTd(fmtInvInt(qtySum)),
                    _metaTh('إجمالي الفاتورة'),
                    _metaTd(fmtInvInt(inv['total'])),
                    _metaTh('الصافي للدفع'),
                    _metaTd(fmtInvInt(inv['netPay']), color: EdAccountsTheme.credit, bold: true),
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
        color: EdAccountsTheme.tableHead,
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
        child: Text(t, textAlign: TextAlign.center, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: AppColors.muted)),
      );

  Widget _metaTd(String t, {Color? color, bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
        child: Text(
          t,
          textAlign: TextAlign.center,
          textDirection: TextDirection.ltr,
          style: TextStyle(fontSize: 12, fontWeight: bold ? FontWeight.w800 : FontWeight.w700, color: color ?? AppColors.text),
        ),
      );
}

class EdInvoiceLinesSection extends StatelessWidget {
  const EdInvoiceLinesSection({super.key, required this.detail});

  final InvoiceDetail detail;

  @override
  Widget build(BuildContext context) {
    final inv = reconcileInvoiceTotals(detail.invoice, detail.lines);
    final lines = detail.lines;

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
                color: EdAccountsTheme.accentSoft,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: EdAccountsTheme.line),
              ),
              child: Text('${lines.length} بند', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: EdAccountsTheme.accent)),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (lines.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 36),
            alignment: Alignment.center,
            child: const Text('لا توجد بنود لهذه الفاتورة', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
          )
        else
          EdInvoiceLinesTable(inv: inv, lines: lines),
      ],
    );
  }
}

class EdInvoiceLinesTable extends StatelessWidget {
  const EdInvoiceLinesTable({super.key, required this.inv, required this.lines});

  final Map<String, dynamic> inv;
  final List<Map<String, dynamic>> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: EdAccountsTheme.line),
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        color: EdAccountsTheme.card,
      ),
      clipBehavior: Clip.antiAlias,
      child: EdFullWidthTable(
        minWidth: 520,
        builder: (_) => Table(
          border: TableBorder.all(color: EdAccountsTheme.line),
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          columnWidths: const {
            0: FixedColumnWidth(32),
            1: FixedColumnWidth(84),
            2: FlexColumnWidth(3.5),
            3: FixedColumnWidth(52),
            4: FixedColumnWidth(52),
            5: FlexColumnWidth(1.2),
            6: FlexColumnWidth(1.2),
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
            _sumRow('إجمالي الفاتورة', fmtInvInt(inv['total'])),
            _sumRow('الحسومات', fmtInvInt(inv['discount'])),
            _sumRow('الصافي للدفع', fmtInvInt(inv['netPay']), valueColor: EdAccountsTheme.credit, highlight: true),
          ],
        ),
      ),
    );
  }

  TableRow _lineRow(int index, Map<String, dynamic> line) {
    final remarks = '${line['remarks'] ?? ''}'.trim();
    return TableRow(
      decoration: BoxDecoration(color: index.isEven ? EdAccountsTheme.cardTint : EdAccountsTheme.card),
      children: [
        _cell('${index + 1}', align: TextAlign.center, muted: true, bold: true),
        _cell(invoiceBarcode(line), align: TextAlign.center, mono: true, size: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${line['matName'] ?? line['name'] ?? '—'}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, height: 1.3)),
              if (remarks.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 3),
                  child: Text(remarks, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.muted)),
                ),
            ],
          ),
        ),
        _qtyCell(line['quant'] ?? line['qty']),
        _qtyCell(line['bonus']),
        _moneyCell(line['price'] ?? line['unitPrice']),
        _moneyCell(invoiceLineTotal(line), net: true),
      ],
    );
  }

  TableRow _sumRow(String label, String value, {Color? valueColor, bool highlight = false}) {
    return TableRow(
      decoration: BoxDecoration(color: highlight ? EdAccountsTheme.creditSoft : EdAccountsTheme.cardTint),
      children: [
        _cell(''),
        _cell(''),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
          child: Text(
            label,
            textAlign: TextAlign.right,
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: highlight ? AppColors.navy : AppColors.textSecondary),
          ),
        ),
        _cell(''),
        _cell(''),
        _cell(''),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text(
            value,
            textAlign: TextAlign.center,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: valueColor ?? AppColors.text),
          ),
        ),
      ],
    );
  }

  Widget _th(String text) {
    return Container(
      color: EdAccountsTheme.tableHead,
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: EdAccountsTheme.tableHeadText, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }

  Widget _cell(String text, {TextAlign align = TextAlign.right, bool muted = false, bool bold = false, bool mono = false, double size = 11}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        text,
        textAlign: align,
        textDirection: text.contains('-') || RegExp(r'^\d').hasMatch(text) ? TextDirection.ltr : TextDirection.rtl,
        style: TextStyle(
          fontSize: size,
          fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
          color: muted ? AppColors.muted : AppColors.text,
          fontFamily: mono ? 'monospace' : null,
        ),
      ),
    );
  }

  Widget _qtyCell(dynamic v) {
    final n = v as num? ?? 0;
    if (n == 0) return _cell('—', align: TextAlign.center, muted: true);
    return _cell(fmtQty(n), align: TextAlign.center, bold: true);
  }

  Widget _moneyCell(dynamic v, {bool net = false}) {
    final n = v as num? ?? 0;
    if (n == 0) return _cell('—', align: TextAlign.center, muted: true);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
      child: Text(
        fmtInvInt(n),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
        style: TextStyle(fontSize: net ? 12 : 11, fontWeight: FontWeight.w800, color: net ? EdAccountsTheme.credit : AppColors.text),
      ),
    );
  }
}

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../core/utils/numeric_input.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import 'commerce_theme.dart';

// ── فروع / أقسام ──

class EdShopPickerGrid extends StatelessWidget {
  const EdShopPickerGrid({
    super.key,
    required this.items,
    required this.emptyMessage,
    required this.emptyIcon,
    required this.itemBuilder,
  });

  final List<dynamic> items;
  final String emptyMessage;
  final IconData emptyIcon;
  final Widget Function(BuildContext context, int index) itemBuilder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Center(child: EmptyState(message: emptyMessage, icon: emptyIcon));
    }
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 280,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.35,
      ),
      itemCount: items.length,
      itemBuilder: itemBuilder,
    );
  }
}

class EdShopPickerCard extends StatelessWidget {
  const EdShopPickerCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String? subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: EdCommerceTheme.card,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border.all(color: EdCommerceTheme.line),
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(height: 3, color: EdCommerceTheme.accent),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: EdCommerceTheme.accentSoft,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: EdCommerceTheme.line),
                        ),
                        child: Icon(icon, color: EdCommerceTheme.accent, size: 22),
                      ),
                      const Spacer(),
                      Text(title, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.3)),
                      if (subtitle != null && subtitle!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(subtitle!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      ],
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(color: EdCommerceTheme.cardTint, border: Border(top: BorderSide(color: EdCommerceTheme.line))),
                child: Row(
                  children: [
                    Text('فتح', style: TextStyle(fontWeight: FontWeight.w800, color: EdCommerceTheme.accent, fontSize: 13)),
                    const Spacer(),
                    Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: EdCommerceTheme.accent),
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

// ── شريط الزبون ──

class EdShopCustomerBar extends StatelessWidget {
  const EdShopCustomerBar({super.key, required this.customer, required this.branchLabel, required this.onPick});

  final BranchAccount? customer;
  final String branchLabel;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    final name = customer?.name1 ?? 'لم يُختر زبون';
    final meta = customer == null
        ? branchLabel
        : [customer!.address, branchLabel].whereType<String>().where((s) => s.isNotEmpty).join(' · ');

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.8))),
        boxShadow: AppColors.softShadow,
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: customer != null ? EdCommerceTheme.accent : AppColors.surfaceAlt,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              customer != null ? Icons.person_rounded : Icons.person_outline_rounded,
              color: customer != null ? Colors.white : AppColors.muted,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('اسم الزبون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                const SizedBox(height: 2),
                Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy)),
                if (meta.isNotEmpty)
                  Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onPick,
              borderRadius: BorderRadius.circular(12),
              child: Ink(
                decoration: BoxDecoration(
                  color: AppColors.navy,
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: const Text('اختيار', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Colors.white)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── شريط البحث والباركود ──

class EdShopToolbar extends StatelessWidget {
  const EdShopToolbar({
    super.key,
    required this.searchHint,
    required this.onSearchChanged,
    required this.barcodeController,
    required this.onBarcodeSubmit,
    required this.onBarcodeScan,
  });

  final String searchHint;
  final ValueChanged<String> onSearchChanged;
  final TextEditingController barcodeController;
  final VoidCallback onBarcodeSubmit;
  final VoidCallback onBarcodeScan;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.9),
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.7))),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.inputFill,
                borderRadius: BorderRadius.circular(AppColors.radius),
                border: Border.all(color: AppColors.borderLight),
              ),
              child: EdSearchField(hint: searchHint, onChanged: onSearchChanged),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.inputFill,
                borderRadius: BorderRadius.circular(AppColors.radius),
                border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.2)),
              ),
              child: TextField(
                controller: barcodeController,
                keyboardType: EdNumericFieldConfig.integer.keyboardType,
                inputFormatters: EdNumericFieldConfig.integer.inputFormatters,
                textDirection: EdNumericFieldConfig.integer.textDirection,
                enableSuggestions: EdNumericFieldConfig.integer.enableSuggestions,
                autocorrect: EdNumericFieldConfig.integer.autocorrect,
                decoration: InputDecoration(
                  hintText: 'باركود',
                  isDense: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  prefixIcon: const Icon(Icons.qr_code_scanner_rounded, color: AppColors.muted, size: 20),
                  suffixIcon: IconButton(
                    tooltip: 'بحث',
                    icon: Icon(Icons.search_rounded, color: EdCommerceTheme.accent, size: 20),
                    onPressed: onBarcodeSubmit,
                  ),
                ),
                onSubmitted: (_) => onBarcodeSubmit(),
              ),
            ),
          ),
          const SizedBox(width: 6),
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(12),
            child: InkWell(
              onTap: onBarcodeScan,
              borderRadius: BorderRadius.circular(12),
              child: Ink(
                decoration: BoxDecoration(
                  color: AppColors.navy,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const SizedBox(
                  width: 46,
                  height: 46,
                  child: Icon(Icons.document_scanner_outlined, color: Colors.white, size: 22),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── لوحة الصنف — شريط يسار ──

class EdShopProductDetailPlaceholder extends StatelessWidget {
  const EdShopProductDetailPlaceholder({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: EdCommerceTheme.line),
        boxShadow: AppColors.softShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: EdCommerceTheme.accentSoft,
                  shape: BoxShape.circle,
                  border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.15)),
                ),
                child: Icon(Icons.touch_app_rounded, size: 36, color: EdCommerceTheme.accent.withValues(alpha: 0.7)),
              ),
              const SizedBox(height: 20),
              const Text('تفاصيل المنتج', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Color(0xFF1E293B))),
              const SizedBox(height: 8),
              Text(
                'اختر منتجاً من الشبكة لعرض الصورة والسعر وإدخال الكمية والهدايا والتيستر',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EdShopProductDetailPanel extends StatelessWidget {
  const EdShopProductDetailPanel({
    super.key,
    required this.product,
    required this.sectionName,
    required this.quant,
    required this.bonus,
    required this.tester,
    required this.onDecQuant,
    required this.onIncQuant,
    required this.onDecBonus,
    required this.onIncBonus,
    required this.onDecTester,
    required this.onIncTester,
    required this.onSetQuant,
    required this.onSetBonus,
    required this.onSetTester,
    this.scrollController,
  });

  final Product product;
  final String sectionName;
  final num quant;
  final num bonus;
  final num tester;
  final VoidCallback onDecQuant;
  final VoidCallback onIncQuant;
  final VoidCallback onDecBonus;
  final VoidCallback onIncBonus;
  final VoidCallback onDecTester;
  final VoidCallback onIncTester;
  final ValueChanged<num> onSetQuant;
  final ValueChanged<num> onSetBonus;
  final ValueChanged<num> onSetTester;
  final ScrollController? scrollController;

  @override
  Widget build(BuildContext context) {
    final lineTotal = quant * product.price;
    final stock = product.stockHint;
    final code = product.barcode ?? product.skuNum ?? '—';
    final inDraft = quant > 0 || bonus > 0 || tester > 0;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: inDraft ? EdCommerceTheme.accent.withValues(alpha: 0.35) : EdCommerceTheme.line, width: inDraft ? 2 : 1),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.6))),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: EdCommerceTheme.accentSoft,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.inventory_2_outlined, color: EdCommerceTheme.accent, size: 22),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text('تفاصيل الإضافة', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFF1E293B))),
                ),
                if (inDraft)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: EdCommerceTheme.accentSoft,
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.2)),
                    ),
                    child: const Text('في الفاتورة', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                  ),
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AspectRatio(
                    aspectRatio: 1.1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: EdCommerceTheme.accentSoft.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: EdCommerceTheme.line),
                      ),
                      padding: const EdgeInsets.all(14),
                      child: _productImage(product),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(product.name, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF1E293B), height: 1.35)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _chip(Icons.qr_code_2_rounded, code, mono: true),
                      _chip(Icons.category_outlined, sectionName),
                      if (stock != null && stock.isNotEmpty) _chip(Icons.warehouse_outlined, 'مخزون: $stock'),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: EdCommerceTheme.cardTint,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: EdCommerceTheme.line),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('سعر الجملة', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                              const SizedBox(height: 4),
                              Text(fmtMoney(product.price), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: EdCommerceTheme.accentSoft,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.15)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('المجموع', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                              const SizedBox(height: 4),
                              Text(fmtMoney(lineTotal), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Color(0xFF1E293B))),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Text('الكميات', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF334155))),
                  const SizedBox(height: 10),
                  EdShopQtyRow(label: 'الكمية', amount: quant, kind: EdShopQtyKind.unit, onDec: onDecQuant, onInc: onIncQuant, onSetValue: onSetQuant),
                  const SizedBox(height: 10),
                  EdShopQtyRow(label: 'الهدايا', amount: bonus, kind: EdShopQtyKind.gift, onDec: onDecBonus, onInc: onIncBonus, onSetValue: onSetBonus),
                  const SizedBox(height: 10),
                  EdShopQtyRow(label: 'التيستر', amount: tester, kind: EdShopQtyKind.tester, onDec: onDecTester, onInc: onIncTester, onSetValue: onSetTester),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String text, {bool mono = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: EdCommerceTheme.cardTint,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: EdCommerceTheme.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.muted),
          const SizedBox(width: 5),
          Text(
            text,
            textDirection: mono ? TextDirection.ltr : TextDirection.rtl,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

Widget _productImage(Product product) {
  if (product.imageUrl != null) {
    return CachedNetworkImage(
      imageUrl: product.imageUrl!,
      fit: BoxFit.contain,
      memCacheWidth: 280,
      placeholder: (_, __) => const Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))),
      errorWidget: (_, __, ___) => const Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.muted),
    );
  }
  return const Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.muted);
}

// ── كميات المنتج ──

enum EdShopQtyKind { unit, gift, tester }

class EdShopQtyRow extends StatefulWidget {
  const EdShopQtyRow({
    super.key,
    required this.label,
    required this.amount,
    required this.kind,
    required this.onDec,
    required this.onInc,
    required this.onSetValue,
  });

  final String label;
  final num amount;
  final EdShopQtyKind kind;
  final VoidCallback onDec;
  final VoidCallback onInc;
  final ValueChanged<num> onSetValue;

  @override
  State<EdShopQtyRow> createState() => _EdShopQtyRowState();
}

class _EdShopQtyRowState extends State<EdShopQtyRow> {
  bool _editing = false;
  late TextEditingController _ctrl;
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: _textForAmount(widget.amount));
    _focus.addListener(() {
      if (!_focus.hasFocus && _editing) _commit();
    });
  }

  @override
  void didUpdateWidget(EdShopQtyRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!_editing && oldWidget.amount != widget.amount) {
      _ctrl.text = _textForAmount(widget.amount);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  String _textForAmount(num v) {
    if (v == v.roundToDouble()) return '${v.round()}';
    return v.toString();
  }

  void _startEdit() {
    setState(() {
      _editing = true;
      _ctrl.text = _textForAmount(widget.amount);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _focus.requestFocus();
    });
  }

  void _commit() {
    final raw = WesternDigitsFormatter.toWestern(_ctrl.text.trim()).replaceAll(',', '');
    final parsed = num.tryParse(raw);
    if (parsed != null) {
      widget.onSetValue(parsed.clamp(0, 999999));
    }
    if (mounted) {
      setState(() => _editing = false);
      _ctrl.text = _textForAmount(widget.amount);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg) = switch (widget.kind) {
      EdShopQtyKind.gift => (EdCommerceTheme.giftBg, EdCommerceTheme.giftBorder, EdCommerceTheme.giftFg),
      EdShopQtyKind.tester => (EdCommerceTheme.testerBg, EdCommerceTheme.testerBorder, EdCommerceTheme.testerFg),
      EdShopQtyKind.unit => (EdCommerceTheme.card, EdCommerceTheme.line, AppColors.navy),
    };

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: border),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: fg.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(widget.label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: fg)),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _qtyBtn(Icons.remove_rounded, widget.onDec, fg),
              Expanded(
                child: _editing
                    ? TextField(
                        controller: _ctrl,
                        focusNode: _focus,
                        textAlign: TextAlign.center,
                        keyboardType: EdNumericFieldConfig.decimal.keyboardType,
                        inputFormatters: EdNumericFieldConfig.decimal.inputFormatters,
                        textDirection: EdNumericFieldConfig.decimal.textDirection,
                        enableSuggestions: EdNumericFieldConfig.decimal.enableSuggestions,
                        autocorrect: EdNumericFieldConfig.decimal.autocorrect,
                        textInputAction: TextInputAction.done,
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: fg),
                        decoration: InputDecoration(
                          isDense: true,
                          filled: true,
                          fillColor: AppColors.surface,
                          contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: border)),
                          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: border)),
                          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: fg, width: 1.5)),
                        ),
                        onSubmitted: (_) => _commit(),
                      )
                    : Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: _startEdit,
                          borderRadius: BorderRadius.circular(10),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Column(
                              children: [
                                Text(
                                  fmtQty(widget.amount),
                                  textAlign: TextAlign.center,
                                  textDirection: TextDirection.ltr,
                                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: fg),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'اضغط للكتابة',
                                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: fg.withValues(alpha: 0.55)),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
              ),
              _qtyBtn(Icons.add_rounded, widget.onInc, fg),
            ],
          ),
        ],
      ),
    );
  }

  Widget _qtyBtn(IconData icon, VoidCallback onTap, Color fg) {
    return Material(
      color: EdCommerceTheme.card,
      borderRadius: BorderRadius.circular(10),
      elevation: 0,
      shadowColor: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: EdCommerceTheme.line.withValues(alpha: 0.45)),
            boxShadow: [BoxShadow(color: fg.withValues(alpha: 0.1), blurRadius: 8, offset: const Offset(0, 2))],
          ),
          child: Icon(icon, color: fg, size: 22),
        ),
      ),
    );
  }
}

// ── شبكة المنتجات ──

class EdShopProductTile extends StatelessWidget {
  const EdShopProductTile({
    super.key,
    required this.product,
    required this.selected,
    required this.inDraft,
    required this.onTap,
  });

  final Product product;
  final bool selected;
  final bool inDraft;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = selected ? EdCommerceTheme.accent : (inDraft ? EdCommerceTheme.accent.withValues(alpha: 0.4) : EdCommerceTheme.line);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: borderColor, width: selected ? 2 : 1),
            boxShadow: selected ? [BoxShadow(color: EdCommerceTheme.selectedGlow, blurRadius: 12, offset: const Offset(0, 4))] : AppColors.softShadow,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (inDraft)
                Container(
                  height: 3,
                  decoration: const BoxDecoration(
                    color: EdCommerceTheme.accent,
                    borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
                  ),
                ),
              Expanded(
                flex: 3,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                  child: Container(
                    decoration: BoxDecoration(
                      color: EdCommerceTheme.accentSoft.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: EdCommerceTheme.line.withValues(alpha: 0.6)),
                    ),
                    padding: const EdgeInsets.all(8),
                    child: product.imageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: product.imageUrl!,
                            fit: BoxFit.contain,
                            memCacheWidth: 200,
                            placeholder: (_, __) => const Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                            errorWidget: (_, __, ___) => const Icon(Icons.inventory_2_outlined, color: AppColors.muted, size: 32),
                          )
                        : const Icon(Icons.inventory_2_outlined, color: AppColors.muted, size: 32),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, height: 1.3, color: Color(0xFF1E293B)),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(fmtMoney(product.price), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                        const Spacer(),
                        if (inDraft)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                            decoration: BoxDecoration(
                              color: EdCommerceTheme.accentSoft,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Text('مضاف', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                          ),
                      ],
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

class EdShopMetaBar extends StatelessWidget {
  const EdShopMetaBar({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
      child: Text(text, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
    );
  }
}

class EdShopPagination extends StatelessWidget {
  const EdShopPagination({
    super.key,
    required this.page,
    required this.pageCount,
    required this.onPage,
  });

  final int page;
  final int pageCount;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    if (pageCount <= 1) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _navBtn(Icons.chevron_right_rounded, page > 0 ? () => onPage(page - 1) : null),
          const SizedBox(width: 6),
          ..._pageButtons(),
          const SizedBox(width: 6),
          _navBtn(Icons.chevron_left_rounded, page < pageCount - 1 ? () => onPage(page + 1) : null),
        ],
      ),
    );
  }

  List<Widget> _pageButtons() {
    final pages = <int>{0, pageCount - 1, page, page - 1, page + 1}.where((p) => p >= 0 && p < pageCount).toList()..sort();
    final widgets = <Widget>[];
    int? prev;
    for (final p in pages) {
      if (prev != null && p - prev > 1) {
        widgets.add(const Padding(padding: EdgeInsets.symmetric(horizontal: 4), child: Text('…', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700))));
      }
      widgets.add(_pageBtn(p));
      prev = p;
    }
    return widgets;
  }

  Widget _pageBtn(int p) {
    final active = p == page;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: active ? EdCommerceTheme.accent : EdCommerceTheme.card,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: () => onPage(p),
          borderRadius: BorderRadius.circular(8),
          child: Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: active ? EdCommerceTheme.accent : EdCommerceTheme.line),
            ),
            child: Text('${p + 1}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: active ? Colors.white : AppColors.navy)),
          ),
        ),
      ),
    );
  }

  Widget _navBtn(IconData icon, VoidCallback? onTap) {
    return Material(
      color: EdCommerceTheme.card,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: Border.all(color: EdCommerceTheme.line)),
          child: Icon(icon, size: 20, color: onTap != null ? AppColors.navy : AppColors.borderStrong),
        ),
      ),
    );
  }
}

class EdShopOrderDock extends StatelessWidget {
  const EdShopOrderDock({super.key, required this.lineCount, required this.totalLabel, required this.onPressed});

  final int lineCount;
  final String totalLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.8))),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppColors.navy,
                borderRadius: BorderRadius.circular(14),
              ),
              alignment: Alignment.center,
              child: Text('$lineCount', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$lineCount أصناف في الفاتورة', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Color(0xFF1E293B))),
                  Text(totalLabel, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                ],
              ),
            ),
            Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                onTap: onPressed,
                borderRadius: BorderRadius.circular(14),
                child: Ink(
                  decoration: BoxDecoration(
                    color: AppColors.navy,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.receipt_long_rounded, color: Colors.white, size: 20),
                      SizedBox(width: 8),
                      Text('الفاتورة', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

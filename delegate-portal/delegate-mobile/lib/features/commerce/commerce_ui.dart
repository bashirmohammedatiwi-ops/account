import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
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
                      Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.3)),
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('اسم الزبون', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                const SizedBox(height: 2),
                Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.navy)),
                if (meta.isNotEmpty)
                  Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: onPick,
            style: FilledButton.styleFrom(
              backgroundColor: EdCommerceTheme.accent,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: const Text('اختيار', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
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
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: EdSearchField(hint: searchHint, onChanged: onSearchChanged),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 2,
            child: TextField(
              controller: barcodeController,
              decoration: InputDecoration(
                hintText: 'باركود',
                isDense: true,
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
          const SizedBox(width: 6),
          Material(
            color: EdCommerceTheme.cardTint,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              onTap: onBarcodeScan,
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: EdCommerceTheme.line)),
                child: Icon(Icons.document_scanner_outlined, color: EdCommerceTheme.accent, size: 22),
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
        color: EdCommerceTheme.panelBg,
        border: Border(
          left: BorderSide(color: EdCommerceTheme.accent.withValues(alpha: 0.25), width: 4),
          right: BorderSide(color: EdCommerceTheme.line),
        ),
      ),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: EdCommerceTheme.card,
                  shape: BoxShape.circle,
                  border: Border.all(color: EdCommerceTheme.line),
                  boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4))],
                ),
                child: Icon(Icons.inventory_2_outlined, size: 32, color: AppColors.muted.withValues(alpha: 0.55)),
              ),
              const SizedBox(height: 16),
              const Text('معلومات الصنف', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
              const SizedBox(height: 8),
              Text(
                'اختر منتجاً من الشبكة\nلعرض التفاصيل وإدخال الكميات',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted.withValues(alpha: 0.9), height: 1.55),
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
    required this.onDecQuant,
    required this.onIncQuant,
    required this.onDecBonus,
    required this.onIncBonus,
    required this.notesController,
    required this.onNotesChanged,
  });

  final Product product;
  final String sectionName;
  final num quant;
  final num bonus;
  final VoidCallback onDecQuant;
  final VoidCallback onIncQuant;
  final VoidCallback onDecBonus;
  final VoidCallback onIncBonus;
  final TextEditingController notesController;
  final ValueChanged<String> onNotesChanged;

  @override
  Widget build(BuildContext context) {
    final lineTotal = quant * product.price;
    final stock = product.stockHint;
    final code = product.barcode ?? product.skuNum ?? '—';

    return Container(
      decoration: BoxDecoration(
        color: EdCommerceTheme.panelBg,
        border: Border(
          left: BorderSide(color: EdCommerceTheme.accent, width: 4),
          right: BorderSide(color: EdCommerceTheme.line),
        ),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.05), blurRadius: 16, offset: const Offset(4, 0))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            color: EdCommerceTheme.panelHeader,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.info_outline_rounded, color: Colors.white, size: 16),
                    SizedBox(width: 6),
                    Text('معلومات الصنف', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
                  ],
                ),
                if (stock != null && stock.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                    child: Text('كمية المخزون: $stock', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: Container(
                      decoration: BoxDecoration(
                        color: EdCommerceTheme.card,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: EdCommerceTheme.line),
                        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2))],
                      ),
                      padding: const EdgeInsets.all(12),
                      child: _productImage(product),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(product.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.4)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _chip(Icons.qr_code_2_rounded, code, mono: true),
                      _chip(Icons.category_outlined, sectionName),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: EdCommerceTheme.card,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: EdCommerceTheme.line),
                    ),
                    child: Row(
                      children: [
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('سعر الجملة', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                              SizedBox(height: 4),
                            ],
                          ),
                        ),
                        Text(fmtMoney(product.price), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: EdCommerceTheme.accentSoft,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: EdCommerceTheme.accent.withValues(alpha: 0.2)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('المجموع الاجمالي', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                        Text(fmtMoney(lineTotal), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  EdShopQtyRow(label: 'وحدة', value: fmtQty(quant), gift: false, onDec: onDecQuant, onInc: onIncQuant),
                  const SizedBox(height: 10),
                  EdShopQtyRow(label: 'عينة', value: fmtQty(bonus), gift: true, onDec: onDecBonus, onInc: onIncBonus),
                  const SizedBox(height: 14),
                  const Text('ملاحظات', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: notesController,
                    onChanged: onNotesChanged,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'اختياري...',
                      isDense: true,
                      filled: true,
                      fillColor: EdCommerceTheme.card,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.accent.withValues(alpha: 0.5))),
                    ),
                  ),
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
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: EdCommerceTheme.card,
        borderRadius: BorderRadius.circular(8),
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
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
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

class EdShopQtyRow extends StatelessWidget {
  const EdShopQtyRow({
    super.key,
    required this.label,
    required this.value,
    required this.gift,
    required this.onDec,
    required this.onInc,
  });

  final String label;
  final String value;
  final bool gift;
  final VoidCallback onDec;
  final VoidCallback onInc;

  @override
  Widget build(BuildContext context) {
    final bg = gift ? EdCommerceTheme.giftBg : EdCommerceTheme.card;
    final border = gift ? EdCommerceTheme.giftBorder : EdCommerceTheme.line;
    final fg = gift ? EdCommerceTheme.giftFg : AppColors.navy;

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: border),
      ),
      child: Column(
        children: [
          Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: gift ? EdCommerceTheme.giftFg : AppColors.muted)),
          const SizedBox(height: 8),
          Row(
            children: [
              _qtyBtn(Icons.remove_rounded, onDec, fg),
              Expanded(
                child: Text(value, textAlign: TextAlign.center, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: fg)),
              ),
              _qtyBtn(Icons.add_rounded, onInc, fg),
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
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: EdCommerceTheme.line),
            boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.04), blurRadius: 4, offset: const Offset(0, 1))],
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
    final borderColor = selected ? EdCommerceTheme.selectedBorder : (inDraft ? EdCommerceTheme.accent.withValues(alpha: 0.5) : EdCommerceTheme.line);

    return Material(
      color: EdCommerceTheme.card,
      borderRadius: BorderRadius.circular(AppColors.radiusSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            border: Border.all(color: borderColor, width: selected ? 2 : 1),
            boxShadow: selected ? [BoxShadow(color: EdCommerceTheme.selectedGlow, blurRadius: 0, spreadRadius: 1)] : null,
          ),
          padding: const EdgeInsets.all(8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Container(
                  decoration: BoxDecoration(
                    color: EdCommerceTheme.cardTint,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: EdCommerceTheme.line),
                  ),
                  padding: const EdgeInsets.all(6),
                  child: product.imageUrl != null
                      ? CachedNetworkImage(
                          imageUrl: product.imageUrl!,
                          fit: BoxFit.contain,
                          memCacheWidth: 160,
                          placeholder: (_, __) => const Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
                          errorWidget: (_, __, ___) => const Icon(Icons.inventory_2_outlined, color: AppColors.muted),
                        )
                      : const Icon(Icons.inventory_2_outlined, color: AppColors.muted),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                product.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, height: 1.25, color: AppColors.navy),
              ),
              if (inDraft)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: EdCommerceTheme.accentSoft, borderRadius: BorderRadius.circular(999)),
                    child: const Text('في الطلب', textAlign: TextAlign.center, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
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
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: BoxDecoration(
        color: EdCommerceTheme.dockBg,
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 12, offset: const Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: FilledButton(
                onPressed: lineCount > 0 ? onPressed : null,
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: EdCommerceTheme.dockBg,
                  disabledBackgroundColor: Colors.white.withValues(alpha: 0.35),
                  disabledForegroundColor: Colors.white70,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.receipt_long_rounded, size: 20),
                    const SizedBox(width: 8),
                    Text('عرض الطلبية · $totalLabel', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  ],
                ),
              ),
            ),
            if (lineCount > 0) ...[
              const SizedBox(width: 10),
              Container(
                width: 36,
                height: 36,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: EdCommerceTheme.accent, shape: BoxShape.circle),
                child: Text('$lineCount', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 13)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

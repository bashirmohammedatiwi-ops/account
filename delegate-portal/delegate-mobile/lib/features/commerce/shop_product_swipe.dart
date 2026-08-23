import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/utils/formatters.dart';
import '../../models/models.dart';
import 'commerce_theme.dart';
import 'commerce_ui.dart';

/// بطاقة منتج كاملة — تمرير أفقي، متجاوبة مع iPad
class EdShopSwipeProductCard extends StatelessWidget {
  const EdShopSwipeProductCard({
    super.key,
    required this.product,
    required this.sectionName,
    required this.quant,
    required this.bonus,
    required this.tester,
    required this.inDraft,
    required this.wide,
    required this.onDecQuant,
    required this.onIncQuant,
    required this.onDecBonus,
    required this.onIncBonus,
    required this.onDecTester,
    required this.onIncTester,
    required this.onSetQuant,
    required this.onSetBonus,
    required this.onSetTester,
  });

  final Product product;
  final String sectionName;
  final num quant;
  final num bonus;
  final num tester;
  final bool inDraft;
  final bool wide;
  final VoidCallback onDecQuant;
  final VoidCallback onIncQuant;
  final VoidCallback onDecBonus;
  final VoidCallback onIncBonus;
  final VoidCallback onDecTester;
  final VoidCallback onIncTester;
  final ValueChanged<num> onSetQuant;
  final ValueChanged<num> onSetBonus;
  final ValueChanged<num> onSetTester;

  @override
  Widget build(BuildContext context) {
    final lineTotal = quant * product.price;
    final code = product.barcode ?? product.skuNum ?? '—';

    final imageBlock = _ProductImageBlock(product: product, wide: wide);
    final infoBlock = _ProductInfoBlock(
      product: product,
      sectionName: sectionName,
      code: code,
      lineTotal: lineTotal,
      inDraft: inDraft,
    );
    final qtyBlock = _ProductQtyBlock(
      quant: quant,
      bonus: bonus,
      tester: tester,
      wide: wide,
      onDecQuant: onDecQuant,
      onIncQuant: onIncQuant,
      onDecBonus: onDecBonus,
      onIncBonus: onIncBonus,
      onDecTester: onDecTester,
      onIncTester: onIncTester,
      onSetQuant: onSetQuant,
      onSetBonus: onSetBonus,
      onSetTester: onSetTester,
    );

    return Padding(
      padding: EdgeInsets.fromLTRB(wide ? 20 : 12, 4, wide ? 20 : 12, 8),
      child: Material(
        color: Colors.transparent,
        elevation: 0,
        shadowColor: Colors.transparent,
        borderRadius: BorderRadius.circular(wide ? AppColors.radius2xl : AppColors.radiusXl),
        child: Container(
          decoration: BoxDecoration(
            color: EdCommerceTheme.card,
            borderRadius: BorderRadius.circular(wide ? AppColors.radius2xl : AppColors.radiusXl),
            border: Border.all(color: inDraft ? EdCommerceTheme.accent.withValues(alpha: 0.45) : EdCommerceTheme.line, width: inDraft ? 2 : 1),
            boxShadow: inDraft ? AppColors.elevatedShadow : AppColors.cardShadow,
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                height: 4,
                color: inDraft ? EdCommerceTheme.accent : EdCommerceTheme.accent.withValues(alpha: 0.35),
              ),
              Expanded(
                child: wide
                    ? Padding(
                        padding: const EdgeInsets.all(20),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(flex: 5, child: imageBlock),
                            const SizedBox(width: 20),
                            Expanded(
                              flex: 6,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Expanded(child: infoBlock),
                                  const SizedBox(height: 12),
                                  qtyBlock,
                                ],
                              ),
                            ),
                          ],
                        ),
                      )
                    : Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(flex: 5, child: imageBlock),
                            const SizedBox(height: 12),
                            infoBlock,
                            const SizedBox(height: 12),
                            qtyBlock,
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProductImageBlock extends StatelessWidget {
  const _ProductImageBlock({required this.product, required this.wide});

  final Product product;
  final bool wide;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: EdCommerceTheme.accentSoft,
        borderRadius: BorderRadius.circular(wide ? AppColors.radiusLg : AppColors.radius),
        border: Border.all(color: EdCommerceTheme.line.withValues(alpha: 0.8)),
      ),
      padding: EdgeInsets.all(wide ? 16 : 10),
      child: product.imageUrl != null
          ? CachedNetworkImage(
              imageUrl: product.imageUrl!,
              fit: BoxFit.contain,
              memCacheWidth: wide ? 480 : 320,
              placeholder: (_, __) => const Center(child: CircularProgressIndicator(strokeWidth: 2, color: EdCommerceTheme.accent)),
              errorWidget: (_, __, ___) => const Icon(Icons.inventory_2_outlined, size: 56, color: AppColors.muted),
            )
          : const Center(child: Icon(Icons.inventory_2_outlined, size: 56, color: AppColors.muted)),
    );
  }
}

class _ProductInfoBlock extends StatelessWidget {
  const _ProductInfoBlock({
    required this.product,
    required this.sectionName,
    required this.code,
    required this.lineTotal,
    required this.inDraft,
  });

  final Product product;
  final String sectionName;
  final String code;
  final num lineTotal;
  final bool inDraft;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (inDraft)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: EdCommerceTheme.accent,
              borderRadius: BorderRadius.circular(999),
            ),
            child: const Text('في الفاتورة', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: Colors.white)),
          ),
        Text(product.name, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.35)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            _metaChip(Icons.category_outlined, sectionName),
            _metaChip(Icons.qr_code_2_rounded, code, mono: true),
            if (product.stockHint != null && product.stockHint!.isNotEmpty) _metaChip(Icons.inventory_outlined, 'مخزون: ${product.stockHint}'),
          ],
        ),
        const Spacer(),
        Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('سعر الجملة', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                Text(fmtMoney(product.price), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent)),
              ],
            ),
            const Spacer(),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('المجموع', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                Text(fmtMoney(lineTotal), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ],
            ),
          ],
        ),
      ],
    );
  }

  Widget _metaChip(IconData icon, String text, {bool mono = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: EdCommerceTheme.cardTint,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: EdCommerceTheme.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: AppColors.muted),
          const SizedBox(width: 4),
          Text(text, textDirection: mono ? TextDirection.ltr : TextDirection.rtl, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
        ],
      ),
    );
  }
}

class _ProductQtyBlock extends StatelessWidget {
  const _ProductQtyBlock({
    required this.quant,
    required this.bonus,
    required this.tester,
    required this.wide,
    required this.onDecQuant,
    required this.onIncQuant,
    required this.onDecBonus,
    required this.onIncBonus,
    required this.onDecTester,
    required this.onIncTester,
    required this.onSetQuant,
    required this.onSetBonus,
    required this.onSetTester,
  });

  final num quant;
  final num bonus;
  final num tester;
  final bool wide;
  final VoidCallback onDecQuant;
  final VoidCallback onIncQuant;
  final VoidCallback onDecBonus;
  final VoidCallback onIncBonus;
  final VoidCallback onDecTester;
  final VoidCallback onIncTester;
  final ValueChanged<num> onSetQuant;
  final ValueChanged<num> onSetBonus;
  final ValueChanged<num> onSetTester;

  @override
  Widget build(BuildContext context) {
    final children = [
      EdShopQtyRow(label: 'الكمية', amount: quant, kind: EdShopQtyKind.unit, onDec: onDecQuant, onInc: onIncQuant, onSetValue: onSetQuant),
      EdShopQtyRow(label: 'الهدايا', amount: bonus, kind: EdShopQtyKind.gift, onDec: onDecBonus, onInc: onIncBonus, onSetValue: onSetBonus),
      EdShopQtyRow(label: 'التيستر', amount: tester, kind: EdShopQtyKind.tester, onDec: onDecTester, onInc: onIncTester, onSetValue: onSetTester),
    ];

    if (wide) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children.map((w) => Expanded(child: Padding(padding: const EdgeInsets.only(left: 8), child: w))).toList(),
      );
    }

    return Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          children[i],
        ],
      ],
    );
  }
}
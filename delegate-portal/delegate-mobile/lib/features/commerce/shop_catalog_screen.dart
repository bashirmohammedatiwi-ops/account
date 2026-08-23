import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/delegate_api.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/debounce.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../core/widgets/phone_ui.dart';
import '../../models/models.dart';
import 'commerce_draft.dart';
import 'commerce_screens.dart';
import 'commerce_theme.dart';
import 'commerce_ui.dart';

/// كتالوج المنتجات — أقسام فرعية بالأعلى + شبكة + لوحة تفاصيل (iPad)
class ShopCatalogScreen extends ConsumerStatefulWidget {
  const ShopCatalogScreen({super.key, this.initialBranchId, this.initialSectionId});

  final int? initialBranchId;
  final int? initialSectionId;

  @override
  ConsumerState<ShopCatalogScreen> createState() => _ShopCatalogScreenState();
}

class _ShopCatalogScreenState extends ConsumerState<ShopCatalogScreen> {
  int? _branchId;
  int? _sectionId;
  int? _selectedProductId;
  String _filter = '';
  String _filterApplied = '';
  final _barcodeCtrl = TextEditingController();
  final _debouncer = Debouncer();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    _debouncer.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    final agentId = ref.read(authProvider).agent?.id;
    final notifier = ref.read(invoiceDraftProvider.notifier);
    if (agentId != null) await notifier.load(agentId);

    var branchId = widget.initialBranchId ?? notifier.branchId;
    var sectionId = widget.initialSectionId ?? notifier.sectionId;

    if (branchId == null) {
      if (mounted) context.go('/shop');
      return;
    }

    final branches = await ref.read(catalogBranchesProvider.future);
    final sections = await ref.read(catalogSectionsProvider(branchId).future);
    if (sectionId == null && sections.isNotEmpty) sectionId = sections.first.id;

    notifier.branchId = branchId;
    notifier.sectionId = sectionId;
    notifier.branchName = branches.where((b) => b.id == branchId).map((b) => b.name).firstOrNull;
    notifier.sectionName = sections.where((s) => s.id == sectionId).map((s) => s.name).firstOrNull;
    if (agentId != null) await notifier.persist(agentId);

    if (!mounted) return;
    setState(() {
      _branchId = branchId;
      _sectionId = sectionId;
      _ready = true;
    });
  }

  Future<void> _persistDraft() async {
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) await ref.read(invoiceDraftProvider.notifier).persist(agentId);
  }

  Future<void> _pickCustomer() async {
    final branch = await pickBranchCustomer(context, ref);
    if (branch != null) {
      ref.read(invoiceDraftProvider.notifier).customer = branch;
      await _persistDraft();
      if (mounted) setState(() {});
    }
  }

  Future<void> _selectSection(int sectionId, List<CatalogSection> sections) async {
    final notifier = ref.read(invoiceDraftProvider.notifier);
    notifier.sectionId = sectionId;
    notifier.sectionName = sections.firstWhere((s) => s.id == sectionId).name;
    await _persistDraft();
    if (!mounted) return;
    setState(() {
      _sectionId = sectionId;
      _selectedProductId = null;
    });
    context.go('/shop/$_branchId/sections/$sectionId/products');
  }

  void _adjust(Product product, String field, int delta) {
    ref.read(invoiceDraftProvider.notifier).adjustLine(product.id, field: field, delta: delta);
    _persistDraft();
    setState(() {});
  }

  void _setField(Product product, String field, num value) {
    final notifier = ref.read(invoiceDraftProvider.notifier);
    final cur = ref.read(invoiceDraftProvider)[product.id] ?? emptyDraftLine();
    final clamped = value.clamp(0, 999999);
    switch (field) {
      case 'bonus':
        notifier.updateLine(product.id, quant: cur.quant, bonus: clamped, tester: cur.tester);
      case 'tester':
        notifier.updateLine(product.id, quant: cur.quant, bonus: cur.bonus, tester: clamped);
      default:
        notifier.updateLine(product.id, quant: clamped, bonus: cur.bonus, tester: cur.tester);
    }
    _persistDraft();
    setState(() {});
  }

  Future<void> _lookupBarcode(List<Product> products) async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty || _branchId == null) return;
    try {
      final product = await ref.read(apiClientProvider).lookupProduct(code, branchId: _branchId);
      _selectProduct(product.id, products);
      final cur = ref.read(invoiceDraftProvider)[product.id] ?? emptyDraftLine();
      ref.read(invoiceDraftProvider.notifier).updateLine(product.id, quant: cur.quant + 1);
      await _persistDraft();
      _barcodeCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${product.name} +1'), behavior: SnackBarBehavior.floating));
        setState(() {});
      }
    } catch (_) {
      final local = products.where((p) => (p.barcode ?? '').contains(code) || (p.skuNum ?? '').contains(code)).toList();
      if (local.length == 1) {
        final p = local.first;
        _selectProduct(p.id, products);
        final cur = ref.read(invoiceDraftProvider)[p.id] ?? emptyDraftLine();
        ref.read(invoiceDraftProvider.notifier).updateLine(p.id, quant: cur.quant + 1);
        await _persistDraft();
        _barcodeCtrl.clear();
        if (mounted) setState(() {});
      }
    }
  }

  void _selectProduct(int id, List<Product> products) {
    if (!products.any((p) => p.id == id)) return;
    setState(() => _selectedProductId = id);
    if (!EdLayout.of(context).isTablet) {
      final product = products.firstWhere((p) => p.id == id);
      final line = ref.read(invoiceDraftProvider)[id] ?? emptyDraftLine();
      final sectionName = ref.read(invoiceDraftProvider.notifier).sectionName ?? '';
      _openProductSheet(product, sectionName, line);
    }
  }

  Future<void> _openProductSheet(Product product, String sectionName, DraftLine line) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.72,
        minChildSize: 0.45,
        maxChildSize: 0.92,
        expand: false,
        builder: (_, scrollCtrl) => Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            boxShadow: AppColors.elevatedShadow,
          ),
          child: EdShopProductDetailPanel(
            product: product,
            sectionName: sectionName,
            quant: line.quant,
            bonus: line.bonus,
            tester: line.tester,
            scrollController: scrollCtrl,
            onDecQuant: () => _adjust(product, 'quant', -1),
            onIncQuant: () => _adjust(product, 'quant', 1),
            onDecBonus: () => _adjust(product, 'bonus', -1),
            onIncBonus: () => _adjust(product, 'bonus', 1),
            onDecTester: () => _adjust(product, 'tester', -1),
            onIncTester: () => _adjust(product, 'tester', 1),
            onSetQuant: (v) => _setField(product, 'quant', v),
            onSetBonus: (v) => _setField(product, 'bonus', v),
            onSetTester: (v) => _setField(product, 'tester', v),
          ),
        ),
      ),
    );
    if (mounted) setState(() {});
  }

  num _total(List<Product> products, Map<int, DraftLine> draft) {
    num t = 0;
    for (final p in products) {
      final d = draft[p.id];
      if (d != null && d.quant > 0) t += d.quant * p.price;
    }
    return t;
  }

  int _lineCount(Map<int, DraftLine> draft) => draft.values.where(draftLineActive).length;

  Future<void> _openInvoiceSheet(List<Product> products) async {
    if (_branchId == null) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EdOrderInvoiceSheet(branchId: _branchId!, products: products),
    );
  }

  List<Product> _filterProducts(List<Product> products) {
    final q = _filterApplied.toLowerCase();
    if (q.isEmpty) return products;
    return products
        .where((p) => p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q) || (p.skuNum ?? '').contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready || _branchId == null || _sectionId == null) {
      return AppPage(
        title: 'المنتجات',
        showBack: true,
        onBack: () => context.go('/shop'),
        child: const LoadingView(message: 'جاري تحميل المنتجات...'),
      );
    }

    final branchesAsync = ref.watch(catalogBranchesProvider);
    final sectionsAsync = ref.watch(catalogSectionsProvider(_branchId!));
    final productsAsync = ref.watch(catalogProductsProvider(_sectionId!));
    final draft = ref.watch(invoiceDraftProvider);
    final customer = ref.read(invoiceDraftProvider.notifier).customer;
    final layout = EdLayout.of(context);

    final branchName = branchesAsync.valueOrNull?.where((b) => b.id == _branchId).map((b) => b.name).firstOrNull ?? '';
    final sectionName = sectionsAsync.valueOrNull?.where((s) => s.id == _sectionId).map((s) => s.name).firstOrNull ?? '';

    return AppPage(
      title: branchName,
      kicker: 'المنتجات',
      subtitle: sectionName,
      showBack: true,
      onBack: () => context.go('/shop'),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EdShopCustomerBar(
              customer: customer,
              branchLabel: branchName,
              onPick: _pickCustomer,
            ),
            EdShopBranchStrip(
              branchName: branchName,
              onChangeBranch: () => context.go('/shop'),
            ),
            sectionsAsync.when(
              loading: () => const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator(color: EdCommerceTheme.accent)),
              error: (e, _) => Padding(padding: const EdgeInsets.all(12), child: Text('$e', style: const TextStyle(color: AppColors.danger))),
              data: (sections) => EdShopSectionTabs(
                sections: sections,
                selectedId: _sectionId!,
                onSelect: (id) => _selectSection(id, sections),
              ),
            ),
            EdShopToolbar(
              searchHint: 'بحث بالاسم أو الباركود...',
              onSearchChanged: (v) {
                _filter = v.trim();
                _debouncer.run(() {
                  if (mounted) setState(() {
                    _filterApplied = _filter;
                    _selectedProductId = null;
                  });
                });
              },
              barcodeController: _barcodeCtrl,
              onBarcodeSubmit: () => productsAsync.whenData(_lookupBarcode),
              onBarcodeScan: () => productsAsync.whenData(_lookupBarcode),
            ),
            Expanded(
              child: productsAsync.when(
                loading: () => const LoadingView(message: 'جاري تحميل المنتجات...'),
                error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogProductsProvider(_sectionId!))),
                data: (products) {
                  final filtered = _filterProducts(products);
                  if (filtered.isEmpty) {
                    return const EmptyState(message: 'لا توجد منتجات في هذا التصنيف', icon: Icons.inventory_2_outlined);
                  }

                  final selected = _selectedProductId != null
                      ? filtered.cast<Product?>().firstWhere((p) => p!.id == _selectedProductId, orElse: () => null)
                      : null;
                  final selectedLine = selected != null ? draft[selected.id] ?? emptyDraftLine() : emptyDraftLine();

                  if (layout.isTablet) {
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          flex: 55,
                          child: _ProductGrid(
                            products: filtered,
                            draft: draft,
                            selectedId: _selectedProductId,
                            crossAxisCount: layout.isDesktop ? 4 : 3,
                            onTap: (p) => _selectProduct(p.id, filtered),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 45,
                          child: Padding(
                            padding: const EdgeInsets.only(top: 8, right: 12, bottom: 8),
                            child: selected != null
                                ? EdShopProductDetailPanel(
                                    product: selected,
                                    sectionName: sectionName,
                                    quant: selectedLine.quant,
                                    bonus: selectedLine.bonus,
                                    tester: selectedLine.tester,
                                    onDecQuant: () => _adjust(selected, 'quant', -1),
                                    onIncQuant: () => _adjust(selected, 'quant', 1),
                                    onDecBonus: () => _adjust(selected, 'bonus', -1),
                                    onIncBonus: () => _adjust(selected, 'bonus', 1),
                                    onDecTester: () => _adjust(selected, 'tester', -1),
                                    onIncTester: () => _adjust(selected, 'tester', 1),
                                    onSetQuant: (v) => _setField(selected, 'quant', v),
                                    onSetBonus: (v) => _setField(selected, 'bonus', v),
                                    onSetTester: (v) => _setField(selected, 'tester', v),
                                  )
                                : const EdShopProductDetailPlaceholder(),
                          ),
                        ),
                      ],
                    );
                  }

                  return _ProductGrid(
                    products: filtered,
                    draft: draft,
                    selectedId: _selectedProductId,
                    crossAxisCount: 2,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    onTap: (p) => _selectProduct(p.id, filtered),
                  );
                },
              ),
            ),
            productsAsync.maybeWhen(
              data: (products) => EdShopOrderDock(
                lineCount: _lineCount(draft),
                totalLabel: fmtMoney(_total(products, draft)),
                onPressed: () => _openInvoiceSheet(products),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
            if (layout.isPhone) const SizedBox(height: kPhoneBottomInset - 80),
          ],
        ),
      ),
    );
  }
}

class _ProductGrid extends StatelessWidget {
  const _ProductGrid({
    required this.products,
    required this.draft,
    required this.selectedId,
    required this.crossAxisCount,
    required this.onTap,
    this.padding,
  });

  final List<Product> products;
  final Map<int, DraftLine> draft;
  final int? selectedId;
  final int crossAxisCount;
  final ValueChanged<Product> onTap;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: padding ?? const EdgeInsets.fromLTRB(12, 8, 12, 8),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.78,
      ),
      itemCount: products.length,
      itemBuilder: (_, i) {
        final p = products[i];
        final line = draft[p.id] ?? emptyDraftLine();
        return EdShopProductTile(
          product: p,
          selected: selectedId == p.id,
          inDraft: draftLineActive(line),
          onTap: () => onTap(p),
        );
      },
    );
  }
}

/// شريط الأقسام الفرعية
class EdShopSectionTabs extends StatelessWidget {
  const EdShopSectionTabs({super.key, required this.sections, required this.selectedId, required this.onSelect});

  final List<CatalogSection> sections;
  final int selectedId;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    if (sections.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.7))),
        boxShadow: AppColors.softShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('الأقسام الفرعية', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.muted)),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: sections.map((s) {
                final active = s.id == selectedId;
                return Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      onTap: () => onSelect(s.id),
                      borderRadius: BorderRadius.circular(14),
                      child: Ink(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: active ? EdCommerceTheme.accentSoft : AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: active ? EdCommerceTheme.accent.withValues(alpha: 0.35) : EdCommerceTheme.line),
                          boxShadow: active ? [BoxShadow(color: EdCommerceTheme.accent.withValues(alpha: 0.12), blurRadius: 10, offset: const Offset(0, 4))] : null,
                        ),
                        child: Text(
                          s.name,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: active ? EdCommerceTheme.accent : const Color(0xFF475569),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

/// شريط القسم الرئيسي المختار
class EdShopBranchStrip extends StatelessWidget {
  const EdShopBranchStrip({super.key, required this.branchName, required this.onChangeBranch});

  final String branchName;
  final VoidCallback onChangeBranch;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: EdCommerceTheme.accentSoft.withValues(alpha: 0.5),
      child: Row(
        children: [
          Icon(Icons.storefront_rounded, size: 18, color: EdCommerceTheme.accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              branchName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Color(0xFF1E293B)),
            ),
          ),
          TextButton.icon(
            onPressed: onChangeBranch,
            icon: const Icon(Icons.swap_horiz_rounded, size: 18),
            label: const Text('تغيير القسم'),
            style: TextButton.styleFrom(
              foregroundColor: EdCommerceTheme.accent,
              textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

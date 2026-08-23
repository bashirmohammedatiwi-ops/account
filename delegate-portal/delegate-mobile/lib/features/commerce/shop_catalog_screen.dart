import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/debounce.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/customer_picker.dart';
import '../../models/models.dart';
import 'commerce_draft.dart';
import 'commerce_screens.dart';
import 'commerce_theme.dart';
import 'commerce_ui.dart';
import 'shop_product_swipe.dart';

/// واجهة المنتجات الموحّدة — تصنيفات بالأعلى + تمرير أفقي بين المنتجات
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
  int _productIndex = 0;
  String _filter = '';
  String _filterApplied = '';
  final _pageCtrl = PageController();
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
    _pageCtrl.dispose();
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

    final branches = await ref.read(catalogBranchesProvider.future);
    if (branchId == null && branches.isNotEmpty) branchId = branches.first.id;

    if (branchId != null) {
      final sections = await ref.read(catalogSectionsProvider(branchId).future);
      if (sectionId == null && sections.isNotEmpty) sectionId = sections.first.id;
      notifier.branchId = branchId;
      notifier.sectionId = sectionId;
      notifier.branchName = branches.where((b) => b.id == branchId).map((b) => b.name).firstOrNull;
      notifier.sectionName = sections.where((s) => s.id == sectionId).map((s) => s.name).firstOrNull;
      if (agentId != null) await notifier.persist(agentId);
    }

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

  Future<void> _selectBranch(int branchId, List<CatalogBranch> branches) async {
    final sections = await ref.read(catalogSectionsProvider(branchId).future);
    final sectionId = sections.isNotEmpty ? sections.first.id : null;
    final notifier = ref.read(invoiceDraftProvider.notifier);
    notifier.branchId = branchId;
    notifier.sectionId = sectionId;
    notifier.branchName = branches.firstWhere((b) => b.id == branchId).name;
    notifier.sectionName = sections.isNotEmpty ? sections.first.name : null;
    await _persistDraft();
    if (!mounted) return;
    setState(() {
      _branchId = branchId;
      _sectionId = sectionId;
      _productIndex = 0;
    });
    if (_pageCtrl.hasClients) _pageCtrl.jumpToPage(0);
  }

  Future<void> _selectSection(int sectionId, List<CatalogSection> sections) async {
    final notifier = ref.read(invoiceDraftProvider.notifier);
    notifier.sectionId = sectionId;
    notifier.sectionName = sections.firstWhere((s) => s.id == sectionId).name;
    await _persistDraft();
    if (!mounted) return;
    setState(() {
      _sectionId = sectionId;
      _productIndex = 0;
    });
    if (_pageCtrl.hasClients) _pageCtrl.jumpToPage(0);
  }

  void _adjust(Product product, String field, int delta) {
    ref.read(invoiceDraftProvider.notifier).adjustLine(product.id, field: field, delta: delta);
    _persistDraft();
    setState(() {});
  }

  Future<void> _lookupBarcode(List<Product> products) async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty || _branchId == null) return;
    try {
      final product = await ref.read(apiClientProvider).lookupProduct(code, branchId: _branchId);
      _jumpToProduct(product.id, products);
      final cur = ref.read(invoiceDraftProvider)[product.id] ?? emptyDraftLine();
      ref.read(invoiceDraftProvider.notifier).updateLine(product.id, quant: cur.quant + 1);
      await _persistDraft();
      _barcodeCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${product.name} +1')));
        setState(() {});
      }
    } catch (_) {
      final local = products.where((p) => (p.barcode ?? '').contains(code) || (p.skuNum ?? '').contains(code)).toList();
      if (local.length == 1) {
        final p = local.first;
        _jumpToProduct(p.id, products);
        final cur = ref.read(invoiceDraftProvider)[p.id] ?? emptyDraftLine();
        ref.read(invoiceDraftProvider.notifier).updateLine(p.id, quant: cur.quant + 1);
        await _persistDraft();
        _barcodeCtrl.clear();
        if (mounted) setState(() {});
      }
    }
  }

  void _jumpToProduct(int id, List<Product> products) {
    final idx = products.indexWhere((p) => p.id == id);
    if (idx < 0) return;
    setState(() => _productIndex = idx);
    if (_pageCtrl.hasClients) _pageCtrl.animateToPage(idx, duration: const Duration(milliseconds: 280), curve: Curves.easeOut);
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
        kicker: 'عرض وطلب',
        showBack: true,
        onBack: () => context.go('/home'),
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
      title: 'المنتجات',
      kicker: 'عرض وطلب',
      subtitle: [branchName, sectionName].where((s) => s.isNotEmpty).join(' · '),
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EdShopCustomerBar(
              customer: customer,
              branchLabel: [branchName, sectionName].where((s) => s.isNotEmpty).join(' / '),
              onPick: _pickCustomer,
            ),
            branchesAsync.when(
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
              data: (branches) {
                if (branches.length <= 1) return const SizedBox.shrink();
                return EdShopBranchBar(
                  branches: branches,
                  selectedId: _branchId!,
                  onSelect: (id) => _selectBranch(id, branches),
                );
              },
            ),
            sectionsAsync.when(
              loading: () => const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator(color: EdCommerceTheme.accent)),
              error: (e, _) => Padding(padding: const EdgeInsets.all(12), child: Text('$e', style: const TextStyle(color: AppColors.danger))),
              data: (sections) => EdShopCategoryBar(
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
                  if (mounted) {
                    setState(() {
                      _filterApplied = _filter;
                      _productIndex = 0;
                    });
                    if (_pageCtrl.hasClients) _pageCtrl.jumpToPage(0);
                  }
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
                  final safeIndex = _productIndex.clamp(0, filtered.length - 1);
                  if (safeIndex != _productIndex) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted) setState(() => _productIndex = safeIndex);
                    });
                  }

                  return Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: EdCommerceTheme.accentSoft,
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: EdCommerceTheme.line),
                              ),
                              child: Text(
                                '${filtered.length} منتج',
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: EdCommerceTheme.accent),
                              ),
                            ),
                            const Spacer(),
                            Icon(Icons.swipe_rounded, size: 16, color: AppColors.muted.withValues(alpha: 0.8)),
                            const SizedBox(width: 4),
                            Text(
                              'مرّر يميناً ويساراً',
                              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted.withValues(alpha: 0.9)),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: PageView.builder(
                          controller: _pageCtrl,
                          itemCount: filtered.length,
                          onPageChanged: (i) => setState(() => _productIndex = i),
                          itemBuilder: (_, i) {
                            final p = filtered[i];
                            final line = draft[p.id] ?? emptyDraftLine();
                            return EdShopSwipeProductCard(
                              product: p,
                              sectionName: sectionName,
                              quant: line.quant,
                              bonus: line.bonus,
                              tester: line.tester,
                              inDraft: draftLineActive(line),
                              wide: layout.isTablet,
                              onDecQuant: () => _adjust(p, 'quant', -1),
                              onIncQuant: () => _adjust(p, 'quant', 1),
                              onDecBonus: () => _adjust(p, 'bonus', -1),
                              onIncBonus: () => _adjust(p, 'bonus', 1),
                              onDecTester: () => _adjust(p, 'tester', -1),
                              onIncTester: () => _adjust(p, 'tester', 1),
                            );
                          },
                        ),
                      ),
                      EdShopProductDots(count: filtered.length, index: safeIndex),
                    ],
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
          ],
        ),
      ),
    );
  }
}

/// شريط فروع المنتجات
class EdShopBranchBar extends StatelessWidget {
  const EdShopBranchBar({super.key, required this.branches, required this.selectedId, required this.onSelect});

  final List<CatalogBranch> branches;
  final int selectedId;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            const Icon(Icons.store_mall_directory_outlined, size: 18, color: AppColors.muted),
            const SizedBox(width: 8),
            ...branches.map((b) {
              final active = b.id == selectedId;
              return Padding(
                padding: const EdgeInsets.only(left: 8),
                child: FilterChip(
                  label: Text(b.name),
                  selected: active,
                  onSelected: (_) => onSelect(b.id),
                  selectedColor: EdCommerceTheme.accentSoft,
                  checkmarkColor: EdCommerceTheme.accent,
                  labelStyle: TextStyle(fontWeight: FontWeight.w800, color: active ? EdCommerceTheme.accent : AppColors.textSecondary),
                  side: BorderSide(color: active ? EdCommerceTheme.accent.withValues(alpha: 0.4) : EdCommerceTheme.line),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}

/// شريط تصنيفات (أقسام) المنتجات
class EdShopCategoryBar extends StatelessWidget {
  const EdShopCategoryBar({super.key, required this.sections, required this.selectedId, required this.onSelect});

  final List<CatalogSection> sections;
  final int selectedId;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    if (sections.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface.withValues(alpha: 0.92),
        border: Border(bottom: BorderSide(color: EdCommerceTheme.line.withValues(alpha: 0.8))),
        boxShadow: AppColors.softShadow,
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 4,
                height: 16,
                decoration: BoxDecoration(
                  gradient: EdCommerceTheme.accentGradient,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              const SizedBox(width: 8),
              const Text('التصنيفات', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.navy)),
            ],
          ),
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
                    borderRadius: BorderRadius.circular(999),
                    child: InkWell(
                      onTap: () => onSelect(s.id),
                      borderRadius: BorderRadius.circular(999),
                      child: Ink(
                        decoration: BoxDecoration(
                          gradient: active ? EdCommerceTheme.accentGradient : null,
                          color: active ? null : AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: active ? Colors.transparent : EdCommerceTheme.line),
                          boxShadow: active ? [BoxShadow(color: EdCommerceTheme.accent.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4))] : null,
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                        child: Text(
                          s.name,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: active ? Colors.white : AppColors.navy,
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

class EdShopProductDots extends StatelessWidget {
  const EdShopProductDots({super.key, required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    if (count <= 1) return const SizedBox(height: 8);
    final maxDots = count > 12 ? 12 : count;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(maxDots, (i) {
          final dotIndex = count <= 12 ? i : (i * count / maxDots).round().clamp(0, count - 1);
          final active = dotIndex == index;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: active ? 18 : 7,
            height: 7,
            decoration: BoxDecoration(
              gradient: active ? EdCommerceTheme.accentGradient : null,
              color: active ? null : EdCommerceTheme.line.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(99),
              boxShadow: active ? [BoxShadow(color: EdCommerceTheme.accent.withValues(alpha: 0.3), blurRadius: 6, offset: const Offset(0, 2))] : null,
            ),
          );
        }),
      ),
    );
  }
}

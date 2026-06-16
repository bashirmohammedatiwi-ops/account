import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/debounce.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';
import 'commerce_theme.dart';
import 'commerce_ui.dart';
import 'order_invoice_ui.dart';

final catalogBranchesProvider = FutureProvider((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCatalogBranches());
});

final catalogSectionsProvider = FutureProvider.family<List<CatalogSection>, int>((ref, branchId) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getCatalogSections(branchId));
});

final catalogProductsProvider = FutureProvider.family<List<Product>, int>((ref, sectionId) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getProducts(sectionId));
});

class InvoiceDraftNotifier extends Notifier<Map<int, ({num quant, num bonus})>> {
  int? branchId;
  int? sectionId;
  String? branchName;
  String? sectionName;
  BranchAccount? customer;
  String notes = '';

  @override
  Map<int, ({num quant, num bonus})> build() => {};

  Future<void> load(int agentId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('delegateInvoice:$agentId');
    if (raw == null) return;
    final data = jsonDecode(raw) as Map<String, dynamic>;
    branchId = data['branchId'] as int?;
    sectionId = data['sectionId'] as int?;
    branchName = data['branchName'] as String?;
    sectionName = data['sectionName'] as String?;
    notes = data['notes'] as String? ?? '';
    final customerJson = data['customer'] as Map<String, dynamic>?;
    if (customerJson != null) {
      customer = BranchAccount.fromJson(customerJson);
    }
    final draft = data['draft'] as Map<String, dynamic>? ?? {};
    state = draft.map((k, v) {
      final m = v as Map<String, dynamic>;
      return MapEntry(int.parse(k), (quant: m['quant'] as num? ?? 0, bonus: m['bonus'] as num? ?? 0));
    });
  }

  Future<void> persist(int agentId) async {
    final prefs = await SharedPreferences.getInstance();
    final draft = state.map((k, v) => MapEntry('$k', {'quant': v.quant, 'bonus': v.bonus}));
    await prefs.setString('delegateInvoice:$agentId', jsonEncode({
      'branchId': branchId,
      'sectionId': sectionId,
      'branchName': branchName,
      'sectionName': sectionName,
      'notes': notes,
      'customer': customer == null
          ? null
          : {
              'seq': customer!.seq,
              'num': customer!.accountNum,
              'name1': customer!.name1,
              'name2': customer!.name2,
              'address': customer!.address,
              'bal': customer!.bal,
            },
      'draft': draft,
    }));
  }

  void setQty(int productId, num quant, num bonus) {
    if (quant <= 0 && bonus <= 0) {
      final next = {...state};
      next.remove(productId);
      state = next;
      return;
    }
    state = {...state, productId: (quant: quant, bonus: bonus)};
  }

  void clear() {
    state = {};
    customer = null;
    notes = '';
  }
}

final invoiceDraftProvider = NotifierProvider<InvoiceDraftNotifier, Map<int, ({num quant, num bonus})>>(InvoiceDraftNotifier.new);

class ShopBranchesScreen extends ConsumerStatefulWidget {
  const ShopBranchesScreen({super.key});

  @override
  ConsumerState<ShopBranchesScreen> createState() => _ShopBranchesScreenState();
}

class _ShopBranchesScreenState extends ConsumerState<ShopBranchesScreen> {
  String? _resumeHint;

  @override
  void initState() {
    super.initState();
    _loadResumeHint();
  }

  Future<void> _loadResumeHint() async {
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId == null) return;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('delegateInvoice:$agentId');
    if (raw == null || !mounted) return;
    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      final draft = data['draft'] as Map<String, dynamic>? ?? {};
      final hasLines = draft.values.any((v) {
        final m = v as Map<String, dynamic>;
        return (m['quant'] as num? ?? 0) > 0 || (m['bonus'] as num? ?? 0) > 0;
      });
      if (hasLines) {
        setState(() {
          _resumeHint = [data['branchName'], data['sectionName']].whereType<String>().where((s) => s.isNotEmpty).join(' · ');
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(catalogBranchesProvider);
    return AppPage(
      title: 'فروع المنتجات',
      kicker: 'المنتجات',
      subtitle: 'اختر فرع المنتجات',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: Column(
          children: [
            if (_resumeHint != null)
              EdResumeBanner(
                message: 'فاتورة محفوظة · $_resumeHint',
                actionLabel: 'متابعة',
                onAction: () async {
                  final agentId = ref.read(authProvider).agent?.id;
                  if (agentId != null) {
                    await ref.read(invoiceDraftProvider.notifier).load(agentId);
                    final n = ref.read(invoiceDraftProvider.notifier);
                    if (n.branchId != null && n.sectionId != null && context.mounted) {
                      context.go('/shop/${n.branchId}/sections/${n.sectionId}/products');
                    }
                  }
                },
              ),
            Expanded(
              child: branchesAsync.when(
                loading: () => const LoadingView(),
                error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogBranchesProvider)),
                data: (branches) => EdShopPickerGrid(
                  items: branches,
                  emptyMessage: 'لا توجد فروع منتجات',
                  emptyIcon: Icons.store_mall_directory_outlined,
                  itemBuilder: (_, i) {
                    final b = branches[i];
                    return EdShopPickerCard(
                      title: b.name,
                      subtitle: b.description,
                      icon: Icons.store_mall_directory_outlined,
                      onTap: () => context.go('/shop/${b.id}/sections'),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ShopSectionsScreen extends ConsumerWidget {
  const ShopSectionsScreen({super.key, required this.branchId});
  final int branchId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sectionsAsync = ref.watch(catalogSectionsProvider(branchId));
    final branchesAsync = ref.watch(catalogBranchesProvider);
    final branchName = branchesAsync.valueOrNull?.where((b) => b.id == branchId).map((b) => b.name).firstOrNull;

    return AppPage(
      title: 'الأقسام',
      kicker: 'المنتجات',
      subtitle: branchName ?? 'اختر قسم المنتجات',
      showBack: true,
      onBack: () => context.pop(),
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: sectionsAsync.when(
          loading: () => const LoadingView(),
          error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogSectionsProvider(branchId))),
          data: (sections) => EdShopPickerGrid(
            items: sections,
            emptyMessage: 'لا توجد أقسام',
            emptyIcon: Icons.category_outlined,
            itemBuilder: (_, i) {
              final s = sections[i];
              return EdShopPickerCard(
                title: s.name,
                subtitle: s.description,
                icon: Icons.category_outlined,
                onTap: () async {
                  final notifier = ref.read(invoiceDraftProvider.notifier);
                  notifier.branchId = branchId;
                  notifier.sectionId = s.id;
                  notifier.branchName = branchName;
                  notifier.sectionName = s.name;
                  final agentId = ref.read(authProvider).agent?.id;
                  if (agentId != null) await notifier.persist(agentId);
                  if (context.mounted) context.go('/shop/$branchId/sections/${s.id}/products');
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

class ShopProductsScreen extends ConsumerWidget {
  const ShopProductsScreen({super.key, required this.branchId, required this.sectionId});
  final int branchId;
  final int sectionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(catalogBranchesProvider);
    final sectionsAsync = ref.watch(catalogSectionsProvider(branchId));
    final branchName = branchesAsync.valueOrNull?.where((b) => b.id == branchId).map((b) => b.name).firstOrNull ?? '';
    final sectionName = sectionsAsync.valueOrNull?.where((s) => s.id == sectionId).map((s) => s.name).firstOrNull ?? '';

    return AppPage(
      title: 'عرض وطلب',
      kicker: 'المنتجات',
      subtitle: [branchName, sectionName].where((s) => s.isNotEmpty).join(' · '),
      showBack: true,
      onBack: () => context.pop(),
      child: ShopProductsPanel(
        branchId: branchId,
        sectionId: sectionId,
        branchName: branchName,
        sectionName: sectionName,
      ),
    );
  }
}

class ShopProductsPanel extends ConsumerStatefulWidget {
  const ShopProductsPanel({
    super.key,
    required this.branchId,
    required this.sectionId,
    required this.branchName,
    required this.sectionName,
  });

  final int branchId;
  final int sectionId;
  final String branchName;
  final String sectionName;

  @override
  ConsumerState<ShopProductsPanel> createState() => _ShopProductsPanelState();
}

class _ShopProductsPanelState extends ConsumerState<ShopProductsPanel> {
  String _filter = '';
  String _filterApplied = '';
  int _page = 0;
  int? _selectedId;
  final _barcodeCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  final _debouncer = Debouncer();

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    _notesCtrl.dispose();
    _debouncer.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) {
      ref.read(invoiceDraftProvider.notifier).load(agentId).then((_) {
        if (mounted) {
          _notesCtrl.text = ref.read(invoiceDraftProvider.notifier).notes;
        }
      });
    }
    final notifier = ref.read(invoiceDraftProvider.notifier);
    notifier.branchId = widget.branchId;
    notifier.sectionId = widget.sectionId;
    notifier.branchName = widget.branchName;
    notifier.sectionName = widget.sectionName;
  }

  int _pageSize(BuildContext context) {
    final cols = EdLayout.of(context).gridColumns(phone: 2, tablet: 3, wide: 3, desktop: 4);
    return cols * 2;
  }

  num _total(List<Product> products, Map<int, ({num quant, num bonus})> draft) {
    num t = 0;
    for (final p in products) {
      final d = draft[p.id];
      if (d != null && d.quant > 0) t += d.quant * p.price;
    }
    return t;
  }

  int _lineCount(Map<int, ({num quant, num bonus})> draft) {
    return draft.values.where((d) => d.quant > 0 || d.bonus > 0).length;
  }

  Future<void> _persistDraft() async {
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) await ref.read(invoiceDraftProvider.notifier).persist(agentId);
  }

  Future<void> _pickCustomer() async {
    final trees = await ref.read(apiClientProvider).getTrees();
    if (!mounted || trees.isEmpty) return;
    final tree = await showDialog<AccountTree>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('اختر الشجرة'),
        children: trees.map((t) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, t), child: Text(t.name1))).toList(),
      ),
    );
    if (tree == null) return;
    final branches = await ref.read(apiClientProvider).getChildren(tree.seq);
    if (!mounted) return;
    final branch = await showDialog<BranchAccount>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('اختر الزبون'),
        children: branches
            .map((b) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, b), child: Text('${b.name1} (${b.accountNum})')))
            .toList(),
      ),
    );
    if (branch != null) {
      ref.read(invoiceDraftProvider.notifier).customer = branch;
      await _persistDraft();
      if (mounted) setState(() {});
    }
  }

  Future<void> _lookupBarcode(List<Product> products) async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    try {
      final product = await ref.read(apiClientProvider).lookupProduct(code, branchId: widget.branchId);
      _selectProduct(product.id, products);
      final notifier = ref.read(invoiceDraftProvider.notifier);
      final current = ref.read(invoiceDraftProvider)[product.id];
      notifier.setQty(product.id, (current?.quant ?? 0) + 1, current?.bonus ?? 0);
      await _persistDraft();
      _barcodeCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${product.name} +1')));
      }
    } catch (e) {
      final local = products.where((p) => (p.barcode ?? '').contains(code) || (p.skuNum ?? '').contains(code)).toList();
      if (local.length == 1) {
        final p = local.first;
        _selectProduct(p.id, products);
        final notifier = ref.read(invoiceDraftProvider.notifier);
        final current = ref.read(invoiceDraftProvider)[p.id];
        notifier.setQty(p.id, (current?.quant ?? 0) + 1, current?.bonus ?? 0);
        await _persistDraft();
        _barcodeCtrl.clear();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  void _selectProduct(int id, List<Product> products) {
    setState(() {
      _selectedId = id;
      _page = products.indexWhere((p) => p.id == id) ~/ _pageSize(context);
    });
  }

  Product? _selectedProduct(List<Product> products) {
    if (_selectedId == null) return null;
    for (final p in products) {
      if (p.id == _selectedId) return p;
    }
    return null;
  }

  void _adjustQty(Product product, {required bool quant, required int delta}) {
    final notifier = ref.read(invoiceDraftProvider.notifier);
    final current = ref.read(invoiceDraftProvider)[product.id];
    final q = current?.quant ?? 0;
    final b = current?.bonus ?? 0;
    if (quant) {
      notifier.setQty(product.id, (q + delta).clamp(0, 999999), b);
    } else {
      notifier.setQty(product.id, q, (b + delta).clamp(0, 999999));
    }
    _persistDraft();
    setState(() {});
  }

  Future<void> _openInvoiceSheet(List<Product> products) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => EdOrderInvoiceSheet(branchId: widget.branchId, products: products),
    );
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(catalogProductsProvider(widget.sectionId));
    final draft = ref.watch(invoiceDraftProvider);
    final customer = ref.read(invoiceDraftProvider.notifier).customer;
    final layout = EdLayout.of(context);
    final sideWidth = layout.isTablet ? 320.0 : 280.0;
    final cols = layout.gridColumns(phone: 2, tablet: 3, wide: 3, desktop: 4);

    return ColoredBox(
      color: EdCommerceTheme.pageBg,
      child: productsAsync.when(
        loading: () => const LoadingView(message: 'جاري تحميل المنتجات...'),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogProductsProvider(widget.sectionId))),
        data: (products) {
          final q = _filterApplied.toLowerCase();
          final filtered = products.where((p) {
            if (q.isEmpty) return true;
            return p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q) || (p.skuNum ?? '').contains(q);
          }).toList();

          if (_selectedId != null && !filtered.any((p) => p.id == _selectedId)) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _selectedId = null);
            });
          }

          final pageSize = _pageSize(context);
          final pageCount = filtered.isEmpty ? 1 : ((filtered.length + pageSize - 1) / pageSize).ceil();
          final safePage = _page.clamp(0, pageCount - 1);
          if (safePage != _page) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _page = safePage);
            });
          }
          final pageItems = filtered.skip(safePage * pageSize).take(pageSize).toList();
          final selected = _selectedProduct(filtered);
          final showSide = layout.isTablet || selected != null;

          Widget buildDetailPanel() {
            if (selected != null) {
              return EdShopProductDetailPanel(
                product: selected,
                sectionName: widget.sectionName,
                quant: draft[selected.id]?.quant ?? 0,
                bonus: draft[selected.id]?.bonus ?? 0,
                onDecQuant: () => _adjustQty(selected, quant: true, delta: -1),
                onIncQuant: () => _adjustQty(selected, quant: true, delta: 1),
                onDecBonus: () => _adjustQty(selected, quant: false, delta: -1),
                onIncBonus: () => _adjustQty(selected, quant: false, delta: 1),
                notesController: _notesCtrl,
                onNotesChanged: (v) {
                  ref.read(invoiceDraftProvider.notifier).notes = v;
                  _persistDraft();
                },
              );
            }
            return const EdShopProductDetailPlaceholder();
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              EdShopCustomerBar(
                customer: customer,
                branchLabel: [widget.branchName, widget.sectionName].where((s) => s.isNotEmpty).join(' / '),
                onPick: _pickCustomer,
              ),
              EdShopToolbar(
                searchHint: 'اسم المنتج...',
                onSearchChanged: (v) {
                  _filter = v.trim();
                  _debouncer.run(() {
                    if (mounted) {
                      setState(() {
                        _filterApplied = _filter;
                        _page = 0;
                      });
                    }
                  });
                },
                barcodeController: _barcodeCtrl,
                onBarcodeSubmit: () => _lookupBarcode(products),
                onBarcodeScan: () => _lookupBarcode(products),
              ),
              Expanded(
                child: Row(
                  textDirection: TextDirection.ltr,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (showSide)
                      SizedBox(
                        width: sideWidth,
                        child: buildDetailPanel(),
                      ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          EdShopMetaBar(text: '${widget.branchName} · ${widget.sectionName} · ${filtered.length} منتج · صفحة ${safePage + 1} من $pageCount'),
                          Expanded(
                            child: filtered.isEmpty
                                ? const EmptyState(message: 'لا توجد منتجات', icon: Icons.inventory_2_outlined)
                                : GridView.builder(
                                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
                                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: cols,
                                      crossAxisSpacing: 10,
                                      mainAxisSpacing: 10,
                                      childAspectRatio: layout.isTablet ? 0.78 : 0.72,
                                    ),
                                    itemCount: pageItems.length,
                                    itemBuilder: (_, i) {
                                      final p = pageItems[i];
                                      final d = draft[p.id];
                                      return EdShopProductTile(
                                        key: ValueKey(p.id),
                                        product: p,
                                        selected: _selectedId == p.id,
                                        inDraft: (d?.quant ?? 0) > 0 || (d?.bonus ?? 0) > 0,
                                        onTap: () => setState(() => _selectedId = p.id),
                                      );
                                    },
                                  ),
                          ),
                          EdShopPagination(page: safePage, pageCount: pageCount, onPage: (p) => setState(() => _page = p)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              EdShopOrderDock(
                lineCount: _lineCount(draft),
                totalLabel: fmtMoney(_total(products, draft)),
                onPressed: () => _openInvoiceSheet(products),
              ),
            ],
          );
        },
      ),
    );
  }
}

class EdOrderInvoiceSheet extends ConsumerStatefulWidget {
  const EdOrderInvoiceSheet({super.key, required this.branchId, required this.products});

  final int branchId;
  final List<Product> products;

  @override
  ConsumerState<EdOrderInvoiceSheet> createState() => _EdOrderInvoiceSheetState();
}

class _EdOrderInvoiceSheetState extends ConsumerState<EdOrderInvoiceSheet> {
  bool _submitting = false;
  late TextEditingController _notesCtrl;

  @override
  void initState() {
    super.initState();
    _notesCtrl = TextEditingController(text: ref.read(invoiceDraftProvider.notifier).notes);
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _persist() async {
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) await ref.read(invoiceDraftProvider.notifier).persist(agentId);
  }

  Future<void> _pickCustomer() async {
    final trees = await ref.read(apiClientProvider).getTrees();
    if (!mounted || trees.isEmpty) return;
    final tree = await showDialog<AccountTree>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('اختر الشجرة'),
        children: trees.map((t) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, t), child: Text(t.name1))).toList(),
      ),
    );
    if (tree == null) return;
    final branches = await ref.read(apiClientProvider).getChildren(tree.seq);
    if (!mounted) return;
    final branch = await showDialog<BranchAccount>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('اختر الزبون'),
        children: branches
            .map((b) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, b), child: Text('${b.name1} (${b.accountNum})')))
            .toList(),
      ),
    );
    if (branch != null) {
      ref.read(invoiceDraftProvider.notifier).customer = branch;
      await _persist();
      if (mounted) setState(() {});
    }
  }

  void _adjustLine(int productId, {required bool quant, required int delta}) {
    final notifier = ref.read(invoiceDraftProvider.notifier);
    final current = ref.read(invoiceDraftProvider)[productId];
    final q = current?.quant ?? 0;
    final b = current?.bonus ?? 0;
    if (quant) {
      notifier.setQty(productId, (q + delta).clamp(0, 999999), b);
    } else {
      notifier.setQty(productId, q, (b + delta).clamp(0, 999999));
    }
    _persist();
    setState(() {});
  }

  Future<void> _clearDraft() async {
    ref.read(invoiceDraftProvider.notifier).clear();
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('delegateInvoice:$agentId');
    }
    if (mounted) Navigator.pop(context);
  }

  Future<void> _submit() async {
    final draftNotifier = ref.read(invoiceDraftProvider.notifier);
    final customer = draftNotifier.customer;
    if (customer == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اختر الزبون أولاً')));
      return;
    }
    draftNotifier.notes = _notesCtrl.text;
    final draft = ref.read(invoiceDraftProvider);
    final lines = <OrderLine>[];
    for (final p in widget.products) {
      final d = draft[p.id];
      if (d == null || (d.quant <= 0 && d.bonus <= 0)) continue;
      lines.add(OrderLine(
        productId: p.id,
        matName: p.name,
        quant: d.quant,
        bonus: d.bonus,
        unitPrice: p.price,
        barcode: p.barcode ?? p.skuNum,
      ));
    }
    if (lines.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref.read(apiClientProvider).submitOrder(
            customerAccSeq: customer.seq,
            catalogBranchId: widget.branchId,
            notes: draftNotifier.notes,
            lines: lines,
          );
      draftNotifier.clear();
      final agentId = ref.read(authProvider).agent?.id;
      if (agentId != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('delegateInvoice:$agentId');
      }
      ref.invalidate(ordersProvider);
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم إرسال الطلب')));
        context.go('/orders');
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(invoiceDraftProvider);
    final draftNotifier = ref.read(invoiceDraftProvider.notifier);
    final customer = draftNotifier.customer;
    final lines = buildOrderInvoiceLines(widget.products, draft);
    final total = lines.fold<num>(0, (s, l) => s + l.lineTotal);
    final qtySum = lines.fold<num>(0, (s, l) => s + l.quant);
    final bonusSum = lines.fold<num>(0, (s, l) => s + l.bonus);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.55,
      maxChildSize: 0.96,
      builder: (_, scrollCtrl) => Material(
        color: EdCommerceTheme.pageBg,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EdOrderInvoiceSheetHeader(onClose: () => Navigator.pop(context)),
            Expanded(
              child: ListView(
                controller: scrollCtrl,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                children: [
                  EdOrderInvoiceCustomerBar(customer: customer, onPick: _pickCustomer),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesCtrl,
                    maxLines: 2,
                    onChanged: (v) {
                      draftNotifier.notes = v;
                      _persist();
                    },
                    decoration: InputDecoration(
                      labelText: 'ملاحظات',
                      hintText: 'ملاحظات للإدارة (اختياري)...',
                      filled: true,
                      fillColor: EdCommerceTheme.card,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: EdCommerceTheme.line)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  EdOrderInvoiceDocPanel(
                    title: 'فاتورة طلب مندوب',
                    docNum: 'مسودة',
                    dateLabel: fmtDate(isoToday()),
                    customerName: customer?.name1 ?? '—',
                    customerNum: customer?.accountNum,
                    branchName: draftNotifier.branchName,
                    remarks: _notesCtrl.text.trim(),
                    lineCount: lines.length,
                    qtySum: qtySum,
                    bonusSum: bonusSum,
                    total: total,
                  ),
                  const SizedBox(height: 16),
                  EdOrderInvoiceLinesSection(lines: lines, editable: true, onAdjust: _adjustLine),
                ],
              ),
            ),
            EdOrderInvoiceSheetFooter(
              total: total,
              lineCount: lines.length,
              submitting: _submitting,
              onClear: _clearDraft,
              onSubmit: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

final orderDetailProvider = FutureProvider.family<Order, int>((ref, id) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getOrder(id));
});

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(ordersProvider);
    return AppPage(
      title: 'طلباتي',
      kicker: 'الطلبات',
      subtitle: 'متابعة حالة الطلبات',
      showBack: true,
      onBack: () => context.go('/home'),
      actions: [
        EdHeaderIconButton(icon: Icons.refresh_rounded, tooltip: 'تحديث', onPressed: () => ref.invalidate(ordersProvider)),
      ],
      child: ColoredBox(
        color: EdCommerceTheme.pageBg,
        child: ordersAsync.when(
          loading: () => const LoadingView(message: 'جاري تحميل الطلبات...'),
          error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(ordersProvider)),
          data: (orders) {
            if (orders.isEmpty) return const EmptyState(message: 'لا توجد طلبات', icon: Icons.receipt_long_outlined);
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final o = orders[i];
                return EdOrderCard(
                  id: o.id,
                  customer: o.customerName ?? '—',
                  date: fmtDate(o.createdAt),
                  amount: fmtMoney(o.totalAmount),
                  statusLabel: orderStatusLabel(o.status),
                  statusColor: AppTheme.orderStatusColor(o.status),
                  onTap: () => context.go('/orders/${o.id}'),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class OrderDetailScreen extends ConsumerWidget {
  const OrderDetailScreen({super.key, required this.id});
  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppPage(
      title: 'تفاصيل الطلب',
      kicker: 'الطلبات',
      subtitle: '#$id',
      showBack: true,
      onBack: () => context.pop(),
      child: OrderDetailBody(id: id),
    );
  }
}

class OrderDetailBody extends ConsumerWidget {
  const OrderDetailBody({super.key, required this.id});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(id));

    return ColoredBox(
      color: EdCommerceTheme.pageBg,
      child: orderAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(orderDetailProvider(id))),
        data: (order) {
          return EdOrderInvoiceDetailView(
            order: order,
            statusLabel: orderStatusLabel(order.status),
            statusColor: AppTheme.orderStatusColor(order.status),
          );
        },
      ),
    );
  }
}

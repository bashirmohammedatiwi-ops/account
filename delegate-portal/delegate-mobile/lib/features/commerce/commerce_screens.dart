import 'package:cached_network_image/cached_network_image.dart';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/utils/debounce.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';

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
    notes = data['notes'] as String? ?? '';
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
      'notes': notes,
      'draft': draft,
    }));
  }

  void setQty(int productId, num quant, num bonus) {
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
        data: (branches) {
          if (branches.isEmpty) return const EmptyState(message: 'لا توجد فروع منتجات', icon: Icons.store_mall_directory_outlined);
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: branches.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final b = branches[i];
              return EdNavCard(
                icon: Icons.store_mall_directory_outlined,
                title: b.name,
                subtitle: b.description,
                accent: AppColors.moduleShop,
                onTap: () => context.go('/shop/${b.id}/sections'),
              );
            },
          );
        },
            ),
          ),
        ],
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
    return AppPage(
      title: 'الأقسام',
      kicker: 'المنتجات',
      subtitle: 'اختر قسم المنتجات',
      showBack: true,
      onBack: () => context.pop(),
      child: sectionsAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogSectionsProvider(branchId))),
        data: (sections) {
          if (sections.isEmpty) return const EmptyState(message: 'لا توجد أقسام', icon: Icons.category_outlined);
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: sections.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (_, i) {
              final s = sections[i];
              return EdNavCard(
                icon: Icons.category_outlined,
                title: s.name,
                accent: AppColors.moduleShop,
                onTap: () {
                  ref.read(invoiceDraftProvider.notifier).branchId = branchId;
                  context.go('/shop/$branchId/sections/${s.id}/products');
                },
              );
            },
          );
        },
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
    return AppPage(
      title: 'عرض وطلب',
      kicker: 'المنتجات',
      subtitle: 'أضف الكميات ثم اعرض الفاتورة',
      showBack: true,
      onBack: () => context.pop(),
      child: ShopProductsPanel(branchId: branchId, sectionId: sectionId),
    );
  }
}

class ShopProductsPanel extends ConsumerStatefulWidget {
  const ShopProductsPanel({super.key, required this.branchId, required this.sectionId, this.embedded = false});

  final int branchId;
  final int sectionId;
  final bool embedded;

  @override
  ConsumerState<ShopProductsPanel> createState() => _ShopProductsPanelState();
}

class _ShopProductsPanelState extends ConsumerState<ShopProductsPanel> {
  String _filter = '';
  String _filterApplied = '';
  final _barcodeCtrl = TextEditingController();
  final _debouncer = Debouncer();

  @override
  void dispose() {
    _barcodeCtrl.dispose();
    _debouncer.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final agentId = ref.read(authProvider).agent?.id;
    if (agentId != null) {
      ref.read(invoiceDraftProvider.notifier).load(agentId);
    }
    ref.read(invoiceDraftProvider.notifier).sectionId = widget.sectionId;
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

  Future<void> _lookupBarcode(List<Product> products) async {
    final code = _barcodeCtrl.text.trim();
    if (code.isEmpty) return;
    try {
      final product = await ref.read(apiClientProvider).lookupProduct(code, branchId: widget.branchId);
      final notifier = ref.read(invoiceDraftProvider.notifier);
      final current = ref.read(invoiceDraftProvider)[product.id];
      notifier.setQty(product.id, (current?.quant ?? 0) + 1, current?.bonus ?? 0);
      final agentId = ref.read(authProvider).agent?.id;
      if (agentId != null) await notifier.persist(agentId);
      _barcodeCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${product.name} +1')));
      }
    } catch (e) {
      final local = products.where((p) => (p.barcode ?? '').contains(code) || (p.skuNum ?? '').contains(code)).toList();
      if (local.length == 1) {
        final p = local.first;
        final notifier = ref.read(invoiceDraftProvider.notifier);
        final current = ref.read(invoiceDraftProvider)[p.id];
        notifier.setQty(p.id, (current?.quant ?? 0) + 1, current?.bonus ?? 0);
        _barcodeCtrl.clear();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  Future<void> _openInvoiceSheet(List<Product> products) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => _InvoiceSheet(branchId: widget.branchId, products: products),
    );
  }

  @override
  Widget build(BuildContext context) {
    final productsAsync = ref.watch(catalogProductsProvider(widget.sectionId));
    final draft = ref.watch(invoiceDraftProvider);
    final agentId = ref.watch(authProvider).agent?.id;
    final layout = EdLayout.of(context);
    final cols = layout.gridColumns(phone: 2, tablet: 3, wide: 4, desktop: 5);

    final toolbar = EdPageToolbar(
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: EdSearchField(
              hint: 'بحث عن منتج...',
              onChanged: (v) {
                _filter = v.trim();
                _debouncer.run(() {
                  if (mounted) setState(() => _filterApplied = _filter);
                });
              },
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _barcodeCtrl,
              decoration: InputDecoration(
                hintText: 'باركود',
                isDense: true,
                prefixIcon: const Icon(Icons.qr_code_scanner, color: AppColors.muted),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.add_circle_outline, color: AppColors.moduleShop),
                  onPressed: () => _lookupBarcode(productsAsync.valueOrNull ?? []),
                ),
              ),
              onSubmitted: (_) => _lookupBarcode(productsAsync.valueOrNull ?? []),
            ),
          ),
        ],
      ),
    );

    final content = productsAsync.when(
      loading: () => const LoadingView(message: 'جاري تحميل المنتجات...'),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogProductsProvider(widget.sectionId))),
      data: (products) {
        final q = _filterApplied.toLowerCase();
        final filtered = products.where((p) {
          if (q.isEmpty) return true;
          return p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q);
        }).toList();

        return Column(
          children: [
            Expanded(
              child: filtered.isEmpty
                  ? const EmptyState(message: 'لا توجد منتجات', icon: Icons.inventory_2_outlined)
                  : GridView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: cols,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                        childAspectRatio: layout.isWide ? 0.72 : 0.68,
                      ),
                      itemCount: filtered.length,
                      itemBuilder: (_, i) => _ProductCard(
                        key: ValueKey(filtered[i].id),
                        product: filtered[i],
                        agentId: agentId,
                      ),
                    ),
            ),
            if (_lineCount(draft) > 0)
              EdBottomActionBar(
                label: 'الفاتورة (${fmtMoney(_total(products, draft))})',
                onPressed: () => _openInvoiceSheet(products),
              ),
          ],
        );
      },
    );

    if (widget.embedded) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [toolbar, Expanded(child: content)],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [toolbar, Expanded(child: content)],
    );
  }
}

class _ProductCard extends ConsumerWidget {
  const _ProductCard({super.key, required this.product, this.agentId});
  final Product product;
  final int? agentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(invoiceDraftProvider)[product.id];
    final quant = draft?.quant ?? 0;
    final bonus = draft?.bonus ?? 0;
    final notifier = ref.read(invoiceDraftProvider.notifier);

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: quant > 0 || bonus > 0 ? AppColors.moduleShop : AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppColors.radiusSm),
                ),
                padding: const EdgeInsets.all(8),
                child: product.imageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: product.imageUrl!,
                        fit: BoxFit.contain,
                        memCacheWidth: 240,
                        placeholder: (_, __) => const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))),
                        errorWidget: (_, __, ___) => const Icon(Icons.inventory_2_outlined, size: 40, color: AppColors.muted),
                      )
                    : const Icon(Icons.inventory_2_outlined, size: 40, color: AppColors.muted),
              ),
            ),
            const SizedBox(height: 8),
            Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
            Text(fmtMoney(product.price), style: const TextStyle(color: AppColors.moduleShop, fontWeight: FontWeight.w800, fontSize: 13)),
            const SizedBox(height: 8),
            EdQtyStepper(
              value: fmtQty(quant),
              onDec: () {
                notifier.setQty(product.id, (quant - 1).clamp(0, 999999), bonus);
                if (agentId != null) notifier.persist(agentId!);
              },
              onInc: () {
                notifier.setQty(product.id, quant + 1, bonus);
                if (agentId != null) notifier.persist(agentId!);
              },
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                const Text('هدية', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.muted)),
                const Spacer(),
                EdQtyStepper(
                  compact: true,
                  value: '$bonus',
                  onDec: () {
                    notifier.setQty(product.id, quant, (bonus - 1).clamp(0, 999999));
                    if (agentId != null) notifier.persist(agentId!);
                  },
                  onInc: () {
                    notifier.setQty(product.id, quant, bonus + 1);
                    if (agentId != null) notifier.persist(agentId!);
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InvoiceSheet extends ConsumerStatefulWidget {
  const _InvoiceSheet({required this.branchId, required this.products});
  final int branchId;
  final List<Product> products;

  @override
  ConsumerState<_InvoiceSheet> createState() => _InvoiceSheetState();
}

class _InvoiceSheetState extends ConsumerState<_InvoiceSheet> {
  bool _submitting = false;
  List<BranchAccount> _branches = [];
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
    _branches = await ref.read(apiClientProvider).getChildren(tree.seq);
    if (!mounted) return;
    final branch = await showDialog<BranchAccount>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('اختر الزبون'),
        children: _branches
            .map((b) => SimpleDialogOption(onPressed: () => Navigator.pop(ctx, b), child: Text('${b.name1} (${b.accountNum})')))
            .toList(),
      ),
    );
    if (branch != null) {
      ref.read(invoiceDraftProvider.notifier).customer = branch;
      setState(() {});
    }
  }

  Future<void> _submit() async {
    final draftNotifier = ref.read(invoiceDraftProvider.notifier);
    final customer = draftNotifier.customer;
    if (customer == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('اختر الزبون أولاً')));
      return;
    }
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
    final customer = ref.read(invoiceDraftProvider.notifier).customer;
    num total = 0;
    final rows = <Widget>[];
    for (final p in widget.products) {
      final d = draft[p.id];
      if (d == null || (d.quant <= 0 && d.bonus <= 0)) continue;
      total += d.quant * p.price;
      rows.add(EdLineRow(
        title: p.name,
        subtitle: '${fmtQty(d.quant)} + هدية ${fmtQty(d.bonus)}',
        amount: fmtMoney(d.quant * p.price),
      ));
    }

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      builder: (_, controller) => Material(
        color: AppColors.bg,
        child: ListView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: AppColors.moduleShop.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.receipt_long_rounded, color: AppColors.moduleShop),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text('فاتورة الطلب', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.navy)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            EdNavCard(
              icon: Icons.person_outline_rounded,
              title: customer?.name1 ?? 'اختر الزبون',
              subtitle: customer?.accountNum,
              accent: AppColors.accentTeal,
              trailing: 'اختيار',
              onTap: _pickCustomer,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtrl,
              decoration: const InputDecoration(labelText: 'ملاحظات', hintText: 'اختياري...'),
              maxLines: 2,
              onChanged: (v) => ref.read(invoiceDraftProvider.notifier).notes = v,
            ),
            const SizedBox(height: 16),
            const EdSectionHeader(title: 'البنود'),
            ...rows,
            const SizedBox(height: 8),
            EdDocPanel(
              title: 'الإجمالي',
              rows: [(label: 'المجموع', value: fmtMoney(total))],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      ref.read(invoiceDraftProvider.notifier).clear();
                      final agentId = ref.read(authProvider).agent?.id;
                      if (agentId != null) {
                        final prefs = await SharedPreferences.getInstance();
                        await prefs.remove('delegateInvoice:$agentId');
                      }
                      if (mounted) Navigator.pop(context);
                    },
                    child: const Text('مسح'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: EdPrimaryButton(
                    label: 'إرسال للإدارة',
                    loading: _submitting,
                    onPressed: () {
                      ref.read(invoiceDraftProvider.notifier).notes = _notesCtrl.text;
                      _submit();
                    },
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

    return orderAsync.when(
      loading: () => const LoadingView(),
      error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(orderDetailProvider(id))),
      data: (order) {
        final statusColor = AppTheme.orderStatusColor(order.status);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            EdDocPanel(
              title: 'معلومات الطلب',
              rows: [
                (label: 'الحالة', value: orderStatusLabel(order.status)),
                (label: 'الزبون', value: order.customerName ?? '—'),
                (label: 'الفرع', value: order.catalogBranchName ?? '—'),
                (label: 'المجموع', value: fmtMoney(order.totalAmount)),
                if (order.notes != null && order.notes!.isNotEmpty) (label: 'ملاحظات', value: order.notes!),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(orderStatusLabel(order.status), style: TextStyle(color: statusColor, fontWeight: FontWeight.w800)),
            ),
            const SizedBox(height: 16),
            const EdSectionHeader(title: 'البنود'),
            ...order.lines.map((line) => EdLineRow(
                  title: line.matName,
                  subtitle: '${fmtQty(line.quant)} + هدية ${fmtQty(line.bonus)}',
                  amount: fmtMoney(line.lineTotal ?? line.quant * line.unitPrice),
                )),
          ],
        );
      },
    );
  }
}

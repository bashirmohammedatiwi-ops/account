import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/auth/auth_session.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../models/models.dart';
import '../home/home_screen.dart';

final catalogBranchesProvider = FutureProvider((ref) => withAuth(ref, () => ref.read(apiClientProvider).getCatalogBranches()));

final catalogSectionsProvider = FutureProvider.family<List<CatalogSection>, int>((ref, branchId) {
  return withAuth(ref, () => ref.read(apiClientProvider).getCatalogSections(branchId));
});

final catalogProductsProvider = FutureProvider.family<List<Product>, int>((ref, sectionId) {
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
      subtitle: 'اختر فرع المنتجات',
      child: Column(
        children: [
          if (_resumeHint != null)
            MaterialBanner(
              content: Text('فاتورة محفوظة · $_resumeHint'),
              leading: const Icon(Icons.save_outlined),
              actions: [
                TextButton(
                  onPressed: () async {
                    final agentId = ref.read(authProvider).agent?.id;
                    if (agentId != null) {
                      await ref.read(invoiceDraftProvider.notifier).load(agentId);
                      final n = ref.read(invoiceDraftProvider.notifier);
                      if (n.branchId != null && n.sectionId != null) {
                        if (context.mounted) {
                          context.go('/shop/${n.branchId}/sections/${n.sectionId}/products');
                        }
                      }
                    }
                  },
                  child: const Text('متابعة'),
                ),
              ],
            ),
          Expanded(
            child: branchesAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogBranchesProvider)),
        data: (branches) {
          if (branches.isEmpty) return const EmptyState(message: 'لا توجد فروع منتجات');
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: branches.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final b = branches[i];
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.store_mall_directory_outlined),
                  title: Text(b.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(b.description ?? ''),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () => context.go('/shop/${b.id}/sections'),
                ),
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
      subtitle: 'اختر قسم المنتجات',
      child: sectionsAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogSectionsProvider(branchId))),
        data: (sections) {
          if (sections.isEmpty) return const EmptyState(message: 'لا توجد أقسام');
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: sections.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final s = sections[i];
              return Card(
                child: ListTile(
                  title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () {
                    ref.read(invoiceDraftProvider.notifier).branchId = branchId;
                    context.go('/shop/$branchId/sections/${s.id}/products');
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class ShopProductsScreen extends ConsumerStatefulWidget {
  const ShopProductsScreen({super.key, required this.branchId, required this.sectionId});
  final int branchId;
  final int sectionId;

  @override
  ConsumerState<ShopProductsScreen> createState() => _ShopProductsScreenState();
}

class _ShopProductsScreenState extends ConsumerState<ShopProductsScreen> {
  String _filter = '';
  final _barcodeCtrl = TextEditingController();

  @override
  void dispose() {
    _barcodeCtrl.dispose();
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

    return AppPage(
      title: 'عرض وطلب',
      subtitle: 'أضف الكميات ثم اعرض الفاتورة',
      showBack: true,
      child: productsAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(catalogProductsProvider(widget.sectionId))),
        data: (products) {
          final filtered = products.where((p) {
            if (_filter.isEmpty) return true;
            final q = _filter.toLowerCase();
            return p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q);
          }).toList();

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Row(
                  children: [
                    Expanded(
                      flex: 2,
                      child: TextField(
                        decoration: const InputDecoration(hintText: 'بحث عن منتج...', prefixIcon: Icon(Icons.search)),
                        onChanged: (v) => setState(() => _filter = v.trim()),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _barcodeCtrl,
                        decoration: InputDecoration(
                          hintText: 'باركود',
                          prefixIcon: const Icon(Icons.qr_code_scanner),
                          suffixIcon: IconButton(
                            icon: const Icon(Icons.add_circle_outline),
                            onPressed: () => _lookupBarcode(products),
                          ),
                        ),
                        onSubmitted: (_) => _lookupBarcode(products),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: MediaQuery.sizeOf(context).width >= 900 ? 3 : 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 0.72,
                  ),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _ProductCard(product: filtered[i], agentId: agentId),
                ),
              ),
            ],
          );
        },
      ),
      floatingActionButton: productsAsync.maybeWhen(
        data: (products) {
          final count = _lineCount(draft);
          if (count == 0) return null;
          return FloatingActionButton.extended(
            onPressed: () => _openInvoiceSheet(products),
            icon: const Icon(Icons.receipt_long),
            label: Text('الفاتورة (${fmtMoney(_total(products, draft))})'),
          );
        },
        orElse: () => null,
      ),
    );
  }
}

class _ProductCard extends ConsumerWidget {
  const _ProductCard({required this.product, this.agentId});
  final Product product;
  final int? agentId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(invoiceDraftProvider)[product.id];
    final quant = draft?.quant ?? 0;
    final bonus = draft?.bonus ?? 0;
    final notifier = ref.read(invoiceDraftProvider.notifier);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: product.imageUrl != null
                  ? Image.network(product.imageUrl!, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Icon(Icons.inventory_2_outlined, size: 48))
                  : const Icon(Icons.inventory_2_outlined, size: 48),
            ),
            Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(fmtMoney(product.price), style: TextStyle(color: Theme.of(context).colorScheme.primary)),
            const SizedBox(height: 8),
            Row(
              children: [
                _StepBtn(icon: Icons.remove, onTap: () {
                  notifier.setQty(product.id, (quant - 1).clamp(0, 999999), bonus);
                  if (agentId != null) notifier.persist(agentId!);
                }),
                Expanded(child: Text('${fmtQty(quant)}', textAlign: TextAlign.center)),
                _StepBtn(icon: Icons.add, onTap: () {
                  notifier.setQty(product.id, quant + 1, bonus);
                  if (agentId != null) notifier.persist(agentId!);
                }),
              ],
            ),
            Row(
              children: [
                const Text('هدية', style: TextStyle(fontSize: 12)),
                const Spacer(),
                _StepBtn(icon: Icons.remove, small: true, onTap: () {
                  notifier.setQty(product.id, quant, (bonus - 1).clamp(0, 999999));
                  if (agentId != null) notifier.persist(agentId!);
                }),
                Text('$bonus'),
                _StepBtn(icon: Icons.add, small: true, onTap: () {
                  notifier.setQty(product.id, quant, bonus + 1);
                  if (agentId != null) notifier.persist(agentId!);
                }),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  const _StepBtn({required this.icon, required this.onTap, this.small = false});
  final IconData icon;
  final VoidCallback onTap;
  final bool small;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      visualDensity: VisualDensity.compact,
      iconSize: small ? 18 : 22,
      onPressed: onTap,
      icon: Icon(icon),
      style: IconButton.styleFrom(
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
        minimumSize: Size(small ? 32 : 40, small ? 32 : 40),
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
      rows.add(ListTile(
        title: Text(p.name),
        subtitle: Text('${fmtQty(d.quant)} + هدية ${fmtQty(d.bonus)}'),
        trailing: Text(fmtMoney(d.quant * p.price)),
      ));
    }

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      builder: (_, controller) => Material(
        child: ListView(
          controller: controller,
          padding: const EdgeInsets.all(20),
          children: [
            Text('فاتورة الطلب', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 12),
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(customer?.name1 ?? 'اختر الزبون'),
              subtitle: customer != null ? Text(customer.accountNum) : null,
              trailing: TextButton(onPressed: _pickCustomer, child: const Text('اختيار')),
            ),
            const Divider(),
            TextField(
              controller: _notesCtrl,
              decoration: const InputDecoration(labelText: 'ملاحظات', hintText: 'اختياري...'),
              maxLines: 2,
              onChanged: (v) => ref.read(invoiceDraftProvider.notifier).notes = v,
            ),
            const SizedBox(height: 8),
            ...rows,
            const Divider(),
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
                  child: FilledButton(
                    onPressed: _submitting ? null : () {
                      ref.read(invoiceDraftProvider.notifier).notes = _notesCtrl.text;
                      _submit();
                    },
                    child: _submitting ? const CircularProgressIndicator(color: Colors.white) : const Text('إرسال للإدارة'),
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

final orderDetailProvider = FutureProvider.family<Order, int>((ref, id) => withAuth(ref, () => ref.read(apiClientProvider).getOrder(id)));

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ordersAsync = ref.watch(ordersProvider);
    return AppPage(
      title: 'طلباتي',
      subtitle: 'متابعة حالة الطلبات',
      actions: [IconButton(onPressed: () => ref.invalidate(ordersProvider), icon: const Icon(Icons.refresh_rounded))],
      child: ordersAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(ordersProvider)),
        data: (orders) {
          if (orders.isEmpty) return const EmptyState(message: 'لا توجد طلبات');
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: orders.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final o = orders[i];
              return Card(
                child: ListTile(
                  title: Text('طلب #${o.id}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${o.customerName ?? ''} · ${fmtDate(o.createdAt)}'),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(fmtMoney(o.totalAmount), style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(orderStatusLabel(o.status), style: TextStyle(color: AppTheme.orderStatusColor(o.status), fontSize: 12)),
                    ],
                  ),
                  onTap: () => context.go('/orders/${o.id}'),
                ),
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
    final orderAsync = ref.watch(orderDetailProvider(id));
    return AppPage(
      title: 'تفاصيل الطلب',
      subtitle: '#$id',
      showBack: true,
      child: orderAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(message: e.displayMessage, onRetry: () => ref.invalidate(orderDetailProvider(id))),
        data: (order) {
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(orderStatusLabel(order.status), style: TextStyle(color: AppTheme.orderStatusColor(order.status), fontWeight: FontWeight.w700)),
                      Text('الزبون: ${order.customerName ?? ''}'),
                      Text('الفرع: ${order.catalogBranchName ?? ''}'),
                      Text('المجموع: ${fmtMoney(order.totalAmount)}'),
                      if (order.notes != null && order.notes!.isNotEmpty) Text('ملاحظات: ${order.notes}'),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Column(
                  children: order.lines.map((line) => ListTile(
                        title: Text(line.matName),
                        subtitle: Text('${fmtQty(line.quant)} + هدية ${fmtQty(line.bonus)}'),
                        trailing: Text(fmtMoney(line.lineTotal ?? line.quant * line.unitPrice)),
                      )).toList(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

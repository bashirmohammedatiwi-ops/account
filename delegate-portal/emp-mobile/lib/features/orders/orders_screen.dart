import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';

final ordersFilterProvider = StateProvider<String>((ref) => 'pending');
final ordersSourceFilterProvider = StateProvider<String>((ref) => '');

final ordersListProvider = FutureProvider.autoDispose<List<PurchaseOrder>>((ref) async {
  final filter = ref.watch(ordersFilterProvider);
  final source = ref.watch(ordersSourceFilterProvider);
  return ref.read(apiClientProvider).listOrders(
    status: filter.isEmpty ? null : filter,
    sourceType: source.isEmpty ? null : source,
  );
});

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() async {
      if (ref.read(authProvider).isAuthenticated) {
        await ref.read(notificationServiceProvider).start();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(ordersFilterProvider);
    final sourceFilter = ref.watch(ordersSourceFilterProvider);
    final ordersAsync = ref.watch(ordersListProvider);
    final employee = ref.watch(authProvider).employee;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(employee?.name ?? 'تجهيز الطلبات', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const Text('طلبات الشراء', style: TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
            ],
          ),
          actions: [
            IconButton(
              onPressed: () => ref.invalidate(ordersListProvider),
              icon: const Icon(Icons.refresh),
            ),
            IconButton(
              onPressed: () async {
                ref.read(notificationServiceProvider).stop();
                await ref.read(authProvider.notifier).logout();
              },
              icon: const Icon(Icons.logout, color: AppColors.danger),
            ),
          ],
        ),
        body: Column(
          children: [
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  _SourceFilterChip(label: 'كل المصادر', id: '', selected: sourceFilter.isEmpty),
                  _SourceFilterChip(label: 'المندوبين', id: 'delegate', selected: sourceFilter == 'delegate'),
                  _SourceFilterChip(label: 'الشورجة', id: 'shorja', selected: sourceFilter == 'shorja'),
                ],
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Row(
                children: [
                  _FilterChip(label: 'قيد الانتظار', id: 'pending', selected: filter == 'pending'),
                  _FilterChip(label: 'تم التجهيز', id: 'processing', selected: filter == 'processing'),
                  _FilterChip(label: 'مرفوض', id: 'rejected', selected: filter == 'rejected'),
                  _FilterChip(label: 'الكل', id: '', selected: filter.isEmpty),
                ],
              ),
            ),
            Expanded(
              child: ordersAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(e is ApiException ? e.message : 'فشل تحميل الطلبات', textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: () => ref.invalidate(ordersListProvider), child: const Text('إعادة المحاولة')),
                      ],
                    ),
                  ),
                ),
                data: (orders) {
                  if (orders.isEmpty) {
                    return const Center(child: Text('لا توجد طلبات', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w700)));
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(ordersListProvider);
                      await ref.read(ordersListProvider.future);
                      await ref.read(notificationServiceProvider).poll(seed: true);
                    },
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: orders.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, i) => _OrderCard(order: orders[i]),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends ConsumerWidget {
  const _FilterChip({required this.label, required this.id, required this.selected});

  final String label;
  final String id;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => ref.read(ordersFilterProvider.notifier).state = id,
        selectedColor: AppColors.primarySoft,
        checkmarkColor: AppColors.primary,
      ),
    );
  }
}

class _SourceFilterChip extends ConsumerWidget {
  const _SourceFilterChip({required this.label, required this.id, required this.selected});

  final String label;
  final String id;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.only(left: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => ref.read(ordersSourceFilterProvider.notifier).state = id,
        selectedColor: const Color(0xFFDCFCE7),
        checkmarkColor: const Color(0xFF15803D),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order});

  final PurchaseOrder order;

  @override
  Widget build(BuildContext context) {
    final giftCount = order.lines.fold<num>(0, (s, l) => s + l.bonus);
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppColors.radius),
        onTap: () => context.push('/orders/${order.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(order.orderNo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor(order.status).withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(statusLabelAr(order.status), style: TextStyle(color: statusColor(order.status), fontWeight: FontWeight.w800, fontSize: 12)),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(order.customerName ?? 'بدون زبون', style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(
                order.isShorja
                    ? '${order.shorjaBranchName ?? 'فرع الشورجة'}${order.shorjaInvoiceNo != null && order.shorjaInvoiceNo!.isNotEmpty ? ' · فاتورة ${order.shorjaInvoiceNo}' : ''}'
                    : '${order.agentName ?? '—'}${order.catalogBranchName != null ? ' · ${order.catalogBranchName}' : ''}',
                style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600),
              ),
              if (order.isShorja)
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text('طلب شورجة', style: TextStyle(color: Color(0xFF15803D), fontSize: 11, fontWeight: FontWeight.w800)),
                ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 12,
                runSpacing: 6,
                children: [
                  _Stat(label: 'المبلغ', value: formatMoney(order.totalAmount)),
                  _Stat(label: 'بنود', value: '${order.lines.length}'),
                  if (giftCount > 0) _Stat(label: 'هدايا', value: '$giftCount', highlight: true),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.highlight = false});

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: '$label ', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          TextSpan(
            text: value,
            style: TextStyle(fontWeight: FontWeight.w800, color: highlight ? AppColors.gift : AppColors.text),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../models/models.dart';

final ordersFilterProvider = StateProvider<String>((ref) => 'pending');
final ordersSourceFilterProvider = StateProvider<String>((ref) => '');
final ordersSearchProvider = StateProvider<String>((ref) => '');

final ordersListProvider = FutureProvider.autoDispose<List<PurchaseOrder>>((ref) async {
  final auth = ref.watch(authProvider);
  if (auth.loading || !auth.isAuthenticated) return [];

  final filter = ref.watch(ordersFilterProvider);
  final source = ref.watch(ordersSourceFilterProvider);
  final orders = await ref.read(apiClientProvider).listOrders(
    status: filter.isEmpty ? null : filter,
    sourceType: source.isEmpty ? null : source,
  );
  final q = ref.watch(ordersSearchProvider).trim().toLowerCase();
  var result = orders;
  if (filter == 'processing') {
    result = [...result]..sort((a, b) {
        if (a.prepConfirmed != b.prepConfirmed) return a.prepConfirmed ? 1 : -1;
        return b.id.compareTo(a.id);
      });
  }
  if (q.isEmpty) return result;
  return result.where((o) {
    final hay = [
      o.orderNo,
      o.customerName,
      o.agentName,
      o.shorjaInvoiceNo,
      o.shorjaBranchName,
      o.catalogBranchName,
    ].whereType<String>().join(' ').toLowerCase();
    return hay.contains(q);
  }).toList();
});

final pendingCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final auth = ref.watch(authProvider);
  if (auth.loading || !auth.isAuthenticated) return 0;

  final feed = await ref.read(apiClientProvider).orderFeed(status: 'pending');
  return feed.pendingCount;
});

final orderStatsProvider = FutureProvider.autoDispose<OrderStats>((ref) async {
  final auth = ref.watch(authProvider);
  if (auth.loading || !auth.isAuthenticated) {
    return const OrderStats(
      todaySubmitted: 0,
      pending: 0,
      processing: 0,
      rejected: 0,
      totalAmount: 0,
    );
  }

  return ref.read(apiClientProvider).orderStats();
});

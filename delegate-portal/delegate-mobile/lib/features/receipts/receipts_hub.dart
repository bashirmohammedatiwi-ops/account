import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/delegate_api.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../models/models.dart';

class ReceiptsHubData {
  const ReceiptsHubData({required this.deliveries, required this.receipts});

  final List<DeliveryReceipt> deliveries;
  final List<Receipt> receipts;

  List<DeliveryReceipt> get awaitingReceipt => deliveries.where((d) => d.canCreateReceipt).toList();

  List<DeliveryReceipt> get linkedDeliveries => deliveries.where((d) => !d.canCreateReceipt).toList();

  List<Receipt> get inReview =>
      receipts.where((r) => r.status == 'pending' || r.status == 'reviewed').toList();

  List<Receipt> get deliveredToCompany => receipts.where((r) => r.status == 'posted').toList();

  List<Receipt> get rejected => receipts.where((r) => r.status == 'rejected').toList();
}

/// قائمة وصول القبض — تُحدَّث مباشرة بعد الإصدار ولا تعتمد على IndexedStack.
class DeliveriesListNotifier extends AsyncNotifier<List<DeliveryReceipt>> {
  @override
  Future<List<DeliveryReceipt>> build() async {
    ref.watch(authProvider.select((s) => '${s.token ?? ''}:${s.agent?.id ?? ''}'));
    return withAuth(ref, () => ref.read(apiClientProvider).getDeliveryReceipts());
  }

  Future<void> refresh() async {
    state = const AsyncLoading<List<DeliveryReceipt>>().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(apiClientProvider).getDeliveryReceipts());
  }

  void upsert(DeliveryReceipt receipt) {
    final current = state.value ?? [];
    final next = [receipt, ...current.where((e) => e.id != receipt.id)];
    state = AsyncData(next);
  }
}

final deliveriesListNotifierProvider =
    AsyncNotifierProvider<DeliveriesListNotifier, List<DeliveryReceipt>>(DeliveriesListNotifier.new);

final deliveryReceiptsListProvider = FutureProvider<List<DeliveryReceipt>>((ref) {
  ref.watch(deliveriesListNotifierProvider);
  return ref.read(deliveriesListNotifierProvider.future);
});

class ReceiptsListNotifier extends AsyncNotifier<List<Receipt>> {
  @override
  Future<List<Receipt>> build() async {
    ref.watch(authProvider.select((s) => '${s.token ?? ''}:${s.agent?.id ?? ''}'));
    return withAuth(ref, () => ref.read(apiClientProvider).getReceipts());
  }

  Future<void> refresh() async {
    state = const AsyncLoading<List<Receipt>>().copyWithPrevious(state);
    state = await AsyncValue.guard(() => ref.read(apiClientProvider).getReceipts());
  }

  void upsert(Receipt receipt) {
    final current = state.value ?? [];
    final next = [receipt, ...current.where((e) => e.id != receipt.id)];
    state = AsyncData(next);
  }
}

final receiptsListProvider =
    AsyncNotifierProvider<ReceiptsListNotifier, List<Receipt>>(ReceiptsListNotifier.new);

final receiptsHubProvider = FutureProvider<ReceiptsHubData>((ref) async {
  final deliveries = await ref.watch(deliveriesListNotifierProvider.future);
  final receipts = await ref.watch(receiptsListProvider.future);
  return ReceiptsHubData(deliveries: deliveries, receipts: receipts);
});

void invalidateReceiptsData(WidgetRef ref) {
  ref.invalidate(deliveryReceiptsListProvider);
  ref.invalidate(receiptsHubProvider);
  unawaited(ref.read(deliveriesListNotifierProvider.notifier).refresh());
  unawaited(ref.read(receiptsListProvider.notifier).refresh());
}

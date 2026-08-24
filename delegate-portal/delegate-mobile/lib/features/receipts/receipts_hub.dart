import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/delegate_api.dart';
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

final deliveryReceiptsListProvider = FutureProvider<List<DeliveryReceipt>>((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getDeliveryReceipts());
});

final receiptsListProvider = FutureProvider<List<Receipt>>((ref) {
  ref.keepAlive();
  return withAuth(ref, () => ref.read(apiClientProvider).getReceipts());
});

final receiptsHubProvider = FutureProvider<ReceiptsHubData>((ref) {
  ref.keepAlive();
  return withAuth(ref, () async {
    final api = ref.read(apiClientProvider);
    final deliveries = await api.getDeliveryReceipts();
    final receipts = await api.getReceipts();
    return ReceiptsHubData(deliveries: deliveries, receipts: receipts);
  });
});

void invalidateReceiptsData(WidgetRef ref) {
  ref.invalidate(receiptsHubProvider);
  ref.invalidate(receiptsListProvider);
  ref.invalidate(deliveryReceiptsListProvider);
}

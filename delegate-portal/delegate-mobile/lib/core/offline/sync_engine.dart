import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/models.dart';
import '../api/api_client.dart';
import '../auth/data_refresh.dart';
import 'connectivity_service.dart';
import 'offline_api_client.dart';
import 'offline_stores.dart';
import 'outbox_store.dart';

class SyncStatus {
  const SyncStatus({
    this.syncing = false,
    this.pendingCount = 0,
    this.lastSyncAt,
    this.lastError,
  });

  final bool syncing;
  final int pendingCount;
  final DateTime? lastSyncAt;
  final String? lastError;

  SyncStatus copyWith({
    bool? syncing,
    int? pendingCount,
    DateTime? lastSyncAt,
    String? lastError,
  }) =>
      SyncStatus(
        syncing: syncing ?? this.syncing,
        pendingCount: pendingCount ?? this.pendingCount,
        lastSyncAt: lastSyncAt ?? this.lastSyncAt,
        lastError: lastError,
      );
}

class SyncStatusNotifier extends Notifier<SyncStatus> {
  @override
  SyncStatus build() {
    Future.microtask(_refreshPendingCount);
    return const SyncStatus();
  }

  Future<void> _refreshPendingCount() async {
    final count = await ref.read(outboxStoreProvider).pendingCount();
    state = state.copyWith(pendingCount: count);
  }

  void setSyncing(bool syncing) => state = state.copyWith(syncing: syncing);

  void setError(String? error) => state = state.copyWith(lastError: error);

  void markSynced() => state = state.copyWith(lastSyncAt: DateTime.now(), lastError: null);

  Future<void> refreshPendingCount() => _refreshPendingCount();
}

final syncStatusProvider = NotifierProvider<SyncStatusNotifier, SyncStatus>(SyncStatusNotifier.new);

class SyncEngine {
  SyncEngine(this._ref);

  final Ref _ref;

  Future<void> syncPending() async {
    if (!_ref.read(connectivityProvider).isOnline) return;
    final notifier = _ref.read(syncStatusProvider.notifier);
    notifier.setSyncing(true);
    try {
      final api = _ref.read(rawApiClientProvider);
      final outbox = _ref.read(outboxStoreProvider);
      final entries = await outbox.pending();
      for (final entry in entries) {
        try {
          await _processEntry(api, entry);
          await outbox.markDone(entry.id);
        } catch (e) {
          await outbox.markFailed(entry.id, e.toString());
          notifier.setError(e.toString());
        }
      }
      await notifier.refreshPendingCount();
      notifier.markSynced();
      _ref.read(delegateDataRefreshProvider)();
    } finally {
      notifier.setSyncing(false);
    }
  }

  Future<void> refreshCache() async {
    if (!_ref.read(connectivityProvider).isOnline) return;
    final client = _ref.read(apiClientProvider);
    final notifier = _ref.read(syncStatusProvider.notifier);
    notifier.setSyncing(true);
    try {
      await client.getTrees();
      await client.getOrders();
      await client.getReceipts();
      await client.getDeliveryReceipts();
      await client.getCustomerRequests();
      await client.getPromotionalVisits();
      await client.getGovernorates();
      await client.getVisitOutcomes();

      final branches = await client.getCatalogBranches();
      for (final branch in branches) {
        final sections = await client.getCatalogSections(branch.id);
        for (final section in sections) {
          await client.getProducts(section.id);
        }
      }

      final trees = await client.getTrees();
      for (final tree in trees) {
        await client.getPickableCustomers(tree.seq);
      }

      notifier.markSynced();
      _ref.read(delegateDataRefreshProvider)();
    } catch (e) {
      notifier.setError(e.toString());
    } finally {
      notifier.setSyncing(false);
    }
  }

  Future<void> fullSync() async {
    await syncPending();
    await refreshCache();
  }

  Future<void> _processEntry(ApiClient api, OutboxEntry entry) async {
    switch (entry.entityType) {
      case 'order':
        final body = entry.body!;
        await api.submitOrder(
          customerAccSeq: body['customerAccSeq'] as String?,
          customerRequestId: body['customerRequestId'] as int?,
          catalogBranchId: body['catalogBranchId'] as int,
          notes: body['notes'] as String?,
          lines: _parseOrderLines(body['lines'] as List),
        );
        return;
      case 'order_delete':
        await api.deleteOrder(_idFromPath(entry.path));
        return;
      case 'receipt':
        final body = entry.body!;
        await api.createReceipt(
          customerAccSeq: '${body['customerAccSeq']}',
          treeAccSeq: '${body['treeAccSeq']}',
          treeName: '${body['treeName']}',
          amount: body['amount'] as num,
          commission: body['commission'] as num? ?? 0,
          discount: body['discount'] as num? ?? 0,
          notes: body['notes'] as String?,
          deliveryReceiptId: body['deliveryReceiptId'] as int?,
        );
        return;
      case 'receipt_delete':
        await api.deleteReceipt(_idFromPath(entry.path));
        return;
      case 'delivery_receipt':
        final body = entry.body!;
        await api.createDeliveryReceipt(
          customerAccSeq: '${body['customerAccSeq']}',
          treeAccSeq: '${body['treeAccSeq']}',
          treeName: '${body['treeName']}',
          amount: body['amount'] as num,
          notes: body['notes'] as String?,
        );
        return;
      case 'delivery_delete':
        await api.deleteDeliveryReceipt(_idFromPath(entry.path));
        return;
      case 'delivery_printed':
        await api.markDeliveryReceiptPrinted(_idFromPath(entry.path));
        return;
      case 'customer_request':
        final body = entry.body!;
        await api.createCustomerRequest(
          treeAccSeq: '${body['treeAccSeq']}',
          treeName: '${body['treeName']}',
          name: '${body['name']}',
          phone: body['phone'] as String?,
          address: body['address'] as String?,
          notes: body['notes'] as String?,
        );
        return;
      case 'customer_request_delete':
        await api.deleteCustomerRequest(_idFromPath(entry.path));
        return;
      case 'promo_visit':
        final body = entry.body!;
        await api.createPromotionalVisit(
          governorateCode: '${body['governorateCode']}',
          areaName: '${body['areaName']}',
          shopName: '${body['shopName']}',
          visitOutcome: '${body['visitOutcome']}',
          notes: body['notes'] as String?,
        );
        return;
      case 'promo_delete':
        await api.deletePromotionalVisit(_idFromPath(entry.path));
        return;
      default:
        await api.requestJson(entry.method, entry.path, body: entry.body);
    }
  }

  List<OrderLine> _parseOrderLines(List raw) => raw.map((e) {
        final m = Map<String, dynamic>.from(e as Map);
        return OrderLine(
          productId: m['productId'] as int? ?? 0,
          matName: '${m['matName'] ?? ''}',
          quant: m['quant'] as num? ?? 0,
          bonus: m['bonus'] as num? ?? 0,
          tester: m['tester'] as num? ?? 0,
          unitPrice: m['unitPrice'] as num? ?? m['price'] as num? ?? 0,
          barcode: m['barcode'] as String?,
          lineTotal: m['lineTotal'] as num?,
        );
      }).toList();

  int _idFromPath(String path) {
    final parts = path.split('/').where((p) => p.isNotEmpty);
    for (final part in parts) {
      final id = int.tryParse(part);
      if (id != null) return id;
    }
    throw FormatException('لا يوجد رقم في المسار: $path');
  }
}

final syncEngineProvider = Provider<SyncEngine>((ref) => SyncEngine(ref));

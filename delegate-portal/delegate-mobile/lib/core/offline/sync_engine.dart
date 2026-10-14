import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../auth/auth_provider.dart';
import '../auth/data_refresh.dart';
import 'connectivity_service.dart';
import 'offline_api_client.dart';
import 'offline_stores.dart';
import 'outbox_store.dart';

class SyncStatus {
  const SyncStatus({
    this.syncing = false,
    this.pendingCount = 0,
    this.failedCount = 0,
    this.lastSyncAt,
    this.lastError,
    this.prefetching = false,
    this.prefetchProgress,
    this.prefetchLabel,
    this.lastPrefetchAt,
  });

  final bool syncing;
  final int pendingCount;
  /// عمليات رفضها الخادم عدة مرات — تنتظر قرار المندوب.
  final int failedCount;
  final DateTime? lastSyncAt;
  final String? lastError;
  final bool prefetching;
  /// 0..1 أثناء تنزيل البيانات للعمل دون اتصال.
  final double? prefetchProgress;
  final String? prefetchLabel;
  final DateTime? lastPrefetchAt;

  SyncStatus copyWith({
    bool? syncing,
    int? pendingCount,
    int? failedCount,
    DateTime? lastSyncAt,
    String? lastError,
    bool clearError = false,
    bool? prefetching,
    double? prefetchProgress,
    String? prefetchLabel,
    DateTime? lastPrefetchAt,
  }) =>
      SyncStatus(
        syncing: syncing ?? this.syncing,
        pendingCount: pendingCount ?? this.pendingCount,
        failedCount: failedCount ?? this.failedCount,
        lastSyncAt: lastSyncAt ?? this.lastSyncAt,
        lastError: clearError ? null : (lastError ?? this.lastError),
        prefetching: prefetching ?? this.prefetching,
        prefetchProgress: (prefetching ?? this.prefetching) ? (prefetchProgress ?? this.prefetchProgress) : null,
        prefetchLabel: (prefetching ?? this.prefetching) ? (prefetchLabel ?? this.prefetchLabel) : null,
        lastPrefetchAt: lastPrefetchAt ?? this.lastPrefetchAt,
      );
}

class SyncStatusNotifier extends Notifier<SyncStatus> {
  @override
  SyncStatus build() {
    Future.microtask(_refreshPendingCount);
    Future.microtask(_loadLastPrefetch);
    return const SyncStatus();
  }

  Future<void> _refreshPendingCount() async {
    final outbox = ref.read(outboxStoreProvider);
    final count = await outbox.pendingCount();
    final failed = await outbox.failedCount();
    state = state.copyWith(pendingCount: count, failedCount: failed);
  }

  Future<void> _loadLastPrefetch() async {
    final prefs = await SharedPreferences.getInstance();
    final ms = prefs.getInt(SyncEngine.lastPrefetchPrefsKey);
    if (ms != null) {
      state = state.copyWith(lastPrefetchAt: DateTime.fromMillisecondsSinceEpoch(ms));
    }
  }

  void setSyncing(bool syncing) => state = state.copyWith(syncing: syncing);

  void setError(String? error) =>
      state = error == null ? state.copyWith(clearError: true) : state.copyWith(lastError: error);

  void markSynced() => state = state.copyWith(lastSyncAt: DateTime.now(), clearError: true);

  /// البيانات المعروضة حُدّثت — دون مسح خطأ إرسال قائم.
  void markRefreshed() => state = state.copyWith(lastSyncAt: DateTime.now());

  void setPrefetch({required bool active, double? progress, String? label}) =>
      state = state.copyWith(prefetching: active, prefetchProgress: progress, prefetchLabel: label);

  void markPrefetched(DateTime at) => state = state.copyWith(lastPrefetchAt: at);

  Future<void> refreshPendingCount() => _refreshPendingCount();
}

final syncStatusProvider = NotifierProvider<SyncStatusNotifier, SyncStatus>(SyncStatusNotifier.new);

/// مزامنة: إرسال العمليات المحفوظة محلياً + تحديث البيانات المعروضة + تنزيل نسخة كاملة للعمل دون اتصال.
class SyncEngine {
  SyncEngine(this._ref);

  static const lastPrefetchPrefsKey = 'edari_last_offline_prefetch';
  /// بعد هذا العدد من الرفض من الخادم يتوقف الإرسال التلقائي ويُعرض للمندوب.
  static const maxServerRejections = 5;
  /// أقل مدة بين تنزيلين تلقائيين للنسخة الكاملة.
  static const autoPrefetchInterval = Duration(hours: 6);

  final Ref _ref;
  Future<void>? _syncInFlight;
  Future<void>? _liveInFlight;
  Future<void>? _prefetchInFlight;

  bool get _online => _ref.read(connectivityProvider).isOnline;

  /// يرسل العمليات المحفوظة محلياً بالترتيب. يتوقف عند انقطاع الشبكة دون احتساب محاولة.
  Future<void> syncPending() async {
    if (!_online) return;
    if (_syncInFlight != null) return _syncInFlight!;
    final run = _syncPendingImpl();
    _syncInFlight = run;
    try {
      await run;
    } finally {
      if (identical(_syncInFlight, run)) _syncInFlight = null;
    }
  }

  Future<void> _syncPendingImpl() async {
    final notifier = _ref.read(syncStatusProvider.notifier);
    final outbox = _ref.read(outboxStoreProvider);
    final initial = await outbox.pending();
    if (initial.isEmpty) {
      await notifier.refreshPendingCount();
      return;
    }
    notifier.setSyncing(true);
    var sent = 0;
    try {
      final client = _ref.read(apiClientProvider);
      try {
        await client.reconcileStaleLocalReceipts();
      } catch (_) {}

      final api = _ref.read(rawApiClientProvider);
      final entries = await outbox.pending();
      String? lastError;
      for (final entry in entries) {
        try {
          await _processEntry(api, entry);
          await _dropOutboxOptimistic(entry);
          await outbox.markDone(entry.id);
          sent++;
        } catch (e) {
          if (_isBenignOutboxError(e, entry)) {
            await _dropOutboxOptimistic(entry);
            await outbox.markDone(entry.id);
            sent++;
            continue;
          }
          if (_isNetworkError(e)) {
            // الشبكة انقطعت أثناء الإرسال — نتوقف ونعيد المحاولة لاحقاً دون احتساب رفض.
            lastError = 'انقطع الاتصال أثناء الإرسال — ستُعاد المحاولة تلقائياً';
            break;
          }
          if (_isTransientServerError(e)) {
            // عطل مؤقت في الخادم (5xx/429/408) أو جلسة منتهية — لا يُحتسب رفضاً.
            lastError = _statusOf(e) == 401
                ? 'انتهت الجلسة — سجّل الدخول مجدداً لإرسال العمليات'
                : 'الخادم مشغول مؤقتاً — ستُعاد المحاولة تلقائياً';
            break;
          }
          lastError = e.displayMessage;
          await outbox.markFailed(entry.id, lastError, failAfter: maxServerRejections);
        }
      }
      if (sent > 0) {
        try {
          await client.reconcileStaleLocalReceipts();
        } catch (_) {}
      }
      await notifier.refreshPendingCount();
      if (lastError == null) {
        notifier.markSynced();
      } else {
        notifier.setError(lastError);
      }
      if (sent > 0) _ref.read(delegateDataRefreshProvider)();
    } finally {
      notifier.setSyncing(false);
    }
  }

  /// تحديث حي: يرسل المعلّق ثم يعيد جلب البيانات المعروضة حالياً من الخادم.
  Future<void> refreshLive() {
    return _liveInFlight ??= _refreshLiveImpl().whenComplete(() => _liveInFlight = null);
  }

  Future<void> _refreshLiveImpl() async {
    if (!_online) {
      // ربما عاد الخادم — فحص سريع بدل الانتظار.
      await _ref.read(connectivityProvider.notifier).probe();
      if (!_online) return;
    }
    if (_ref.read(syncStatusProvider).pendingCount > 0) {
      await syncPending();
    }
    _ref.read(delegateDataRefreshProvider)();
    final notifier = _ref.read(syncStatusProvider.notifier);
    if (_ref.read(syncStatusProvider).pendingCount == 0) {
      notifier.markSynced();
    } else {
      notifier.markRefreshed();
    }
  }

  /// يُستدعى عند عودة الاتصال.
  Future<void> onReconnected() async {
    await syncPending();
    await refreshLive();
    unawaited(prefetchForOffline().catchError((Object _) {}));
  }

  /// ينزّل نسخة كاملة من البيانات (الزبائن، الطلبات، السندات، المنتجات، ...) للعمل دون اتصال.
  ///
  /// تلقائياً مرة كل [autoPrefetchInterval]، أو فوراً عند [force].
  /// [statements] ينزّل كشف حساب كل زبون أيضاً (أبطأ).
  Future<void> prefetchForOffline({bool force = false, bool statements = false}) {
    return _prefetchInFlight ??= _prefetchImpl(force: force, statements: statements)
        .whenComplete(() => _prefetchInFlight = null);
  }

  Future<void> _prefetchImpl({required bool force, required bool statements}) async {
    if (!_online) {
      if (force) throw ApiException('تنزيل البيانات يتطلب اتصالاً بالشبكة');
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    if (!force) {
      final last = prefs.getInt(lastPrefetchPrefsKey);
      if (last != null &&
          DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(last)) < autoPrefetchInterval) {
        return;
      }
    }

    final client = _ref.read(apiClientProvider);
    final notifier = _ref.read(syncStatusProvider.notifier);
    final isSecondary = _ref.read(authProvider).agent?.isSecondary ?? false;
    notifier.setPrefetch(active: true, progress: 0, label: 'البيانات الأساسية');

    var failures = 0;
    Future<void> safe(Future<void> Function() task) async {
      if (!_online) throw ApiException('انقطع الاتصال أثناء التنزيل');
      try {
        await task();
      } on ApiException catch (e) {
        if (e.statusCode == 401) rethrow;
        failures++;
      } catch (_) {
        failures++;
      }
    }

    try {
      await Future.wait([
        safe(() => client.getTrees()),
        safe(() => client.getOrders()),
        if (!isSecondary) safe(() => client.getReceipts()),
        safe(() => client.getDeliveryReceipts()),
        safe(() => client.getCustomerRequests()),
        safe(() => client.getPromotionalVisits()),
        safe(() => client.getGovernorates()),
        safe(() => client.getVisitOutcomes()),
        safe(() => client.getDeliveryReceiptPrintTemplate()),
      ]);

      // الزبائن لكل شجرة.
      final trees = await client.cacheOnly(() => client.getTrees()) ?? const <AccountTree>[];
      final leaves = <BranchAccount>[];
      for (var i = 0; i < trees.length; i++) {
        notifier.setPrefetch(active: true, progress: 0.1 + 0.25 * (i / trees.length), label: 'الزبائن: ${trees[i].name1}');
        await safe(() async {
          final children = await client.getChildren(trees[i].seq);
          leaves.addAll(children);
        });
        await safe(() => client.getPickableCustomers(trees[i].seq).then((_) {}));
      }

      // المنتجات.
      final branches = await (() async {
        try {
          return await client.getCatalogBranches();
        } catch (_) {
          return const <CatalogBranch>[];
        }
      })();
      final sectionsAll = <CatalogSection>[];
      for (final branch in branches) {
        await safe(() async => sectionsAll.addAll(await client.getCatalogSections(branch.id)));
      }
      for (var i = 0; i < sectionsAll.length; i++) {
        notifier.setPrefetch(
          active: true,
          progress: 0.35 + (statements ? 0.25 : 0.65) * (i / sectionsAll.length),
          label: 'المنتجات: ${sectionsAll[i].name}',
        );
        await safe(() => client.getProducts(sectionsAll[i].id).then((_) {}));
      }

      // كشوف الحساب — اختياري.
      if (statements) {
        for (var i = 0; i < leaves.length; i++) {
          notifier.setPrefetch(
            active: true,
            progress: 0.6 + 0.4 * (i / leaves.length),
            label: 'كشف حساب ${i + 1} من ${leaves.length}',
          );
          await safe(() => client.getStatement(leaves[i].seq).then((_) {}));
        }
      }

      if (failures > 0) {
        // تنزيل ناقص — لا نسجّله كمكتمل حتى تُعاد المحاولة لاحقاً.
        throw ApiException('تعذّر تنزيل بعض البيانات ($failures) — أعد المحاولة عند تحسّن الاتصال');
      }
      final now = DateTime.now();
      await prefs.setInt(lastPrefetchPrefsKey, now.millisecondsSinceEpoch);
      notifier.markPrefetched(now);
      notifier.markSynced();
    } finally {
      notifier.setPrefetch(active: false);
    }
  }

  /// للتوافق مع الاستدعاءات القديمة.
  Future<void> fullSync({bool deepCatalog = true}) async {
    await syncPending();
    await refreshLive();
    if (deepCatalog) await prefetchForOffline(force: true);
  }

  int? _statusOf(Object e) {
    if (e is DioException) return e.response?.statusCode;
    if (e is ApiException) return e.statusCode;
    return null;
  }

  bool _isTransientServerError(Object e) {
    final s = _statusOf(e);
    if (s == null) return false;
    return s >= 500 || s == 408 || s == 429 || s == 401;
  }

  bool _isNetworkError(Object e) {
    if (e is DioException) return e.response == null;
    if (e is ApiException) return e.statusCode == null;
    return false;
  }

  Future<void> _processEntry(ApiClient api, OutboxEntry entry) async {
    switch (entry.entityType) {
      case 'order':
        final body = entry.body!;
        final clientRequestId = '${body['clientRequestId'] ?? entry.id}';
        final order = await api.submitOrder(
          customerAccSeq: body['customerAccSeq'] as String?,
          customerRequestId: body['customerRequestId'] as int?,
          catalogBranchId: body['catalogBranchId'] as int,
          notes: body['notes'] as String?,
          lines: _parseOrderLines(body['lines'] as List),
          clientRequestId: clientRequestId,
        );
        await _ref.read(apiClientProvider).applyServerOrderAfterSubmit(order, clientRequestId);
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
          clientRequestId: body['clientRequestId'] as String? ?? entry.id,
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
          clientRequestId: body['clientRequestId'] as String? ?? entry.id,
        );
        return;
      case 'delivery_delete':
        await api.deleteDeliveryReceipt(_idFromPath(entry.path));
        return;
      case 'delivery_printed':
        await api.markDeliveryReceiptPrinted(_idFromPath(entry.path));
        return;
      case 'delivery_handover':
        await api.markDeliveryHandoverReceived(
          _idFromPath(entry.path),
          note: entry.body?['note'] as String?,
        );
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
          centerPhone: body['centerPhone'] as String?,
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

  bool _isBenignOutboxError(Object e, OutboxEntry entry) {
    if (_isNetworkError(e)) return false;
    final msg = e.toString();
    final status = e is ApiException ? e.statusCode : null;
    final isDelete = entry.entityType.endsWith('_delete');
    // حذف عنصر لم يعد موجوداً على الخادم = تم المطلوب.
    if (isDelete && (status == 404 || msg.contains('غير موجود'))) return true;
    if (entry.entityType == 'receipt' && (msg.contains('مسبق') || msg.contains('مسبقاً'))) return true;
    if (entry.entityType == 'delivery_receipt' && msg.contains('مسبق')) return true;
    if (entry.entityType == 'delivery_printed') return true;
    if (entry.entityType == 'order' && (msg.contains('client_request') || msg.contains('مسبق'))) return true;
    return false;
  }

  Future<void> _dropOutboxOptimistic(OutboxEntry entry) async {
    final opt = entry.optimisticJson;
    if (opt == null || entry.listCacheKey == null) return;
    final id = opt['id'];
    if (id == null) return;
    await _ref.read(cacheStoreProvider).removeListItem(entry.listCacheKey!, id);
  }
}

final syncEngineProvider = Provider<SyncEngine>((ref) => SyncEngine(ref));

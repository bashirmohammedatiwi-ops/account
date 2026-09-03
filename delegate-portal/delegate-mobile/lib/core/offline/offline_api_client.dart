import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/models.dart';
import '../../features/receipts/thermal_print_service.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';
import '../api/login_api.dart';
import '../auth/auth_provider.dart';
import '../utils/formatters.dart';
import 'cache_store.dart';
import 'connectivity_service.dart';
import 'offline_keys.dart';
import 'offline_stores.dart';
import 'outbox_store.dart';
import 'sync_engine.dart';

int _localId() => -DateTime.now().millisecondsSinceEpoch;

int _rowId(dynamic value) {
  if (value == null) return 0;
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse('$value') ?? 0;
}

List<Map<String, dynamic>> _rawDeliveryRows(dynamic data) {
  if (data is! Map) return [];
  final list = data['deliveryReceipts'] ?? data['delivery_receipts'];
  if (list is! List) return [];
  return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
}

List<Map<String, dynamic>> _syncListWithServer(
  List<Map<String, dynamic>> online,
  List<Map<String, dynamic>> cached,
) {
  final onlineIds = online.map((r) => _rowId(r['id'])).where((id) => id > 0).toSet();

  final pending = cached.where((row) {
    final id = _rowId(row['id']);
    if (id < 0) return true;
    if (row['localPending'] == true && !onlineIds.contains(id)) return true;
    return false;
  });

  final byId = <int, Map<String, dynamic>>{};
  for (final row in online) {
    byId[_rowId(row['id'])] = row;
  }
  for (final row in pending) {
    byId[_rowId(row['id'])] = row;
  }

  final synced = byId.values.toList();
  synced.sort((a, b) => _rowId(b['id']).compareTo(_rowId(a['id'])));
  return synced;
}

Map<String, dynamic> _normalizeDeliveryRow(Map<String, dynamic> json) {
  final status = '${json['status'] ?? 'issued'}';
  return {
    'id': json['id'],
    'deliveryNo': json['deliveryNo'] ?? json['delivery_no'] ?? '',
    'status': status,
    'statusLabel': json['statusLabel'] ?? json['status_label'] ?? (status == 'linked' ? 'مرتبط بسند قبض' : 'مُصدَّر'),
    'agentId': json['agentId'] ?? json['agent_id'],
    'amount': json['amount'] ?? 0,
    'customerName': json['customerName'] ?? json['customer_name'],
    'customerNum': json['customerNum'] ?? json['customer_num'],
    'customerAccSeq': json['customerAccSeq'] ?? json['customer_acc_seq'],
    'treeAccSeq': json['treeAccSeq'] ?? json['tree_acc_seq'],
    'treeName': json['treeName'] ?? json['tree_name'],
    'notes': json['notes'],
    'receiptDate': json['receiptDate'] ?? json['receipt_date'],
    'printedAt': json['printedAt'] ?? json['printed_at'],
    'receiptId': json['receiptId'] ?? json['receipt_id'],
    'linkedReceiptNo': json['linkedReceiptNo'] ?? json['linked_receipt_no'],
    'createdAt': json['createdAt'] ?? json['created_at'],
  };
}

/// عميل API مع تخزين محلي وقائمة إرسال عند عودة الشبكة.
class OfflineApiClient {
  OfflineApiClient(this._api, this._ref);

  final ApiClient _api;
  final Ref _ref;

  CacheStore get _cache => _ref.read(cacheStoreProvider);
  OutboxStore get _outbox => _ref.read(outboxStoreProvider);

  bool get _online => _ref.read(connectivityProvider).isOnline;
  String get serverUrl => _api.serverUrl;

  int? get _agentId => _ref.read(authProvider).agent?.id;

  String _receiptsCacheKey({String? status}) {
    final agentId = _agentId;
    if (agentId == null) {
      return status != null ? '${OfflineKeys.receipts}:$status' : OfflineKeys.receipts;
    }
    return OfflineKeys.receiptsForAgent(agentId, status: status);
  }

  String _deliveryCacheKey({String? status}) {
    final agentId = _agentId;
    if (agentId == null) {
      return status != null ? '${OfflineKeys.deliveryReceipts}:$status' : OfflineKeys.deliveryReceipts;
    }
    return OfflineKeys.deliveryReceiptsForAgent(agentId, status: status);
  }

  List<Map<String, dynamic>> _filterRowsForCurrentAgent(List<Map<String, dynamic>> rows) {
    final agentId = _agentId;
    if (agentId == null) return rows;
    return rows.where((row) {
      final rowAgent = row['agentId'] ?? row['agent_id'];
      if (rowAgent == null) return _rowId(row['id']) < 0 || row['localPending'] == true;
      return _rowId(rowAgent) == agentId;
    }).toList();
  }

  /// يحذف المخزن القديم المشترك بين المندوبين بعد تسجيل الدخول/الخروج.
  Future<void> resetReceiptCachesForSession() async {
    await _cache.deleteLegacyReceiptCaches();
  }

  Future<void> _bumpPendingCount() => _ref.read(syncStatusProvider.notifier).refreshPendingCount();

  Future<T> _withCache<T>({
    required String cacheKey,
    required Future<T> Function() onlineFetch,
    required Future<T?> Function() offlineRead,
    String offlineMessage = 'لا توجد نسخة محلية — اتصل بالشبكة لأول مرة',
  }) async {
    if (_online) {
      try {
        return await onlineFetch();
      } on ApiException catch (e) {
        if (e.statusCode == 401) throw e;
        final cached = await offlineRead();
        if (cached != null) return cached;
        throw e;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) {
          throw ApiException('انتهت الجلسة — سجّل الدخول مجدداً', statusCode: 401);
        }
        final cached = await offlineRead();
        if (cached != null) return cached;
        throw ApiException(_apiNetworkMessage(e));
      }
    }
    final cached = await offlineRead();
    if (cached != null) return cached;
    throw ApiException(offlineMessage);
  }

  String _apiNetworkMessage(DioException e) {
    if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
      return 'فشل الاتصال — تحقق من الشبكة وحاول مجدداً';
    }
    return e.message ?? 'فشل الاتصال — تحقق من الشبكة وحاول مجدداً';
  }

  Future<void> _indexAccounts(List<BranchAccount> accounts) async {
    if (accounts.isEmpty) return;
    final raw = await _cache.getJson(OfflineKeys.searchIndex);
    final list = raw is List
        ? List<Map<String, dynamic>>.from(raw.map((e) => Map<String, dynamic>.from(e as Map)))
        : <Map<String, dynamic>>[];
    final bySeq = <String, Map<String, dynamic>>{};
    for (final e in list) {
      final seq = '${e['seq'] ?? ''}';
      if (seq.isNotEmpty) bySeq[seq] = e;
    }
    for (final a in accounts) {
      bySeq[a.seq] = {
        'seq': a.seq,
        'num': a.accountNum,
        'name1': a.name1,
        'name2': a.name2,
        'address': a.address,
        'bal': a.bal,
      };
    }
    await _cache.setJson(OfflineKeys.searchIndex, bySeq.values.toList());
  }

  Future<void> _indexProductMaps(List<Map<String, dynamic>> raw, {int? branchId}) async {
    if (raw.isEmpty) return;
    final cached = await _cache.getJson(OfflineKeys.productIndex);
    final list = cached is List
        ? List<Map<String, dynamic>>.from(cached.map((e) => Map<String, dynamic>.from(e as Map)))
        : <Map<String, dynamic>>[];
    final codes = <String, Map<String, dynamic>>{};
    for (final e in list) {
      final code = '${e['code'] ?? ''}'.trim().toLowerCase();
      if (code.isNotEmpty) codes[code] = e;
    }
    for (final m in raw) {
      final code = '${m['barcode'] ?? ''}'.trim().toLowerCase();
      if (code.isEmpty) continue;
      codes[code] = {
        'code': m['barcode'],
        if (branchId != null) 'branchId': branchId,
        'product': m,
      };
    }
    await _cache.setJson(OfflineKeys.productIndex, codes.values.toList());
  }

  Map<String, dynamic> _orderMap(Order o) => {
        'id': o.id,
        'status': o.status,
        'statusLabel': o.statusLabel ?? displayOrderStatusLabel(status: o.status),
        'createdAt': o.createdAt,
        'customerName': o.customerName,
        'customerAccSeq': o.customerAccSeq,
        'catalogBranchName': o.catalogBranchName,
        'notes': o.notes,
        'totalAmount': o.totalAmount,
        'lines': o.lines.map((l) => l.toJson()).toList(),
      };

  Future<LoginResult> login(String username, String password) => _api.login(username, password);

  Future<Agent> me() async {
    if (_online) {
      try {
        return await _api.me();
      } on ApiException catch (e) {
        if (e.statusCode == 401) throw e;
      } catch (_) {}
    }
    final agent = _ref.read(authProvider).agent;
    if (agent != null) return agent;
    throw ApiException('لا توجد بيانات محلية للمندوب');
  }

  Future<List<AccountTree>> getTrees() => _withCache(
        cacheKey: OfflineKeys.trees,
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/trees');
          final raw = (data['trees'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.trees, raw);
          return raw.map(AccountTree.fromJson).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.trees);
          if (raw is! List) return null;
          return raw.map((e) => AccountTree.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<BranchAccount>> getChildren(String seq, {bool leaves = true}) => _withCache(
        cacheKey: OfflineKeys.children(seq),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/accounts/$seq/children', query: leaves ? {'view': 'leaves'} : null);
          final raw = (data['children'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.children(seq), raw);
          final accounts = raw.map(BranchAccount.fromJson).toList();
          await _indexAccounts(accounts);
          return accounts;
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.children(seq));
          if (raw is! List) return null;
          return raw.map((e) => BranchAccount.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<BranchAccount>> getPickableCustomers(String treeSeq) => _withCache(
        cacheKey: OfflineKeys.pickable(treeSeq),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/accounts/$treeSeq/pickable-customers');
          final raw = (data['customers'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.pickable(treeSeq), raw);
          final accounts = raw.map(BranchAccount.fromJson).toList();
          await _indexAccounts(accounts);
          return accounts;
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.pickable(treeSeq));
          if (raw is! List) return null;
          return raw.map((e) => BranchAccount.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<AccountStatement> getStatement(String seq) => _withCache(
        cacheKey: OfflineKeys.statement(seq),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/accounts/$seq/statement');
          await _cache.setJson(OfflineKeys.statement(seq), data);
          return AccountStatement.fromJson(data);
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.statement(seq));
          if (raw is! Map) return null;
          return AccountStatement.fromJson(Map<String, dynamic>.from(raw));
        },
      );

  Future<Uint8List> getStatementPdf(String seq) async {
    if (!_online) throw ApiException('تحميل PDF يتطلب اتصالاً بالشبكة');
    return _api.requestBytes('/accounts/$seq/statement.pdf');
  }

  Future<InvoiceDetail> getInvoice(String ref, {String by = 'auto', String? accSeq}) => _withCache(
        cacheKey: OfflineKeys.invoice(ref, by, accSeq),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/invoices/$ref', query: {
            'by': by,
            if (accSeq != null && accSeq.isNotEmpty) 'acc': accSeq,
          });
          await _cache.setJson(OfflineKeys.invoice(ref, by, accSeq), data);
          return InvoiceDetail.fromJson(data);
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.invoice(ref, by, accSeq));
          if (raw is! Map) return null;
          return InvoiceDetail.fromJson(Map<String, dynamic>.from(raw));
        },
      );

  Future<Uint8List> getInvoicePdf(String ref, {String by = 'auto', String? accSeq}) async {
    if (!_online) throw ApiException('تحميل PDF يتطلب اتصالاً بالشبكة');
    return _api.requestBytes('/invoices/$ref.pdf', query: {
      'by': by,
      if (accSeq != null && accSeq.isNotEmpty) 'acc': accSeq,
    });
  }

  Future<List<CatalogBranch>> getCatalogBranches() => _withCache(
        cacheKey: OfflineKeys.catalogBranches,
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/catalog/branches');
          final raw = (data['branches'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.catalogBranches, raw);
          return raw.map(CatalogBranch.fromJson).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.catalogBranches);
          if (raw is! List) return null;
          return raw.map((e) => CatalogBranch.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<CatalogSection>> getCatalogSections(int branchId) => _withCache(
        cacheKey: OfflineKeys.sections(branchId),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/catalog/branches/$branchId/sections');
          final raw = (data['sections'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.sections(branchId), raw);
          return raw.map(CatalogSection.fromJson).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.sections(branchId));
          if (raw is! List) return null;
          return raw.map((e) => CatalogSection.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<Product>> getProducts(int sectionId) => _withCache(
        cacheKey: OfflineKeys.products(sectionId),
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/catalog/sections/$sectionId/products');
          final raw = (data['products'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.products(sectionId), raw);
          final products = raw.map((e) => Product.fromJson(e, serverUrl: serverUrl)).toList();
          await _indexProductMaps(raw, branchId: null);
          return products;
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.products(sectionId));
          if (raw is! List) return null;
          return raw.map((e) => Product.fromJson(Map<String, dynamic>.from(e as Map), serverUrl: serverUrl)).toList();
        },
      );

  Future<List<Order>> _readOrdersList(String cacheKey, Future<Map<String, dynamic>> Function() fetch) => _withCache(
        cacheKey: cacheKey,
        onlineFetch: () async {
          final data = await fetch();
          final raw = (data['orders'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(cacheKey, raw);
          return raw.map((e) => Order.fromJson(e)).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(cacheKey);
          if (raw is! List) return null;
          return raw.map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<Order>> getOrders({String? status}) {
    final cacheKey = status != null ? '${OfflineKeys.orders}:$status' : OfflineKeys.orders;
    return _readOrdersList(cacheKey, () => _api.requestJson('GET', '/orders', query: status != null ? {'status': status} : null));
  }

  Future<Order> getOrder(int id) async {
    if (id < 0) {
      final raw = await _cache.getJson(OfflineKeys.orders);
      if (raw is List) {
        for (final e in raw) {
          final m = Map<String, dynamic>.from(e as Map);
          if (m['id'] == id) return Order.fromJson(m);
        }
      }
      throw ApiException('الطلب غير موجود محلياً');
    }
    return _withCache(
      cacheKey: OfflineKeys.orderDetail(id),
      onlineFetch: () async {
        final data = await _api.requestJson('GET', '/orders/$id');
        final orderMap = Map<String, dynamic>.from(data['order'] as Map);
        await _cache.setJson(OfflineKeys.orderDetail(id), orderMap);
        return Order.fromJson(orderMap);
      },
      offlineRead: () async {
        final raw = await _cache.getJson(OfflineKeys.orderDetail(id));
        if (raw is Map) return Order.fromJson(Map<String, dynamic>.from(raw));
        final list = await _cache.getJson(OfflineKeys.orders);
        if (list is List) {
          for (final e in list) {
            final m = Map<String, dynamic>.from(e as Map);
            if (m['id'] == id) return Order.fromJson(m);
          }
        }
        return null;
      },
    );
  }

  Future<Order> submitOrder({
    String? customerAccSeq,
    int? customerRequestId,
    required int catalogBranchId,
    required String? notes,
    required List<OrderLine> lines,
  }) async {
    final body = {
      if (customerAccSeq != null && customerAccSeq.isNotEmpty) 'customerAccSeq': customerAccSeq,
      if (customerRequestId != null) 'customerRequestId': customerRequestId,
      'catalogBranchId': catalogBranchId,
      'notes': notes,
      'lines': lines.map((l) => l.toJson()).toList(),
      'submit': true,
    };
    final localId = _localId();
    final total = lines.fold<num>(0, (s, l) => s + (l.lineTotal ?? l.quant * l.unitPrice));
    final optimistic = {
      'id': localId,
      'status': 'pending',
      'statusLabel': 'بانتظار الإرسال',
      'createdAt': DateTime.now().toIso8601String(),
      'totalAmount': total,
      'notes': notes,
      'localPending': true,
      'lines': lines.map((l) => l.toJson()).toList(),
    };

    Future<Order> queueLocal() async {
      await _outbox.enqueue(
        method: 'POST',
        path: '/orders',
        entityType: 'order',
        body: body,
        optimisticJson: optimistic,
        listCacheKey: OfflineKeys.orders,
      );
      await _cache.mergeListItem(OfflineKeys.orders, optimistic);
      await _bumpPendingCount();
      return Order.fromJson(optimistic);
    }

    if (!_online) return queueLocal();
    try {
      final order = await _api.submitOrder(
        customerAccSeq: customerAccSeq,
        customerRequestId: customerRequestId,
        catalogBranchId: catalogBranchId,
        notes: notes,
        lines: lines,
      );
      await _cache.mergeListItem(OfflineKeys.orders, _orderMap(order));
      return order;
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      return queueLocal();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      return queueLocal();
    }
  }

  Future<List<BranchAccount>> searchAccounts(String q) async {
    final trimmed = q.trim();
    if (trimmed.isEmpty) return [];
    if (_online) {
      try {
        final data = await _api.requestJson('GET', '/search', query: {'q': trimmed});
        final raw = (data['results'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        final accounts = raw.map(BranchAccount.fromJson).toList();
        await _indexAccounts(accounts);
        return accounts;
      } on ApiException catch (e) {
        if (e.statusCode == 401) throw e;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      }
    }
    final raw = await _cache.getJson(OfflineKeys.searchIndex);
    if (raw is! List) return [];
    final qn = trimmed.toLowerCase();
    final results = <BranchAccount>[];
    for (final e in raw) {
      final m = Map<String, dynamic>.from(e as Map);
      final name = '${m['name1'] ?? ''}'.toLowerCase();
      final num = '${m['num'] ?? m['accountNum'] ?? ''}'.toLowerCase();
      if (name.contains(qn) || num.contains(qn)) {
        results.add(BranchAccount.fromJson(m));
      }
    }
    return results;
  }

  Future<Product> lookupProduct(String code, {int? branchId}) async {
    if (_online) {
      try {
        final product = await _api.lookupProduct(code, branchId: branchId);
        await _indexProductMaps(
          [{
            'id': product.id,
            'name': product.name,
            'price': product.price,
            'barcode': product.barcode,
            'skuNum': product.skuNum,
            'imageUrl': product.imageUrl,
            'stockHint': product.stockHint,
          }],
          branchId: branchId,
        );
        return product;
      } on ApiException catch (e) {
        if (e.statusCode == 401) throw e;
      } on DioException catch (e) {
        if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      }
    }
    final cn = code.trim().toLowerCase();
    final raw = await _cache.getJson(OfflineKeys.productIndex);
    if (raw is List) {
      for (final e in raw) {
        final m = Map<String, dynamic>.from(e as Map);
        final c = '${m['code'] ?? ''}'.trim().toLowerCase();
        final b = m['branchId'] as int?;
        if (c == cn && (branchId == null || b == null || b == branchId)) {
          final pm = Map<String, dynamic>.from(m['product'] as Map);
          return Product.fromJson(pm, serverUrl: serverUrl);
        }
      }
    }
    throw ApiException('المنتج غير موجود في الذاكرة المحلية');
  }

  Future<SalesReportResult> getSalesReport({
    required String treeSeq,
    required String dateFrom,
    required String dateTo,
    int limit = 100,
    int offset = 0,
  }) async {
    if (!_online) throw ApiException('التقارير تتطلب اتصالاً بالشبكة');
    return _api.getSalesReport(treeSeq: treeSeq, dateFrom: dateFrom, dateTo: dateTo, limit: limit, offset: offset);
  }

  Future<List<Receipt>> _parseReceiptList(List<Map<String, dynamic>> raw) async {
    final out = <Receipt>[];
    for (final e in raw) {
      try {
        out.add(Receipt.fromJson(e));
      } catch (_) {}
    }
    return out;
  }

  Future<List<DeliveryReceipt>> _parseDeliveryList(List<Map<String, dynamic>> raw) async {
    final out = <DeliveryReceipt>[];
    for (final e in raw) {
      try {
        out.add(DeliveryReceipt.fromJson(_normalizeDeliveryRow(e)));
      } catch (_) {}
    }
    return out;
  }

  Future<List<Receipt>> _readReceiptsList(String cacheKey, Future<Map<String, dynamic>> Function() fetch) => _withCache(
        cacheKey: cacheKey,
        onlineFetch: () async {
          await _cache.deleteLegacyReceiptCaches();
          final data = await fetch();
          final raw = (data['receipts'] as List?)
                  ?.map((e) => Map<String, dynamic>.from(e as Map))
                  .toList() ??
              <Map<String, dynamic>>[];
          final cachedJson = await _cache.getJson(cacheKey);
          final cachedRaw = cachedJson is List
              ? cachedJson.map((e) => Map<String, dynamic>.from(e as Map)).toList()
              : <Map<String, dynamic>>[];
          final synced = _syncListWithServer(raw, cachedRaw);
          await _cache.setJson(cacheKey, synced);
          return _parseReceiptList(synced);
        },
        offlineRead: () async {
          final raw = await _cache.getJson(cacheKey);
          if (raw is! List) return null;
          final rows = _filterRowsForCurrentAgent(raw.map((e) => Map<String, dynamic>.from(e as Map)).toList());
          return _parseReceiptList(rows);
        },
      );

  Future<List<Receipt>> getReceipts({String? status}) {
    final cacheKey = _receiptsCacheKey(status: status);
    return _readReceiptsList(cacheKey, () => _api.requestJson('GET', '/receipts', query: status != null ? {'status': status} : null));
  }

  Future<Receipt> createReceipt({
    required String customerAccSeq,
    required String treeAccSeq,
    required String treeName,
    required num amount,
    num commission = 0,
    num discount = 0,
    String? notes,
    int? deliveryReceiptId,
  }) async {
    final body = {
      'customerAccSeq': customerAccSeq,
      'treeAccSeq': treeAccSeq,
      'treeName': treeName,
      'amount': amount,
      'commission': commission,
      'discount': discount,
      'notes': notes ?? '',
      if (deliveryReceiptId != null) 'deliveryReceiptId': deliveryReceiptId,
    };
    final localId = _localId();
    final cacheKey = _receiptsCacheKey();
    final optimistic = {
      'id': localId,
      'receiptNo': 'LOCAL-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'pending',
      'statusLabel': 'بانتظار الإرسال',
      'amount': amount,
      'commission': commission,
      'discount': discount,
      'treeName': treeName,
      'notes': notes,
      'createdAt': DateTime.now().toIso8601String(),
      'localPending': true,
      if (_agentId != null) 'agentId': _agentId,
    };

    Future<Receipt> queueLocal() async {
      await _outbox.enqueue(
        method: 'POST',
        path: '/receipts',
        entityType: 'receipt',
        body: body,
        optimisticJson: optimistic,
        listCacheKey: cacheKey,
      );
      await _cache.mergeListItem(cacheKey, optimistic);
      return Receipt.fromJson(optimistic);
    }

    if (!_online) return queueLocal();
    try {
      final receipt = await _api.createReceipt(
        customerAccSeq: customerAccSeq,
        treeAccSeq: treeAccSeq,
        treeName: treeName,
        amount: amount,
        commission: commission,
        discount: discount,
        notes: notes,
        deliveryReceiptId: deliveryReceiptId,
      );
      await _cache.mergeListItem(cacheKey, Map<String, dynamic>.from({
        'id': receipt.id,
        'receiptNo': receipt.receiptNo,
        'status': receipt.status,
        'statusLabel': receipt.statusLabel,
        'amount': receipt.amount,
        'commission': receipt.commission,
        'discount': receipt.discount,
        'customerName': receipt.customerName,
        'customerNum': receipt.customerNum,
        'treeName': receipt.treeName,
        'notes': receipt.notes,
        'receiptDate': receipt.receiptDate,
        'createdAt': receipt.createdAt,
        if (_agentId != null) 'agentId': _agentId,
      }));
      return receipt;
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      return queueLocal();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      return queueLocal();
    }
  }

  Future<List<DeliveryReceipt>> _readDeliveryList(String cacheKey, Future<Map<String, dynamic>> Function() fetch) => _withCache(
        cacheKey: cacheKey,
        onlineFetch: () async {
          await _cache.deleteLegacyReceiptCaches();
          final data = await fetch();
          final onlineRaw = _rawDeliveryRows(data);
          final cachedJson = await _cache.getJson(cacheKey);
          final cachedRaw = cachedJson is List
              ? cachedJson.map((e) => Map<String, dynamic>.from(e as Map)).toList()
              : <Map<String, dynamic>>[];
          final synced = _syncListWithServer(onlineRaw, cachedRaw);
          await _cache.setJson(cacheKey, synced);
          return _parseDeliveryList(synced);
        },
        offlineRead: () async {
          final raw = await _cache.getJson(cacheKey);
          if (raw is! List) return null;
          final rows = _filterRowsForCurrentAgent(raw.map((e) => Map<String, dynamic>.from(e as Map)).toList());
          return _parseDeliveryList(rows);
        },
      );

  Future<List<DeliveryReceipt>> getDeliveryReceipts({String? status}) {
    final cacheKey = _deliveryCacheKey(status: status);
    return _readDeliveryList(cacheKey, () => _api.requestJson('GET', '/delivery-receipts', query: status != null ? {'status': status} : null));
  }

  Future<Map<String, dynamic>?> getDeliveryReceiptPrintTemplate() async {
    if (_online) {
      try {
        final data = await _api.requestJson('GET', '/delivery-receipts/print-template');
        final template = Map<String, dynamic>.from(data['template'] as Map);
        await _cache.setJson(OfflineKeys.deliveryPrintTemplate, template);
        await ThermalPrintService.cacheTemplate(template);
        return template;
      } catch (_) {}
    }
    final raw = await _cache.getJson(OfflineKeys.deliveryPrintTemplate);
    if (raw is Map) {
      final template = Map<String, dynamic>.from(raw);
      await ThermalPrintService.cacheTemplate(template);
      return template;
    }
    return null;
  }

  Future<DeliveryReceipt> createDeliveryReceipt({
    required String customerAccSeq,
    required String treeAccSeq,
    required String treeName,
    required num amount,
    String? notes,
    String? displayCustomerName,
    String? displayCustomerNum,
  }) async {
    final body = {
      'customerAccSeq': customerAccSeq,
      'treeAccSeq': treeAccSeq,
      'treeName': treeName,
      'amount': amount,
      'notes': notes ?? '',
    };
    final localId = _localId();
    final cacheKey = _deliveryCacheKey();
    final optimistic = {
      'id': localId,
      'deliveryNo': 'LOCAL-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'issued',
      'statusLabel': 'بانتظار الإرسال',
      'amount': amount,
      'treeName': treeName,
      'customerAccSeq': customerAccSeq,
      'treeAccSeq': treeAccSeq,
      'customerName': displayCustomerName ?? '',
      'customerNum': displayCustomerNum ?? '',
      'notes': notes,
      'createdAt': DateTime.now().toIso8601String(),
      'localPending': true,
      if (_agentId != null) 'agentId': _agentId,
    };

    Future<DeliveryReceipt> queueLocal() async {
      await _outbox.enqueue(
        method: 'POST',
        path: '/delivery-receipts',
        entityType: 'delivery_receipt',
        body: body,
        optimisticJson: optimistic,
        listCacheKey: cacheKey,
      );
      await _cache.mergeListItem(cacheKey, _normalizeDeliveryRow(optimistic));
      return DeliveryReceipt.fromJson(optimistic);
    }

    if (!_online) return queueLocal();
    try {
      final receipt = await _api.createDeliveryReceipt(
        customerAccSeq: customerAccSeq,
        treeAccSeq: treeAccSeq,
        treeName: treeName,
        amount: amount,
        notes: notes,
      );
      await _cache.mergeListItem(cacheKey, _normalizeDeliveryRow(Map<String, dynamic>.from({
        'id': receipt.id,
        'deliveryNo': receipt.deliveryNo,
        'status': receipt.status,
        'statusLabel': receipt.statusLabel,
        'amount': receipt.amount,
        'customerName': receipt.customerName ?? displayCustomerName,
        'customerNum': receipt.customerNum ?? displayCustomerNum,
        'customerAccSeq': receipt.customerAccSeq,
        'treeAccSeq': receipt.treeAccSeq,
        'treeName': receipt.treeName,
        'notes': receipt.notes,
        'receiptId': receipt.receiptId,
        'linkedReceiptNo': receipt.linkedReceiptNo,
        'createdAt': receipt.createdAt,
        if (_agentId != null) 'agentId': _agentId,
      })));
      return receipt;
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      return queueLocal();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      return queueLocal();
    }
  }

  Future<void> markDeliveryReceiptPrinted(int id) async {
    if (id < 0) return;
    if (!_online) {
      await _outbox.enqueue(method: 'POST', path: '/delivery-receipts/$id/printed', entityType: 'delivery_printed');
      return;
    }
    try {
      await _api.markDeliveryReceiptPrinted(id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'POST', path: '/delivery-receipts/$id/printed', entityType: 'delivery_printed');
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'POST', path: '/delivery-receipts/$id/printed', entityType: 'delivery_printed');
    }
  }

  Future<void> deleteDeliveryReceipt(int id) async {
    final cacheKey = _deliveryCacheKey();
    if (id < 0) {
      await _cache.removeListItem(cacheKey, id);
      return;
    }
    if (!_online) {
      await _outbox.enqueue(method: 'DELETE', path: '/delivery-receipts/$id', entityType: 'delivery_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
      return;
    }
    try {
      await _api.deleteDeliveryReceipt(id);
      await _cache.removeListItem(cacheKey, id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'DELETE', path: '/delivery-receipts/$id', entityType: 'delivery_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'DELETE', path: '/delivery-receipts/$id', entityType: 'delivery_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
    }
  }

  Future<void> deleteReceipt(int id) async {
    final cacheKey = _receiptsCacheKey();
    if (id < 0) {
      await _cache.removeListItem(cacheKey, id);
      return;
    }
    if (!_online) {
      await _outbox.enqueue(method: 'DELETE', path: '/receipts/$id', entityType: 'receipt_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
      return;
    }
    try {
      await _api.deleteReceipt(id);
      await _cache.removeListItem(cacheKey, id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'DELETE', path: '/receipts/$id', entityType: 'receipt_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'DELETE', path: '/receipts/$id', entityType: 'receipt_delete', listCacheKey: cacheKey);
      await _cache.removeListItem(cacheKey, id);
    }
  }

  Future<List<CustomerRequest>> _readCustomerRequests(String cacheKey, Future<Map<String, dynamic>> Function() fetch) => _withCache(
        cacheKey: cacheKey,
        onlineFetch: () async {
          final data = await fetch();
          final raw = (data['requests'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(cacheKey, raw);
          return raw.map((e) => CustomerRequest.fromJson(e)).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(cacheKey);
          if (raw is! List) return null;
          return raw.map((e) => CustomerRequest.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<CustomerRequest>> getCustomerRequests({String? status}) {
    final cacheKey = status != null ? '${OfflineKeys.customerRequests}:$status' : OfflineKeys.customerRequests;
    return _readCustomerRequests(cacheKey, () => _api.requestJson('GET', '/customer-requests', query: status != null ? {'status': status} : null));
  }

  Future<CustomerRequest> createCustomerRequest({
    required String treeAccSeq,
    required String treeName,
    required String name,
    String? phone,
    String? address,
    String? notes,
  }) async {
    final body = {
      'treeAccSeq': treeAccSeq,
      'treeName': treeName,
      'name': name,
      'phone': phone ?? '',
      'address': address ?? '',
      'notes': notes ?? '',
    };
    final localId = _localId();
    final optimistic = {
      'id': localId,
      'requestNo': 'LOCAL-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'pending',
      'statusLabel': 'بانتظار الإرسال',
      'name': name,
      'phone': phone,
      'address': address,
      'notes': notes,
      'treeName': treeName,
      'createdAt': DateTime.now().toIso8601String(),
      'localPending': true,
    };

    Future<CustomerRequest> queueLocal() async {
      await _outbox.enqueue(
        method: 'POST',
        path: '/customer-requests',
        entityType: 'customer_request',
        body: body,
        optimisticJson: optimistic,
        listCacheKey: OfflineKeys.customerRequests,
      );
      await _cache.mergeListItem(OfflineKeys.customerRequests, optimistic);
      return CustomerRequest.fromJson(optimistic);
    }

    if (!_online) return queueLocal();
    try {
      final request = await _api.createCustomerRequest(
        treeAccSeq: treeAccSeq,
        treeName: treeName,
        name: name,
        phone: phone,
        address: address,
        notes: notes,
      );
      await _cache.mergeListItem(OfflineKeys.customerRequests, Map<String, dynamic>.from({
        'id': request.id,
        'requestNo': request.requestNo,
        'status': request.status,
        'statusLabel': request.statusLabel,
        'name': request.name,
        'phone': request.phone,
        'address': request.address,
        'notes': request.notes,
        'treeName': request.treeName,
        'createdAt': request.createdAt,
      }));
      return request;
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      return queueLocal();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      return queueLocal();
    }
  }

  Future<void> deleteCustomerRequest(int id) async {
    if (id < 0) {
      await _cache.removeListItem(OfflineKeys.customerRequests, id);
      return;
    }
    if (!_online) {
      await _outbox.enqueue(method: 'DELETE', path: '/customer-requests/$id', entityType: 'customer_request_delete', listCacheKey: OfflineKeys.customerRequests);
      await _cache.removeListItem(OfflineKeys.customerRequests, id);
      return;
    }
    try {
      await _api.deleteCustomerRequest(id);
      await _cache.removeListItem(OfflineKeys.customerRequests, id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'DELETE', path: '/customer-requests/$id', entityType: 'customer_request_delete', listCacheKey: OfflineKeys.customerRequests);
      await _cache.removeListItem(OfflineKeys.customerRequests, id);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'DELETE', path: '/customer-requests/$id', entityType: 'customer_request_delete', listCacheKey: OfflineKeys.customerRequests);
      await _cache.removeListItem(OfflineKeys.customerRequests, id);
    }
  }

  Future<List<IraqGovernorate>> getGovernorates() => _withCache(
        cacheKey: OfflineKeys.governorates,
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/governorates');
          final raw = (data['governorates'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.governorates, raw);
          return raw.map(IraqGovernorate.fromJson).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.governorates);
          if (raw is! List) return null;
          return raw.map((e) => IraqGovernorate.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<VisitOutcome>> getVisitOutcomes() => _withCache(
        cacheKey: OfflineKeys.visitOutcomes,
        onlineFetch: () async {
          final data = await _api.requestJson('GET', '/promotional-visits/outcomes');
          final raw = (data['outcomes'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(OfflineKeys.visitOutcomes, raw);
          return raw.map(VisitOutcome.fromJson).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(OfflineKeys.visitOutcomes);
          if (raw is! List) return null;
          return raw.map((e) => VisitOutcome.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<PromotionalVisit>> _readPromoVisits(String cacheKey, Future<Map<String, dynamic>> Function() fetch) => _withCache(
        cacheKey: cacheKey,
        onlineFetch: () async {
          final data = await fetch();
          final raw = (data['visits'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
          await _cache.setJson(cacheKey, raw);
          return raw.map((e) => PromotionalVisit.fromJson(e)).toList();
        },
        offlineRead: () async {
          final raw = await _cache.getJson(cacheKey);
          if (raw is! List) return null;
          return raw.map((e) => PromotionalVisit.fromJson(Map<String, dynamic>.from(e as Map))).toList();
        },
      );

  Future<List<PromotionalVisit>> getPromotionalVisits({String? status}) {
    final cacheKey = status != null ? '${OfflineKeys.promoVisits}:$status' : OfflineKeys.promoVisits;
    return _readPromoVisits(cacheKey, () => _api.requestJson('GET', '/promotional-visits', query: status != null ? {'status': status} : null));
  }

  Future<PromotionalVisit> createPromotionalVisit({
    required String governorateCode,
    required String areaName,
    required String shopName,
    required String visitOutcome,
    String? centerPhone,
    String? notes,
  }) async {
    final body = {
      'governorateCode': governorateCode,
      'areaName': areaName,
      'shopName': shopName,
      'visitOutcome': visitOutcome,
      if (centerPhone != null && centerPhone.trim().isNotEmpty) 'centerPhone': centerPhone.trim(),
      'notes': notes ?? '',
    };
    final localId = _localId();
    final optimistic = {
      'id': localId,
      'visitNo': 'LOCAL-${DateTime.now().millisecondsSinceEpoch}',
      'status': 'pending',
      'statusLabel': 'بانتظار الإرسال',
      'governorateCode': governorateCode,
      'governorateName': governorateCode,
      'areaName': areaName,
      'shopName': shopName,
      'visitOutcome': visitOutcome,
      'visitOutcomeLabel': visitOutcome,
      if (centerPhone != null && centerPhone.trim().isNotEmpty) 'centerPhone': centerPhone.trim(),
      'notes': notes,
      'createdAt': DateTime.now().toIso8601String(),
      'localPending': true,
    };

    Future<PromotionalVisit> queueLocal() async {
      await _outbox.enqueue(
        method: 'POST',
        path: '/promotional-visits',
        entityType: 'promo_visit',
        body: body,
        optimisticJson: optimistic,
        listCacheKey: OfflineKeys.promoVisits,
      );
      await _cache.mergeListItem(OfflineKeys.promoVisits, optimistic);
      return PromotionalVisit.fromJson(optimistic);
    }

    if (!_online) return queueLocal();
    try {
      final visit = await _api.createPromotionalVisit(
        governorateCode: governorateCode,
        areaName: areaName,
        shopName: shopName,
        visitOutcome: visitOutcome,
        centerPhone: centerPhone,
        notes: notes,
      );
      await _cache.mergeListItem(OfflineKeys.promoVisits, Map<String, dynamic>.from({
        'id': visit.id,
        'visitNo': visit.visitNo,
        'status': visit.status,
        'statusLabel': visit.statusLabel,
        'governorateCode': visit.governorateCode,
        'governorateName': visit.governorateName,
        'areaName': visit.areaName,
        'shopName': visit.shopName,
        'visitOutcome': visit.visitOutcome,
        'visitOutcomeLabel': visit.visitOutcomeLabel,
        'centerPhone': visit.centerPhone,
        'notes': visit.notes,
        'createdAt': visit.createdAt,
      }));
      return visit;
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      return queueLocal();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      return queueLocal();
    }
  }

  Future<void> deletePromotionalVisit(int id) async {
    if (id < 0) {
      await _cache.removeListItem(OfflineKeys.promoVisits, id);
      return;
    }
    if (!_online) {
      await _outbox.enqueue(method: 'DELETE', path: '/promotional-visits/$id', entityType: 'promo_delete', listCacheKey: OfflineKeys.promoVisits);
      await _cache.removeListItem(OfflineKeys.promoVisits, id);
      return;
    }
    try {
      await _api.deletePromotionalVisit(id);
      await _cache.removeListItem(OfflineKeys.promoVisits, id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'DELETE', path: '/promotional-visits/$id', entityType: 'promo_delete', listCacheKey: OfflineKeys.promoVisits);
      await _cache.removeListItem(OfflineKeys.promoVisits, id);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'DELETE', path: '/promotional-visits/$id', entityType: 'promo_delete', listCacheKey: OfflineKeys.promoVisits);
      await _cache.removeListItem(OfflineKeys.promoVisits, id);
    }
  }

  Future<void> deleteOrder(int id) async {
    if (id < 0) {
      await _cache.removeListItem(OfflineKeys.orders, id);
      return;
    }
    if (!_online) {
      await _outbox.enqueue(method: 'DELETE', path: '/orders/$id', entityType: 'order_delete', listCacheKey: OfflineKeys.orders);
      await _cache.removeListItem(OfflineKeys.orders, id);
      return;
    }
    try {
      await _api.deleteOrder(id);
      await _cache.removeListItem(OfflineKeys.orders, id);
    } on ApiException catch (e) {
      if (e.statusCode == 401) throw e;
      await _outbox.enqueue(method: 'DELETE', path: '/orders/$id', entityType: 'order_delete', listCacheKey: OfflineKeys.orders);
      await _cache.removeListItem(OfflineKeys.orders, id);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw ApiException('انتهت الجلسة', statusCode: 401);
      await _outbox.enqueue(method: 'DELETE', path: '/orders/$id', entityType: 'order_delete', listCacheKey: OfflineKeys.orders);
      await _cache.removeListItem(OfflineKeys.orders, id);
    }
  }
}

final apiClientProvider = Provider<OfflineApiClient>((ref) => OfflineApiClient(ref.watch(rawApiClientProvider), ref));

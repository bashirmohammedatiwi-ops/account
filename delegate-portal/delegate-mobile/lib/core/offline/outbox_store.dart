import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../utils/formatters.dart';
import 'offline_db.dart';

class OutboxEntry {
  OutboxEntry({
    required this.id,
    required this.method,
    required this.path,
    required this.entityType,
    required this.createdAt,
    this.body,
    this.optimisticJson,
    this.listCacheKey,
    this.retries = 0,
    this.status = 'pending',
    this.error,
  });

  final String id;
  final String method;
  final String path;
  final String entityType;
  final int createdAt;
  final Map<String, dynamic>? body;
  final Map<String, dynamic>? optimisticJson;
  final String? listCacheKey;
  final int retries;
  final String status;
  final String? error;

  bool get isFailed => status == 'failed';

  /// وصف مقروء لنوع العملية.
  String get label => switch (entityType) {
        'order' => 'طلب',
        'order_delete' => 'حذف طلب',
        'receipt' => 'سند قبض',
        'receipt_delete' => 'حذف سند قبض',
        'delivery_receipt' => 'وصل قبض',
        'delivery_delete' => 'حذف وصل قبض',
        'delivery_printed' => 'تأكيد طباعة وصل',
        'delivery_handover' => 'تأكيد استلام وصل',
        'customer_request' => 'زبون جديد',
        'customer_request_delete' => 'حذف طلب زبون',
        'promo_visit' => 'زيارة ترويجية',
        'promo_delete' => 'حذف زيارة',
        'customer_governorate' => 'تصنيف محافظة',
        _ => 'عملية',
      };

  /// تفاصيل مختصرة (اسم الزبون/المبلغ) من البيانات المحفوظة.
  String get summary {
    final opt = optimisticJson ?? const {};
    final b = body ?? const {};
    final parts = <String>[];
    if (entityType == 'customer_governorate') {
      final seqs = b['seqs'];
      final count = seqs is List ? seqs.length : 0;
      final gov = '${opt['governorateName'] ?? ''}'.trim();
      return [if (count > 0) '$count زبون', gov.isEmpty ? 'إزالة التصنيف' : gov].join(' ← ');
    }
    final name = '${opt['customerName'] ?? opt['name'] ?? opt['shopName'] ?? b['name'] ?? b['shopName'] ?? ''}'.trim();
    if (name.isNotEmpty) parts.add(name);
    final amount = opt['amount'] ?? opt['totalAmount'] ?? b['amount'];
    if (amount is num && amount != 0) parts.add('${fmtMoney(amount)} د.ع');
    return parts.join(' · ');
  }

  factory OutboxEntry.fromRow(Map<String, Object?> row) => OutboxEntry(
        id: row['id'] as String,
        method: row['method'] as String,
        path: row['path'] as String,
        entityType: row['entity_type'] as String,
        createdAt: row['created_at'] as int,
        body: row['body'] != null ? Map<String, dynamic>.from(jsonDecode(row['body'] as String) as Map) : null,
        optimisticJson: row['optimistic_json'] != null
            ? Map<String, dynamic>.from(jsonDecode(row['optimistic_json'] as String) as Map)
            : null,
        listCacheKey: row['list_cache_key'] as String?,
        retries: row['retries'] as int? ?? 0,
        status: row['status'] as String? ?? 'pending',
        error: row['error'] as String?,
      );
}

class OutboxStore {
  OutboxStore(this._db);

  final OfflineDb _db;
  static const _uuid = Uuid();

  Future<String> enqueue({
    required String method,
    required String path,
    required String entityType,
    Map<String, dynamic>? body,
    Map<String, dynamic>? optimisticJson,
    String? listCacheKey,
  }) async {
    final bodyWithId = body == null ? null : Map<String, dynamic>.from(body);
    if (bodyWithId != null) {
      final existing = '${bodyWithId['clientRequestId'] ?? ''}'.trim();
      if (existing.isEmpty) {
        bodyWithId['clientRequestId'] = _uuid.v4();
      } else if (entityType == 'order') {
        final queuedEntries = await pending();
        for (final entry in queuedEntries) {
          if (entry.entityType != 'order') continue;
          final queued = '${entry.body?['clientRequestId'] ?? ''}'.trim();
          if (queued == existing) return entry.id;
        }
      }
    }
    final id = _uuid.v4();
    await _db.insertOutbox({
      'id': id,
      'method': method,
      'path': path,
      'body': bodyWithId != null ? jsonEncode(bodyWithId) : null,
      'entity_type': entityType,
      'optimistic_json': optimisticJson != null ? jsonEncode(optimisticJson) : null,
      'list_cache_key': listCacheKey,
      'created_at': DateTime.now().millisecondsSinceEpoch,
      'retries': 0,
      'status': 'pending',
      'error': null,
    });
    return id;
  }

  Future<List<OutboxEntry>> pending() async {
    final rows = await _db.queryPendingOutbox();
    return rows.map(OutboxEntry.fromRow).toList();
  }

  Future<List<OutboxEntry>> all() async {
    final rows = await _db.queryAllOutbox();
    return rows.map(OutboxEntry.fromRow).toList();
  }

  Future<int> pendingCount() async => _db.pendingOutboxCount();

  Future<int> failedCount() async => _db.failedOutboxCount();

  Future<void> markDone(String id) async => _db.deleteOutbox(id);

  /// رفض من الخادم — بعد [failAfter] محاولات يتوقف الإرسال التلقائي ويظهر للمندوب.
  Future<void> markFailed(String id, String error, {int failAfter = 0}) async =>
      _db.bumpOutboxRetry(id, error, failAfter: failAfter);

  /// إعادة عنصر مرفوض إلى قائمة الإرسال.
  Future<void> retry(String id) async => _db.setOutboxStatus(id, 'pending', resetRetries: true);
}

import 'dart:convert';

import 'package:uuid/uuid.dart';

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
    final id = _uuid.v4();
    await _db.insertOutbox({
      'id': id,
      'method': method,
      'path': path,
      'body': body != null ? jsonEncode(body) : null,
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

  Future<int> pendingCount() async => _db.pendingOutboxCount();

  Future<void> markDone(String id) async => _db.deleteOutbox(id);

  Future<void> markFailed(String id, String error) async => _db.bumpOutboxRetry(id, error);
}

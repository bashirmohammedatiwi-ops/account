import 'dart:convert';

import 'offline_db.dart';

class CacheStore {
  CacheStore(this._db);

  final OfflineDb _db;

  Future<void> setJson(String key, Object value) async {
    await _db.upsertCache(key, jsonEncode(value), DateTime.now().millisecondsSinceEpoch);
  }

  Future<dynamic> getJson(String key) async {
    final raw = await _db.readCache(key);
    if (raw == null) return null;
    return jsonDecode(raw);
  }

  Future<void> delete(String key) async {
    await _db.deleteCache(key);
  }

  Future<void> deleteLegacyReceiptCaches() async {
    await _db.deleteLegacyReceiptCaches();
  }

  Future<void> mergeListItem(String listKey, Map<String, dynamic> item, {String idField = 'id'}) async {
    final raw = await getJson(listKey);
    final list = raw is List
        ? List<Map<String, dynamic>>.from(raw.map((e) => Map<String, dynamic>.from(e as Map)))
        : <Map<String, dynamic>>[];
    final id = item[idField];
    list.removeWhere((e) => e[idField] == id);
    list.insert(0, item);
    await setJson(listKey, list);
  }

  Future<void> removeListItem(String listKey, dynamic id, {String idField = 'id'}) async {
    final raw = await getJson(listKey);
    if (raw is! List) return;
    final list = List<Map<String, dynamic>>.from(raw.map((e) => Map<String, dynamic>.from(e as Map)));
    list.removeWhere((e) => e[idField] == id);
    await setJson(listKey, list);
  }
}

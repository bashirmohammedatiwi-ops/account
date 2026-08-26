import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';

import 'offline_keys.dart';

class OfflineDb {
  OfflineDb._();
  static final OfflineDb instance = OfflineDb._();

  Database? _db;
  SharedPreferences? _prefs;

  Future<SharedPreferences> get prefs async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  Future<Database> get database async {
    if (kIsWeb) {
      throw UnsupportedError('SQLite غير متاح على الويب — استخدم عمليات OfflineDb المباشرة');
    }
    if (_db != null) return _db!;
    final base = await getDatabasesPath();
    _db = await openDatabase(
      p.join(base, 'edari_delegate_offline.db'),
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE cache_entries (
            key TEXT PRIMARY KEY,
            json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
          )
        ''');
        await db.execute('''
          CREATE TABLE outbox (
            id TEXT PRIMARY KEY,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            body TEXT,
            entity_type TEXT NOT NULL,
            optimistic_json TEXT,
            list_cache_key TEXT,
            created_at INTEGER NOT NULL,
            retries INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT
          )
        ''');
      },
    );
    return _db!;
  }

  Future<void> close() async {
    if (_db != null) {
      await _db!.close();
      _db = null;
    }
  }

  Future<void> upsertCache(String key, String json, int updatedAt) async {
    if (kIsWeb) {
      final sp = await prefs;
      await sp.setString('oc:$key', json);
      await sp.setInt('oc_t:$key', updatedAt);
      return;
    }
    final db = await database;
    await db.insert(
      'cache_entries',
      {'key': key, 'json': json, 'updated_at': updatedAt},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<String?> readCache(String key) async {
    if (kIsWeb) {
      return (await prefs).getString('oc:$key');
    }
    final db = await database;
    final row = await db.query('cache_entries', where: 'key = ?', whereArgs: [key], limit: 1);
    if (row.isEmpty) return null;
    return row.first['json'] as String?;
  }

  Future<void> deleteCache(String key) async {
    if (kIsWeb) {
      final sp = await prefs;
      await sp.remove('oc:$key');
      await sp.remove('oc_t:$key');
      return;
    }
    final db = await database;
    await db.delete('cache_entries', where: 'key = ?', whereArgs: [key]);
  }

  /// يحذف مفاتيح الوصولات/السندات القديمة غير المقيّدة بالمندوب.
  Future<void> deleteLegacyReceiptCaches() async {
    bool isLegacyReceiptKey(String key) {
      if (key == OfflineKeys.receipts || key == OfflineKeys.deliveryReceipts) return true;
      if (key.startsWith('${OfflineKeys.receipts}:') && !key.contains(':agent:')) return true;
      if (key.startsWith('${OfflineKeys.deliveryReceipts}:') && !key.contains(':agent:')) return true;
      return false;
    }

    if (kIsWeb) {
      final sp = await prefs;
      for (final storageKey in sp.getKeys()) {
        if (!storageKey.startsWith('oc:')) continue;
        final key = storageKey.substring(3);
        if (isLegacyReceiptKey(key)) {
          await sp.remove(storageKey);
          await sp.remove('oc_t:$key');
        }
      }
      return;
    }

    final db = await database;
    final rows = await db.query('cache_entries', columns: ['key']);
    for (final row in rows) {
      final key = row['key'] as String;
      if (isLegacyReceiptKey(key)) {
        await deleteCache(key);
      }
    }
  }

  Future<void> insertOutbox(Map<String, Object?> row) async {
    if (kIsWeb) {
      final sp = await prefs;
      final raw = sp.getString('outbox') ?? '[]';
      final list = jsonDecode(raw) as List;
      list.add(row);
      await sp.setString('outbox', jsonEncode(list));
      return;
    }
    final db = await database;
    await db.insert('outbox', row);
  }

  Future<List<Map<String, Object?>>> queryPendingOutbox() async {
    if (kIsWeb) {
      final sp = await prefs;
      final raw = sp.getString('outbox') ?? '[]';
      final list = (jsonDecode(raw) as List).cast<Map>();
      return list
          .map((e) => Map<String, Object?>.from(e))
          .where((e) => e['status'] == 'pending')
          .toList()
        ..sort((a, b) => (a['created_at'] as int).compareTo(b['created_at'] as int));
    }
    final db = await database;
    final rows = await db.query('outbox', where: 'status = ?', whereArgs: ['pending'], orderBy: 'created_at ASC');
    return rows;
  }

  Future<int> pendingOutboxCount() async {
    if (kIsWeb) {
      return (await queryPendingOutbox()).length;
    }
    final db = await database;
    final r = Sqflite.firstIntValue(await db.rawQuery('SELECT COUNT(*) FROM outbox WHERE status = ?', ['pending']));
    return r ?? 0;
  }

  Future<void> deleteOutbox(String id) async {
    if (kIsWeb) {
      final sp = await prefs;
      final raw = sp.getString('outbox') ?? '[]';
      final list = (jsonDecode(raw) as List).cast<Map>();
      list.removeWhere((e) => e['id'] == id);
      await sp.setString('outbox', jsonEncode(list));
      return;
    }
    final db = await database;
    await db.delete('outbox', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> bumpOutboxRetry(String id, String error) async {
    if (kIsWeb) {
      final sp = await prefs;
      final raw = sp.getString('outbox') ?? '[]';
      final list = (jsonDecode(raw) as List).cast<Map>();
      for (final e in list) {
        if (e['id'] == id) {
          e['retries'] = (e['retries'] as int? ?? 0) + 1;
          e['error'] = error;
        }
      }
      await sp.setString('outbox', jsonEncode(list));
      return;
    }
    final db = await database;
    final retries = Sqflite.firstIntValue(await db.rawQuery('SELECT retries FROM outbox WHERE id = ?', [id])) ?? 0;
    await db.update(
      'outbox',
      {'retries': retries + 1, 'error': error},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> clearAll() async {
    if (kIsWeb) {
      final sp = await prefs;
      final keys = sp.getKeys().where((k) => k.startsWith('oc:') || k.startsWith('oc_t:') || k == 'outbox');
      for (final k in keys) {
        await sp.remove(k);
      }
      return;
    }
    final db = await database;
    await db.delete('cache_entries');
    await db.delete('outbox');
  }
}

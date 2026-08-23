import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'offline_db.dart';
import 'cache_store.dart';
import 'outbox_store.dart';

final cacheStoreProvider = Provider<CacheStore>((ref) => CacheStore(OfflineDb.instance));
final outboxStoreProvider = Provider<OutboxStore>((ref) => OutboxStore(OfflineDb.instance));

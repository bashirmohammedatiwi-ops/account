import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/receipts/receipts_hub.dart';
import '../../features/home/home_screen.dart';
import '../offline/sync_engine.dart';

/// يُعاد تحميل كل بيانات التطبيق بعد تسجيل الدخول أو استعادة الجلسة.
final delegateDataRefreshProvider = Provider<void Function()>((ref) {
  return () {
    ref.invalidate(treesProvider);
    ref.invalidate(ordersProvider);
    ref.invalidate(receiptsHubProvider);
    ref.invalidate(receiptsListProvider);
    ref.invalidate(deliveriesListNotifierProvider);
    ref.invalidate(customerRequestsListProvider);
    ref.invalidate(promotionalVisitsListProvider);
    ref.read(syncStatusProvider.notifier).refreshPendingCount();
  };
});

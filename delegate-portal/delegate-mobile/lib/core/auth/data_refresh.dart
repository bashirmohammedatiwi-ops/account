import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/commerce/commerce_screens.dart';
import '../../features/receipts/receipts_screen.dart';
import '../../features/home/home_screen.dart';
import '../offline/sync_engine.dart';

/// يُعاد تحميل كل بيانات التطبيق بعد تسجيل الدخول أو استعادة الجلسة.
final delegateDataRefreshProvider = Provider<void Function()>((ref) {
  return () {
    ref.invalidate(treesProvider);
    ref.invalidate(ordersProvider);
    ref.invalidate(receiptsListProvider);
    ref.invalidate(deliveryReceiptsListProvider);
    ref.invalidate(customerRequestsListProvider);
    ref.invalidate(promotionalVisitsListProvider);
    ref.invalidate(catalogBranchesProvider);
    ref.read(syncStatusProvider.notifier).refreshPendingCount();
  };
});

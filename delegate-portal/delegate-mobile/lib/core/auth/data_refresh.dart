import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/commerce/commerce_screens.dart';
import '../../features/home/home_screen.dart';

/// يُعاد تحميل كل بيانات التطبيق بعد تسجيل الدخول أو استعادة الجلسة.
final delegateDataRefreshProvider = Provider<void Function()>((ref) {
  return () {
    ref.invalidate(treesProvider);
    ref.invalidate(ordersProvider);
    ref.invalidate(receiptsListProvider);
    ref.invalidate(customerRequestsListProvider);
    ref.invalidate(promotionalVisitsListProvider);
    ref.invalidate(catalogBranchesProvider);
  };
});

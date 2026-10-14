import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/accounts/accounts_screens.dart';
import '../../features/commerce/commerce_screens.dart';
import '../../features/home/home_screen.dart';
import '../../features/invoices/invoice_screen.dart';
import '../../features/receipts/receipts_hub.dart';
import '../offline/sync_engine.dart';
import 'auth_provider.dart';

/// يعيد جلب كل بيانات التطبيق — بعد تسجيل الدخول، أو عند التحديث الحي الدوري.
///
/// كل المزوّدات «المحلي أولاً»: البيانات الحالية تبقى معروضة أثناء التحديث،
/// والمزوّدات غير المعروضة حالياً لا تُجلب إلا عند فتح شاشتها.
final delegateDataRefreshProvider = Provider<void Function({bool includeCatalog})>((ref) {
  return ({bool includeCatalog = false}) {
    ref.invalidate(treesProvider);
    ref.invalidate(ordersProvider);
    ref.invalidate(orderDetailProvider);
    ref.invalidate(childrenProvider);
    ref.invalidate(statementProvider);
    ref.invalidate(customerRequestsListProvider);
    ref.invalidate(promotionalVisitsListProvider);
    // قوائم الوصولات/السندات: تحديث في المكان (دون إعادة بناء) إن كانت محمّلة.
    if (ref.exists(deliveriesListNotifierProvider)) {
      ref.read(deliveriesListNotifierProvider.notifier).refresh();
    }
    final isSecondary = ref.read(authProvider).agent?.isSecondary ?? false;
    if (!isSecondary && ref.exists(receiptsListProvider)) {
      ref.read(receiptsListProvider.notifier).refresh();
    }
    if (includeCatalog) {
      ref.invalidate(catalogBranchesProvider);
      ref.invalidate(catalogSectionsProvider);
      ref.invalidate(catalogProductsProvider);
      ref.invalidate(invoiceProvider);
    }
    ref.read(syncStatusProvider.notifier).refreshPendingCount();
  };
});

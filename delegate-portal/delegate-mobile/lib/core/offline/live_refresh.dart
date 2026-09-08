import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_provider.dart';
import '../offline/connectivity_service.dart';
import '../offline/offline_api_client.dart';
import '../offline/sync_engine.dart';
import '../../features/receipts/receipts_hub.dart';

/// تحديث حي لسندات القبض والوصولات (بعد تغييرات لوحة التحكم).
Future<void> refreshDelegateLiveData(WidgetRef ref) async {
  final auth = ref.read(authProvider);
  if (!auth.isAuthenticated) return;

  if (ref.read(connectivityProvider).isOnline) {
    await ref.read(apiClientProvider).reconcileStaleLocalReceipts();
    if (ref.read(syncStatusProvider).pendingCount > 0) {
      unawaited(ref.read(syncEngineProvider).syncPending());
    }
  }

  await ref.read(deliveriesListNotifierProvider.notifier).refresh();
  final isSecondary = auth.agent?.isSecondary ?? false;
  if (!isSecondary) {
    await ref.read(receiptsListProvider.notifier).refresh();
  }
}

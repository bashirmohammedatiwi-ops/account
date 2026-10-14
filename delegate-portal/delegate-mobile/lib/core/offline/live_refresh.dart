import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_provider.dart';
import 'sync_engine.dart';

/// تحديث حي: يرسل المعلّق ثم يعيد جلب ما هو معروض حالياً (بعد تغييرات لوحة التحكم).
Future<void> refreshDelegateLiveData(WidgetRef ref) async {
  if (!ref.read(authProvider).isAuthenticated) return;
  await ref.read(syncEngineProvider).refreshLive();
}

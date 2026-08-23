import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import 'auth_provider.dart';

/// ينتظر انتهاء استعادة الجلسة ثم يربط الطلب بتغيّر التوكن (بعد تسجيل الدخول).
Future<T> withAuth<T>(Ref ref, Future<T> Function() request) async {
  ref.watch(authProvider.select((s) => '${s.token ?? ''}:${s.agent?.id ?? ''}'));

  await ref.read(authProvider.notifier).waitUntilReady();
  final auth = ref.read(authProvider);
  if (!auth.isAuthenticated) {
    throw ApiException('يرجى تسجيل الدخول', statusCode: 401);
  }
  return request();
}

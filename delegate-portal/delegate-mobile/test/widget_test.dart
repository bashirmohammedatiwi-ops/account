import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:edari_delegate/config/app_config.dart';
import 'package:edari_delegate/core/api/api_client.dart';
import 'package:edari_delegate/core/auth/auth_provider.dart';
import 'package:edari_delegate/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('App smoke test', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          appConfigProvider.overrideWithValue(AppConfig(prefs)),
          authProvider.overrideWith(() => _TestAuth()),
        ],
        child: const EdariDelegateApp(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('تسجيل الدخول'), findsOneWidget);
  });
}

class _TestAuth extends AuthNotifier {
  @override
  AuthState build() => const AuthState(loading: false);
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app.dart';
import 'core/auth/auth_provider.dart';
import 'core/auth/data_refresh.dart';
import 'core/layout/breakpoints.dart';
import 'core/theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  PaintingBinding.instance.imageCache.maximumSize = 300;
  PaintingBinding.instance.imageCache.maximumSizeBytes = 100 << 20;

  runApp(
    const ProviderScope(
      child: EdariDelegateApp(),
    ),
  );
}

class EdariDelegateApp extends ConsumerWidget {
  const EdariDelegateApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(authProvider, (prev, next) {
      if (prev?.isAuthenticated != true && next.isAuthenticated) {
        ref.read(delegateDataRefreshProvider)();
      }
    });

    final router = ref.read(appRouterProvider);

    return MaterialApp.router(
      title: 'Edari Delegate',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      scrollBehavior: const EdScrollBehavior(),
      routerConfig: router,
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../widgets/premium_widgets.dart';
import '../orders/orders_providers.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.toString();
    final showNav = !location.contains('/orders/');
    final index = location.startsWith('/stats')
        ? 1
        : location.startsWith('/profile')
            ? 2
            : 0;
    final pending = ref.watch(pendingCountProvider).maybeWhen(data: (c) => c, orElse: () => 0);

    return Scaffold(
      body: child,
      bottomNavigationBar: showNav
          ? PremiumBottomNav(
              index: index,
              pendingCount: pending,
              onChanged: (i) {
                switch (i) {
                  case 0:
                    context.go('/orders');
                  case 1:
                    context.go('/stats');
                  case 2:
                    context.go('/profile');
                }
              },
            )
          : null,
    );
  }
}

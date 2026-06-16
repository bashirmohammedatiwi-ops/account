import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/accounts_hub_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/commerce/shop_hub_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/invoices/invoice_screen.dart';
import '../../features/orders/orders_hub_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../auth/auth_provider.dart';
import '../widgets/adaptive_shell.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/home',
    redirect: (context, state) {
      final loggingIn = state.matchedLocation == '/login';
      if (auth.loading) return null;
      if (!auth.isAuthenticated) return loggingIn ? null : '/login';
      if (loggingIn) return '/home';
      return null;
    },
    refreshListenable: _RouterRefresh(ref),
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, _) => const LoginScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => AdaptiveShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
          GoRoute(
            path: '/accounts',
            builder: (_, _) => const AccountsHubScreen(),
            routes: [
              GoRoute(
                path: ':treeSeq/branches',
                builder: (context, state) => AccountsHubScreen(
                  treeSeq: state.pathParameters['treeSeq'],
                ),
              ),
              GoRoute(
                path: ':treeSeq/statement/:accSeq',
                builder: (context, state) => AccountsHubScreen(
                  treeSeq: state.pathParameters['treeSeq'],
                  accSeq: state.pathParameters['accSeq'],
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/invoice/:ref',
            builder: (context, state) {
              final q = state.uri.queryParameters;
              return InvoiceScreen(
                ref: state.pathParameters['ref']!,
                by: q['by'] ?? 'auto',
                accSeq: q['acc'],
              );
            },
          ),
          GoRoute(
            path: '/shop',
            builder: (_, _) => const ShopHubScreen(),
            routes: [
              GoRoute(
                path: ':branchId/sections',
                builder: (context, state) => ShopHubScreen(
                  branchId: int.parse(state.pathParameters['branchId']!),
                ),
              ),
              GoRoute(
                path: ':branchId/sections/:sectionId/products',
                builder: (context, state) => ShopHubScreen(
                  branchId: int.parse(state.pathParameters['branchId']!),
                  sectionId: int.parse(state.pathParameters['sectionId']!),
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/orders',
            builder: (_, _) => const OrdersHubScreen(),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) => OrdersHubScreen(
                  orderId: int.parse(state.pathParameters['id']!),
                ),
              ),
            ],
          ),
          GoRoute(path: '/reports', builder: (_, _) => const ReportsScreen()),
          GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
        ],
      ),
    ],
  );
});

class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(this.ref) {
    ref.listen(authProvider, (_, _) => notifyListeners());
  }
  final Ref ref;
}

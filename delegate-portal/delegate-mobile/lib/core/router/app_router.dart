import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/accounts/accounts_hub_screen.dart';
import '../../features/auth/auth_boot_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/commerce/shop_hub_screen.dart';
import '../../features/customers/customers_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/invoices/invoice_screen.dart';
import '../../features/orders/orders_hub_screen.dart';
import '../../features/promotional_visits/promotional_visits_screen.dart';
import '../../features/receipts/receipts_screen.dart';
import '../../features/reports/reports_screen.dart';
import '../../features/settings/printer_settings_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../auth/auth_provider.dart';
import '../widgets/adaptive_shell.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/home',
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loc = state.matchedLocation;
      final loggingIn = loc == '/login';
      final booting = loc == '/boot';
      if (auth.loading) return booting ? null : '/boot';
      if (!auth.isAuthenticated) return loggingIn ? null : '/login';
      if (loggingIn || booting) return '/home';
      return null;
    },
    refreshListenable: refresh,
    routes: [
      GoRoute(
        path: '/boot',
        builder: (_, _) => const AuthBootScreen(),
      ),
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
          GoRoute(path: '/receipts', builder: (_, _) => const ReceiptsScreen()),
          GoRoute(path: '/customers', builder: (_, _) => const CustomersScreen()),
          GoRoute(path: '/promotional-visits', builder: (_, _) => const PromotionalVisitsScreen()),
          GoRoute(
            path: '/settings',
            builder: (_, _) => const SettingsScreen(),
            routes: [
              GoRoute(path: 'printer', builder: (_, _) => const PrinterSettingsScreen()),
            ],
          ),
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

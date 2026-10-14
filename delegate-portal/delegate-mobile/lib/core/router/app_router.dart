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
import '../../features/team/team_screen.dart';
import '../../features/settings/printer_settings_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../auth/auth_provider.dart';
import '../navigation/ed_page_transition.dart';
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
        pageBuilder: (context, state) => edFadeSlidePage(
          key: state.pageKey,
          child: const AuthBootScreen(),
        ),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => edFadeSlidePage(
          key: state.pageKey,
          child: const LoginScreen(),
        ),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => AdaptiveShell(child: child),
        routes: [
          GoRoute(path: '/home', pageBuilder: (_, state) => edShellPage(state, const HomeScreen())),
          GoRoute(
            path: '/accounts',
            pageBuilder: (_, state) => edShellPage(state, const AccountsHubScreen()),
            routes: [
              GoRoute(
                path: ':treeSeq/branches',
                pageBuilder: (context, state) => edShellPage(state, AccountsHubScreen(
                  treeSeq: state.pathParameters['treeSeq'],
                )),
              ),
              GoRoute(
                path: ':treeSeq/statement/:accSeq',
                pageBuilder: (context, state) => edShellPage(state, AccountsHubScreen(
                  treeSeq: state.pathParameters['treeSeq'],
                  accSeq: state.pathParameters['accSeq'],
                )),
              ),
            ],
          ),
          GoRoute(
            path: '/invoice/:ref',
            pageBuilder: (context, state) {
              final q = state.uri.queryParameters;
              return edShellPage(state, InvoiceScreen(
                ref: Uri.decodeComponent(state.pathParameters['ref']!),
                by: q['by'] ?? 'auto',
                accSeq: q['acc'],
              ));
            },
          ),
          GoRoute(
            path: '/shop',
            pageBuilder: (_, state) => edShellPage(state, const ShopHubScreen()),
            routes: [
              GoRoute(
                path: ':branchId/sections',
                pageBuilder: (context, state) => edShellPage(state, ShopHubScreen(
                  branchId: int.parse(state.pathParameters['branchId']!),
                )),
              ),
              GoRoute(
                path: ':branchId/sections/:sectionId/products',
                pageBuilder: (context, state) => edShellPage(state, ShopHubScreen(
                  branchId: int.parse(state.pathParameters['branchId']!),
                  sectionId: int.parse(state.pathParameters['sectionId']!),
                )),
              ),
            ],
          ),
          GoRoute(
            path: '/orders',
            pageBuilder: (_, state) => edShellPage(state, const OrdersHubScreen()),
            routes: [
              GoRoute(
                path: ':id',
                pageBuilder: (context, state) => edShellPage(state, OrdersHubScreen(
                  orderId: int.parse(state.pathParameters['id']!),
                )),
              ),
            ],
          ),
          GoRoute(path: '/reports', pageBuilder: (_, state) => edShellPage(state, const ReportsScreen())),
          GoRoute(path: '/receipts', pageBuilder: (_, state) => edShellPage(state, const ReceiptsScreen())),
          GoRoute(path: '/team', pageBuilder: (_, state) => edShellPage(state, const TeamScreen())),
          GoRoute(path: '/customers', pageBuilder: (_, state) => edShellPage(state, const CustomersScreen())),
          GoRoute(path: '/promotional-visits', pageBuilder: (_, state) => edShellPage(state, const PromotionalVisitsScreen())),
          GoRoute(
            path: '/settings',
            pageBuilder: (_, state) => edShellPage(state, const SettingsScreen()),
            routes: [
              GoRoute(path: 'printer', pageBuilder: (_, state) => edShellPage(state, const PrinterSettingsScreen())),
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

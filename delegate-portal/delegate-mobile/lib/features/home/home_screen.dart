import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/delegate_api.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/auth/auth_session.dart';
import '../../core/offline/sync_engine.dart';
import '../../models/models.dart';
import '../receipts/receipts_hub.dart';
import '../team/team_hub.dart';
import 'home_ui.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agent = ref.watch(authProvider).agent;
    final isSecondary = agent?.isSecondary ?? false;

    final data = HomeData(
      agentName: agent?.name ?? 'مندوب',
      roleLabel: agent?.delegateRoleLabel ?? '',
      isSecondary: isSecondary,
      hasTeam: ref.watch(hasTeamProvider),
      trees: ref.watch(treesProvider),
      orders: ref.watch(ordersProvider),
      receipts: isSecondary ? const AsyncData<List<Receipt>>([]) : ref.watch(receiptsListProvider),
      deliveries: ref.watch(deliveriesListNotifierProvider),
      customerRequests: ref.watch(customerRequestsListProvider),
      promoVisits: ref.watch(promotionalVisitsListProvider),
      teamPendingHandover: ref.watch(teamOverviewProvider).valueOrNull?.totalPendingHandoverCount ?? 0,
    );

    Future<void> refresh() => ref.read(syncEngineProvider).refreshLive();

    return HomeView(
      data: data,
      onRefresh: refresh,
      onNavigate: (path) => context.go(path),
      onSettings: () => context.go('/settings'),
    );
  }
}

final treesProvider = StreamProvider<List<AccountTree>>((ref) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getTrees()));
});

final ordersProvider = StreamProvider<List<Order>>((ref) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getOrders()));
});

final customerRequestsListProvider = StreamProvider<List<CustomerRequest>>((ref) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getCustomerRequests()));
});

final promotionalVisitsListProvider = StreamProvider<List<PromotionalVisit>>((ref) {
  ref.keepAlive();
  final api = ref.read(apiClientProvider);
  return withAuthStream(ref, () => api.cacheThenNetwork(() => api.getPromotionalVisits()));
});

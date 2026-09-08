import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_provider.dart';
import '../../models/models.dart';
import '../receipts/receipts_hub.dart';
import '../receipts/receipts_ui.dart';
import 'team_models.dart';

/// نطاق التاريخ النشط في شاشة متابعة الفريق — الافتراضي «هذا الشهر».
final teamDateRangeProvider = StateProvider<ReceiptsDateRange>(
  (ref) => ReceiptsDateRange.forPeriod(ReceiptsPeriod.month),
);

List<DeliveryReceipt> filterTeamDeliveriesByDate(
  List<DeliveryReceipt> deliveries,
  ReceiptsDateRange range,
) {
  if (range.isAll) return deliveries;
  return deliveries
      .where((d) => receiptsMatchesDateRange(d.receiptDate ?? d.createdAt, range))
      .toList();
}

/// نظرة عامة على فريق المندوب الرئيسي — مُشتقّة من قائمة وصولات القبض.
///
/// تعتمد على [deliveriesListNotifierProvider] نفسه الذي تستخدمه شاشة الوصولات،
/// فتتحدّث تلقائياً بعد أي إصدار/تسليم دون طلب شبكة إضافي.
final teamOverviewProvider = Provider<AsyncValue<TeamOverview>>((ref) {
  final agent = ref.watch(authProvider.select((s) => s.agent));
  final dateRange = ref.watch(teamDateRangeProvider);
  final deliveriesAsync = ref.watch(deliveriesListNotifierProvider);
  final knownCount = agent?.secondaryCount ?? 0;

  return deliveriesAsync.whenData(
    (deliveries) => TeamOverview.fromDeliveries(
      filterTeamDeliveriesByDate(deliveries, dateRange),
      knownSecondaryCount: knownCount,
    ),
  );
});

/// هل يملك المندوب الحالي فريقاً (رئيسي وله مندوبون ثانويون)؟
final hasTeamProvider = Provider<bool>((ref) {
  final agent = ref.watch(authProvider.select((s) => s.agent));
  if (agent == null || agent.isSecondary) return false;
  if (agent.secondaryCount > 0) return true;
  // احتياط: إن ظهرت وصولات فريق حتى لو لم يُحدَّث العدّاد.
  final overview = ref.watch(teamOverviewProvider).valueOrNull;
  return (overview?.secondaries.isNotEmpty) ?? false;
});

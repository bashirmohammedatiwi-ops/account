import '../../models/models.dart';

/// ملخص أداء مندوب ثانوي واحد — مُشتقّ من قائمة وصولات القبض المتاحة للمندوب الرئيسي.
///
/// لا يوجد endpoint مخصّص على الخادم يسرد المندوبين الثانويين بإحصاءاتهم،
/// لكن قائمة `getDeliveryReceipts()` للمندوب الرئيسي تشمل وصولات كل فريقه
/// (كل وصل يحمل `agentId` و`agentName` و`isTeamDelivery` وحالة التسليم)،
/// فنُجمّعها هنا لبناء لوحة متابعة كاملة دون تعديل الخادم.
class SecondaryAgentSummary {
  const SecondaryAgentSummary({
    required this.agentId,
    required this.agentName,
    required this.deliveries,
    required this.deliveryCount,
    required this.totalAmount,
    required this.handoverPendingCount,
    required this.handoverPendingAmount,
    required this.handoverReceivedCount,
    required this.handoverReceivedAmount,
    required this.awaitingReceiptCount,
    required this.linkedCount,
    required this.lastActivity,
  });

  final int agentId;
  final String agentName;

  /// وصولات هذا المندوب (مرتبة الأحدث أولاً).
  final List<DeliveryReceipt> deliveries;

  final int deliveryCount;
  final num totalAmount;

  /// بانتظار تسليم المبلغ للمندوب الرئيسي.
  final int handoverPendingCount;
  final num handoverPendingAmount;

  /// تم استلام المبلغ من قِبل الرئيسي.
  final int handoverReceivedCount;
  final num handoverReceivedAmount;

  /// وصولات جاهزة لإنشاء سند قبض لها (canCreateReceipt).
  final int awaitingReceiptCount;

  /// وصولات مرتبطة بسند قبض بالفعل.
  final int linkedCount;

  /// آخر تاريخ نشاط (receiptDate أو createdAt) لهذا المندوب — للفرز.
  final String? lastActivity;

  bool get hasPendingHandover => handoverPendingCount > 0;
}

/// نظرة عامة على فريق المندوب الرئيسي كاملاً.
class TeamOverview {
  const TeamOverview({
    required this.secondaries,
    required this.totalSecondaries,
    required this.totalTeamDeliveries,
    required this.totalTeamAmount,
    required this.totalPendingHandoverCount,
    required this.totalPendingHandoverAmount,
    required this.totalReceivedAmount,
  });

  final List<SecondaryAgentSummary> secondaries;
  final int totalSecondaries;
  final int totalTeamDeliveries;
  final num totalTeamAmount;
  final int totalPendingHandoverCount;
  final num totalPendingHandoverAmount;
  final num totalReceivedAmount;

  bool get isEmpty => secondaries.isEmpty;

  /// عدد المندوبين الذين لديهم مبالغ بانتظار التسليم.
  int get secondariesWithPending =>
      secondaries.where((s) => s.hasPendingHandover).length;

  /// يبني نظرة الفريق من قائمة الوصولات + عدد المندوبين المعروف من ملف المندوب.
  ///
  /// [knownSecondaryCount] من `agent.secondaryCount` (قد يشمل مندوبين لم
  /// يُصدروا وصولات بعد، فلا يظهرون في القائمة). نستخدمه فقط للعنونة الإجمالية.
  factory TeamOverview.fromDeliveries(
    List<DeliveryReceipt> deliveries, {
    int knownSecondaryCount = 0,
  }) {
    // وصولات الفريق فقط (المُصدَرة من مندوبين ثانويين تابعين، لا وصولات الرئيسي نفسه).
    final teamRows = deliveries.where((d) {
      if (d.agentId == null) return false;
      return d.isTeamDelivery || d.agentRole == 'secondary';
    }).toList();

    final byAgent = <int, List<DeliveryReceipt>>{};
    for (final d in teamRows) {
      byAgent.putIfAbsent(d.agentId!, () => []).add(d);
    }

    final summaries = <SecondaryAgentSummary>[];
    num totalTeamAmount = 0;
    var totalTeamDeliveries = 0;
    var totalPendingCount = 0;
    num totalPendingAmount = 0;
    num totalReceivedAmount = 0;

    byAgent.forEach((agentId, rows) {
      // ترتيب ثابت: التاريخ ثم المعرّف — لا يتغيّر موضع الوصل بعد الاستلام أو ربط السند.
      rows.sort((a, b) {
        final byDate = _activityKey(b).compareTo(_activityKey(a));
        if (byDate != 0) return byDate;
        return b.id.compareTo(a.id);
      });

      num total = 0;
      var pendingCount = 0;
      num pendingAmount = 0;
      var receivedCount = 0;
      num receivedAmount = 0;
      var awaitingReceipt = 0;
      var linked = 0;

      for (final d in rows) {
        total += d.amount;
        if (d.handoverReceived) {
          receivedCount++;
          receivedAmount += d.amount;
        } else {
          pendingCount++;
          pendingAmount += d.amount;
        }
        if (d.canCreateReceipt) awaitingReceipt++;
        if (d.receiptId != null || d.status == 'linked') linked++;
      }

      totalTeamAmount += total;
      totalTeamDeliveries += rows.length;
      totalPendingCount += pendingCount;
      totalPendingAmount += pendingAmount;
      totalReceivedAmount += receivedAmount;

      summaries.add(SecondaryAgentSummary(
        agentId: agentId,
        agentName: rows.first.agentName?.trim().isNotEmpty == true
            ? rows.first.agentName!.trim()
            : 'مندوب #$agentId',
        deliveries: rows,
        deliveryCount: rows.length,
        totalAmount: total,
        handoverPendingCount: pendingCount,
        handoverPendingAmount: pendingAmount,
        handoverReceivedCount: receivedCount,
        handoverReceivedAmount: receivedAmount,
        awaitingReceiptCount: awaitingReceipt,
        linkedCount: linked,
        lastActivity: rows.first.receiptDate ?? rows.first.createdAt,
      ));
    });

    // ترتيب: مَن لديه مبالغ معلّقة أولاً، ثم الأكثر مبلغاً، ثم الاسم.
    summaries.sort((a, b) {
      if (a.hasPendingHandover != b.hasPendingHandover) {
        return a.hasPendingHandover ? -1 : 1;
      }
      final amt = b.handoverPendingAmount.compareTo(a.handoverPendingAmount);
      if (amt != 0) return amt;
      final tot = b.totalAmount.compareTo(a.totalAmount);
      if (tot != 0) return tot;
      return a.agentName.compareTo(b.agentName);
    });

    return TeamOverview(
      secondaries: summaries,
      totalSecondaries:
          knownSecondaryCount > summaries.length ? knownSecondaryCount : summaries.length,
      totalTeamDeliveries: totalTeamDeliveries,
      totalTeamAmount: totalTeamAmount,
      totalPendingHandoverCount: totalPendingCount,
      totalPendingHandoverAmount: totalPendingAmount,
      totalReceivedAmount: totalReceivedAmount,
    );
  }

  static String _activityKey(DeliveryReceipt d) =>
      d.receiptDate ?? d.createdAt ?? '';
}

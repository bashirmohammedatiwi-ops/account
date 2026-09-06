import '../../models/models.dart';

/// يعيد حساب حقول وصول القبض حسب المندوب الحالي — يصلح كاشاً قديماً أو بيانات ناقصة.
List<DeliveryReceipt> enrichDeliveriesForViewer(List<DeliveryReceipt> list, Agent? viewer) {
  if (viewer == null) return list;
  return list.map((d) => enrichDeliveryForViewer(d, viewer)).toList();
}

bool isTeamDeliveryFor(DeliveryReceipt d, int viewerId) {
  if (d.isTeamDelivery) return true;
  if (d.agentRole == 'secondary') return true;
  final agentId = d.agentId;
  return agentId != null && agentId != viewerId;
}

bool canMarkHandoverFor(DeliveryReceipt d, Agent viewer) {
  if (!viewer.isPrimary) return false;
  if (d.handoverReceived) return false;
  if (!isTeamDeliveryFor(d, viewer.id)) return false;
  final agentId = d.agentId;
  if (agentId != null && agentId == viewer.id) return false;
  return true;
}

DeliveryReceipt enrichDeliveryForViewer(DeliveryReceipt d, Agent viewer) {
  final agentId = d.agentId;
  final isTeam = isTeamDeliveryFor(d, viewer.id);
  final canMark = canMarkHandoverFor(d, viewer);
  final canCreate = d.status == 'issued' &&
      d.receiptId == null &&
      viewer.isPrimary &&
      (agentId == viewer.id || isTeam);

  if (d.isTeamDelivery == isTeam && d.canMarkHandover == canMark && d.canCreateReceipt == canCreate) {
    return d;
  }

  return DeliveryReceipt(
    id: d.id,
    deliveryNo: d.deliveryNo,
    status: d.status,
    statusLabel: d.statusLabel,
    amount: d.amount,
    agentId: d.agentId,
    agentName: d.agentName,
    agentRole: d.agentRole,
    isTeamDelivery: isTeam,
    handoverStatus: d.handoverStatus,
    handoverStatusLabel: d.handoverStatusLabel,
    handoverAt: d.handoverAt,
    handoverByAgentId: d.handoverByAgentId,
    handoverNote: d.handoverNote,
    adminNote: d.adminNote,
    updatedAt: d.updatedAt,
    canMarkHandover: canMark,
    canCreateReceipt: canCreate,
    customerName: d.customerName,
    customerNum: d.customerNum,
    customerAccSeq: d.customerAccSeq,
    treeAccSeq: d.treeAccSeq,
    treeName: d.treeName,
    notes: d.notes,
    receiptDate: d.receiptDate,
    printedAt: d.printedAt,
    receiptId: d.receiptId,
    linkedReceiptNo: d.linkedReceiptNo,
    createdAt: d.createdAt,
  );
}

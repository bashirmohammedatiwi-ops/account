class Employee {
  const Employee({required this.username, required this.name});

  final String username;
  final String name;

  factory Employee.fromJson(Map<String, dynamic> json) => Employee(
        username: '${json['username'] ?? ''}',
        name: '${json['name'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {'username': username, 'name': name};
}

class OrderLine {
  const OrderLine({
    this.id,
    required this.productId,
    required this.matName,
    required this.quant,
    required this.bonus,
    required this.tester,
    required this.unitPrice,
    this.barcode,
    this.lineTotal,
    this.imageUrl,
    this.remarks,
  });

  final int? id;
  final int productId;
  final String matName;
  final num quant;
  final num bonus;
  final num tester;
  final num unitPrice;
  final String? barcode;
  final num? lineTotal;
  final String? imageUrl;
  final String? remarks;

  num get deliverQty => quant + bonus + tester;

  OrderLine copyWith({num? quant, num? bonus, num? tester}) => OrderLine(
        id: id,
        productId: productId,
        matName: matName,
        quant: quant ?? this.quant,
        bonus: bonus ?? this.bonus,
        tester: tester ?? this.tester,
        unitPrice: unitPrice,
        barcode: barcode,
        lineTotal: lineTotal,
        imageUrl: imageUrl,
        remarks: remarks,
      );

  factory OrderLine.fromJson(Map<String, dynamic> json, {String? serverUrl}) {
    var imageUrl = json['imageUrl'] as String?;
    if (imageUrl != null && imageUrl.startsWith('/') && serverUrl != null) {
      imageUrl = '$serverUrl$imageUrl';
    }
    return OrderLine(
      id: json['id'] as int?,
      productId: json['productId'] as int? ?? 0,
      matName: '${json['matName'] ?? ''}',
      quant: json['quant'] as num? ?? 0,
      bonus: json['bonus'] as num? ?? 0,
      tester: json['tester'] as num? ?? 0,
      unitPrice: json['unitPrice'] as num? ?? 0,
      barcode: json['barcode'] as String?,
      lineTotal: json['lineTotal'] as num?,
      imageUrl: imageUrl,
      remarks: json['remarks'] as String?,
    );
  }

  Map<String, dynamic> toPatchJson() => {
        'quant': quant,
        'bonus': bonus,
        'tester': tester,
      };
}

class PurchaseOrder {
  const PurchaseOrder({
    required this.id,
    required this.orderNo,
    required this.status,
    required this.statusLabel,
    this.agentName,
    this.customerName,
    this.customerNum,
    this.catalogBranchName,
    this.notes,
    this.totalAmount,
    this.totalQty,
    this.submittedAt,
    this.lines = const [],
    this.editable = false,
  });

  final int id;
  final String orderNo;
  final String status;
  final String statusLabel;
  final String? agentName;
  final String? customerName;
  final String? customerNum;
  final String? catalogBranchName;
  final String? notes;
  final num? totalAmount;
  final num? totalQty;
  final String? submittedAt;
  final List<OrderLine> lines;
  final bool editable;

  bool get hasGifts => lines.any((l) => l.bonus > 0);
  bool get hasTesters => lines.any((l) => l.tester > 0);

  factory PurchaseOrder.fromJson(Map<String, dynamic> json, {String? serverUrl}) {
    final status = '${json['status'] ?? ''}';
    return PurchaseOrder(
      id: json['id'] as int,
      orderNo: '${json['orderNo'] ?? ''}',
      status: status,
      statusLabel: '${json['statusLabel'] ?? status}',
      agentName: json['agentName'] as String?,
      customerName: json['customerName'] as String?,
      customerNum: json['customerNum'] as String?,
      catalogBranchName: json['catalogBranchName'] as String?,
      notes: json['notes'] as String?,
      totalAmount: json['totalAmount'] as num?,
      totalQty: json['totalQty'] as num?,
      submittedAt: json['submittedAt'] as String?,
      lines: (json['lines'] as List? ?? [])
          .map((e) => OrderLine.fromJson(Map<String, dynamic>.from(e as Map), serverUrl: serverUrl))
          .toList(),
      editable: status == 'pending' || status == 'processing',
    );
  }
}

class OrderFeed {
  const OrderFeed({
    required this.pendingCount,
    this.latest,
    this.newOrders = const [],
  });

  final int pendingCount;
  final PurchaseOrder? latest;
  final List<PurchaseOrder> newOrders;

  factory OrderFeed.fromJson(Map<String, dynamic> json, {String? serverUrl}) => OrderFeed(
        pendingCount: json['pendingCount'] as int? ?? 0,
        latest: json['latest'] != null
            ? PurchaseOrder.fromJson(Map<String, dynamic>.from(json['latest'] as Map), serverUrl: serverUrl)
            : null,
        newOrders: (json['newOrders'] as List? ?? [])
            .map((e) => PurchaseOrder.fromJson(Map<String, dynamic>.from(e as Map), serverUrl: serverUrl))
            .toList(),
      );
}

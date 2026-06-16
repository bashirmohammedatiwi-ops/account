class Agent {
  const Agent({required this.id, required this.name, required this.username});

  final int id;
  final String name;
  final String username;

  factory Agent.fromJson(Map<String, dynamic> json) => Agent(
        id: (json['id'] as num).toInt(),
        name: '${json['name'] ?? ''}',
        username: '${json['username'] ?? ''}',
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'username': username};
}

class AccountTree {
  const AccountTree({
    required this.seq,
    required this.accountNum,
    required this.name1,
    required this.bal,
    required this.subCount,
    required this.directChildren,
    this.debtStatus,
  });

  final String seq;
  final String accountNum;
  final String name1;
  final num bal;
  final int subCount;
  final int directChildren;
  final String? debtStatus;

  factory AccountTree.fromJson(Map<String, dynamic> json) => AccountTree(
        seq: '${json['seq']}',
        accountNum: '${json['num'] ?? ''}',
        name1: '${json['name1'] ?? ''}',
        bal: json['bal'] as num? ?? 0,
        subCount: json['subCount'] as int? ?? 0,
        directChildren: json['directChildren'] as int? ?? 0,
        debtStatus: json['debtStatus'] as String?,
      );
}

class BranchAccount {
  const BranchAccount({
    required this.seq,
    required this.accountNum,
    required this.name1,
    required this.bal,
    this.name2,
    this.address,
    this.debtAmount,
    this.debtStatus,
    this.summary,
  });

  final String seq;
  final String accountNum;
  final String name1;
  final String? name2;
  final String? address;
  final num bal;
  final num? debtAmount;
  final String? debtStatus;
  final Map<String, dynamic>? summary;

  String? get summaryLabel => summary?['label']?.toString();

  bool matchesBranchFilter(String filter) {
    if (filter == 'all') return true;
    final debt = debtAmount ?? 0;
    if (filter == 'debit') return debt > 0;
    if (filter == 'credit') return bal > 0 && debt <= 0;
    return true;
  }

  factory BranchAccount.fromJson(Map<String, dynamic> json) => BranchAccount(
        seq: '${json['seq']}',
        accountNum: '${json['num'] ?? ''}',
        name1: '${json['name1'] ?? ''}',
        name2: json['name2']?.toString(),
        address: json['address']?.toString(),
        bal: json['bal'] as num? ?? 0,
        debtAmount: json['debtAmount'] as num?,
        debtStatus: json['debtStatus']?.toString(),
        summary: json['summary'] is Map ? Map<String, dynamic>.from(json['summary'] as Map) : null,
      );
}

class StatementLine {
  const StatementLine({
    required this.description,
    this.date,
    this.debit = 0,
    this.credit = 0,
    this.balance,
    this.isOpening = false,
    this.isReconciliation = false,
    this.hasInvoice = false,
    this.isReturnInvoice = false,
    this.billSeq,
    this.billNum,
    this.invoiceRef,
  });

  final String description;
  final String? date;
  final num debit;
  final num credit;
  final num? balance;
  final bool isOpening;
  final bool isReconciliation;
  final bool hasInvoice;
  final bool isReturnInvoice;
  final String? billSeq;
  final String? billNum;
  final String? invoiceRef;

  bool get isInvoiceLine {
    if (isOpening || isReconciliation || !hasInvoice) return false;
    if (isReturnInvoice) return credit > 0;
    return debit > 0;
  }

  InvoiceLookup? get invoiceLookup {
    if (!isInvoiceLine) return null;
    final seq = _digits(billSeq);
    if (seq.isNotEmpty) return InvoiceLookup(ref: seq, by: 'seq');
    final num = _digits(billNum);
    if (num.isNotEmpty) return InvoiceLookup(ref: num, by: 'num');
    final fallback = _digits(invoiceRef);
    if (fallback.isNotEmpty) return InvoiceLookup(ref: fallback, by: 'auto');
    return null;
  }

  static String _digits(String? v) => (v ?? '').replaceAll(RegExp(r'[^0-9]'), '');

  factory StatementLine.fromJson(Map<String, dynamic> json) => StatementLine(
        description: '${json['description'] ?? json['desc'] ?? ''}',
        date: json['date'] as String?,
        debit: json['debit'] as num? ?? 0,
        credit: json['credit'] as num? ?? 0,
        balance: json['balance'] as num?,
        isOpening: json['isOpening'] == true,
        isReconciliation: json['isReconciliation'] == true,
        hasInvoice: json['hasInvoice'] == true,
        isReturnInvoice: json['isReturnInvoice'] == true,
        billSeq: json['billSeq']?.toString(),
        billNum: json['billNum']?.toString(),
        invoiceRef: json['invoiceRef']?.toString(),
      );
}

class InvoiceLookup {
  const InvoiceLookup({required this.ref, required this.by, this.accSeq});

  final String ref;
  final String by;
  final String? accSeq;
}

class AccountStatement {
  const AccountStatement({
    required this.account,
    required this.lines,
    this.openingBalance = 0,
    this.totalDebit = 0,
    this.totalCredit = 0,
    this.finalBalance = 0,
    this.summary,
    this.debtAmount,
  });

  final Map<String, dynamic> account;
  final List<StatementLine> lines;
  final num openingBalance;
  final num totalDebit;
  final num totalCredit;
  final num finalBalance;
  final Map<String, dynamic>? summary;
  final num? debtAmount;

  factory AccountStatement.fromJson(Map<String, dynamic> json) => AccountStatement(
        account: Map<String, dynamic>.from(json['account'] as Map? ?? {}),
        lines: (json['lines'] as List? ?? [])
            .map((e) => StatementLine.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        openingBalance: json['openingBalance'] as num? ?? 0,
        totalDebit: json['totalDebit'] as num? ?? 0,
        totalCredit: json['totalCredit'] as num? ?? 0,
        finalBalance: json['finalBalance'] as num? ?? 0,
        summary: json['summary'] != null ? Map<String, dynamic>.from(json['summary'] as Map) : null,
        debtAmount: json['debtAmount'] as num?,
      );
}

class InvoiceDetail {
  const InvoiceDetail({required this.invoice, required this.lines, this.customer, this.branch});

  final Map<String, dynamic> invoice;
  final List<Map<String, dynamic>> lines;
  final Map<String, dynamic>? customer;
  final Map<String, dynamic>? branch;

  factory InvoiceDetail.fromJson(Map<String, dynamic> json) => InvoiceDetail(
        invoice: Map<String, dynamic>.from(json['invoice'] as Map? ?? {}),
        lines: (json['lines'] as List? ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList(),
        customer: json['customer'] != null ? Map<String, dynamic>.from(json['customer'] as Map) : null,
        branch: json['branch'] != null ? Map<String, dynamic>.from(json['branch'] as Map) : null,
      );
}

class CatalogBranch {
  const CatalogBranch({required this.id, required this.name, this.description});

  final int id;
  final String name;
  final String? description;

  factory CatalogBranch.fromJson(Map<String, dynamic> json) => CatalogBranch(
        id: json['id'] as int,
        name: '${json['name'] ?? ''}',
        description: json['description'] as String?,
      );
}

class CatalogSection {
  const CatalogSection({required this.id, required this.name, this.description});

  final int id;
  final String name;
  final String? description;

  factory CatalogSection.fromJson(Map<String, dynamic> json) => CatalogSection(
        id: json['id'] as int,
        name: '${json['name'] ?? ''}',
        description: json['description'] as String?,
      );
}

class Product {
  const Product({
    required this.id,
    required this.name,
    required this.price,
    this.barcode,
    this.skuNum,
    this.imageUrl,
    this.stockHint,
  });

  final int id;
  final String name;
  final num price;
  final String? barcode;
  final String? skuNum;
  final String? imageUrl;
  final String? stockHint;

  factory Product.fromJson(Map<String, dynamic> json, {String? serverUrl}) {
    var imageUrl = json['imageUrl'] as String? ?? json['image_url'] as String?;
    if (imageUrl != null && imageUrl.startsWith('/') && serverUrl != null) {
      imageUrl = '$serverUrl$imageUrl';
    }
    return Product(
      id: json['id'] as int,
      name: '${json['name'] ?? ''}',
      price: json['price'] as num? ?? 0,
      barcode: json['barcode'] as String?,
      skuNum: json['skuNum']?.toString() ?? json['sku_num']?.toString(),
      imageUrl: imageUrl,
      stockHint: json['stockHint'] as String? ?? json['stock_hint'] as String?,
    );
  }
}

class OrderLine {
  const OrderLine({
    required this.productId,
    required this.matName,
    required this.quant,
    required this.bonus,
    required this.unitPrice,
    this.barcode,
    this.lineTotal,
  });

  final int productId;
  final String matName;
  final num quant;
  final num bonus;
  final num unitPrice;
  final String? barcode;
  final num? lineTotal;

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'barcode': barcode ?? '',
        'matNum': barcode ?? '',
        'matName': matName,
        'quant': quant,
        'bonus': bonus,
        'unitPrice': unitPrice,
        'price': unitPrice,
        'lineTotal': lineTotal ?? quant * unitPrice,
      };
}

class Order {
  const Order({
    required this.id,
    required this.status,
    required this.createdAt,
    this.customerName,
    this.customerAccSeq,
    this.catalogBranchName,
    this.notes,
    this.totalAmount,
    this.lines = const [],
  });

  final int id;
  final String status;
  final String createdAt;
  final String? customerName;
  final String? customerAccSeq;
  final String? catalogBranchName;
  final String? notes;
  final num? totalAmount;
  final List<OrderLine> lines;

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['id'] as int,
        status: '${json['status'] ?? ''}',
        createdAt: '${json['createdAt'] ?? json['created_at'] ?? ''}',
        customerName: json['customerName'] as String? ?? json['customer_name'] as String?,
        customerAccSeq: json['customerAccSeq']?.toString() ?? json['customer_acc_seq']?.toString(),
        catalogBranchName: json['catalogBranchName'] as String? ?? json['catalog_branch_name'] as String?,
        notes: json['notes'] as String?,
        totalAmount: json['totalAmount'] as num? ?? json['total_amount'] as num?,
        lines: (json['lines'] as List? ?? []).map((e) {
          final m = Map<String, dynamic>.from(e as Map);
          return OrderLine(
            productId: m['productId'] as int? ?? 0,
            matName: '${m['matName'] ?? m['mat_name'] ?? ''}',
            quant: m['quant'] as num? ?? 0,
            bonus: m['bonus'] as num? ?? 0,
            unitPrice: m['unitPrice'] as num? ?? m['price'] as num? ?? 0,
            barcode: m['barcode'] as String?,
            lineTotal: m['lineTotal'] as num? ?? m['line_total'] as num?,
          );
        }).toList(),
      );
}

class SalesReportSummary {
  const SalesReportSummary({
    this.salesAmount = 0,
    this.salesCount = 0,
    this.returnsAmount = 0,
    this.returnsCount = 0,
    this.netAmount = 0,
    this.netCount = 0,
  });

  final num salesAmount;
  final int salesCount;
  final num returnsAmount;
  final int returnsCount;
  final num netAmount;
  final int netCount;

  factory SalesReportSummary.fromJson(Map<String, dynamic>? json) {
    final s = json ?? {};
    return SalesReportSummary(
      salesAmount: s['salesAmount'] as num? ?? s['sales_amount'] as num? ?? 0,
      salesCount: s['salesCount'] as int? ?? s['sales_count'] as int? ?? 0,
      returnsAmount: s['returnsAmount'] as num? ?? s['returns_amount'] as num? ?? 0,
      returnsCount: s['returnsCount'] as int? ?? s['returns_count'] as int? ?? 0,
      netAmount: s['netAmount'] as num? ?? s['net_amount'] as num? ?? 0,
      netCount: s['netCount'] as int? ?? s['net_count'] as int? ?? 0,
    );
  }
}

class SalesReportInvoice {
  const SalesReportInvoice({
    required this.ref,
    required this.invoiceNum,
    required this.date,
    required this.amount,
    this.isReturn = false,
    this.customerName,
    this.accSeq,
  });

  final String ref;
  final String invoiceNum;
  final String date;
  final num amount;
  final bool isReturn;
  final String? customerName;
  final String? accSeq;

  factory SalesReportInvoice.fromJson(Map<String, dynamic> json) => SalesReportInvoice(
        ref: '${json['ref'] ?? json['billSeq'] ?? json['seq'] ?? ''}',
        invoiceNum: '${json['num'] ?? json['billNum'] ?? ''}',
        date: '${json['date'] ?? ''}',
        amount: json['amount'] as num? ?? 0,
        isReturn: json['isReturn'] == true || json['is_return'] == true,
        customerName: json['customerName'] as String? ?? json['customer_name'] as String?,
        accSeq: json['accSeq']?.toString() ?? json['acc_seq']?.toString(),
      );
}

class SalesReportResult {
  const SalesReportResult({
    required this.summary,
    required this.invoices,
    required this.total,
    required this.offset,
    required this.limit,
  });

  final SalesReportSummary summary;
  final List<SalesReportInvoice> invoices;
  final int total;
  final int offset;
  final int limit;

  factory SalesReportResult.fromJson(Map<String, dynamic> json) => SalesReportResult(
        summary: SalesReportSummary.fromJson(
          json['summary'] != null ? Map<String, dynamic>.from(json['summary'] as Map) : null,
        ),
        invoices: (json['invoices'] as List? ?? [])
            .map((e) => SalesReportInvoice.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        total: json['total'] as int? ?? 0,
        offset: json['offset'] as int? ?? 0,
        limit: json['limit'] as int? ?? 100,
      );
}

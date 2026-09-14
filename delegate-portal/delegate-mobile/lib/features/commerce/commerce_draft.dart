import '../../models/models.dart';

/// سطر مسودة الفاتورة — كمية + هدية + تيستر
typedef DraftLine = ({num quant, num bonus, num tester});

DraftLine emptyDraftLine() => (quant: 0, bonus: 0, tester: 0);

bool draftLineActive(DraftLine? line) {
  if (line == null) return false;
  return line.quant > 0 || line.bonus > 0 || line.tester > 0;
}

/// بيانات المنتج المحفوظة مع المسودة — لبناء فاتورة واحدة لكل أقسام الفرع
class ProductSnapshot {
  const ProductSnapshot({
    required this.id,
    required this.name,
    required this.price,
    this.barcode,
    this.skuNum,
  });

  final int id;
  final String name;
  final num price;
  final String? barcode;
  final String? skuNum;

  factory ProductSnapshot.fromProduct(Product p) => ProductSnapshot(
        id: p.id,
        name: p.name,
        price: p.price,
        barcode: p.barcode,
        skuNum: p.skuNum,
      );

  factory ProductSnapshot.fromJson(Map<String, dynamic> json) => ProductSnapshot(
        id: json['id'] as int,
        name: '${json['name'] ?? ''}',
        price: json['price'] as num? ?? 0,
        barcode: json['barcode'] as String?,
        skuNum: json['skuNum'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'price': price,
        if (barcode != null) 'barcode': barcode,
        if (skuNum != null) 'skuNum': skuNum,
      };
}

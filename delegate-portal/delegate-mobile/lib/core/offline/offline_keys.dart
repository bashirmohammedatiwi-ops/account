abstract final class OfflineKeys {
  static const trees = 'cache:trees';
  static const orders = 'cache:orders';
  static const receipts = 'cache:receipts';
  static const deliveryReceipts = 'cache:delivery_receipts';
  static const customerRequests = 'cache:customer_requests';
  static const promoVisits = 'cache:promo_visits';
  static const governorates = 'cache:governorates';
  static const visitOutcomes = 'cache:visit_outcomes';
  static const catalogBranches = 'cache:catalog_branches';
  static const searchIndex = 'cache:search_index';
  static const productIndex = 'cache:product_index';

  static String children(String seq) => 'cache:children:$seq';
  static String pickable(String treeSeq) => 'cache:pickable:$treeSeq';
  static String sections(int branchId) => 'cache:sections:$branchId';
  static String products(int sectionId) => 'cache:products:$sectionId';
  static String statement(String seq) => 'cache:statement:$seq';
  static String orderDetail(int id) => 'cache:order:$id';
  static String invoice(String ref, String by, String? acc) => 'cache:invoice:$ref:$by:${acc ?? ''}';
}

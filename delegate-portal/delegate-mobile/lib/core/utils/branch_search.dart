import '../../models/models.dart';

String _branchSearchHaystack(BranchAccount branch) {
  return [
    branch.name1,
    branch.name2,
    branch.accountNum,
    branch.address,
    branch.pendingLabel,
  ].where((part) => part != null && '$part'.trim().isNotEmpty).join(' ').toLowerCase();
}

bool branchMatchesSearch(BranchAccount branch, String query) {
  final q = query.trim().toLowerCase();
  if (q.isEmpty) return true;
  final hay = _branchSearchHaystack(branch);
  if (hay.contains(q)) return true;
  final qDigits = q.replaceAll(RegExp(r'\D'), '');
  if (qDigits.length >= 3) {
    return hay.replaceAll(RegExp(r'\D'), '').contains(qDigits);
  }
  return false;
}

List<BranchAccount> filterBranchesForSearch(List<BranchAccount> branches, String query) {
  final q = query.trim();
  if (q.isEmpty) return branches;
  return branches.where((b) => branchMatchesSearch(b, q)).toList();
}

int? _pendingKey(BranchAccount branch) => branch.isPending ? branch.requestId : null;

List<BranchAccount> mergePickableBranches(List<BranchAccount> primary, List<BranchAccount> extra) {
  if (extra.isEmpty) return primary;
  final seenSeq = <String>{};
  final seenRequest = <int>{};
  final merged = <BranchAccount>[];

  void add(BranchAccount branch) {
    final pendingId = _pendingKey(branch);
    if (pendingId != null) {
      if (seenRequest.add(pendingId)) merged.add(branch);
      return;
    }
    final seq = branch.seq.trim();
    if (seq.isEmpty) {
      merged.add(branch);
      return;
    }
    if (seenSeq.add(seq)) merged.add(branch);
  }

  for (final branch in primary) {
    add(branch);
  }
  for (final branch in extra) {
    add(branch);
  }
  merged.sort((a, b) => a.name1.compareTo(b.name1));
  return merged;
}

BranchAccount branchFromCustomerRequest(CustomerRequest request) {
  return BranchAccount(
    seq: '',
    accountNum: request.requestNo,
    name1: request.name,
    address: request.address,
    bal: 0,
    requestId: request.id,
    isPending: true,
    pendingLabel: request.statusLabel,
  );
}

List<BranchAccount> pendingBranchesForTree(List<CustomerRequest> requests, String treeSeq) {
  return requests
      .where((r) {
        if (r.status != 'pending' && r.status != 'reviewed') return false;
        final tree = r.treeAccSeq?.trim();
        return tree == null || tree.isEmpty || tree == treeSeq;
      })
      .map(branchFromCustomerRequest)
      .toList();
}

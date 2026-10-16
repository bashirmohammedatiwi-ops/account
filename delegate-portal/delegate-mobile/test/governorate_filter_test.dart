import 'package:flutter_test/flutter_test.dart';

import 'package:edari_delegate/core/widgets/governorate_ui.dart';
import 'package:edari_delegate/models/models.dart';

BranchAccount _b(String seq, String? gov, {bool pending = false}) => BranchAccount.fromJson({
      'seq': pending ? '' : seq,
      'num': seq,
      'name1': 'زبون $seq',
      'bal': 0,
      'governorateCode': gov,
      if (pending) 'isPending': true,
    });

void main() {
  test('fromJson reads governorate and fills the Arabic name', () {
    final b = _b('C1', 'BAS');
    expect(b.governorateCode, 'BAS');
    expect(b.governorateName, 'البصرة');
    expect(_b('C2', '').governorateCode, isNull);
  });

  test('matchesGovernorate: all, specific and unclassified', () {
    final bgd = _b('C1', 'BGD');
    final none = _b('C2', null);
    expect(bgd.matchesGovernorate(null), isTrue);
    expect(bgd.matchesGovernorate('BGD'), isTrue);
    expect(bgd.matchesGovernorate('BAS'), isFalse);
    expect(none.matchesGovernorate(kUnclassifiedGovernorate), isTrue);
    expect(bgd.matchesGovernorate(kUnclassifiedGovernorate), isFalse);
  });

  test('countByGovernorate counts posted customers only', () {
    final counts = countByGovernorate([
      _b('C1', 'BGD'),
      _b('C2', 'BGD'),
      _b('C3', 'NIN'),
      _b('C4', null),
      _b('R1', null, pending: true),
    ]);
    expect(counts, {'BGD': 2, 'NIN': 1, kUnclassifiedGovernorate: 1});
  });

  test('withGovernorate updates and clears', () {
    final b = _b('C1', null).withGovernorate('ERB');
    expect(b.governorateName, 'أربيل');
    expect(b.withGovernorate(null).governorateCode, isNull);
    expect(kIraqGovernorates.length, 19);
  });
}

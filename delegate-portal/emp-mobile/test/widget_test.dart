import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:edari_emp/main.dart';

void main() {
  testWidgets('App boots', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: EdariEmpApp()));
    expect(find.textContaining('تجهيز'), findsWidgets);
  });
}

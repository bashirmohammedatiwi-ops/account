import 'package:flutter/material.dart';

import 'breakpoints.dart';

/// هامش أفقي — أقل على iPad لاستخدام عرض الشاشة.
double edPageHorizontalPadding(BuildContext context) {
  final w = MediaQuery.sizeOf(context).width;
  if (w >= EdLayout.desktopMin) return 20;
  if (w >= EdLayout.tabletMin) return 8;
  return 16;
}

/// جدول بعرض الصفحة: يملأ العرض المتاح، أو يُمرَّر أفقياً إذا كان أضيق من الحد الأدنى.
class EdFullWidthTable extends StatelessWidget {
  const EdFullWidthTable({
    super.key,
    required this.minWidth,
    required this.builder,
  });

  final double minWidth;
  final Widget Function(double tableWidth) builder;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxW = constraints.maxWidth;
        if (maxW.isFinite && maxW >= minWidth) {
          return SizedBox(width: maxW, child: builder(maxW));
        }
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SizedBox(width: minWidth, child: builder(minWidth)),
        );
      },
    );
  }
}

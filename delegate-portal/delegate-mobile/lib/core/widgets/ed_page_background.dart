import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// خلفية الصفحات — تدرّج فاتح رسمي يعمل على الهاتف والآيباد.
class EdPageBackground extends StatelessWidget {
  const EdPageBackground({super.key, this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(gradient: AppColors.pageGradient),
      child: child,
    );
  }
}

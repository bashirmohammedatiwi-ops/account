import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// خلفية بيضاء رسمية — تُستخدم خلف كل الصفحات
class EdPageBackground extends StatelessWidget {
  const EdPageBackground({super.key, this.child});

  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.white,
      child: child,
    );
  }
}

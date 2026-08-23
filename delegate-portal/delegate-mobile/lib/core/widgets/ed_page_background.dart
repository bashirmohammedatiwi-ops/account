import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// خلفية زخرفية ناعمة — تُستخدم خلف كل الصفحات
class EdPageBackground extends StatelessWidget {
  const EdPageBackground({super.key, this.child, this.intensity = 1.0});

  final Widget? child;
  final double intensity;

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;

    return Stack(
      fit: StackFit.expand,
      children: [
        const DecoratedBox(
          decoration: BoxDecoration(gradient: AppColors.pageGradient),
        ),
        Positioned(
          top: -80,
          left: -40,
          child: _Orb(color: AppColors.accentTeal, size: 260, blur: 72, alpha: 0.14 * intensity),
        ),
        Positioned(
          top: h * 0.18,
          right: -60,
          child: _Orb(color: AppColors.accentViolet, size: 220, blur: 68, alpha: 0.12 * intensity),
        ),
        Positioned(
          bottom: h * 0.08,
          left: -30,
          child: _Orb(color: AppColors.moduleShop, size: 200, blur: 64, alpha: 0.1 * intensity),
        ),
        Positioned(
          bottom: -40,
          right: 40,
          child: _Orb(color: AppColors.gold, size: 140, blur: 56, alpha: 0.08 * intensity),
        ),
        if (child != null) child!,
      ],
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.color, required this.size, required this.blur, required this.alpha});

  final Color color;
  final double size;
  final double blur;
  final double alpha;

  @override
  Widget build(BuildContext context) {
    return ImageFiltered(
      imageFilter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: alpha)),
      ),
    );
  }
}

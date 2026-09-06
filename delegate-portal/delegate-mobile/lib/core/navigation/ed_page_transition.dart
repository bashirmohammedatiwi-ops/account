import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// انتقال موحّد — تلاشي خفيف مع حركة بسيطة (مناسب للهاتف والآيباد).
Page<void> edFadeSlidePage({
  required LocalKey key,
  required Widget child,
  Duration duration = const Duration(milliseconds: 280),
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: duration,
    reverseTransitionDuration: const Duration(milliseconds: 220),
    transitionsBuilder: (context, animation, secondaryAnimation, pageChild) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic, reverseCurve: Curves.easeIn);
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(begin: const Offset(0.02, 0.012), end: Offset.zero).animate(curved),
          child: pageChild,
        ),
      );
    },
  );
}

/// انتقال تبويبات الشل — أسرع وأخف.
Widget edTabTransition(Widget child, Animation<double> animation) {
  final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic, reverseCurve: Curves.easeIn);
  return FadeTransition(
    opacity: Tween<double>(begin: 0.92, end: 1).animate(curved),
    child: SlideTransition(
      position: Tween<Offset>(begin: const Offset(0.01, 0), end: Offset.zero).animate(curved),
      child: child,
    ),
  );
}

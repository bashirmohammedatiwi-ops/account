import 'package:flutter/material.dart';

/// نقاط توقف موحّدة — iPad mini (~744) · iPad (~820) · iPad Pro (~1024+)
abstract final class EdLayout {
  static const phoneMax = 600.0;
  static const tabletMin = 768.0;
  static const wideMin = 900.0;
  static const desktopMin = 1200.0;

  static EdLayoutData of(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return EdLayoutData(width: size.width, height: size.height);
  }
}

class EdLayoutData {
  const EdLayoutData({required this.width, required this.height});

  final double width;
  final double height;

  bool get isPhone => width < EdLayout.tabletMin;
  bool get isTablet => width >= EdLayout.tabletMin;
  bool get isWide => width >= EdLayout.wideMin;
  bool get isDesktop => width >= EdLayout.desktopMin;

  /// جدول بيانات (كشف / فاتورة) — من iPad فما فوق، أو دائماً مثل الويب على الشاشات الأوسع.
  bool get useDataTable => width >= EdLayout.tabletMin;

  int gridColumns({int phone = 2, int tablet = 3, int wide = 4, int desktop = 5}) {
    if (width >= EdLayout.desktopMin) return desktop;
    if (width >= EdLayout.wideMin) return wide;
    if (width >= EdLayout.tabletMin) return tablet;
    return phone;
  }

  double get sidePanelWidth => width >= EdLayout.desktopMin ? 320 : 280;
}

class EdScrollBehavior extends MaterialScrollBehavior {
  const EdScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    return const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());
  }
}

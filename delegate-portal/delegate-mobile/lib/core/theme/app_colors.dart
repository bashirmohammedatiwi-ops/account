import 'package:flutter/material.dart';

/// نظام ألوان Edari — أنيق واحترافي
abstract final class AppColors {
  // الخلفيات
  static const bg = Color(0xFFF3F5F9);
  static const bgWarm = Color(0xFFF8F9FC);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF8FAFC);
  static const surfaceAlt = Color(0xFFF1F5F9);
  static const surfaceElevated = Color(0xFFFAFBFD);
  static const inputFill = Color(0xFFF8FAFC);

  // الحدود
  static const border = Color(0xFFE2E8F0);
  static const borderLight = Color(0xFFEEF2F6);
  static const borderStrong = Color(0xFFCBD5E1);
  static const borderFocus = Color(0xFF0D9488);

  // النص
  static const text = Color(0xFF0C1222);
  static const textSecondary = Color(0xFF475569);
  static const muted = Color(0xFF64748B);
  static const mutedLight = Color(0xFF94A3B8);

  // العلامة التجارية
  static const navy = Color(0xFF0C1222);
  static const navySoft = Color(0xFF1A2332);
  static const navyMid = Color(0xFF1E3A5F);
  static const accent = Color(0xFF0F4C81);
  static const accentSoft = Color(0xFFE6F4F3);
  static const accentTeal = Color(0xFF0D9488);
  static const accentTealLight = Color(0xFF14B8A6);
  static const accentBlue = Color(0xFF2563EB);
  static const gold = Color(0xFFC9A962);
  static const goldLine = Color(0xFFD4BC8A);

  // الحالات
  static const danger = Color(0xFFDC2626);
  static const dangerSoft = Color(0xFFFEF2F2);
  static const success = Color(0xFF059669);
  static const successSoft = Color(0xFFECFDF5);
  static const warning = Color(0xFFD97706);
  static const warningSoft = Color(0xFFFFFBEB);
  static const info = Color(0xFF0284C7);
  static const infoSoft = Color(0xFFF0F9FF);

  // الزوايا
  static const radiusXs = 6.0;
  static const radiusSm = 10.0;
  static const radius = 14.0;
  static const radiusLg = 20.0;
  static const radiusXl = 24.0;

  // الوحدات
  static const modules = (
    accounts: Color(0xFF0D9488),
    shop: Color(0xFF2563EB),
    orders: Color(0xFF7C3AED),
    reports: Color(0xFFD97706),
    receipts: Color(0xFF059669),
    customers: Color(0xFFE11D48),
  );

  static const moduleAccounts = Color(0xFF0D9488);
  static const moduleShop = Color(0xFF2563EB);
  static const moduleOrders = Color(0xFF7C3AED);
  static const moduleReports = Color(0xFFD97706);
  static const moduleReceipts = Color(0xFF059669);
  static const moduleCustomers = Color(0xFFE11D48);

  // التدرجات
  static const brandGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0C1222), Color(0xFF1A3352), Color(0xFF0D9488)],
    stops: [0.0, 0.55, 1.0],
  );

  static const buttonGradient = LinearGradient(
    begin: Alignment.centerRight,
    end: Alignment.centerLeft,
    colors: [Color(0xFF0C1222), Color(0xFF1E3A5F), Color(0xFF0D9488)],
  );

  static LinearGradient get heroGradient => brandGradient;

  static List<BoxShadow> get cardShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.06), blurRadius: 20, offset: const Offset(0, 8)),
        BoxShadow(color: navy.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 2)),
      ];

  static List<BoxShadow> get softShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4)),
      ];

  static List<BoxShadow> get buttonShadow => [
        BoxShadow(color: accentTeal.withValues(alpha: 0.25), blurRadius: 16, offset: const Offset(0, 6)),
      ];
}

/// مسافات موحّدة
abstract final class EdSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const xxl = 24.0;
  static const page = 20.0;
}

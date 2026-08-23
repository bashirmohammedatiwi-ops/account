import 'package:flutter/material.dart';

/// نظام ألوان Edari — فاخر وحديث
abstract final class AppColors {
  // الخلفيات
  static const bg = Color(0xFFEEF2F9);
  static const bgWarm = Color(0xFFF5F7FC);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF8FAFD);
  static const surfaceAlt = Color(0xFFF1F5FA);
  static const surfaceElevated = Color(0xFFFAFBFE);
  static const inputFill = Color(0xFFF4F7FB);
  static const surfaceGlass = Color(0xF2FFFFFF);

  // الحدود
  static const border = Color(0xFFDCE4EF);
  static const borderLight = Color(0xFFE8EEF5);
  static const borderStrong = Color(0xFFC5D0DE);
  static const borderFocus = Color(0xFF0D9488);
  static const borderGlass = Color(0x66FFFFFF);

  // النص
  static const text = Color(0xFF0A1020);
  static const textSecondary = Color(0xFF445066);
  static const muted = Color(0xFF64748B);
  static const mutedLight = Color(0xFF94A3B8);

  // العلامة التجارية
  static const navy = Color(0xFF0A1020);
  static const navySoft = Color(0xFF151D2E);
  static const navyMid = Color(0xFF1A3352);
  static const accent = Color(0xFF0F4C81);
  static const accentSoft = Color(0xFFE8F4F3);
  static const accentTeal = Color(0xFF0D9488);
  static const accentTealLight = Color(0xFF14B8A6);
  static const accentBlue = Color(0xFF2563EB);
  static const accentViolet = Color(0xFF6366F1);
  static const gold = Color(0xFFD4AF6A);
  static const goldLine = Color(0xFFE8D5A8);
  static const goldSoft = Color(0xFFFDF8EE);

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
  static const radiusXs = 8.0;
  static const radiusSm = 12.0;
  static const radius = 16.0;
  static const radiusLg = 22.0;
  static const radiusXl = 28.0;
  static const radius2xl = 32.0;

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
  static const modulePromo = Color(0xFFDB2777);

  // التدرجات
  static const pageGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFFF0F4FA), Color(0xFFEEF2F9), Color(0xFFE8EDF6)],
    stops: [0.0, 0.45, 1.0],
  );

  static const brandGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0A0F1C), Color(0xFF152238), Color(0xFF1A3A5C), Color(0xFF0D9488)],
    stops: [0.0, 0.35, 0.72, 1.0],
  );

  static const heroGradient = brandGradient;

  static const buttonGradient = LinearGradient(
    begin: Alignment.centerRight,
    end: Alignment.centerLeft,
    colors: [Color(0xFF0A1020), Color(0xFF1A3352), Color(0xFF0D9488)],
  );

  static const avatarRingGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF2DD4BF), Color(0xFF60A5FA), Color(0xFFA78BFA)],
  );

  static const accentGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0D9488), Color(0xFF2563EB)],
  );

  /// تدرجات فاتحة للصفحة الرئيسية — بدون ألوان غامقة
  static const homeSkyGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFFF8FBFF), Color(0xFFEFF6FF), Color(0xFFECFDF5)],
    stops: [0.0, 0.55, 1.0],
  );

  static const homeAuroraGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFDBEAFE), Color(0xFFE0F2FE), Color(0xFFCCFBF1), Color(0xFFF5F3FF)],
    stops: [0.0, 0.3, 0.65, 1.0],
  );

  static const homeSunGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFCCFBF1), Color(0xFFBAE6FD), Color(0xFFE0E7FF)],
  );

  static const homeCardWash = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFFFFFFFF), Color(0xFFF8FAFC)],
  );

  static LinearGradient homeIconGradient(Color color) => LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [color.withValues(alpha: 0.22), color.withValues(alpha: 0.08)],
      );

  static LinearGradient moduleGradient(Color color) => LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [color, Color.lerp(color, AppColors.navy, 0.25)!],
      );

  static LinearGradient moduleSoftGradient(Color color) => LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [color.withValues(alpha: 0.16), color.withValues(alpha: 0.06)],
      );

  static List<BoxShadow> get cardShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.07), blurRadius: 24, offset: const Offset(0, 10)),
        BoxShadow(color: accentTeal.withValues(alpha: 0.04), blurRadius: 8, offset: const Offset(0, 2)),
      ];

  static List<BoxShadow> get elevatedShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.1), blurRadius: 32, offset: const Offset(0, 14)),
        BoxShadow(color: accentViolet.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4)),
      ];

  static List<BoxShadow> get softShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.05), blurRadius: 16, offset: const Offset(0, 6)),
      ];

  static List<BoxShadow> get buttonShadow => [
        BoxShadow(color: accentTeal.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8)),
      ];

  static List<BoxShadow> get dockShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.1), blurRadius: 28, offset: const Offset(0, 10)),
        BoxShadow(color: accentTeal.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 4)),
      ];

  static List<BoxShadow> get headerShadow => [
        BoxShadow(color: navy.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4)),
      ];

  static BoxDecoration glassCard({Color? color, double radius = radiusLg, Color? borderColor}) => BoxDecoration(
        color: color ?? surfaceGlass,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor ?? borderLight.withValues(alpha: 0.9)),
        boxShadow: cardShadow,
      );
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

import 'package:flutter/material.dart';

/// نظام ألوان Edari — فاخر وحديث
/// نظام ألوان Edari — هادئ واحترافي، مبني على أزرق الشعار.
abstract final class AppColors {
  // الخلفيات
  static const bg = Color(0xFFF4F6FA);
  static const bgWarm = Color(0xFFF7F8FB);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF9FAFB);
  static const surfaceAlt = Color(0xFFF2F4F7);
  static const surfaceElevated = Color(0xFFFFFFFF);
  static const inputFill = Color(0xFFF9FAFB);
  static const surfaceGlass = Color(0xFAFFFFFF);

  // الحدود
  static const border = Color(0xFFE4E7EC);
  static const borderLight = Color(0xFFEAECF0);
  static const borderStrong = Color(0xFFD0D5DD);
  static const borderFocus = Color(0xFF1A5FD8);
  static const borderGlass = Color(0x66FFFFFF);

  // النص
  static const text = Color(0xFF101828);
  static const textSecondary = Color(0xFF475467);
  static const muted = Color(0xFF667085);
  static const mutedLight = Color(0xFF98A2B3);

  // العلامة التجارية
  static const navy = Color(0xFF101828);
  static const navySoft = Color(0xFF1D2939);
  static const navyMid = Color(0xFF243B63);
  static const accent = Color(0xFF1A5FD8);
  /// اللون الأساسي للتطبيق (الاسم القديم محفوظ للتوافق).
  static const accentTeal = Color(0xFF1A5FD8);
  static const accentTealLight = Color(0xFF528BFF);
  static const accentSoft = Color(0xFFEEF4FF);
  static const primary = accentTeal;
  static const primarySoft = accentSoft;
  static const primaryDark = Color(0xFF123F99);
  static const accentBlue = Color(0xFF1A5FD8);
  static const accentViolet = Color(0xFF6941C6);
  static const gold = Color(0xFFB54708);
  static const goldLine = Color(0xFFFEDF89);
  static const goldSoft = Color(0xFFFFFAEB);

  // الحالات
  static const danger = Color(0xFFD92D20);
  static const dangerSoft = Color(0xFFFEF3F2);
  static const success = Color(0xFF079455);
  static const successSoft = Color(0xFFECFDF3);
  static const warning = Color(0xFFDC6803);
  static const warningSoft = Color(0xFFFFFAEB);
  static const info = Color(0xFF0086C9);
  static const infoSoft = Color(0xFFF0F9FF);

  // الزوايا
  static const radiusXs = 6.0;
  static const radiusSm = 10.0;
  static const radius = 12.0;
  static const radiusLg = 16.0;
  static const radiusXl = 18.0;
  static const radius2xl = 22.0;

  // الوحدات
  static const modules = (
    accounts: moduleAccounts,
    shop: moduleShop,
    orders: moduleOrders,
    reports: moduleReports,
    receipts: moduleReceipts,
    customers: moduleCustomers,
  );

  static const moduleAccounts = Color(0xFF0E7490);
  static const moduleShop = Color(0xFF1A5FD8);
  static const moduleOrders = Color(0xFF6941C6);
  static const moduleReports = Color(0xFFB54708);
  static const moduleReceipts = Color(0xFF067647);
  static const moduleCustomers = Color(0xFFC01048);
  static const modulePromo = Color(0xFFC11574);

  // التدرجات
  static const pageGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [bg, bg],
  );

  static const brandGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0B1B3F), Color(0xFF123F99), Color(0xFF1A5FD8)],
    stops: [0.0, 0.6, 1.0],
  );

  static const heroGradient = brandGradient;

  static const buttonGradient = LinearGradient(
    begin: Alignment.centerRight,
    end: Alignment.centerLeft,
    colors: [Color(0xFF123F99), Color(0xFF1A5FD8)],
  );

  static const avatarRingGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF528BFF), Color(0xFF1A5FD8)],
  );

  static const accentGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF1A5FD8), Color(0xFF123F99)],
  );

  /// تدرجات فاتحة للصفحة الرئيسية — بدون ألوان غامقة
  static const homeSkyGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFFFFFFFF), Color(0xFFF8FAFF)],
  );

  static const homeAuroraGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEEF4FF), Color(0xFFF5F8FF)],
  );

  static const homeSunGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFEEF4FF), Color(0xFFE0EAFF)],
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

  static List<BoxShadow> get cardShadow => const [
        BoxShadow(color: Color(0x0A101828), blurRadius: 3, offset: Offset(0, 1)),
        BoxShadow(color: Color(0x08101828), blurRadius: 12, offset: Offset(0, 4)),
      ];

  static List<BoxShadow> get elevatedShadow => const [
        BoxShadow(color: Color(0x14101828), blurRadius: 24, offset: Offset(0, 12)),
        BoxShadow(color: Color(0x08101828), blurRadius: 6, offset: Offset(0, 2)),
      ];

  static List<BoxShadow> get softShadow => const [
        BoxShadow(color: Color(0x0A101828), blurRadius: 2, offset: Offset(0, 1)),
      ];

  static List<BoxShadow> get buttonShadow => const [
        BoxShadow(color: Color(0x261A5FD8), blurRadius: 12, offset: Offset(0, 4)),
      ];

  static List<BoxShadow> get dockShadow => const [
        BoxShadow(color: Color(0x14101828), blurRadius: 20, offset: Offset(0, -2)),
      ];

  static List<BoxShadow> get headerShadow => const [
        BoxShadow(color: Color(0x08101828), blurRadius: 4, offset: Offset(0, 1)),
      ];

  static BoxDecoration glassCard({Color? color, double radius = radiusLg, Color? borderColor}) => BoxDecoration(
        color: color ?? surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor ?? borderLight),
        boxShadow: cardShadow,
      );

  /// بطاقة قياسية: سطح أبيض بحد رفيع وظل خفيف.
  static BoxDecoration card({double radius = radiusLg, Color? color, Color? borderColor}) => BoxDecoration(
        color: color ?? surface,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: borderColor ?? border),
        boxShadow: softShadow,
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

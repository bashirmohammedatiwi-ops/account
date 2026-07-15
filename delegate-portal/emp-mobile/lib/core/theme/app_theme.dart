import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Brand
  static const primary = Color(0xFF0D9488);
  static const primaryDark = Color(0xFF0F766E);
  static const primaryDeep = Color(0xFF134E4A);
  static const accent = Color(0xFF6366F1);
  static const shorja = Color(0xFF16A34A);
  static const shorjaSoft = Color(0xFFDCFCE7);

  // Light
  static const bg = Color(0xFFF4F7FB);
  static const surface = Colors.white;
  static const surfaceAlt = Color(0xFFF8FAFC);
  static const text = Color(0xFF0F172A);
  static const muted = Color(0xFF64748B);
  static const border = Color(0xFFE2E8F0);
  static const shadow = Color(0x1A0F172A);

  // Dark
  static const bgDark = Color(0xFF0B1220);
  static const surfaceDark = Color(0xFF111827);
  static const surfaceAltDark = Color(0xFF1F2937);
  static const textDark = Color(0xFFF8FAFC);
  static const mutedDark = Color(0xFF94A3B8);
  static const borderDark = Color(0xFF334155);

  // Status
  static const pending = Color(0xFFD97706);
  static const pendingSoft = Color(0xFFFFFBEB);
  static const processing = Color(0xFF0284C7);
  static const processingSoft = Color(0xFFE0F2FE);
  static const rejected = Color(0xFFDC2626);
  static const rejectedSoft = Color(0xFFFEE2E2);
  static const gift = Color(0xFFEA580C);
  static const giftSoft = Color(0xFFFFF7ED);
  static const tester = Color(0xFF7C3AED);
  static const testerSoft = Color(0xFFF3E8FF);

  static const radius = 20.0;
  static const radiusSm = 14.0;

  static const headerGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF0F172A), Color(0xFF134E4A), Color(0xFF0D9488)],
  );

  static const cardGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF0D9488), Color(0xFF14B8A6)],
  );
}

class AppTheme {
  static ThemeData light = _build(Brightness.light);
  static ThemeData dark = _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: brightness,
        primary: AppColors.primary,
        surface: dark ? AppColors.surfaceDark : AppColors.surface,
      ),
      scaffoldBackgroundColor: dark ? AppColors.bgDark : AppColors.bg,
    );

    final cairo = GoogleFonts.cairoTextTheme(base.textTheme);

    return base.copyWith(
      textTheme: cairo,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: dark ? AppColors.textDark : AppColors.text,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: cairo.titleLarge?.copyWith(fontWeight: FontWeight.w800),
      ),
      cardTheme: CardThemeData(
        color: dark ? AppColors.surfaceDark : AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppColors.radius),
          side: BorderSide(color: dark ? AppColors.borderDark : AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: dark ? AppColors.surfaceAltDark : AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          borderSide: BorderSide(color: dark ? AppColors.borderDark : AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          borderSide: BorderSide(color: dark ? AppColors.borderDark : AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        labelStyle: TextStyle(color: dark ? AppColors.mutedDark : AppColors.muted, fontWeight: FontWeight.w600),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radiusSm)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radiusSm)),
          side: BorderSide(color: dark ? AppColors.borderDark : AppColors.border),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: dark ? AppColors.surfaceDark : AppColors.surface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: dark ? AppColors.mutedDark : AppColors.muted,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11),
        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 11),
      ),
      dividerTheme: DividerThemeData(color: dark ? AppColors.borderDark : AppColors.border),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: BorderSide(color: dark ? AppColors.borderDark : AppColors.border),
      ),
    );
  }
}

String statusLabelAr(String status) => switch (status) {
      'pending' => 'قيد الانتظار',
      'processing' => 'تم التجهيز',
      'rejected' => 'مرفوض',
      _ => status,
    };

Color statusColor(String status) => switch (status) {
      'pending' => AppColors.pending,
      'processing' => AppColors.processing,
      'rejected' => AppColors.rejected,
      _ => AppColors.muted,
    };

Color statusSoftColor(String status) => switch (status) {
      'pending' => AppColors.pendingSoft,
      'processing' => AppColors.processingSoft,
      'rejected' => AppColors.rejectedSoft,
      _ => AppColors.surfaceAlt,
    };

String formatMoney(num? v) {
  if (v == null) return '—';
  return v.round().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
}

String formatTimeAgo(String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  try {
    final dt = DateTime.parse(iso.replaceFirst(' ', 'T'));
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'الآن';
    if (diff.inMinutes < 60) return 'منذ ${diff.inMinutes} د';
    if (diff.inHours < 24) return 'منذ ${diff.inHours} س';
    return 'منذ ${diff.inDays} ي';
  } catch (_) {
    return iso;
  }
}

bool isDark(BuildContext context) => Theme.of(context).brightness == Brightness.dark;

Color themed(BuildContext context, {required Color light, required Color dark}) =>
    isDark(context) ? dark : light;

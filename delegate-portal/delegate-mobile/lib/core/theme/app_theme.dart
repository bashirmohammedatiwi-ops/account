import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class AppTheme {
  static const _primary = Color(0xFF0F766E);
  static const _primaryDark = Color(0xFF115E59);
  static const _surface = Color(0xFFF8FAFC);
  static const _card = Colors.white;
  static const _text = Color(0xFF0F172A);
  static const _muted = Color(0xFF64748B);
  static const _danger = Color(0xFFDC2626);
  static const _success = Color(0xFF059669);
  static const _warning = Color(0xFFD97706);

  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: _primary,
        primary: _primary,
        secondary: _primaryDark,
        surface: _surface,
        error: _danger,
      ),
      scaffoldBackgroundColor: _surface,
      cardColor: _card,
      dividerColor: const Color(0xFFE2E8F0),
    );

    final textTheme = GoogleFonts.cairoTextTheme(base.textTheme).apply(
      bodyColor: _text,
      displayColor: _text,
    );

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        backgroundColor: _card,
        foregroundColor: _text,
        titleTextStyle: textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
      cardTheme: CardThemeData(
        color: _card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFE2E8F0)),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: _primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 52),
          padding: const EdgeInsets.symmetric(horizontal: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: _card,
        selectedIconTheme: const IconThemeData(color: _primary, size: 26),
        unselectedIconTheme: IconThemeData(color: _muted.withValues(alpha: 0.8), size: 24),
        indicatorColor: _primary.withValues(alpha: 0.12),
        labelType: NavigationRailLabelType.all,
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
        side: const BorderSide(color: Color(0xFFCBD5E1)),
        labelStyle: textTheme.labelLarge,
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
    );
  }

  static Color debtColor(String? status) {
    switch (status) {
      case 'debit':
        return _danger;
      case 'credit':
        return _success;
      default:
        return _muted;
    }
  }

  static Color orderStatusColor(String? status) {
    switch (status) {
      case 'approved':
      case 'delivered':
        return _success;
      case 'rejected':
        return _danger;
      case 'submitted':
      case 'under_review':
      case 'processing':
        return _warning;
      default:
        return _muted;
    }
  }
}

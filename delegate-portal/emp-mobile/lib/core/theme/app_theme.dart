import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const bg = Color(0xFFF1F5F9);
  static const surface = Colors.white;
  static const text = Color(0xFF0F172A);
  static const muted = Color(0xFF64748B);
  static const border = Color(0xFFE2E8F0);
  static const primary = Color(0xFF0F766E);
  static const primarySoft = Color(0xFFCCFBF1);
  static const danger = Color(0xFFB91C1C);
  static const dangerSoft = Color(0xFFFEE2E2);
  static const warn = Color(0xFFB45309);
  static const warnSoft = Color(0xFFFEF3C7);
  static const ok = Color(0xFF0369A1);
  static const okSoft = Color(0xFFE0F2FE);
  static const gift = Color(0xFFEA580C);
  static const radius = 16.0;
}

class AppTheme {
  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(seedColor: AppColors.primary, brightness: Brightness.light),
      scaffoldBackgroundColor: AppColors.bg,
    );
    return base.copyWith(
      textTheme: GoogleFonts.cairoTextTheme(base.textTheme),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.text,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppColors.radius),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
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
      'pending' => AppColors.warn,
      'processing' => AppColors.ok,
      'rejected' => AppColors.danger,
      _ => AppColors.muted,
    };

String formatMoney(num? v) {
  if (v == null) return '—';
  return v.round().toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
}

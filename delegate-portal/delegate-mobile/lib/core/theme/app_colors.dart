import 'package:flutter/material.dart';

/// ألوان بوابة المندوب — مطابقة لتصميم الويب `/m`
abstract final class AppColors {
  static const bg = Color(0xFFEEF1F5);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF8FAFC);
  static const surfaceAlt = Color(0xFFF1F5F9);
  static const border = Color(0xFFD8E0EA);
  static const borderStrong = Color(0xFFBCC8D6);

  static const text = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF475569);
  static const muted = Color(0xFF64748B);

  static const navy = Color(0xFF0F172A);
  static const navySoft = Color(0xFF1E293B);
  static const accent = Color(0xFF0F4C81);
  static const accentSoft = Color(0xFFE8F1F8);
  static const accentTeal = Color(0xFF0F766E);
  static const gold = Color(0xFF927648);
  static const goldLine = Color(0xFFC9B896);

  static const danger = Color(0xFFB91C1C);
  static const dangerSoft = Color(0xFFFEF2F2);
  static const success = Color(0xFF047857);
  static const successSoft = Color(0xFFECFDF5);
  static const warning = Color(0xFFEA580C);
  static const warningSoft = Color(0xFFFFF7ED);

  static const radius = 12.0;
  static const radiusSm = 8.0;
  static const radiusLg = 16.0;

  static const moduleAccounts = Color(0xFF0F766E);
  static const moduleShop = Color(0xFF2563EB);
  static const moduleOrders = Color(0xFF7C3AED);
  static const moduleReports = Color(0xFFD97706);

  static LinearGradient get heroGradient => const LinearGradient(
        begin: Alignment.topRight,
        end: Alignment.bottomLeft,
        colors: [navy, Color(0xFF1E3A5F), accentTeal],
      );
}

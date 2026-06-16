import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';

/// ألوان موحّدة لقسم الكشوفات — Pearl Edari (بسيطة وأنيقة)
abstract final class EdAccountsTheme {
  static const pageBg = AppColors.bg;

  static const card = AppColors.surface;
  static const cardTint = AppColors.surfaceAlt;
  static const cardMuted = AppColors.surfaceMuted;
  static const line = AppColors.border;
  static const lineStrong = AppColors.borderStrong;

  static const accent = AppColors.accentTeal;
  static const accentSoft = AppColors.accentSoft;

  static const debit = Color(0xFF9A3412);
  static const debitSoft = Color(0xFFFFF7ED);
  static const credit = Color(0xFF0F766E);
  static const creditSoft = Color(0xFFECFDF5);
  static const neutral = AppColors.muted;
  static const neutralSoft = AppColors.surfaceMuted;
  static const debt = Color(0xFF78716C);

  static const tableHead = AppColors.surfaceAlt;
  static const tableHeadText = AppColors.navy;

  static const heroGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFFF8FAFC), Color(0xFFEEF2F6)],
  );

  static Color balanceColor(num? v) {
    if (v == null || v == 0) return neutral;
    return v < 0 ? debit : credit;
  }

  static ({Color fg, Color bg, Color border}) variantStyle(BranchCardVariant v) => switch (v) {
        BranchCardVariant.debit => (fg: debit, bg: debitSoft, border: line),
        BranchCardVariant.credit => (fg: credit, bg: creditSoft, border: line),
        BranchCardVariant.clear => (fg: neutral, bg: cardTint, border: line),
      };

  static ({Color fg, Color bg}) filterStyle(String key, {required bool selected}) {
    if (!selected) return (fg: AppColors.textSecondary, bg: card);
    return switch (key) {
      'debit' => (fg: debit, bg: debitSoft),
      'credit' => (fg: credit, bg: creditSoft),
      _ => (fg: accent, bg: accentSoft),
    };
  }
}

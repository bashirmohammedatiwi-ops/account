import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'app_colors.dart';

abstract final class AppTheme {
  static ThemeData get light {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.navy,
        primary: AppColors.navy,
        secondary: AppColors.accentTeal,
        surface: AppColors.bg,
        error: AppColors.danger,
      ),
      scaffoldBackgroundColor: AppColors.bg,
      cardColor: AppColors.surface,
      dividerColor: AppColors.border,
    );

    final textTheme = GoogleFonts.cairoTextTheme(base.textTheme).apply(
      bodyColor: AppColors.text,
      displayColor: AppColors.text,
    );

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppColors.radius),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        labelStyle: textTheme.labelLarge?.copyWith(color: AppColors.textSecondary, fontWeight: FontWeight.w700),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppColors.radiusSm)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusSm),
          borderSide: const BorderSide(color: AppColors.accent, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radiusSm)),
          textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          side: const BorderSide(color: AppColors.borderStrong),
          minimumSize: const Size(0, 46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radiusSm)),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: AppColors.surface,
        selectedIconTheme: const IconThemeData(color: AppColors.accentTeal, size: 26),
        unselectedIconTheme: const IconThemeData(color: AppColors.muted, size: 24),
        indicatorColor: AppColors.accentTeal.withValues(alpha: 0.12),
        labelType: NavigationRailLabelType.all,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(999))),
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }

  static Color debtColor(String? status) {
    switch (status) {
      case 'debit':
        return AppColors.danger;
      case 'credit':
        return AppColors.success;
      default:
        return AppColors.muted;
    }
  }

  static Color orderStatusColor(String? status) {
    switch (status) {
      case 'approved':
      case 'delivered':
        return AppColors.success;
      case 'rejected':
        return AppColors.danger;
      case 'submitted':
      case 'under_review':
      case 'processing':
        return AppColors.warning;
      default:
        return AppColors.muted;
    }
  }

  static Color branchAccent(BranchCardVariant variant) {
    return switch (variant) {
      BranchCardVariant.debit => AppColors.danger,
      BranchCardVariant.credit => AppColors.success,
      BranchCardVariant.clear => AppColors.borderStrong,
    };
  }
}

enum BranchCardVariant { debit, credit, clear }

BranchCardVariant branchVariantFor({required num bal, required num? debtAmount}) {
  final debt = debtAmount ?? 0;
  if (debt > 0) return BranchCardVariant.debit;
  if (bal > 0) return BranchCardVariant.credit;
  return BranchCardVariant.clear;
}

String branchStatusLabel(BranchCardVariant v) => switch (v) {
      BranchCardVariant.debit => 'مدين',
      BranchCardVariant.credit => 'دائن',
      BranchCardVariant.clear => 'متعادل',
    };

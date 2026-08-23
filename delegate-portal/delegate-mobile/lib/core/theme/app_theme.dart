import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
        surface: AppColors.surface,
        error: AppColors.danger,
      ),
      scaffoldBackgroundColor: Colors.white,
      cardColor: AppColors.surface,
      dividerColor: AppColors.borderLight,
      splashColor: AppColors.accentTeal.withValues(alpha: 0.08),
      highlightColor: AppColors.accentTeal.withValues(alpha: 0.05),
    );

    final textTheme = GoogleFonts.cairoTextTheme(base.textTheme).apply(
      bodyColor: AppColors.text,
      displayColor: AppColors.text,
    );

    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppColors.radius),
      borderSide: BorderSide.none,
    );

    return base.copyWith(
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        backgroundColor: AppColors.navy,
        foregroundColor: Colors.white,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppColors.radiusLg),
          side: const BorderSide(color: AppColors.borderLight),
        ),
        margin: EdgeInsets.zero,
        shadowColor: AppColors.navy.withValues(alpha: 0.08),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.inputFill,
        floatingLabelBehavior: FloatingLabelBehavior.auto,
        labelStyle: textTheme.labelLarge?.copyWith(
          color: AppColors.textSecondary,
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: AppColors.mutedLight,
          fontWeight: FontWeight.w500,
        ),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        border: inputBorder,
        enabledBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.borderLight, width: 1),
        ),
        focusedBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.borderFocus, width: 2),
        ),
        errorBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.danger, width: 1),
        ),
        focusedErrorBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.danger, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.border,
          disabledForegroundColor: AppColors.muted,
          minimumSize: const Size(0, 54),
          padding: const EdgeInsets.symmetric(horizontal: 24),
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radius)),
          textStyle: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.navy,
          side: const BorderSide(color: AppColors.border),
          minimumSize: const Size(0, 50),
          padding: const EdgeInsets.symmetric(horizontal: 20),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radius)),
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.accentTeal,
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      dropdownMenuTheme: DropdownMenuThemeData(
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.inputFill,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(AppColors.radius)),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surfaceAlt,
        selectedColor: AppColors.accentSoft,
        labelStyle: textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.borderLight, thickness: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radius)),
        backgroundColor: AppColors.navy,
      ),
      dialogTheme: DialogThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radiusXl)),
        backgroundColor: AppColors.surface,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppColors.radiusXl)),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: AppColors.surface,
        selectedIconTheme: const IconThemeData(color: AppColors.accentTeal, size: 26),
        unselectedIconTheme: const IconThemeData(color: AppColors.muted, size: 24),
        indicatorColor: AppColors.accentSoft,
        labelType: NavigationRailLabelType.all,
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          shape: WidgetStatePropertyAll(RoundedRectangleBorder(borderRadius: BorderRadius.circular(999))),
          textStyle: WidgetStatePropertyAll(textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
        ),
      ),
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

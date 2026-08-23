import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// ألوان قسم المنتجات — فاتحة وأنيقة
abstract final class EdCommerceTheme {
  static const pageBg = Colors.white;
  static const card = AppColors.surface;
  static const cardTint = AppColors.surfaceAlt;
  static const line = AppColors.border;
  static const accent = AppColors.moduleShop;
  static const accentSoft = Color(0xFFEFF6FF);
  static const accentGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [Color(0xFF2563EB), Color(0xFF6366F1)],
  );
  static const selectedBorder = Color(0xFF2563EB);
  static const selectedGlow = Color(0x402563EB);
  static const giftBg = Color(0xFFFFF7ED);
  static const giftBorder = Color(0xFFFDE68A);
  static const giftFg = Color(0xFFB45309);
  static const testerBg = Color(0xFFF0F9FF);
  static const testerBorder = Color(0xFFBAE6FD);
  static const testerFg = Color(0xFF0369A1);
  static const stockBg = Color(0xFFEFF6FF);
  static const panelBg = Colors.white;
  static const panelHeader = Color(0xFFF8FAFD);
  static const stockFg = Color(0xFF1D4ED8);
}

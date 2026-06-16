import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// ألوان موحّدة لقسم المنتجات — بسيطة وأنيقة
abstract final class EdCommerceTheme {
  static const pageBg = AppColors.bg;
  static const card = AppColors.surface;
  static const cardTint = AppColors.surfaceAlt;
  static const line = AppColors.border;
  static const accent = AppColors.moduleShop;
  static const accentSoft = Color(0xFFEFF6FF);
  static const selectedBorder = Color(0xFF2563EB);
  static const selectedGlow = Color(0x402563EB);
  static const dockBg = AppColors.navy;
  static const giftBg = Color(0xFFFFF7ED);
  static const giftBorder = Color(0xFFFDE68A);
  static const giftFg = Color(0xFFB45309);
  static const stockBg = Color(0xFFEFF6FF);
  static const panelBg = Color(0xFFFAFBFC);
  static const panelHeader = Color(0xFF1E3A5F);
  static const stockFg = Color(0xFF1D4ED8);
}

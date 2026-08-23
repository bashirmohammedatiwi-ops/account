import 'package:flutter/material.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';

/// خلفية بيضاء رسمية للصفحات
class EdModernBackdrop extends StatelessWidget {
  const EdModernBackdrop({super.key, this.variant = EdBackdropVariant.home});

  final EdBackdropVariant variant;

  @override
  Widget build(BuildContext context) {
    return const ColoredBox(color: Colors.white);
  }
}

enum EdBackdropVariant { home, accounts }

/// شريط علوي رسمي داخل البطاقات
class EdCardDecorStrip extends StatelessWidget {
  const EdCardDecorStrip({
    super.key,
    this.colors = const [Color(0xFF0A1020), Color(0xFF152238), Color(0xFF1A3352)],
    this.height = 10,
    this.child,
  });

  final List<Color> colors;
  final double height;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: child != null ? const EdgeInsets.symmetric(horizontal: 14, vertical: 8) : null,
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.centerRight, end: Alignment.centerLeft, colors: colors),
      ),
      height: child == null ? height : null,
      child: child,
    );
  }
}

/// عنوان قسم رسمي
class EdSectionHeader extends StatelessWidget {
  const EdSectionHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.iconColor = AppColors.accentTeal,
    this.large = false,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: large ? 40 : 36,
          height: large ? 40 : 36,
          decoration: BoxDecoration(
            color: AppColors.surfaceAlt,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.borderLight),
          ),
          child: Icon(icon, size: large ? 18 : 16, color: iconColor),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: large ? 18 : 16,
                  fontWeight: FontWeight.w800,
                  color: AppColors.navy,
                  letterSpacing: -0.3,
                ),
              ),
              Text(
                subtitle,
                style: TextStyle(fontSize: large ? 12 : 11, fontWeight: FontWeight.w600, color: AppColors.muted),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// حقل بحث رسمي
class EdModernSearchField extends StatelessWidget {
  const EdModernSearchField({
    super.key,
    required this.hint,
    required this.hasText,
    required this.onChanged,
    required this.onClear,
    this.controller,
    this.large = false,
  });

  final String hint;
  final bool hasText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  final TextEditingController? controller;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w600, color: AppColors.navy),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(fontSize: large ? 14 : 13, fontWeight: FontWeight.w600, color: AppColors.mutedLight),
          prefixIcon: const Icon(Icons.search_rounded, size: 20, color: AppColors.muted),
          suffixIcon: hasText
              ? IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: onClear, color: AppColors.muted)
              : null,
          border: InputBorder.none,
          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: large ? 14 : 12),
        ),
      ),
    );
  }
}

/// أيقونة داخل صندوق رسمي
class EdGradientIconBox extends StatelessWidget {
  const EdGradientIconBox({
    super.key,
    required this.icon,
    required this.color,
    this.size = 52,
    this.iconSize = 24,
    this.bgColor,
  });

  final IconData icon;
  final Color color;
  final double size;
  final double iconSize;
  final Color? bgColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: bgColor ?? AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(size * 0.26),
        border: Border.all(color: AppColors.borderLight),
      ),
      child: Icon(icon, color: color, size: iconSize),
    );
  }
}

/// صورة رمزية رسمية
class EdGradientAvatar extends StatelessWidget {
  const EdGradientAvatar({
    super.key,
    required this.label,
    this.size = 58,
  });

  final String label;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: AppColors.surface,
        border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.4), width: 2),
        boxShadow: AppColors.softShadow,
      ),
      alignment: Alignment.center,
      child: Text(label, style: TextStyle(color: AppColors.navy, fontSize: size * 0.36, fontWeight: FontWeight.w800)),
    );
  }
}

/// زخرفة زاوية — غير مستخدمة في الأسلوب الرسمي (تبقى للتوافق)
class EdTileCornerDecor extends StatelessWidget {
  const EdTileCornerDecor({super.key, required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

/// رسم دائري بسيط للإحصائيات
class EdMiniArcDecor extends StatelessWidget {
  const EdMiniArcDecor({super.key, this.color = AppColors.accentTeal, this.size = 56});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: 0.08),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Icon(Icons.insights_outlined, color: color, size: size * 0.38),
    );
  }
}

/// ارتفاع بلاطة موحّد حسب نوع الجهاز
double edFormalTileExtent(EdLayoutData layout, {double phone = 168, double tablet = 200, double desktop = 190}) {
  if (layout.isDesktop) return desktop;
  if (layout.isTablet) return tablet;
  return phone;
}

/// ارتفاع بطاقة زبون/شجرة
double edFormalCardExtent(EdLayoutData layout, {double phone = 128, double tablet = 140}) {
  if (layout.isTablet) return tablet;
  return phone;
}

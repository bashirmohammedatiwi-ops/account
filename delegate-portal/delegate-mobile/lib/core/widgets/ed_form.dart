import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_colors.dart';
import '../utils/numeric_input.dart';
import 'ed_components.dart';

/// بطاقة نموذج أنيقة — لجميع الشاشات
class EdFormCard extends StatelessWidget {
  const EdFormCard({
    super.key,
    required this.title,
    required this.child,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.trailing,
    this.padding = const EdgeInsets.all(EdSpacing.xl),
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final Widget child;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusXl),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: 4,
            color: AppColors.navy,
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(EdSpacing.xl, EdSpacing.lg, EdSpacing.xl, EdSpacing.md),
            decoration: const BoxDecoration(
              color: AppColors.surfaceAlt,
              border: Border(bottom: BorderSide(color: AppColors.borderLight)),
            ),
            child: Row(
              children: [
                if (icon != null)
                  Container(
                    width: 48,
                    height: 48,
                    margin: const EdgeInsetsDirectional.only(end: EdSpacing.md),
                    decoration: BoxDecoration(
                      color: (iconColor ?? AppColors.accentTeal).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(AppColors.radiusSm),
                      border: Border.all(color: AppColors.borderLight),
                    ),
                    child: Icon(icon, color: iconColor ?? AppColors.accentTeal, size: 24),
                  ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle!,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                      ],
                    ],
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );
  }
}

/// عنوان قسم داخل النموذج
class EdFormSectionTitle extends StatelessWidget {
  const EdFormSectionTitle({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: EdSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
          if (subtitle != null)
            Text(subtitle!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.mutedLight)),
        ],
      ),
    );
  }
}

/// حقل اختيار (زبون، شجرة، إلخ)
class EdPickerField extends StatelessWidget {
  const EdPickerField({
    super.key,
    required this.label,
    required this.onTap,
    this.value,
    this.placeholder = 'اضغط للاختيار',
    this.icon = Icons.touch_app_outlined,
    this.accentColor = AppColors.accentTeal,
    this.subtitle,
  });

  final String label;
  final String? value;
  final String placeholder;
  final String? subtitle;
  final IconData icon;
  final Color accentColor;
  final VoidCallback onTap;

  bool get _hasValue => value != null && value!.isNotEmpty;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: EdSpacing.sm, right: 4),
          child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
        ),
        Material(
          color: _hasValue ? accentColor.withValues(alpha: 0.06) : AppColors.inputFill,
          borderRadius: BorderRadius.circular(AppColors.radius),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppColors.radius),
            child: Ink(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppColors.radius),
                border: Border.all(
                  color: _hasValue ? accentColor.withValues(alpha: 0.35) : AppColors.borderLight,
                  width: _hasValue ? 1.5 : 1,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: EdSpacing.lg, vertical: EdSpacing.lg),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: _hasValue ? accentColor.withValues(alpha: 0.12) : AppColors.surfaceAlt,
                        borderRadius: BorderRadius.circular(AppColors.radiusSm),
                      ),
                      child: Icon(icon, size: 20, color: _hasValue ? accentColor : AppColors.muted),
                    ),
                    const SizedBox(width: EdSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _hasValue ? value! : placeholder,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: _hasValue ? AppColors.navy : AppColors.mutedLight,
                            ),
                          ),
                          if (_hasValue && subtitle != null)
                            Text(subtitle!, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.muted)),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_left_rounded, color: _hasValue ? accentColor : AppColors.mutedLight, size: 22),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// حقل نصي مع تسمية علوية
class EdLabeledField extends StatelessWidget {
  const EdLabeledField({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.inputFormatters,
    this.maxLines = 1,
    this.prefixIcon,
    this.suffix,
    this.obscureText = false,
    this.onSubmitted,
    this.textDirection,
    this.enableSuggestions = true,
    this.autocorrect = true,
  });

  factory EdLabeledField.integer({
    Key? key,
    required String label,
    required TextEditingController controller,
    String? hint,
    int maxLines = 1,
    IconData? prefixIcon,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) {
    final cfg = EdNumericFieldConfig.integer;
    return EdLabeledField(
      key: key,
      label: label,
      controller: controller,
      hint: hint,
      keyboardType: cfg.keyboardType,
      inputFormatters: cfg.inputFormatters,
      maxLines: maxLines,
      prefixIcon: prefixIcon,
      suffix: suffix,
      onSubmitted: onSubmitted,
      textDirection: cfg.textDirection,
      enableSuggestions: cfg.enableSuggestions,
      autocorrect: cfg.autocorrect,
    );
  }

  factory EdLabeledField.decimal({
    Key? key,
    required String label,
    required TextEditingController controller,
    String? hint,
    int maxLines = 1,
    IconData? prefixIcon,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) {
    final cfg = EdNumericFieldConfig.decimal;
    return EdLabeledField(
      key: key,
      label: label,
      controller: controller,
      hint: hint,
      keyboardType: cfg.keyboardType,
      inputFormatters: cfg.inputFormatters,
      maxLines: maxLines,
      prefixIcon: prefixIcon,
      suffix: suffix,
      onSubmitted: onSubmitted,
      textDirection: cfg.textDirection,
      enableSuggestions: cfg.enableSuggestions,
      autocorrect: cfg.autocorrect,
    );
  }

  factory EdLabeledField.phone({
    Key? key,
    required String label,
    required TextEditingController controller,
    String? hint,
    int maxLines = 1,
    IconData? prefixIcon,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) {
    final cfg = EdNumericFieldConfig.phone;
    return EdLabeledField(
      key: key,
      label: label,
      controller: controller,
      hint: hint,
      keyboardType: cfg.keyboardType,
      inputFormatters: cfg.inputFormatters,
      maxLines: maxLines,
      prefixIcon: prefixIcon,
      suffix: suffix,
      onSubmitted: onSubmitted,
      textDirection: cfg.textDirection,
      enableSuggestions: cfg.enableSuggestions,
      autocorrect: cfg.autocorrect,
    );
  }

  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;
  final IconData? prefixIcon;
  final Widget? suffix;
  final bool obscureText;
  final ValueChanged<String>? onSubmitted;
  final TextDirection? textDirection;
  final bool enableSuggestions;
  final bool autocorrect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: EdSpacing.sm, right: 4),
          child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.textSecondary)),
        ),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          maxLines: maxLines,
          obscureText: obscureText,
          onSubmitted: onSubmitted,
          textDirection: textDirection,
          enableSuggestions: enableSuggestions,
          autocorrect: autocorrect,
          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15, color: AppColors.navy),
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: prefixIcon != null ? Icon(prefixIcon, size: 20) : null,
            suffix: suffix,
          ),
        ),
      ],
    );
  }
}

/// قائمة عناصر أنيقة
class EdListSection extends StatelessWidget {
  const EdListSection({
    super.key,
    required this.title,
    required this.count,
    required this.child,
  });

  final String title;
  final int count;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.lg, EdSpacing.page, EdSpacing.md),
          child: Row(
            children: [
              Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
              const SizedBox(width: EdSpacing.sm),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.accentSoft,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.accentTeal),
                ),
              ),
            ],
          ),
        ),
        child,
      ],
    );
  }
}

/// بطاقة عنصر في القائمة
class EdListTileCard extends StatelessWidget {
  const EdListTileCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    this.trailing,
    this.badge,
    this.badgeColor,
    this.onTap,
    this.onDelete,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final String? trailing;
  final String? badge;
  final Color? badgeColor;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: EdSpacing.page, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: AppColors.borderLight),
        boxShadow: AppColors.softShadow,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppColors.radiusLg),
          child: Padding(
            padding: const EdgeInsets.all(EdSpacing.lg),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: iconColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(AppColors.radiusSm),
                  ),
                  child: Icon(icon, color: iconColor, size: 24),
                ),
                const SizedBox(width: EdSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy, height: 1.25)),
                      const SizedBox(height: 3),
                      Text(subtitle, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      if (badge != null) ...[
                        const SizedBox(height: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: (badgeColor ?? AppColors.muted).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            badge!,
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: badgeColor ?? AppColors.muted),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (trailing != null)
                  Text(
                    trailing!,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy),
                  ),
                if (onDelete != null)
                  IconButton(
                    icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger, size: 22),
                    onPressed: onDelete,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// شارة حالة
class EdStatusBadge extends StatelessWidget {
  const EdStatusBadge({super.key, required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

/// زر إرسال متدرج
class EdSubmitButton extends StatelessWidget {
  const EdSubmitButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return EdPrimaryButton(
      label: label,
      onPressed: onPressed,
      loading: loading,
      icon: icon ?? Icons.send_rounded,
      gradient: false,
    );
  }
}

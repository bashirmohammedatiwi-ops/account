import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';

/// مكوّنات التصميم الموحّد (Edari Pro) — بطاقات، مؤشرات، صفوف قوائم، شارات.

/// يحصر المحتوى بعرض مريح للقراءة على الشاشات العريضة ويضيف هوامش الصفحة.
class EdContent extends StatelessWidget {
  const EdContent({super.key, required this.child, this.maxWidth = 1180, this.padding});

  final Widget child;
  final double maxWidth;
  final EdgeInsetsGeometry? padding;

  static double hPad(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= EdLayout.desktopMin) return 28;
    if (w >= EdLayout.tabletMin) return 24;
    return 16;
  }

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: padding ?? EdgeInsets.symmetric(horizontal: hPad(context)),
          child: child,
        ),
      ),
    );
  }
}

/// بطاقة قياسية.
class EdCard extends StatelessWidget {
  const EdCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
    this.borderColor,
    this.radius = AppColors.radiusLg,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final content = Padding(padding: padding, child: child);
    return DecoratedBox(
      decoration: AppColors.card(radius: radius, color: color, borderColor: borderColor),
      child: onTap == null
          ? content
          : Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(radius),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () {
                  HapticFeedback.selectionClick();
                  onTap!();
                },
                child: content,
              ),
            ),
    );
  }
}

/// عنوان قسم مع عدد وإجراء اختياري.
class EdSectionTitle extends StatelessWidget {
  const EdSectionTitle({super.key, required this.title, this.count, this.subtitle, this.action, this.onAction});

  final String title;
  final int? count;
  final String? subtitle;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text),
                      ),
                    ),
                    if (count != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
                        decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(99)),
                        child: Text('$count', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                      ),
                    ],
                  ],
                ),
                if (subtitle != null)
                  Text(subtitle!, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ),
          if (action != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(action!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                  const Icon(Icons.chevron_left_rounded, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// بطاقة مؤشر (KPI).
class EdKpiCard extends StatelessWidget {
  const EdKpiCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color = AppColors.primary,
    this.caption,
    this.onTap,
    this.loading = false,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String? caption;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return EdCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.textSecondary),
                ),
              ),
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(9)),
                child: Icon(icon, size: 18, color: color),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (loading)
            Container(
              height: 26,
              width: 80,
              margin: const EdgeInsets.symmetric(vertical: 2),
              decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(6)),
            )
          else
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                value,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.text,
                  height: 1.25,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ),
          if (caption != null)
            Text(
              caption!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
            ),
        ],
      ),
    );
  }
}

/// بلاطة إجراء/خدمة: أيقونة ملونة + عنوان + وصف + شارة.
class EdActionTile extends StatelessWidget {
  const EdActionTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.color = AppColors.primary,
    this.badge,
    this.prominent = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Color color;
  final String? badge;
  final VoidCallback onTap;
  /// إجراء رئيسي — خلفية ملونة.
  final bool prominent;

  @override
  Widget build(BuildContext context) {
    final fg = prominent ? Colors.white : AppColors.text;
    return LayoutBuilder(builder: (context, c) {
      // بلاطة ضيقة (عمودان على الهاتف): تخطيط عمودي.
      final vertical = c.maxWidth < 210;
      final iconBox = Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: prominent ? Colors.white.withValues(alpha: 0.16) : color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(11),
        ),
        child: Icon(icon, color: prominent ? Colors.white : color, size: 22),
      );
      final badgeWidget = badge == null
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: prominent ? Colors.white : AppColors.danger,
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text(
                badge!,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: prominent ? color : Colors.white),
              ),
            );
      final titleText = Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, color: fg));
      final subtitleText = subtitle == null
          ? null
          : Text(
              subtitle!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: prominent ? Colors.white70 : AppColors.muted),
            );

      return EdCard(
        onTap: onTap,
        color: prominent ? color : null,
        borderColor: prominent ? color : null,
        padding: const EdgeInsets.all(14),
        child: vertical
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      iconBox,
                      const Spacer(),
                      ?badgeWidget,
                    ],
                  ),
                  const SizedBox(height: 10),
                  titleText,
                  ?subtitleText,
                ],
              )
            : Row(
                children: [
                  iconBox,
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [titleText, ?subtitleText],
                    ),
                  ),
                  if (badgeWidget != null)
                    Padding(padding: const EdgeInsetsDirectional.only(start: 6), child: badgeWidget)
                  else
                    Icon(Icons.chevron_left_rounded, size: 20, color: prominent ? Colors.white70 : AppColors.mutedLight),
                ],
              ),
      );
    });
  }
}

/// شارة حالة ملوّنة صغيرة.
class EdPill extends StatelessWidget {
  const EdPill({super.key, required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

/// صف قائمة: أيقونة، عنوان وتفاصيل، قيمة (مبلغ) وشارة.
class EdListRow extends StatelessWidget {
  const EdListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.iconColor = AppColors.primary,
    this.trailingValue,
    this.trailingCaption,
    this.pill,
    this.onTap,
    this.dense = false,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color iconColor;
  final String? trailingValue;
  final String? trailingCaption;
  final Widget? pill;
  final VoidCallback? onTap;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 14, vertical: dense ? 9 : 12),
        child: Row(
          children: [
            if (icon != null) ...[
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: iconColor.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, size: 19, color: iconColor),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.text)),
                  if (subtitle != null)
                    Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (trailingValue != null)
                  Text(
                    trailingValue!,
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text, fontFeatures: [FontFeature.tabularFigures()]),
                  ),
                if (pill != null) ...[
                  const SizedBox(height: 3),
                  pill!,
                ] else if (trailingCaption != null)
                  Text(trailingCaption!, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// بطاقة تحتوي قائمة صفوف مفصولة بخطوط.
class EdListCard extends StatelessWidget {
  const EdListCard({super.key, required this.children, this.emptyText});

  final List<Widget> children;
  final String? emptyText;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: AppColors.card(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        child: Material(
          color: Colors.transparent,
          child: children.isEmpty
              ? Padding(
                  padding: const EdgeInsets.all(22),
                  child: Center(
                    child: Text(emptyText ?? 'لا توجد عناصر', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
                  ),
                )
              : Column(
                  children: [
                    for (var i = 0; i < children.length; i++) ...[
                      if (i > 0) const Divider(height: 1, indent: 14, endIndent: 14),
                      children[i],
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}

/// شبكة متجاوبة بعدد أعمدة حسب العرض المتاح (لا تعتمد على عرض الشاشة).
class EdResponsiveGrid extends StatelessWidget {
  const EdResponsiveGrid({
    super.key,
    required this.children,
    this.minItemWidth = 220,
    this.maxColumns = 4,
    this.spacing = 12,
  });

  final List<Widget> children;
  final double minItemWidth;
  final int maxColumns;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final cols = ((c.maxWidth + spacing) / (minItemWidth + spacing)).floor().clamp(1, maxColumns);
        final itemW = (c.maxWidth - spacing * (cols - 1)) / cols;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: [for (final w in children) SizedBox(width: itemW, child: w)],
        );
      },
    );
  }
}

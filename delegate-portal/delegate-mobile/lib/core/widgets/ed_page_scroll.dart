import 'package:flutter/material.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';
import 'phone_ui.dart';

/// مسافات أسفل الصفحة — تتكيّف مع الشريط السفلي والـ safe area.
class EdPageInsets {
  EdPageInsets._();

  static const double phoneDockHeight = 64;

  static double bottom(BuildContext context, {double extra = 12}) {
    final safe = MediaQuery.paddingOf(context).bottom;
    final layout = EdLayout.of(context);
    if (layout.isWide) return safe + extra;
    return safe + phoneDockHeight + extra;
  }

  static EdgeInsets pageBottom(BuildContext context, {double extra = 12}) {
    return EdgeInsets.only(bottom: bottom(context, extra: extra));
  }
}

/// رأس صفحة داخل التمرير — للاستخدام عند إخفاء الرأس الثابت.
class EdInlinePageHeader extends StatelessWidget {
  const EdInlinePageHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.kicker,
    this.showBack = false,
    this.onBack,
    this.actions,
  });

  final String title;
  final String? subtitle;
  final String? kicker;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Widget>? actions;

  @override
  Widget build(BuildContext context) {
    final back = shouldShowPhoneBack(context, showBack: showBack);
    final top = MediaQuery.paddingOf(context).top;

    return Padding(
      padding: EdgeInsets.fromLTRB(EdSpacing.page, top + 8, EdSpacing.lg, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: back && onBack != null
                ? IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.arrow_forward_rounded, color: AppColors.navy),
                    onPressed: onBack,
                  )
                : null,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (kicker != null && kicker!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(kicker!, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.muted)),
                  ),
                Text(title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.2)),
                if (subtitle != null && subtitle!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(subtitle!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
                  ),
              ],
            ),
          ),
          if (actions != null)
            Row(mainAxisSize: MainAxisSize.min, children: actions!),
        ],
      ),
    );
  }
}

/// فيزياء تمرير موحّدة — ناعمة وقابلة للسحب للتحديث.
const edPageScrollPhysics = AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics());

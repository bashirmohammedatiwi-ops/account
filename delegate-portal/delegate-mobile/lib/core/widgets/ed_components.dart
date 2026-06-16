import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// شريط علوي رسمي — مثل `.app-header` في الويب
class EdAppHeader extends StatelessWidget implements PreferredSizeWidget {
  const EdAppHeader({
    super.key,
    required this.title,
    this.kicker,
    this.subtitle,
    this.showBack = false,
    this.onBack,
    this.actions,
  });

  final String title;
  final String? kicker;
  final String? subtitle;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Widget>? actions;

  @override
  Size get preferredSize => Size.fromHeight(subtitle != null ? 72 : 60);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.navy,
      child: SafeArea(
        bottom: false,
        child: Container(
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: AppColors.goldLine, width: 3)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          child: Row(
            children: [
              if (showBack)
                IconButton(
                  tooltip: 'رجوع',
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_forward_rounded, color: Colors.white),
                )
              else
                const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (kicker != null)
                      Text(
                        kicker!,
                        style: const TextStyle(color: AppColors.goldLine, fontSize: 11, fontWeight: FontWeight.w700),
                      ),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                  ],
                ),
              ),
              if (actions != null) ...actions!,
            ],
          ),
        ),
      ),
    );
  }
}

class EdHeaderIconButton extends StatelessWidget {
  const EdHeaderIconButton({super.key, required this.icon, required this.tooltip, required this.onPressed, this.danger = false});

  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Icon(icon, color: danger ? const Color(0xFFFCA5A5) : Colors.white),
    );
  }
}

/// بطاقة ترحيب — مثل `.ed-panel-home`
class EdHeroCard extends StatelessWidget {
  const EdHeroCard({super.key, required this.agentName, this.avatarText});

  final String agentName;
  final String? avatarText;

  @override
  Widget build(BuildContext context) {
    final initial = (avatarText ?? agentName).characters.first;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: AppColors.heroGradient,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.18), blurRadius: 24, offset: const Offset(0, 8))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.goldLine, width: 2),
                  color: Colors.white.withValues(alpha: 0.12),
                ),
                child: Text(initial, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('مرحباً', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w600)),
                    Text(
                      agentName,
                      style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'اختر التطبيق للبدء',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// شريط أدوات تحت الرأس — خلفية بيضاء وحد سفلي
class EdPageToolbar extends StatelessWidget {
  const EdPageToolbar({super.key, required this.child, this.padding});

  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ?? const EdgeInsets.fromLTRB(16, 10, 16, 12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: child,
    );
  }
}

/// بطاقة تطبيق رئيسية — من الرئيسية فقط
class EdModuleCard extends StatelessWidget {
  const EdModuleCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;
  final String? badge;

  bool get _showBadge => badge != null && badge != '—' && badge != '0';

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      elevation: 0,
      shadowColor: AppColors.navy.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(AppColors.radiusLg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            border: Border.all(color: AppColors.border),
            boxShadow: [BoxShadow(color: AppColors.navy.withValues(alpha: 0.05), blurRadius: 16, offset: const Offset(0, 6))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppColors.radiusLg),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(width: 5, color: color),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 14, 16),
                      child: Row(
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: color.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(color: color.withValues(alpha: 0.2)),
                            ),
                            child: Icon(icon, color: color, size: 26),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                                const SizedBox(height: 4),
                                Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ),
                          if (_showBadge)
                            Container(
                              margin: const EdgeInsets.only(left: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
                              child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800)),
                            ),
                          const SizedBox(width: 6),
                          Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: color.withValues(alpha: 0.85)),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// أيقونة تطبيق دائرية — للاستخدام المضغوط
class EdAppTile extends StatelessWidget {
  const EdAppTile({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.badge,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withValues(alpha: 0.12),
                    border: Border.all(color: color.withValues(alpha: 0.25)),
                  ),
                  child: Icon(icon, color: color, size: 28),
                ),
                if (badge != null && badge != '—' && badge != '0')
                  Positioned(
                    top: -4,
                    left: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
                      child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.text),
            ),
          ],
        ),
      ),
    );
  }
}

class EdStatsBar extends StatelessWidget {
  const EdStatsBar({super.key, required this.items});

  final List<({String label, String value, Color? color})> items;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) Container(width: 1, height: 36, color: AppColors.border),
            Expanded(
              child: Column(
                children: [
                  Text(items[i].label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    items[i].value,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: items[i].color ?? AppColors.text),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class EdSectionHeader extends StatelessWidget {
  const EdSectionHeader({super.key, required this.title, this.subtitle, this.trailing});

  final String title;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                if (subtitle != null)
                  Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// بطاقة شجرة — `.ed-card-tree`
class EdTreeCard extends StatelessWidget {
  const EdTreeCard({
    super.key,
    required this.index,
    required this.accountNum,
    required this.name,
    required this.meta,
    required this.onTap,
    this.selected = false,
  });

  final int index;
  final String accountNum;
  final String name;
  final String meta;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.accentSoft : AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border(
              top: BorderSide(color: selected ? AppColors.accent : AppColors.border),
              left: BorderSide(color: selected ? AppColors.accent : AppColors.border),
              bottom: BorderSide(color: selected ? AppColors.accent : AppColors.border),
              right: const BorderSide(color: AppColors.accent, width: 4),
            ),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.accentSoft,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('#$index', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accent)),
                  ),
                  const SizedBox(width: 8),
                  Text(accountNum, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                ],
              ),
              const SizedBox(height: 10),
              Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(meta, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.w600)),
              const SizedBox(height: 10),
              const Row(
                children: [
                  Text('عرض الزبائن', style: TextStyle(color: AppColors.accentTeal, fontWeight: FontWeight.w800, fontSize: 13)),
                  SizedBox(width: 4),
                  Icon(Icons.arrow_back_ios_new_rounded, size: 12, color: AppColors.accentTeal),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// بطاقة زبون — `.bc-card`
class EdBranchCard extends StatelessWidget {
  const EdBranchCard({
    super.key,
    required this.name,
    required this.accountNum,
    required this.debtLabel,
    required this.debtAmount,
    required this.variant,
    required this.onTap,
    this.selected = false,
  });

  final String name;
  final String accountNum;
  final String debtLabel;
  final String debtAmount;
  final BranchCardVariant variant;
  final VoidCallback onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final accent = AppTheme.branchAccent(variant);
    final initial = name.isNotEmpty ? name.characters.first : '؟';

    return Material(
      color: selected ? accent.withValues(alpha: 0.06) : AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      elevation: selected ? 1 : 0,
      shadowColor: AppColors.navy.withValues(alpha: 0.08),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border(
              top: BorderSide(color: selected ? accent : AppColors.border),
              left: BorderSide(color: selected ? accent : AppColors.border),
              bottom: BorderSide(color: selected ? accent : AppColors.border),
              right: BorderSide(color: accent, width: 4),
            ),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: accent.withValues(alpha: 0.12),
                    child: Text(initial, style: TextStyle(color: accent, fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: accent.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(branchStatusLabel(variant), style: TextStyle(color: accent, fontSize: 11, fontWeight: FontWeight.w800)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(AppColors.radiusSm),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(debtLabel, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                    Text(
                      debtAmount,
                      textDirection: TextDirection.ltr,
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: accent),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(accountNum, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                  const Row(
                    children: [
                      Text('كشف الحساب', style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.w800, fontSize: 12)),
                      SizedBox(width: 4),
                      Icon(Icons.arrow_back_ios_new_rounded, size: 11, color: AppColors.navy),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EdFilterChips extends StatelessWidget {
  const EdFilterChips({super.key, required this.selected, required this.onChanged});

  final String selected;
  final ValueChanged<String> onChanged;

  static const options = [
    ('all', 'الكل'),
    ('debit', 'مدين'),
    ('credit', 'دائن'),
  ];

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (value, label) in options)
          FilterChip(
            label: Text(label),
            selected: selected == value,
            onSelected: (_) => onChanged(value),
            selectedColor: AppColors.navy,
            checkmarkColor: Colors.white,
            labelStyle: TextStyle(
              fontWeight: FontWeight.w700,
              color: selected == value ? Colors.white : AppColors.textSecondary,
            ),
            side: BorderSide(color: selected == value ? AppColors.navy : AppColors.border),
          ),
      ],
    );
  }
}

class EdSearchField extends StatelessWidget {
  const EdSearchField({super.key, required this.hint, required this.onChanged, this.suffix});

  final String hint;
  final ValueChanged<String> onChanged;
  final Widget? suffix;

  @override
  Widget build(BuildContext context) {
    return TextField(
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search_rounded, color: AppColors.muted),
        suffixIcon: suffix,
        isDense: true,
      ),
      onChanged: onChanged,
    );
  }
}

/// لوحة مستند — `.doc-panel`
class EdDocPanel extends StatelessWidget {
  const EdDocPanel({super.key, required this.title, required this.rows});

  final String title;
  final List<({String label, String value})> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.borderStrong),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
          const Divider(height: 20, color: AppColors.border),
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(row.label, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w700)),
                  Text(row.value, textDirection: TextDirection.ltr, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class EdDebtBanner extends StatelessWidget {
  const EdDebtBanner({super.key, required this.amount});

  final String amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.dangerSoft,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: AppColors.danger),
          const SizedBox(width: 10),
          const Expanded(child: Text('الديون', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.danger))),
          Text(amount, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.danger)),
        ],
      ),
    );
  }
}

class EdSideNavItem extends StatelessWidget {
  const EdSideNavItem({
    super.key,
    required this.icon,
    required this.title,
    required this.accent,
    required this.onTap,
    this.subtitle,
    this.trailing,
    this.selected = false,
  });

  final IconData icon;
  final String title;
  final Color accent;
  final VoidCallback onTap;
  final String? subtitle;
  final String? trailing;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? accent.withValues(alpha: 0.08) : Colors.transparent,
      borderRadius: BorderRadius.circular(AppColors.radiusSm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radiusSm),
            border: Border.all(color: selected ? accent : Colors.transparent),
          ),
          child: Row(
            children: [
              Icon(icon, color: selected ? accent : AppColors.muted, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: selected ? AppColors.text : AppColors.textSecondary),
                    ),
                    if (subtitle != null && subtitle!.isNotEmpty)
                      Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              if (trailing != null)
                Text(trailing!, textDirection: TextDirection.ltr, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: accent)),
            ],
          ),
        ),
      ),
    );
  }
}

class EdPrimaryButton extends StatelessWidget {
  const EdPrimaryButton({super.key, required this.label, required this.onPressed, this.loading = false, this.fullWidth = true});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final btn = FilledButton(
      onPressed: loading ? null : onPressed,
      child: loading
          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : Text(label),
    );
    return fullWidth ? SizedBox(width: double.infinity, child: btn) : btn;
  }
}

/// بطاقة تنقل — فروع/أقسام/عناصر قائمة
class EdNavCard extends StatelessWidget {
  const EdNavCard({
    super.key,
    required this.icon,
    required this.title,
    required this.accent,
    required this.onTap,
    this.subtitle,
    this.trailing,
  });

  final IconData icon;
  final String title;
  final Color accent;
  final VoidCallback onTap;
  final String? subtitle;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border(
              top: const BorderSide(color: AppColors.border),
              left: const BorderSide(color: AppColors.border),
              bottom: const BorderSide(color: AppColors.border),
              right: BorderSide(color: accent, width: 4),
            ),
          ),
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(AppColors.radiusSm),
                ),
                child: Icon(icon, color: accent, size: 26),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    if (subtitle != null && subtitle!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(subtitle!, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                    ],
                  ],
                ),
              ),
              if (trailing != null)
                Text(trailing!, style: TextStyle(color: accent, fontWeight: FontWeight.w800, fontSize: 12))
              else
                Icon(Icons.arrow_back_ios_new_rounded, size: 14, color: accent),
            ],
          ),
        ),
      ),
    );
  }
}

class EdResumeBanner extends StatelessWidget {
  const EdResumeBanner({super.key, required this.message, required this.actionLabel, required this.onAction});

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.warningSoft,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.save_outlined, color: AppColors.warning, size: 22),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
          TextButton(onPressed: onAction, child: Text(actionLabel, style: const TextStyle(fontWeight: FontWeight.w800))),
        ],
      ),
    );
  }
}

class EdBottomActionBar extends StatelessWidget {
  const EdBottomActionBar({super.key, required this.label, required this.onPressed, this.icon = Icons.receipt_long_rounded});

  final String label;
  final VoidCallback onPressed;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
        boxShadow: [BoxShadow(color: Color(0x14000000), blurRadius: 12, offset: Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: FilledButton.icon(onPressed: onPressed, icon: Icon(icon), label: Text(label)),
      ),
    );
  }
}

class EdOrderCard extends StatelessWidget {
  const EdOrderCard({
    super.key,
    required this.id,
    required this.customer,
    required this.date,
    required this.amount,
    required this.statusLabel,
    required this.statusColor,
    required this.onTap,
  });

  final int id;
  final String customer;
  final String date;
  final String amount;
  final String statusLabel;
  final Color statusColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppColors.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppColors.radius),
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppColors.radius),
            border: Border(
              top: const BorderSide(color: AppColors.border),
              left: const BorderSide(color: AppColors.border),
              bottom: const BorderSide(color: AppColors.border),
              right: BorderSide(color: statusColor, width: 4),
            ),
          ),
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('طلب #$id', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                    const SizedBox(height: 4),
                    Text('$customer · $date', style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
                      child: Text(statusLabel, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(amount, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 6),
                  const Icon(Icons.arrow_back_ios_new_rounded, size: 12, color: AppColors.muted),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class EdPanelCard extends StatelessWidget {
  const EdPanelCard({super.key, required this.title, required this.child, this.subtitle});

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
          ],
          const Divider(height: 20, color: AppColors.border),
          child,
        ],
      ),
    );
  }
}

class EdLineRow extends StatelessWidget {
  const EdLineRow({super.key, required this.title, required this.subtitle, required this.amount});

  final String title;
  final String subtitle;
  final String amount;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.muted, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          Text(amount, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        ],
      ),
    );
  }
}

class EdQtyStepper extends StatelessWidget {
  const EdQtyStepper({super.key, required this.value, required this.onDec, required this.onInc, this.compact = false});

  final String value;
  final VoidCallback onDec;
  final VoidCallback onInc;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 30.0 : 36.0;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _btn(Icons.remove_rounded, onDec, size),
        Expanded(child: Text(value, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, fontSize: compact ? 13 : 15))),
        _btn(Icons.add_rounded, onInc, size),
      ],
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap, double size) {
    return Material(
      color: AppColors.accentSoft,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: SizedBox(width: size, height: size, child: Icon(icon, size: size * 0.5, color: AppColors.navy)),
      ),
    );
  }
}

class EdLoginAside extends StatelessWidget {
  const EdLoginAside({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.navy,
      padding: const EdgeInsets.all(40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(width: 48, height: 4, color: AppColors.goldLine),
          const SizedBox(height: 20),
          Image.asset('assets/logo.png', width: 64, height: 64),
          const SizedBox(height: 20),
          const Text('Edari', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          const Text('بوابة المندوب', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          Text('كشوف حساب · منتجات · طلبات · تقارير', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontWeight: FontWeight.w600)),
          const SizedBox(height: 28),
          _feature(Icons.account_tree_rounded, 'كشوف حساب تفصيلية'),
          _feature(Icons.storefront_rounded, 'طلبات وفواتير'),
          _feature(Icons.bar_chart_rounded, 'تقارير مبيعات'),
        ],
      ),
    );
  }

  Widget _feature(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, color: AppColors.goldLine, size: 20),
          const SizedBox(width: 10),
          Text(text, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

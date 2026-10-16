import 'package:flutter/material.dart';

import '../../models/models.dart';
import '../theme/app_colors.dart';

/// لون تصنيف المحافظات — مختلف عن ألوان حالات الديون حتى لا يختلط بها.
const kGovernorateColor = AppColors.moduleAccounts;

/// عدد الزبائن في كل محافظة (المفتاح [kUnclassifiedGovernorate] لغير المصنّفين).
Map<String, int> countByGovernorate(Iterable<BranchAccount> branches) {
  final counts = <String, int>{};
  for (final b in branches) {
    if (!b.hasPostedAccount) continue;
    final key = b.governorateCode ?? kUnclassifiedGovernorate;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/// شارة صغيرة باسم المحافظة على صف الزبون. للرئيسي تكون قابلة للضغط لتغييرها.
class EdGovernorateBadge extends StatelessWidget {
  const EdGovernorateBadge({super.key, required this.branch, this.onTap});

  final BranchAccount branch;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final name = branch.governorateName;
    if (name == null && onTap == null) return const SizedBox.shrink();
    final empty = name == null;
    final color = empty ? AppColors.mutedLight : kGovernorateColor;
    final pill = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: empty ? Colors.transparent : color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: empty ? 0.5 : 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(empty ? Icons.add_location_alt_outlined : Icons.place_rounded, size: 12.5, color: color),
          const SizedBox(width: 3),
          Text(
            name ?? 'محافظة',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color),
          ),
        ],
      ),
    );
    if (onTap == null) return pill;
    return Semantics(
      button: true,
      label: empty ? 'تحديد محافظة الزبون' : 'تغيير محافظة الزبون: $name',
      child: InkWell(onTap: onTap, borderRadius: BorderRadius.circular(99), child: pill),
    );
  }
}

/// شريط فلتر المحافظات: «الكل» ثم المحافظات الموجودة في الشجرة مرتبة بالعدد، ثم «غير مصنّف».
class EdGovernorateFilterBar extends StatelessWidget {
  const EdGovernorateFilterBar({
    super.key,
    required this.counts,
    required this.total,
    required this.selected,
    required this.onSelected,
    this.onClassify,
  });

  final Map<String, int> counts;
  final int total;
  /// null = الكل.
  final String? selected;
  final ValueChanged<String?> onSelected;
  /// زر «تصنيف» — للمندوب الرئيسي فقط.
  final VoidCallback? onClassify;

  @override
  Widget build(BuildContext context) {
    final govs = counts.entries.where((e) => e.key != kUnclassifiedGovernorate).toList()
      ..sort((a, b) {
        final c = b.value.compareTo(a.value);
        return c != 0 ? c : iraqGovernorateName(a.key).compareTo(iraqGovernorateName(b.key));
      });
    final unclassified = counts[kUnclassifiedGovernorate] ?? 0;

    // لم يُصنّف أي زبون بعد.
    if (govs.isEmpty) {
      if (onClassify == null) return const SizedBox.shrink();
      return _ClassifyHint(onClassify: onClassify!, total: total);
    }

    return Row(
      children: [
        Expanded(
          child: SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: EdgeInsets.zero,
              children: [
                _GovChip(
                  label: 'كل المحافظات',
                  count: total,
                  icon: Icons.public_rounded,
                  selected: selected == null,
                  onTap: () => onSelected(null),
                ),
                for (final e in govs)
                  _GovChip(
                    label: iraqGovernorateName(e.key),
                    count: e.value,
                    icon: Icons.place_rounded,
                    selected: selected == e.key,
                    onTap: () => onSelected(selected == e.key ? null : e.key),
                  ),
                if (unclassified > 0)
                  _GovChip(
                    label: 'غير مصنّف',
                    count: unclassified,
                    icon: Icons.help_outline_rounded,
                    selected: selected == kUnclassifiedGovernorate,
                    muted: true,
                    onTap: () => onSelected(selected == kUnclassifiedGovernorate ? null : kUnclassifiedGovernorate),
                  ),
              ],
            ),
          ),
        ),
        if (onClassify != null) ...[
          const SizedBox(width: 8),
          FilledButton.tonalIcon(
            onPressed: onClassify,
            icon: const Icon(Icons.checklist_rtl_rounded, size: 18),
            label: const Text('تصنيف'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 40),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              foregroundColor: kGovernorateColor,
              backgroundColor: kGovernorateColor.withValues(alpha: 0.1),
              textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
        ],
      ],
    );
  }
}

class _GovChip extends StatelessWidget {
  const _GovChip({
    required this.label,
    required this.count,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.muted = false,
  });

  final String label;
  final int count;
  final IconData icon;
  final bool selected;
  final bool muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = muted ? AppColors.muted : kGovernorateColor;
    return Padding(
      padding: const EdgeInsetsDirectional.only(end: 8),
      child: Material(
        color: selected ? color : AppColors.surface,
        borderRadius: BorderRadius.circular(99),
        child: InkWell(
          borderRadius: BorderRadius.circular(99),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(99),
              border: Border.all(color: selected ? color : AppColors.borderLight),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 15, color: selected ? Colors.white : color),
                const SizedBox(width: 5),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : AppColors.text,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: selected ? Colors.white.withValues(alpha: 0.22) : color.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: selected ? Colors.white : color,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ClassifyHint extends StatelessWidget {
  const _ClassifyHint({required this.onClassify, required this.total});

  final VoidCallback onClassify;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
      decoration: BoxDecoration(
        color: kGovernorateColor.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(AppColors.radius),
        border: Border.all(color: kGovernorateColor.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          const Icon(Icons.map_outlined, color: kGovernorateColor),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'قسّم زبائنك حسب المحافظات',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800, color: AppColors.text),
                ),
                Text(
                  'يظهر التصنيف لك وللمندوبين الثانويين التابعين لك كفلتر سريع',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: total == 0 ? null : onClassify,
            style: FilledButton.styleFrom(
              backgroundColor: kGovernorateColor,
              minimumSize: const Size(0, 40),
              textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800, fontSize: 13),
            ),
            child: const Text('ابدأ التصنيف'),
          ),
        ],
      ),
    );
  }
}

/// نتيجة اختيار المحافظة: [code] = null تعني إزالة التصنيف.
class GovernoratePick {
  const GovernoratePick(this.code);
  final String? code;
}

/// يختار محافظة من محافظات العراق. حوار في الآيباد، ولوحة سفلية في الهاتف.
/// يعيد null عند الإلغاء.
Future<GovernoratePick?> showGovernoratePicker(
  BuildContext context, {
  required String title,
  String? subtitle,
  String? current,
  bool allowClear = false,
  Map<String, int> counts = const {},
}) {
  final wide = MediaQuery.sizeOf(context).width >= 600;
  final body = _GovernoratePickerBody(
    title: title,
    subtitle: subtitle,
    current: current,
    allowClear: allowClear,
    counts: counts,
  );
  if (wide) {
    return showDialog<GovernoratePick>(
      context: context,
      useRootNavigator: true,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(24),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppColors.radius2xl)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560, maxHeight: 640), child: body),
      ),
    );
  }
  return showModalBottomSheet<GovernoratePick>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(AppColors.radius2xl))),
    builder: (ctx) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.86),
      child: Padding(padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom), child: body),
    ),
  );
}

class _GovernoratePickerBody extends StatefulWidget {
  const _GovernoratePickerBody({
    required this.title,
    required this.subtitle,
    required this.current,
    required this.allowClear,
    required this.counts,
  });

  final String title;
  final String? subtitle;
  final String? current;
  final bool allowClear;
  final Map<String, int> counts;

  @override
  State<_GovernoratePickerBody> createState() => _GovernoratePickerBodyState();
}

class _GovernoratePickerBodyState extends State<_GovernoratePickerBody> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    // المستخدمة في هذه الشجرة أولاً — أسرع للمندوب.
    final list = [...kIraqGovernorates]
      ..sort((a, b) {
        final c = (widget.counts[b.code] ?? 0).compareTo(widget.counts[a.code] ?? 0);
        return c != 0 ? c : kIraqGovernorates.indexOf(a).compareTo(kIraqGovernorates.indexOf(b));
      });
    final q = _q.trim();
    final shown = q.isEmpty ? list : list.where((g) => g.name.contains(q)).toList();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 12, 4),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: kGovernorateColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.map_outlined, color: kGovernorateColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.text)),
                    if (widget.subtitle != null)
                      Text(
                        widget.subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.muted),
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'إغلاق',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'ابحث عن محافظة...',
              prefixIcon: Icon(Icons.search_rounded, color: AppColors.muted),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _q = v),
          ),
        ),
        Flexible(
          child: shown.isEmpty
              ? const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('لا توجد محافظة بهذا الاسم', textAlign: TextAlign.center, style: TextStyle(color: AppColors.muted)),
                )
              : GridView.builder(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 170,
                    mainAxisExtent: 54,
                    crossAxisSpacing: 8,
                    mainAxisSpacing: 8,
                  ),
                  itemCount: shown.length,
                  itemBuilder: (context, i) {
                    final g = shown[i];
                    final isCurrent = g.code == widget.current;
                    final count = widget.counts[g.code] ?? 0;
                    return Material(
                      color: isCurrent ? kGovernorateColor : AppColors.surfaceMuted,
                      borderRadius: BorderRadius.circular(AppColors.radius),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(AppColors.radius),
                        onTap: () => Navigator.of(context).pop(GovernoratePick(g.code)),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(AppColors.radius),
                            border: Border.all(color: isCurrent ? kGovernorateColor : AppColors.borderLight),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                isCurrent ? Icons.check_circle_rounded : Icons.place_outlined,
                                size: 18,
                                color: isCurrent ? Colors.white : kGovernorateColor,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  g.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w800,
                                    color: isCurrent ? Colors.white : AppColors.text,
                                  ),
                                ),
                              ),
                              if (count > 0)
                                Text(
                                  '$count',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: isCurrent ? Colors.white70 : AppColors.mutedLight,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
        if (widget.allowClear)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
              child: OutlinedButton.icon(
                onPressed: () => Navigator.of(context).pop(const GovernoratePick(null)),
                icon: const Icon(Icons.location_off_outlined, size: 18),
                label: const Text('إزالة التصنيف'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.danger,
                  side: BorderSide(color: AppColors.danger.withValues(alpha: 0.35)),
                  minimumSize: const Size.fromHeight(44),
                  textStyle: const TextStyle(fontFamily: 'Cairo', fontWeight: FontWeight.w800),
                ),
              ),
            ),
          )
        else
          const SizedBox(height: 8),
      ],
    );
  }
}

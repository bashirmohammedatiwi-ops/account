import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/api/delegate_api.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/utils/delivery_viewer.dart';
import '../../core/utils/formatters.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_page_scroll.dart';
import '../../models/models.dart';
import '../receipts/receipts_hub.dart';
import '../receipts/receipts_ui.dart';
import 'team_hub.dart';
import 'team_models.dart';
import 'team_ui.dart';

/// شاشة متابعة المندوبين الثانويين للمندوب الرئيسي.
class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  final _searchCtrl = TextEditingController();
  int? _handoverDeliveryId;

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _refresh() =>
      ref.read(deliveriesListNotifierProvider.notifier).refresh();

  List<SecondaryAgentSummary> _filter(List<SecondaryAgentSummary> items) {
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((s) => s.agentName.toLowerCase().contains(q)).toList();
  }

  Future<void> _markHandover(DeliveryReceipt item) async {
    final noteCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد استلام المبلغ'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('تأكيد استلام ${fmtMoney(item.amount)} د.ع من ${item.agentName ?? 'المندوب الثانوي'}؟'),
            const SizedBox(height: 12),
            TextField(
              controller: noteCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'ملاحظة الاستلام',
                hintText: 'اختياري',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('تم الاستلام')),
        ],
      ),
    );
    final note = noteCtrl.text.trim();
    noteCtrl.dispose();
    if (ok != true || !mounted) return;
    setState(() => _handoverDeliveryId = item.id);
    try {
      final updated =
          await ref.read(apiClientProvider).markDeliveryHandoverReceived(item.id, note: note);
      ref.read(deliveriesListNotifierProvider.notifier).upsert(updated);
      _snack('تم تأكيد استلام المبلغ', success: true);
    } catch (e) {
      _snack(e.displayMessage);
    } finally {
      if (mounted) setState(() => _handoverDeliveryId = null);
    }
  }

  void _createReceiptFor(DeliveryReceipt item) {
    ref.read(pendingReceiptLinkProvider.notifier).state = item;
    if (Navigator.canPop(context)) Navigator.pop(context);
    context.go('/receipts');
  }

  void _openSecondary(SecondaryAgentSummary summary) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _SecondaryDetailSheet(
        agentId: summary.agentId,
        periodLabel: ref.read(teamDateRangeProvider).isAll ? null : ref.read(teamDateRangeProvider).label,
        onHandover: _markHandover,
        onCreateReceipt: _createReceiptFor,
        handoverDeliveryId: () => _handoverDeliveryId,
      ),
    );
  }

  void _snack(String msg, {bool success = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: success ? AppColors.success : AppColors.danger,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final overviewAsync = ref.watch(teamOverviewProvider);
    final dateRange = ref.watch(teamDateRangeProvider);
    final layout = EdLayout.of(context);
    final large = layout.isTablet;

    return AppPage(
      title: 'متابعة الفريق',
      kicker: 'المندوب الرئيسي',
      subtitle: 'تابع مندوبيك الثانويين واستلم تحصيلاتهم',
      showBack: true,
      onBack: () => context.go('/home'),
      unifiedScroll: true,
      child: ColoredBox(
        color: Colors.transparent,
        child: overviewAsync.when(
          loading: () => const Center(child: LoadingView()),
          error: (e, _) => ErrorView(
            message: e is ApiException ? e.message : '$e',
            onRetry: _refresh,
          ),
          data: (overview) => _body(context, overview, large, dateRange),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, TeamOverview overview, bool large, ReceiptsDateRange dateRange) {
    final visible = _filter(overview.secondaries);
    final bottom = EdPageInsets.bottom(context);
    final periodLabel = dateRange.isAll ? null : dateRange.label;

    return RefreshIndicator(
      onRefresh: _refresh,
      child: CustomScrollView(
        primary: false,
        physics: edPageScrollPhysics,
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, EdSpacing.md, EdSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: TeamDateRangeFilter(
                dateRange: dateRange,
                onDateRangeChanged: (range) => ref.read(teamDateRangeProvider.notifier).state = range,
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 10)),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, 0),
            sliver: SliverToBoxAdapter(
              child: TeamOverviewHeader(overview: overview, large: large, periodLabel: periodLabel),
            ),
          ),
          if (overview.secondaries.isNotEmpty)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(EdSpacing.page, 12, EdSpacing.page, 0),
              sliver: SliverToBoxAdapter(child: _searchField()),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          if (overview.secondaries.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: EmptyState(
                  message: !dateRange.isAll
                      ? 'لا توجد وصولات في الفترة «${dateRange.label}»'
                      : overview.totalSecondaries > 0
                          ? 'لا توجد وصولات من مندوبيك بعد — ستظهر هنا فور إصدارهم وصل قبض'
                          : 'لا يوجد مندوبون ثانويون تابعون لك حالياً',
                  icon: !dateRange.isAll ? Icons.event_busy_rounded : Icons.groups_outlined,
                ),
              ),
            )
          else if (visible.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: EmptyState(
                  message: 'لا مندوب باسم مطابق',
                  icon: Icons.search_off_rounded,
                ),
              ),
            )
          else
            SliverPadding(
              padding: EdgeInsets.fromLTRB(EdSpacing.page, 0, EdSpacing.page, bottom),
              sliver: large
                  ? SliverGrid(
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 460,
                        mainAxisExtent: 214,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 0,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, i) =>
                            SecondaryAgentCard(summary: visible[i], onTap: () => _openSecondary(visible[i])),
                        childCount: visible.length,
                      ),
                    )
                  : SliverList(
                      delegate: SliverChildBuilderDelegate(
                        (context, i) =>
                            SecondaryAgentCard(summary: visible[i], onTap: () => _openSecondary(visible[i])),
                        childCount: visible.length,
                      ),
                    ),
            ),
        ],
      ),
    );
  }

  Widget _searchField() {
    return TextField(
      controller: _searchCtrl,
      onChanged: (_) => setState(() {}),
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: 'ابحث عن مندوب...',
        prefixIcon: const Icon(Icons.search_rounded, size: 20),
        isDense: true,
        filled: true,
        fillColor: AppColors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.borderLight),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: AppColors.borderLight),
        ),
      ),
    );
  }
}

/// نافذة سفلية بتفاصيل مندوب ثانوي — تُحدَّث حيّاً من مزود الوصولات.
class _SecondaryDetailSheet extends ConsumerStatefulWidget {
  const _SecondaryDetailSheet({
    required this.agentId,
    this.periodLabel,
    required this.onHandover,
    required this.onCreateReceipt,
    required this.handoverDeliveryId,
  });

  final int agentId;
  final String? periodLabel;
  final void Function(DeliveryReceipt) onHandover;
  final void Function(DeliveryReceipt) onCreateReceipt;
  final int? Function() handoverDeliveryId;

  @override
  ConsumerState<_SecondaryDetailSheet> createState() => _SecondaryDetailSheetState();
}

class _SecondaryDetailSheetState extends ConsumerState<_SecondaryDetailSheet> {
  var _statusFilter = DeliveryHandoverFilter.all;

  List<DeliveryReceipt> _enrichedRows(List<DeliveryReceipt> rows, Agent? viewer) {
    if (viewer == null) return rows;
    return rows.map((d) => enrichDeliveryForViewer(d, viewer)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final overview = ref.watch(teamOverviewProvider).valueOrNull;
    final summary = overview?.secondaries.firstWhere(
      (s) => s.agentId == widget.agentId,
      orElse: () => const SecondaryAgentSummary(
        agentId: -1,
        agentName: '',
        deliveries: [],
        deliveryCount: 0,
        totalAmount: 0,
        handoverPendingCount: 0,
        handoverPendingAmount: 0,
        handoverReceivedCount: 0,
        handoverReceivedAmount: 0,
        awaitingReceiptCount: 0,
        linkedCount: 0,
        lastActivity: null,
      ),
    );

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        if (summary == null || summary.agentId == -1) {
          return const Center(child: Text('لا توجد بيانات'));
        }
        final viewer = ref.watch(authProvider).agent;
        final enriched = _enrichedRows(summary.deliveries, viewer);
        final visible = enriched.where(_statusFilter.matches).toList();

        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: CustomScrollView(
            controller: scrollController,
            slivers: [
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 10),
                    Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.borderStrong,
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                      child: Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: AppColors.accentTeal.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: const Icon(Icons.person_rounded, color: AppColors.accentTeal),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(summary.agentName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                                Text(
                                  widget.periodLabel != null
                                      ? 'مندوب ثانوي · ${fmtNumAlways(summary.deliveryCount)} وصل · ${widget.periodLabel}'
                                      : 'مندوب ثانوي · ${fmtNumAlways(summary.deliveryCount)} وصل',
                                    style: const TextStyle(
                                        fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.muted)),
                              ],
                            ),
                          ),
                          IconButton(
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.close_rounded),
                            color: AppColors.muted,
                          ),
                        ],
                      ),
                    ),
                    if (summary.handoverPendingCount > 0)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          decoration: BoxDecoration(
                            color: AppColors.warning.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.hourglass_top_rounded, size: 16, color: AppColors.warning),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'بانتظار استلام ${fmtMoney(summary.handoverPendingAmount)} د.ع (${fmtNumAlways(summary.handoverPendingCount)} وصل)',
                                  style: const TextStyle(
                                      fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.warning),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const Divider(height: 1, color: AppColors.borderLight),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
                      child: DeliveryFilterBar(
                        statusFilter: _statusFilter,
                        onStatusChanged: (f) => setState(() => _statusFilter = f),
                        agents: const [],
                        selectedAgentId: null,
                        onAgentChanged: (_) {},
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
              if (visible.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: EmptyState(
                      message: _statusFilter == DeliveryHandoverFilter.all
                          ? 'لا توجد وصولات لهذا المندوب'
                          : 'لا وصولات مطابقة لفلتر «${_statusFilter.label}»',
                      icon: Icons.filter_list_off_rounded,
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
                  sliver: SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final d = visible[i];
                        return DeliveryReceiptCard(
                          item: d,
                          showPrint: false,
                          isMarkingHandover: widget.handoverDeliveryId() == d.id,
                          onReprint: null,
                          onCreateReceipt: d.canCreateReceipt ? () => widget.onCreateReceipt(d) : null,
                          onMarkHandover: d.canMarkHandover ? () => widget.onHandover(d) : null,
                        );
                      },
                      childCount: visible.length,
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

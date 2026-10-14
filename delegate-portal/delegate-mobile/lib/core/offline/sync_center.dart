import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../auth/data_refresh.dart';
import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';
import '../utils/formatters.dart';
import 'connectivity_service.dart';
import 'offline_stores.dart';
import 'outbox_store.dart';
import 'sync_engine.dart';

/// وصف حالة الاتصال والمزامنة بكلمات قصيرة + لون.
class SyncStatusView {
  const SyncStatusView({required this.label, required this.detail, required this.color, required this.icon});

  final String label;
  final String detail;
  final Color color;
  final IconData icon;

  static SyncStatusView of(ConnectivityState conn, SyncStatus sync) {
    if (!conn.deviceOnline) {
      return SyncStatusView(
        label: 'دون اتصال',
        detail: sync.pendingCount > 0 ? '${sync.pendingCount} بانتظار الإرسال' : 'تعمل على البيانات المحفوظة',
        color: AppColors.warning,
        icon: Icons.cloud_off_rounded,
      );
    }
    if (conn.serverDown) {
      return SyncStatusView(
        label: 'الخادم لا يستجيب',
        detail: sync.pendingCount > 0 ? '${sync.pendingCount} بانتظار الإرسال' : 'إعادة المحاولة تلقائياً',
        color: AppColors.warning,
        icon: Icons.cloud_off_rounded,
      );
    }
    if (sync.syncing) {
      return const SyncStatusView(
        label: 'جارٍ الإرسال…',
        detail: 'مزامنة العمليات المحفوظة',
        color: AppColors.primary,
        icon: Icons.cloud_sync_rounded,
      );
    }
    if (sync.failedCount > 0) {
      return SyncStatusView(
        label: 'عمليات تحتاج مراجعة',
        detail: '${sync.failedCount} رفضها الخادم',
        color: AppColors.danger,
        icon: Icons.error_outline_rounded,
      );
    }
    if (sync.pendingCount > 0) {
      return SyncStatusView(
        label: 'بانتظار الإرسال',
        detail: '${sync.pendingCount} عملية',
        color: AppColors.warning,
        icon: Icons.cloud_upload_outlined,
      );
    }
    return SyncStatusView(
      label: 'متصل',
      detail: sync.lastSyncAt != null ? 'آخر تحديث ${relativeTimeAr(sync.lastSyncAt!)}' : 'البيانات محدّثة',
      color: AppColors.success,
      icon: Icons.cloud_done_rounded,
    );
  }
}

/// شارة صغيرة لحالة الاتصال — تفتح مركز المزامنة عند الضغط.
class SyncStatusChip extends ConsumerWidget {
  const SyncStatusChip({super.key, this.dense = false, this.onDark = false, this.iconOnly = false});

  final bool dense;
  final bool onDark;
  /// أيقونة فقط (للشريط الجانبي المضغوط).
  final bool iconOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn = ref.watch(connectivityProvider);
    final sync = ref.watch(syncStatusProvider);
    final v = SyncStatusView.of(conn, sync);
    if (iconOnly) {
      final count = sync.pendingCount + sync.failedCount;
      return Tooltip(
        message: '${v.label} · ${v.detail}',
        child: Material(
          color: v.color.withValues(alpha: 0.1),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => showSyncCenter(context),
            child: SizedBox(
              width: 44,
              height: 44,
              child: Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  if (sync.syncing)
                    SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: v.color))
                  else
                    Icon(v.icon, size: 21, color: v.color),
                  if (count > 0)
                    Positioned(
                      top: -2,
                      right: -2,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(color: v.color, borderRadius: BorderRadius.circular(99)),
                        child: Text('$count', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: Colors.white)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    final fg = onDark ? Colors.white : v.color;
    return Material(
      color: onDark ? Colors.white.withValues(alpha: 0.12) : v.color.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => showSyncCenter(context),
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: dense ? 8 : 12, vertical: dense ? 5 : 7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (sync.syncing)
                SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
              else
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(color: onDark ? v.color.withValues(alpha: 1) : v.color, shape: BoxShape.circle),
                ),
              const SizedBox(width: 7),
              Text(
                v.label,
                style: TextStyle(fontSize: dense ? 11 : 12, fontWeight: FontWeight.w700, color: fg),
              ),
              if (sync.pendingCount > 0 && !dense) ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(color: fg.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
                  child: Text('${sync.pendingCount}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: fg)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// شريط رفيع يظهر فقط عند انقطاع الاتصال أو وجود عمليات معلّقة.
class OfflineStrip extends ConsumerWidget {
  const OfflineStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final conn = ref.watch(connectivityProvider);
    final sync = ref.watch(syncStatusProvider);
    final visible = !conn.isOnline || sync.pendingCount > 0 || sync.failedCount > 0;
    final v = SyncStatusView.of(conn, sync);
    return AnimatedSize(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutCubic,
      child: !visible
          ? const SizedBox(width: double.infinity)
          : Material(
              color: v.color.withValues(alpha: 0.09),
              child: InkWell(
                onTap: () => showSyncCenter(context),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: v.color.withValues(alpha: 0.2))),
                  ),
                  child: Row(
                    children: [
                      Icon(v.icon, size: 17, color: v.color),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(text: v.label, style: const TextStyle(fontWeight: FontWeight.w800)),
                            TextSpan(text: '  ·  ${v.detail}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          ]),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: v.color),
                        ),
                      ),
                      Text('التفاصيل', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: v.color)),
                      Icon(Icons.chevron_left_rounded, size: 18, color: v.color),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}

/// يفتح مركز المزامنة: حالة الاتصال، العمليات المعلّقة، التنزيل للعمل دون إنترنت.
Future<void> showSyncCenter(BuildContext context) {
  final wide = EdLayout.of(context).isWide;
  if (wide) {
    return showDialog<void>(
      context: context,
      builder: (ctx) => Dialog(
        insetPadding: const EdgeInsets.all(32),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560, maxHeight: 720),
          child: const Directionality(textDirection: TextDirection.rtl, child: SyncCenterPanel()),
        ),
      ),
    );
  }
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.88),
      child: const Directionality(textDirection: TextDirection.rtl, child: SyncCenterPanel()),
    ),
  );
}

class SyncCenterPanel extends ConsumerStatefulWidget {
  const SyncCenterPanel({super.key});

  @override
  ConsumerState<SyncCenterPanel> createState() => _SyncCenterPanelState();
}

class _SyncCenterPanelState extends ConsumerState<SyncCenterPanel> {
  List<OutboxEntry> _entries = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await ref.read(outboxStoreProvider).all();
    if (!mounted) return;
    setState(() {
      _entries = list;
      _loading = false;
    });
  }

  Future<void> _syncNow() async {
    final conn = ref.read(connectivityProvider.notifier);
    await conn.probe();
    await ref.read(syncEngineProvider).syncPending();
    await ref.read(syncEngineProvider).refreshLive();
    await _load();
  }

  Future<void> _retry(OutboxEntry e) async {
    await ref.read(outboxStoreProvider).retry(e.id);
    await ref.read(syncStatusProvider.notifier).refreshPendingCount();
    await _syncNow();
  }

  Future<void> _discard(OutboxEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('حذف العملية؟'),
        content: Text('سيتم حذف «${e.label}» من قائمة الإرسال نهائياً ولن تصل إلى الإدارة.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('حذف'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final opt = e.optimisticJson;
    if (opt != null && e.listCacheKey != null && opt['id'] != null) {
      await ref.read(cacheStoreProvider).removeListItem(e.listCacheKey!, opt['id']);
    }
    await ref.read(outboxStoreProvider).markDone(e.id);
    await ref.read(syncStatusProvider.notifier).refreshPendingCount();
    if (ref.read(syncStatusProvider).pendingCount == 0) {
      ref.read(syncStatusProvider.notifier).setError(null);
    }
    // تحديث القوائم المعروضة لإزالة العنصر المحذوف.
    ref.read(delegateDataRefreshProvider)();
    await _load();
  }

  Future<void> _download({required bool statements}) async {
    try {
      await ref.read(syncEngineProvider).prefetchForOffline(force: true, statements: statements);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تنزيل البيانات — يمكنك العمل دون إنترنت')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.displayMessage)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final conn = ref.watch(connectivityProvider);
    final sync = ref.watch(syncStatusProvider);
    final v = SyncStatusView.of(conn, sync);
    ref.listen(syncStatusProvider.select((s) => '${s.pendingCount}:${s.failedCount}:${s.syncing}'), (_, _) => _load());

    return Material(
      color: AppColors.surface,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 12),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(color: v.color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
                  child: Icon(v.icon, color: v.color),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(v.label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: AppColors.text)),
                      Text(v.detail, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
                    ],
                  ),
                ),
                IconButton(onPressed: () => Navigator.of(context).maybePop(), icon: const Icon(Icons.close_rounded)),
              ],
            ),
          ),
          const Divider(height: 1),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              children: [
                _InfoRow(
                  icon: Icons.update_rounded,
                  label: 'آخر تحديث من الخادم',
                  value: sync.lastSyncAt != null ? relativeTimeAr(sync.lastSyncAt!) : '—',
                ),
                _InfoRow(
                  icon: Icons.download_done_rounded,
                  label: 'آخر تنزيل كامل للعمل دون إنترنت',
                  value: sync.lastPrefetchAt != null ? relativeTimeAr(sync.lastPrefetchAt!) : 'لم يتم بعد',
                ),
                if (sync.lastError != null && sync.lastError!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(sync.lastError!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.danger)),
                  ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: sync.syncing ? null : _syncNow,
                        icon: const Icon(Icons.sync_rounded, size: 20),
                        label: const Text('مزامنة الآن'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const Text('قائمة الإرسال', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text)),
                const SizedBox(height: 4),
                const Text(
                  'العمليات التي أُنشئت دون اتصال تُرسل تلقائياً عند عودة الشبكة.',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                ),
                const SizedBox(height: 10),
                if (_loading)
                  const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                else if (_entries.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: AppColors.card(color: AppColors.surfaceMuted),
                    child: const Row(
                      children: [
                        Icon(Icons.check_circle_rounded, color: AppColors.success, size: 20),
                        SizedBox(width: 10),
                        Text('لا توجد عمليات معلّقة', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                      ],
                    ),
                  )
                else
                  ..._entries.map((e) => _OutboxTile(entry: e, onRetry: () => _retry(e), onDiscard: () => _discard(e))),
                const SizedBox(height: 22),
                const Text('العمل دون إنترنت', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text)),
                const SizedBox(height: 4),
                const Text(
                  'نزّل نسخة من الزبائن والمنتجات والطلبات قبل الخروج لمنطقة ضعيفة التغطية.',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                ),
                const SizedBox(height: 10),
                if (sync.prefetching) ...[
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(value: sync.prefetchProgress, minHeight: 6, backgroundColor: AppColors.surfaceAlt),
                  ),
                  const SizedBox(height: 6),
                  Text(sync.prefetchLabel ?? 'جارٍ التنزيل…', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                ] else
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: conn.isOnline ? () => _download(statements: false) : null,
                        icon: const Icon(Icons.download_rounded, size: 19),
                        label: const Text('تنزيل البيانات'),
                      ),
                      OutlinedButton.icon(
                        onPressed: conn.isOnline ? () => _download(statements: true) : null,
                        icon: const Icon(Icons.receipt_long_outlined, size: 19),
                        label: const Text('مع كشوف الحساب'),
                      ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.mutedLight),
          const SizedBox(width: 10),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textSecondary))),
          Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: AppColors.text)),
        ],
      ),
    );
  }
}

class _OutboxTile extends StatelessWidget {
  const _OutboxTile({required this.entry, required this.onRetry, required this.onDiscard});

  final OutboxEntry entry;
  final VoidCallback onRetry;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    final failed = entry.isFailed;
    final color = failed ? AppColors.danger : AppColors.warning;
    final created = DateTime.fromMillisecondsSinceEpoch(entry.createdAt);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
      decoration: AppColors.card(borderColor: failed ? AppColors.danger.withValues(alpha: 0.3) : null),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
            child: Icon(failed ? Icons.error_outline_rounded : Icons.schedule_send_rounded, size: 19, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(entry.label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.text)),
                if (entry.summary.isNotEmpty)
                  Text(entry.summary, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                Text(
                  failed ? 'رفضه الخادم: ${entry.error ?? ''}' : 'أُنشئ ${relativeTimeAr(created)}',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: failed ? AppColors.danger : AppColors.muted),
                ),
              ],
            ),
          ),
          if (failed)
            IconButton(tooltip: 'إعادة المحاولة', onPressed: onRetry, icon: const Icon(Icons.refresh_rounded, color: AppColors.primary)),
          IconButton(tooltip: 'حذف', onPressed: onDiscard, icon: const Icon(Icons.delete_outline_rounded, color: AppColors.mutedLight)),
        ],
      ),
    );
  }
}

/// يؤكد تسجيل الخروج — ويحذّر إن كانت هناك عمليات لم تُرسل بعد.
Future<bool> confirmLogout(BuildContext context, WidgetRef ref) async {
  await ref.read(syncStatusProvider.notifier).refreshPendingCount();
  final sync = ref.read(syncStatusProvider);
  final unsent = sync.pendingCount + sync.failedCount;
  if (!context.mounted) return false;
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('تسجيل الخروج'),
      content: Text(
        unsent > 0
            ? 'لديك $unsent عملية لم تُرسل بعد إلى الخادم. ستبقى محفوظة على الجهاز وتُرسل عند دخولك مجدداً، ولن يتمكن مندوب آخر من الدخول قبل إرسالها.\nيُفضّل المزامنة أولاً.'
            : 'هل تريد تسجيل الخروج من حساب المندوب؟',
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
        FilledButton(
          style: unsent > 0 ? FilledButton.styleFrom(backgroundColor: AppColors.danger) : null,
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(unsent > 0 ? 'خروج رغم ذلك' : 'خروج'),
        ),
      ],
    ),
  );
  return ok == true;
}

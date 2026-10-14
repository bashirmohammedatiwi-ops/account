import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/config/app_config_notifier.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ed_page_scroll.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../../core/widgets/ed_kit.dart';
import '../../core/api/api_exception.dart';
import '../../core/offline/connectivity_service.dart';
import '../../core/offline/sync_center.dart';
import '../../core/offline/sync_engine.dart';
import '../../core/utils/formatters.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _serverCtrl = TextEditingController();
  bool _editingServer = false;
  bool _savingServer = false;
  String? _serverError;

  @override
  void initState() {
    super.initState();
    _serverCtrl.text = ref.read(appConfigProvider).serverUrl;
  }

  @override
  void dispose() {
    _serverCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveServer() async {
    setState(() {
      _savingServer = true;
      _serverError = null;
    });
    try {
      await ref.read(appConfigProvider.notifier).setServerUrl(_serverCtrl.text);
      if (mounted) setState(() => _editingServer = false);
    } catch (e) {
      setState(() => _serverError = e.toString().replaceFirst('ArgumentError: ', ''));
    } finally {
      if (mounted) setState(() => _savingServer = false);
    }
  }

  Future<void> _resetServer() async {
    await ref.read(appConfigProvider.notifier).resetServerUrl();
    _serverCtrl.text = defaultServerUrl;
    if (mounted) setState(() => _editingServer = false);
  }

  @override
  Widget build(BuildContext context) {
    final agent = ref.watch(authProvider).agent;
    final config = ref.watch(appConfigProvider);
    final initial = (agent?.name ?? 'م').characters.first;

    final sync = ref.watch(syncStatusProvider);
    final conn = ref.watch(connectivityProvider);
    final roleLine = agent == null || agent.delegateRoleLabel.isEmpty
        ? ''
        : agent.isSecondary && agent.parentAgentName.isNotEmpty
            ? '${agent.delegateRoleLabel} · يتبع ${agent.parentAgentName}'
            : agent.isPrimary && agent.secondaryCount > 0
                ? '${agent.delegateRoleLabel} · ${agent.secondaryCount} مندوب ثانوي'
                : agent.delegateRoleLabel;

    return AppPage(
      title: 'الإعدادات',
      subtitle: 'الحساب والمزامنة والطابعة',
      child: ListView(
        primary: false,
        physics: edPageScrollPhysics,
        padding: EdgeInsets.fromLTRB(0, 20, 0, EdPageInsets.bottom(context, extra: 20)),
        children: [
          EdContent(
            maxWidth: 760,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                EdCard(
                  padding: const EdgeInsets.all(18),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: AppColors.primarySoft,
                        child: Text(initial, style: const TextStyle(color: AppColors.primary, fontSize: 22, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(agent?.name ?? '—', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.text, fontSize: 18, fontWeight: FontWeight.w800)),
                            Text(agent?.username ?? '', textDirection: TextDirection.ltr, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
                            if (roleLine.isNotEmpty) ...[
                              const SizedBox(height: 6),
                              EdPill(label: roleLine, color: agent!.isSecondary ? AppColors.warning : AppColors.primary),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                EdPanelCard(
                  title: 'المزامنة والعمل دون إنترنت',
                  subtitle: 'البيانات تُحفظ على الجهاز وتُرسل تلقائياً عند الاتصال',
                  icon: Icons.cloud_sync_outlined,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          const Text('الحالة', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textSecondary)),
                          const Spacer(),
                          const SyncStatusChip(),
                        ],
                      ),
                      const Divider(height: 22),
                      _infoRow(Icons.update_rounded, 'آخر تحديث', sync.lastSyncAt != null ? relativeTimeAr(sync.lastSyncAt!) : '—'),
                      const SizedBox(height: 10),
                      _infoRow(Icons.download_done_rounded, 'آخر تنزيل كامل', sync.lastPrefetchAt != null ? relativeTimeAr(sync.lastPrefetchAt!) : 'لم يتم بعد'),
                      const SizedBox(height: 10),
                      _infoRow(Icons.outbox_outlined, 'بانتظار الإرسال', '${sync.pendingCount + sync.failedCount}'),
                      if (sync.prefetching) ...[
                        const SizedBox(height: 14),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(value: sync.prefetchProgress, minHeight: 6, backgroundColor: AppColors.surfaceAlt),
                        ),
                        const SizedBox(height: 6),
                        Text(sync.prefetchLabel ?? 'جارٍ التنزيل…', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted)),
                      ],
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          FilledButton.icon(
                            onPressed: () => showSyncCenter(context),
                            icon: const Icon(Icons.sync_rounded, size: 19),
                            label: const Text('مركز المزامنة'),
                          ),
                          OutlinedButton.icon(
                            onPressed: !conn.isOnline || sync.prefetching
                                ? null
                                : () async {
                                    try {
                                      await ref.read(syncEngineProvider).prefetchForOffline(force: true);
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(
                                          const SnackBar(content: Text('تم تنزيل البيانات — يمكنك العمل دون إنترنت')),
                                        );
                                      }
                                    } catch (e) {
                                      if (context.mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.displayMessage)));
                                      }
                                    }
                                  },
                            icon: const Icon(Icons.download_rounded, size: 19),
                            label: const Text('تنزيل البيانات الآن'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                EdPanelCard(
                  title: 'خادم Edari',
                  subtitle: config.isCustom ? 'عنوان مخصّص' : 'العنوان الافتراضي',
                  icon: Icons.dns_outlined,
                  child: _serverSection(config),
                ),
                const SizedBox(height: 16),
                if (!kIsWeb) ...[
                  EdPanelCard(
                    title: 'الطابعة الحرارية',
                    subtitle: 'اختر الطابعة مرة واحدة للطباعة',
                    icon: Icons.print_outlined,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'اربط طابعة 80mm من هنا — تُحفظ تلقائياً ولا تحتاج إعادة الاختيار في كل مرة.',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: () => context.push('/settings/printer'),
                          icon: const Icon(Icons.print_outlined, size: 18),
                          label: const Text('إعدادات الطابعة'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                EdPanelCard(
                  title: 'عن التطبيق',
                  icon: Icons.info_outline_rounded,
                  child: Column(
                    children: [
                      _infoRow(Icons.verified_outlined, 'الإصدار', appVersion),
                      const Divider(height: 20),
                      _infoRow(Icons.phone_android_outlined, 'التطبيق', 'Edari Delegate'),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(side: BorderSide(color: AppColors.danger.withValues(alpha: 0.35))),
                  onPressed: () async {
                    final ok = await confirmLogout(context, ref);
                    if (!ok || !context.mounted) return;
                    await ref.read(authProvider.notifier).logout();
                    if (context.mounted) context.go('/login');
                  },
                  icon: const Icon(Icons.logout_rounded, color: AppColors.danger),
                  label: const Text('تسجيل الخروج', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _serverSection(AppConfig config) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_editingServer) ...[
          TextField(
            controller: _serverCtrl,
            decoration: const InputDecoration(
              labelText: 'عنوان الخادم',
              hintText: 'http://host:port',
              prefixIcon: Icon(Icons.dns_outlined),
            ),
            keyboardType: TextInputType.url,
            textDirection: TextDirection.ltr,
          ),
          if (_serverError != null) ...[
            const SizedBox(height: 8),
            Text(_serverError!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: EdPrimaryButton(label: 'حفظ', loading: _savingServer, onPressed: _saveServer),
              ),
              const SizedBox(width: 10),
              OutlinedButton(
                onPressed: _savingServer ? null : () => setState(() => _editingServer = false),
                child: const Text('إلغاء'),
              ),
            ],
          ),
        ] else ...[
          SelectableText(
            config.serverUrl,
            textDirection: TextDirection.ltr,
            style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.text),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => setState(() => _editingServer = true),
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('تعديل'),
                ),
              ),
              if (config.isCustom) ...[
                const SizedBox(width: 10),
                OutlinedButton(
                  onPressed: _resetServer,
                  child: const Text('افتراضي'),
                ),
              ],
            ],
          ),
        ],
      ],
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.muted),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.text)),
      ],
    );
  }
}

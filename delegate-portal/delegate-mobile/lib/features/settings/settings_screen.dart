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

    return AppPage(
      title: 'الحساب',
      kicker: 'الإعدادات',
      showBack: true,
      onBack: () => context.go('/home'),
      child: ListView(
        primary: false,
        physics: edPageScrollPhysics,
        padding: EdgeInsets.fromLTRB(20, 12, 20, EdPageInsets.bottom(context)),
        children: [
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppColors.radiusLg),
              border: Border.all(color: AppColors.borderLight),
              boxShadow: AppColors.cardShadow,
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerRight,
                      end: Alignment.centerLeft,
                      colors: [Color(0xFF0A1020), Color(0xFF152238), Color(0xFF1A3352)],
                    ),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.person_outline_rounded, size: 16, color: Colors.white70),
                      SizedBox(width: 8),
                      Text('حساب المندوب', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white70)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.surfaceAlt,
                          border: Border.all(color: AppColors.accentTeal.withValues(alpha: 0.35)),
                        ),
                        child: Text(initial, style: const TextStyle(color: AppColors.navy, fontSize: 20, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(agent?.name ?? '—', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.navy, fontSize: 17, fontWeight: FontWeight.w800)),
                            Text(agent?.username ?? '', style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
                            if ((agent?.delegateRoleLabel ?? '').isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                agent!.isSecondary && agent.parentAgentName.isNotEmpty
                                    ? '${agent.delegateRoleLabel} · يتبع ${agent.parentAgentName}'
                                    : agent.delegateRoleLabel,
                                style: TextStyle(
                                  color: agent.isSecondary ? AppColors.warning : AppColors.accentTeal,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          EdPanelCard(
            title: 'خادم Edari',
            subtitle: config.isCustom ? 'عنوان مخصّص' : 'العنوان الافتراضي',
            child: Column(
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
                    style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy),
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
            ),
          ),
          const SizedBox(height: 16),
          if (!kIsWeb)
            EdPanelCard(
              title: 'الطابعة الحرارية',
              subtitle: 'اختر الطابعة مرة واحدة للطباعة',
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
          if (!kIsWeb) const SizedBox(height: 16),
          EdPanelCard(
            title: 'عن التطبيق',
            child: Column(
              children: [
                _infoRow(Icons.verified_outlined, 'الإصدار', '1.2.2'),
                const Divider(height: 20),
                _infoRow(Icons.phone_android_outlined, 'المنصة', 'Edari Delegate'),
              ],
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('تسجيل الخروج'),
                  content: const Text('هل تريد تسجيل الخروج من حساب المندوب؟'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('خروج')),
                  ],
                ),
              );
              if (ok != true || !context.mounted) return;
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
            icon: const Icon(Icons.logout_rounded, color: AppColors.danger),
            label: const Text('تسجيل الخروج', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 20, color: AppColors.muted),
        const SizedBox(width: 12),
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted)),
        const Spacer(),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
      ],
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/config/app_config_notifier.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_colors.dart';
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
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: AppColors.heroGradient,
              borderRadius: BorderRadius.circular(AppColors.radius),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.white.withValues(alpha: 0.15),
                  child: Text(initial, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800)),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(agent?.name ?? '—', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
                      Text(agent?.username ?? '', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w600)),
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
          EdPanelCard(
            title: 'عن التطبيق',
            child: Column(
              children: [
                _infoRow(Icons.verified_outlined, 'الإصدار', '1.1.1'),
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

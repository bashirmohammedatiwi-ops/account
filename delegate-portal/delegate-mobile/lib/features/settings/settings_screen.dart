import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/widgets/adaptive_shell.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late TextEditingController _serverCtrl;

  @override
  void initState() {
    super.initState();
    _serverCtrl = TextEditingController(text: ref.read(appConfigProvider).serverUrl);
  }

  @override
  void dispose() {
    _serverCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppPage(
      title: 'الإعدادات',
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          TextField(
            controller: _serverCtrl,
            decoration: const InputDecoration(
              labelText: 'عنوان الخادم',
              hintText: 'http://127.0.0.1:5005',
              prefixIcon: Icon(Icons.dns_outlined),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () async {
              await ref.read(appConfigProvider).setServerUrl(_serverCtrl.text.trim());
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم حفظ العنوان')));
              }
            },
            child: const Text('حفظ'),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
              if (context.mounted) context.go('/login');
            },
            icon: const Icon(Icons.logout_rounded),
            label: const Text('تسجيل الخروج'),
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/theme/theme_mode_provider.dart';
import '../../widgets/app_widgets.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employee = ref.watch(authProvider).employee;
    final config = ref.watch(appConfigProvider);
    final themeMode = ref.watch(themeModeProvider);
    final isDarkMode = themeMode == ThemeMode.dark;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: themed(context, light: AppColors.bg, dark: AppColors.bgDark),
        body: Column(
          children: [
            GradientHeader(
              title: 'حسابي',
              subtitle: employee?.name ?? 'موظف التجهيز',
              compact: true,
              trailing: CircleAvatar(
                radius: 24,
                backgroundColor: Colors.white.withValues(alpha: 0.15),
                child: Text(
                  (employee?.name.isNotEmpty == true ? employee!.name.substring(0, 1) : 'م'),
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                children: [
                  _ProfileCard(
                    children: [
                      _ProfileRow(icon: Icons.badge_outlined, label: 'المستخدم', value: employee?.username ?? '—'),
                      const Divider(height: 20),
                      _ProfileRow(icon: Icons.dns_outlined, label: 'الخادم', value: config.serverUrl),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _ProfileCard(
                    children: [
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('الوضع الداكن', style: TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('مريح للعمل في المخزن', style: TextStyle(color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark))),
                        secondary: Icon(isDarkMode ? Icons.dark_mode_rounded : Icons.light_mode_rounded, color: AppColors.primary),
                        value: isDarkMode,
                        onChanged: (v) => ref.read(themeModeProvider.notifier).toggle(v),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _ProfileCard(
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.notifications_active_outlined, color: AppColors.primary),
                        title: const Text('إشعارات الطلبات', style: TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text(
                          'تنبيهات فورية للطلبات الجديدة والتذكير',
                          style: TextStyle(color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark)),
                        ),
                        trailing: FilledButton.tonal(
                          onPressed: () async {
                            await ref.read(notificationServiceProvider).requestPermission();
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('تم تفعيل الإشعارات — تأكد من السماح من إعدادات الهاتف')),
                              );
                            }
                          },
                          child: const Text('تفعيل'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _ProfileCard(
                    children: [
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.info_outline_rounded, color: AppColors.primary),
                        title: const Text('إصدار التطبيق', style: TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: const Text('3.8.0 — إشعارات محسّنة + خلفية'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: AppColors.rejected),
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('تسجيل الخروج'),
                          content: const Text('هل تريد الخروج من التطبيق؟'),
                          actions: [
                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
                            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('خروج')),
                          ],
                        ),
                      );
                      if (ok != true) return;
                      final notify = ref.read(notificationServiceProvider);
                      await notify.unregisterDeviceToken();
                      notify.stop();
                      await ref.read(authProvider.notifier).logout();
                    },
                    icon: const Icon(Icons.logout_rounded),
                    label: const Text('تسجيل الخروج'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(padding: const EdgeInsets.all(16), child: Column(children: children)),
    );
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: AppColors.primary),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: themed(context, light: AppColors.muted, dark: AppColors.mutedDark), fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(value, style: const TextStyle(fontWeight: FontWeight.w800)),
            ],
          ),
        ),
      ],
    );
  }
}

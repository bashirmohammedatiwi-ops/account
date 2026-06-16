import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/app_config.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _serverCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  bool _showServer = false;

  @override
  void initState() {
    super.initState();
    _serverCtrl.text = ref.read(appConfigProvider).serverUrl;
  }

  @override
  void dispose() {
    _userCtrl.dispose();
    _passCtrl.dispose();
    _serverCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(appConfigProvider).setServerUrl(_serverCtrl.text.trim());
      await ref.read(authProvider.notifier).login(_userCtrl.text.trim(), _passCtrl.text);
      if (mounted) context.go('/home');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = 'فشل الاتصال — استخدم http://187.124.23.65:5005 وليس منفذ 4100');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: wide
            ? Row(
                children: [
                  Expanded(
                    flex: 5,
                    child: Container(
                      color: const Color(0xFF0F766E),
                      padding: const EdgeInsets.all(48),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Image.asset('assets/logo.png', width: 72, height: 72),
                          const SizedBox(height: 24),
                          Text(
                            'بوابة المندوب',
                            style: Theme.of(context).textTheme.displaySmall?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'كشوف حساب · طلبات · تقارير — مصمّم للآيباد والعمل الميداني',
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                  color: Colors.white.withValues(alpha: 0.9),
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  Expanded(flex: 4, child: _form(context)),
                ],
              )
            : _form(context),
      ),
    );
  }

  Widget _form(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (MediaQuery.sizeOf(context).width < 900) ...[
                Center(child: Image.asset('assets/logo.png', width: 64, height: 64)),
                const SizedBox(height: 16),
                Text('تسجيل الدخول', style: Theme.of(context).textTheme.headlineMedium, textAlign: TextAlign.center),
                const SizedBox(height: 24),
              ] else
                Text('تسجيل الدخول', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 24),
              TextField(
                controller: _userCtrl,
                decoration: const InputDecoration(labelText: 'اسم المستخدم', prefixIcon: Icon(Icons.person_outline)),
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passCtrl,
                decoration: const InputDecoration(labelText: 'كلمة المرور', prefixIcon: Icon(Icons.lock_outline)),
                obscureText: true,
                onSubmitted: (_) => _submit(),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => _showServer = !_showServer),
                child: Text(_showServer ? 'إخفاء إعدادات الخادم' : 'إعدادات الخادم (ليس 4100)'),
              ),
              if (_showServer) ...[
                TextField(
                  controller: _serverCtrl,
                  decoration: const InputDecoration(
                    labelText: 'عنوان الخادم',
                    hintText: 'http://187.124.23.65:5005',
                    prefixIcon: Icon(Icons.dns_outlined),
                  ),
                ),
                TextButton(
                  onPressed: () async {
                    _serverCtrl.text = defaultServerUrl;
                    await ref.read(appConfigProvider).setServerUrl(defaultServerUrl);
                    if (mounted) setState(() {});
                  },
                  child: const Text('استخدام الخادم الافتراضي'),
                ),
                const SizedBox(height: 12),
              ],
              if (_error != null) ...[
                Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                const SizedBox(height: 12),
              ],
              const SizedBox(height: 8),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('دخول'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

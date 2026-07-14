import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _userCtrl = TextEditingController(text: 'allemp');
  final _passCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(_userCtrl.text.trim(), _passCtrl.text);
      await ref.read(notificationServiceProvider).start();
      if (mounted) context.go('/orders');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } on DioException catch (_) {
      setState(() => _error = 'فشل الاتصال بالخادم');
    } catch (_) {
      setState(() => _error = 'فشل تسجيل الدخول');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0F172A), Color(0xFF134E4A), Color(0xFF0F766E)],
            ),
          ),
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            width: 52,
                            height: 52,
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            alignment: Alignment.center,
                            child: const Text('E', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                          ),
                          const SizedBox(height: 16),
                          const Text('تجهيز الطلبات', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                          const Text('دخول موظفي التجهيز', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 20),
                          TextField(
                            controller: _userCtrl,
                            decoration: const InputDecoration(labelText: 'اسم المستخدم', prefixIcon: Icon(Icons.person_outline)),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passCtrl,
                            obscureText: true,
                            decoration: const InputDecoration(labelText: 'كلمة المرور', prefixIcon: Icon(Icons.lock_outline)),
                            onSubmitted: (_) => _submit(),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700)),
                          ],
                          const SizedBox(height: 20),
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
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

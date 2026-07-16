import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/api/api_client.dart';
import '../../features/orders/orders_providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with SingleTickerProviderStateMixin {
  final _userCtrl = TextEditingController(text: 'allemp');
  final _passCtrl = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..forward();
  }

  @override
  void dispose() {
    _anim.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).login(_userCtrl.text.trim(), _passCtrl.text);
      ref.invalidate(ordersListProvider);
      ref.invalidate(pendingCountProvider);
      ref.invalidate(orderStatsProvider);
      await ref.read(notificationServiceProvider).start();
      if (mounted) context.go('/orders');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on DioException catch (_) {
      if (mounted) setState(() => _error = 'فشل الاتصال بالخادم');
    } catch (_) {
      if (mounted) setState(() => _error = 'فشل تسجيل الدخول');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final server = ref.watch(appConfigProvider).serverUrl;
    final slide = CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        body: Stack(
          children: [
            Container(decoration: const BoxDecoration(gradient: AppColors.headerGradient)),
            Positioned(top: -80, left: -40, child: _Orb(size: 220, opacity: 0.12)),
            Positioned(bottom: -60, right: -30, child: _Orb(size: 180, opacity: 0.1)),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: FadeTransition(
                    opacity: slide,
                    child: SlideTransition(
                      position: Tween<Offset>(begin: const Offset(0, 0.08), end: Offset.zero).animate(slide),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 440),
                        child: Column(
                          children: [
                            Container(
                              width: 76,
                              height: 76,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(22),
                                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 24, offset: const Offset(0, 10))],
                              ),
                              padding: const EdgeInsets.all(10),
                              child: Image.asset('assets/app_icon_source.png', fit: BoxFit.contain),
                            ),
                            const SizedBox(height: 22),
                            const Text('تجهيز الطلبات', style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 6),
                            Text('بوابة موظفي المخزن والتجهيز', style: TextStyle(color: Colors.white.withValues(alpha: 0.82), fontWeight: FontWeight.w600)),
                            const SizedBox(height: 28),
                            Card(
                              elevation: 8,
                              shadowColor: Colors.black26,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                      decoration: BoxDecoration(
                                        color: AppColors.primary.withValues(alpha: 0.08),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.cloud_done_rounded, color: AppColors.primary, size: 18),
                                          const SizedBox(width: 8),
                                          Expanded(child: Text(server, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.primaryDeep))),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 20),
                                    TextField(
                                      controller: _userCtrl,
                                      textInputAction: TextInputAction.next,
                                      decoration: const InputDecoration(
                                        labelText: 'اسم المستخدم',
                                        prefixIcon: Icon(Icons.person_outline_rounded),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    TextField(
                                      controller: _passCtrl,
                                      obscureText: _obscure,
                                      decoration: InputDecoration(
                                        labelText: 'كلمة المرور',
                                        prefixIcon: const Icon(Icons.lock_outline_rounded),
                                        suffixIcon: IconButton(
                                          onPressed: () => setState(() => _obscure = !_obscure),
                                          icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                        ),
                                      ),
                                      onSubmitted: (_) => _submit(),
                                    ),
                                    if (_error != null) ...[
                                      const SizedBox(height: 14),
                                      Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: AppColors.rejectedSoft,
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: AppColors.rejected.withValues(alpha: 0.25)),
                                        ),
                                        child: Row(
                                          children: [
                                            const Icon(Icons.error_outline_rounded, color: AppColors.rejected, size: 18),
                                            const SizedBox(width: 8),
                                            Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.rejected, fontWeight: FontWeight.w700))),
                                          ],
                                        ),
                                      ),
                                    ],
                                    const SizedBox(height: 22),
                                    FilledButton(
                                      onPressed: _loading ? null : _submit,
                                      child: _loading
                                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                          : const Row(
                                              mainAxisAlignment: MainAxisAlignment.center,
                                              children: [
                                                Icon(Icons.login_rounded),
                                                SizedBox(width: 8),
                                                Text('دخول'),
                                              ],
                                            ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.size, required this.opacity});

  final double size;
  final double opacity;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: opacity)),
    );
  }
}

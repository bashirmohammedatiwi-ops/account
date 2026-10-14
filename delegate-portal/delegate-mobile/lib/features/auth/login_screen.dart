import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_exception.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/layout/breakpoints.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/ed_components.dart';
import '../../core/widgets/ed_form.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  // تعبئة مسبقة في وضع التطوير فقط (--dart-define=EDARI_DEV_USER/EDARI_DEV_PASS).
  final _userCtrl = TextEditingController(text: kDebugMode ? const String.fromEnvironment('EDARI_DEV_USER') : '');
  bool _obscure = true;
  final _passCtrl = TextEditingController(text: kDebugMode ? const String.fromEnvironment('EDARI_DEV_PASS') : '');
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
      if (!mounted) return;
      context.go('/home');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } on DioException catch (e) {
      setState(() => _error = _connectionMessage(e));
    } catch (_) {
      setState(() => _error = 'فشل تسجيل الدخول — حاول مجدداً');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _connectionMessage(Object e) {
    if (e is DioException) {
      if (e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        return 'فشل الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً';
      }
    }
    return 'فشل تسجيل الدخول — حاول مجدداً';
  }

  @override
  Widget build(BuildContext context) {
    final wide = EdLayout.of(context).isTablet;

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: DecoratedBox(
          decoration: const BoxDecoration(gradient: AppColors.pageGradient),
          child: wide
              ? Row(
                  children: [
                    const Expanded(flex: 5, child: EdLoginAside()),
                    Expanded(flex: 4, child: _tabletForm()),
                  ],
                )
              : _phoneLayout(),
        ),
      ),
    );
  }

  Widget _phoneLayout() {
    final top = MediaQuery.paddingOf(context).top;

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: EdgeInsets.fromLTRB(EdSpacing.page, top + 40, EdSpacing.page, 48),
            decoration: const BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(AppColors.radius2xl)),
            ),
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
                  child: Image.asset('assets/logo.png', width: 56, height: 56),
                ),
                const SizedBox(height: EdSpacing.lg),
                const Text('بوابة المندوب', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text('Edari Delegate', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 14, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -32),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: EdSpacing.page),
              child: EdFormCard(
                title: 'تسجيل الدخول',
                subtitle: 'أدخل بيانات حساب المندوب',
                icon: Icons.lock_outline_rounded,
                child: _fields(),
              ),
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _tabletForm() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(EdSpacing.xxl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: EdFormCard(
            title: 'تسجيل الدخول',
            subtitle: 'أدخل بيانات حساب المندوب',
            icon: Icons.lock_outline_rounded,
            child: _fields(),
          ),
        ),
      ),
    );
  }

  Widget _fields() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        EdLabeledField(
          label: 'اسم المستخدم',
          controller: _userCtrl,
          prefixIcon: Icons.person_outline_rounded,
          onSubmitted: (_) => _submit(),
        ),
        const SizedBox(height: EdSpacing.lg),
        EdLabeledField(
          label: 'كلمة المرور',
          controller: _passCtrl,
          obscureText: _obscure,
          prefixIcon: Icons.lock_outline_rounded,
          suffix: GestureDetector(
            onTap: () => setState(() => _obscure = !_obscure),
            child: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20, color: AppColors.muted),
          ),
          onSubmitted: (_) => _submit(),
        ),
        if (_error != null) ...[
          const SizedBox(height: EdSpacing.md),
          Container(
            padding: const EdgeInsets.all(EdSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.dangerSoft,
              borderRadius: BorderRadius.circular(AppColors.radius),
              border: Border.all(color: AppColors.danger.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600, fontSize: 13))),
              ],
            ),
          ),
        ],
        const SizedBox(height: EdSpacing.xl),
        EdPrimaryButton(label: 'دخول', onPressed: _submit, loading: _loading, icon: Icons.login_rounded),
      ],
    );
  }
}

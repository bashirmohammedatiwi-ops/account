import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';
import 'ed_components.dart';

/// غلاف التطبيق — بدون شريط جانبي أو سفلي (التنقل من الرئيسية فقط)
class AdaptiveShell extends StatelessWidget {
  const AdaptiveShell({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(backgroundColor: AppColors.bg, body: child),
    );
  }
}

class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.title,
    required this.child,
    this.actions,
    this.floatingActionButton,
    this.subtitle,
    this.kicker,
    this.showBack = false,
    this.onBack,
    this.toolbar,
    this.useHeader = true,
  });

  final String title;
  final String? subtitle;
  final String? kicker;
  final Widget child;
  final List<Widget>? actions;
  final Widget? floatingActionButton;
  final bool showBack;
  final VoidCallback? onBack;
  final Widget? toolbar;
  final bool useHeader;

  @override
  Widget build(BuildContext context) {
    final router = GoRouter.of(context);
    final canPop = showBack || router.canPop();
    final back = onBack ?? () => router.pop();

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        appBar: useHeader
            ? EdAppHeader(
                title: title,
                kicker: kicker,
                subtitle: subtitle,
                showBack: canPop,
                onBack: canPop ? back : null,
                actions: actions,
              )
            : null,
        floatingActionButton: floatingActionButton,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (toolbar != null) toolbar!,
            Expanded(child: child),
          ],
        ),
      ),
    );
  }
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message = 'جاري التحميل...'});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(
            width: 36,
            height: 36,
            child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.navy),
          ),
          const SizedBox(height: 16),
          Text(message, style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppColors.dangerSoft, shape: BoxShape.circle),
              child: const Icon(Icons.error_outline, size: 36, color: AppColors.danger),
            ),
            const SizedBox(height: 14),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w600)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              EdPrimaryButton(label: 'إعادة المحاولة', onPressed: onRetry, fullWidth: false),
            ],
          ],
        ),
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.color});

  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppColors.radiusSm),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.muted, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            value,
            textDirection: TextDirection.ltr,
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: color ?? AppColors.text),
          ),
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.icon = Icons.inbox_outlined});

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 52, color: AppColors.borderStrong),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted)),
          ],
        ),
      ),
    );
  }
}

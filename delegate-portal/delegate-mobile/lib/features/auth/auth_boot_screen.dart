import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/ed_page_background.dart';

class AuthBootScreen extends StatelessWidget {
  const AuthBootScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: EdPageBackground(
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(AppColors.radiusXl),
              border: Border.all(color: AppColors.borderLight),
              boxShadow: AppColors.cardShadow,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: AppColors.moduleSoftGradient(AppColors.accentTeal),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const CircularProgressIndicator(strokeWidth: 3, color: AppColors.accentTeal),
                ),
                const SizedBox(height: 20),
                const Text('جاري تحميل الجلسة…', style: TextStyle(color: AppColors.navy, fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 6),
                Text('Edari', style: TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 12)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

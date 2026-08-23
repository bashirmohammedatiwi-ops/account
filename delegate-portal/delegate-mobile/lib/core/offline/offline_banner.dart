import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_colors.dart';
import 'connectivity_service.dart';
import 'sync_engine.dart';

class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connectivity = ref.watch(connectivityProvider);
    final sync = ref.watch(syncStatusProvider);

    if (connectivity.isOnline && !sync.syncing && sync.pendingCount == 0) {
      return const SizedBox.shrink();
    }

    final offline = !connectivity.isOnline;
    final color = offline ? AppColors.warning : AppColors.accentTeal;
    final icon = offline ? Icons.cloud_off_rounded : Icons.cloud_sync_rounded;
    final message = offline
        ? 'وضع بدون إنترنت — البيانات محفوظة محلياً'
        : sync.syncing
            ? 'جاري مزامنة البيانات...'
            : 'بانتظار الإرسال: ${sync.pendingCount}';

    return Material(
      color: color.withValues(alpha: 0.12),
      child: InkWell(
        onTap: () {
          if (!offline) ref.read(syncEngineProvider).fullSync();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: color),
                ),
              ),
              if (!offline && !sync.syncing && sync.pendingCount > 0)
                TextButton(
                  onPressed: () => ref.read(syncEngineProvider).syncPending(),
                  child: const Text('إرسال الآن'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class SyncBootstrap extends ConsumerStatefulWidget {
  const SyncBootstrap({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<SyncBootstrap> createState() => _SyncBootstrapState();
}

class _SyncBootstrapState extends ConsumerState<SyncBootstrap> {
  bool _wasOnline = true;

  @override
  Widget build(BuildContext context) {
    ref.listen(connectivityProvider, (prev, next) {
      if (!_wasOnline && next.isOnline) {
        ref.read(syncEngineProvider).fullSync();
      }
      _wasOnline = next.isOnline;
    });

    return widget.child;
  }
}

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_provider.dart';
import '../theme/app_colors.dart';
import 'connectivity_service.dart';
import 'live_refresh.dart';
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
          if (!offline) ref.read(syncEngineProvider).fullSync(deepCatalog: true);
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

class _SyncBootstrapState extends ConsumerState<SyncBootstrap> with WidgetsBindingObserver {
  static const _pollInterval = Duration(seconds: 20);

  bool _wasOnline = true;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pollTimer = Timer.periodic(_pollInterval, (_) => _refreshLiveData());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshLiveData();
    }
  }

  void _refreshLiveData() {
    if (!ref.read(authProvider).isAuthenticated) return;
    unawaited(refreshDelegateLiveData(ref));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(connectivityProvider, (prev, next) {
      if (!_wasOnline && next.isOnline) {
        ref.read(syncEngineProvider).fullSync(deepCatalog: true);
        _refreshLiveData();
      }
      _wasOnline = next.isOnline;
    });

    return widget.child;
  }
}

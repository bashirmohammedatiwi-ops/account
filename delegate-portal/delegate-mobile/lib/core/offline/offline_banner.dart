import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_provider.dart';
import 'connectivity_service.dart';
import 'live_refresh.dart';
import 'sync_engine.dart';

class SyncBootstrap extends ConsumerStatefulWidget {
  const SyncBootstrap({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<SyncBootstrap> createState() => _SyncBootstrapState();
}

/// يدير التحديث الحي: كل [_pollInterval] أثناء فتح التطبيق، وفوراً عند العودة إليه
/// أو عند رجوع الاتصال — فتظهر تغييرات لوحة التحكم خلال ثوانٍ دون سحب للتحديث.
class _SyncBootstrapState extends ConsumerState<SyncBootstrap> with WidgetsBindingObserver {
  static const _pollInterval = Duration(seconds: 30);
  /// لا نكرر التحديث إن حدث قبل أقل من هذه المدة (مثلاً عند العودة السريعة للتطبيق).
  static const _minGap = Duration(seconds: 8);

  Timer? _pollTimer;
  DateTime? _lastRefresh;
  bool _foreground = true;

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
    _foreground = state == AppLifecycleState.resumed;
    if (state == AppLifecycleState.resumed) {
      _refreshLiveData(force: true);
    }
  }

  void _refreshLiveData({bool force = false}) {
    if (!_foreground) return;
    if (!ref.read(authProvider).isAuthenticated) return;
    final now = DateTime.now();
    if (!force && _lastRefresh != null && now.difference(_lastRefresh!) < _minGap) return;
    _lastRefresh = now;
    unawaited(refreshDelegateLiveData(ref));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(connectivityProvider.select((s) => s.isOnline), (prev, online) {
      if (prev == false && online && ref.read(authProvider).isAuthenticated) {
        _lastRefresh = DateTime.now();
        unawaited(ref.read(syncEngineProvider).onReconnected());
      }
    });

    return widget.child;
  }
}

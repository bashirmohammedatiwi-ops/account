import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config_notifier.dart';

/// حالة الاتصال الفعلية: وجود شبكة على الجهاز **و** إمكانية الوصول إلى الخادم.
///
/// `connectivity_plus` وحده يعتبر «واي فاي بلا إنترنت» اتصالاً — فتنتظر الطلبات
/// حتى انتهاء المهلة قبل الرجوع للنسخة المحلية. لذلك نتتبّع أيضاً نتيجة آخر طلب
/// ونفحص الخادم دورياً عند فقدانه.
class ConnectivityState {
  const ConnectivityState({
    required this.deviceOnline,
    required this.serverReachable,
    this.lastChange,
    this.lastServerContact,
  });

  /// الجهاز متصل بشبكة (واي فاي/بيانات).
  final bool deviceOnline;

  /// آخر محاولة للوصول إلى الخادم نجحت.
  final bool serverReachable;
  final DateTime? lastChange;
  final DateTime? lastServerContact;

  bool get isOnline => deviceOnline && serverReachable;

  /// الشبكة متاحة لكن الخادم لا يستجيب (إنترنت ضعيف أو الخادم متوقف).
  bool get serverDown => deviceOnline && !serverReachable;

  ConnectivityState copyWith({
    bool? deviceOnline,
    bool? serverReachable,
    DateTime? lastServerContact,
  }) {
    final next = ConnectivityState(
      deviceOnline: deviceOnline ?? this.deviceOnline,
      serverReachable: serverReachable ?? this.serverReachable,
      lastChange: lastChange,
      lastServerContact: lastServerContact ?? this.lastServerContact,
    );
    if (next.isOnline == isOnline) return next;
    return ConnectivityState(
      deviceOnline: next.deviceOnline,
      serverReachable: next.serverReachable,
      lastChange: DateTime.now(),
      lastServerContact: next.lastServerContact,
    );
  }
}

class ConnectivityNotifier extends Notifier<ConnectivityState> {
  static const _probeInterval = Duration(seconds: 12);
  static const _probeTimeout = Duration(seconds: 6);

  StreamSubscription<List<ConnectivityResult>>? _sub;
  Timer? _probeTimer;
  Future<bool>? _probeInFlight;
  final Dio _probeDio = Dio(BaseOptions(
    connectTimeout: _probeTimeout,
    receiveTimeout: _probeTimeout,
    sendTimeout: _probeTimeout,
    // أي رد من الخادم (حتى 401) يعني أنه متاح.
    validateStatus: (_) => true,
  ));

  @override
  ConnectivityState build() {
    _sub?.cancel();
    _sub = Connectivity().onConnectivityChanged.listen(_onDeviceChange);
    Future.microtask(_initialCheck);
    ref.onDispose(() {
      _sub?.cancel();
      _probeTimer?.cancel();
      _probeDio.close(force: true);
    });
    return const ConnectivityState(deviceOnline: true, serverReachable: true);
  }

  Future<void> _initialCheck() async {
    final results = await Connectivity().checkConnectivity();
    state = state.copyWith(deviceOnline: _isDeviceOnline(results));
    if (state.deviceOnline) unawaited(probe());
  }

  void _onDeviceChange(List<ConnectivityResult> results) {
    final online = _isDeviceOnline(results);
    if (online == state.deviceOnline) return;
    state = state.copyWith(deviceOnline: online);
    if (online) {
      // الشبكة عادت — نتأكد فعلاً من الخادم قبل اعتبار الاتصال قائماً.
      unawaited(probe());
    } else {
      _stopProbing();
    }
  }

  bool _isDeviceOnline(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return results.any((r) => r != ConnectivityResult.none);
  }

  /// يُستدعى بعد أي رد ناجح من الخادم.
  void reportServerContact() {
    if (state.serverReachable && state.deviceOnline) {
      // تحديث خفيف — لا نعيد بناء المستمعين على كل طلب.
      final last = state.lastServerContact;
      if (last != null && DateTime.now().difference(last) < const Duration(seconds: 30)) return;
    }
    _stopProbing();
    state = state.copyWith(deviceOnline: true, serverReachable: true, lastServerContact: DateTime.now());
  }

  /// يُستدعى عند فشل الاتصال بالخادم (لا رد إطلاقاً).
  void reportServerUnreachable() {
    if (!state.serverReachable) return;
    state = state.copyWith(serverReachable: false);
    _startProbing();
  }

  void _startProbing() {
    _probeTimer ??= Timer.periodic(_probeInterval, (_) => probe());
  }

  void _stopProbing() {
    _probeTimer?.cancel();
    _probeTimer = null;
  }

  /// يفحص الخادم بطلب خفيف — يعيد true إن استجاب.
  Future<bool> probe() {
    return _probeInFlight ??= _probe().whenComplete(() => _probeInFlight = null);
  }

  Future<bool> _probe() async {
    final base = ref.read(appConfigProvider).apiBase;
    try {
      await _probeDio.get<dynamic>('$base/me');
      reportServerContact();
      return true;
    } on DioException {
      if (state.deviceOnline) {
        state = state.copyWith(serverReachable: false);
        _startProbing();
      }
      return false;
    } catch (_) {
      return false;
    }
  }
}

final connectivityProvider = NotifierProvider<ConnectivityNotifier, ConnectivityState>(ConnectivityNotifier.new);

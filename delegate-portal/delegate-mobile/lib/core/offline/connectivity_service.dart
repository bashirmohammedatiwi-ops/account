import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class ConnectivityState {
  const ConnectivityState({required this.isOnline, this.lastChange});

  final bool isOnline;
  final DateTime? lastChange;
}

class ConnectivityNotifier extends Notifier<ConnectivityState> {
  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  ConnectivityState build() {
    _sub?.cancel();
    _sub = Connectivity().onConnectivityChanged.listen(_onChange);
    Future.microtask(_probe);
    ref.onDispose(() => _sub?.cancel());
    return const ConnectivityState(isOnline: true);
  }

  void _onChange(List<ConnectivityResult> results) {
    final online = _isOnline(results);
    if (online != state.isOnline) {
      state = ConnectivityState(isOnline: online, lastChange: DateTime.now());
    }
  }

  Future<void> _probe() async {
    final results = await Connectivity().checkConnectivity();
    state = ConnectivityState(isOnline: _isOnline(results), lastChange: DateTime.now());
  }

  bool _isOnline(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return results.any((r) => r != ConnectivityResult.none);
  }
}

final connectivityProvider = NotifierProvider<ConnectivityNotifier, ConnectivityState>(ConnectivityNotifier.new);

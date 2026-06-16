import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';

const _tokenKey = 'delegateToken';
const _agentKey = 'delegateAgent';

class AuthState {
  const AuthState({this.token, this.agent, this.loading = false});

  final String? token;
  final Agent? agent;
  final bool loading;

  bool get isAuthenticated => token != null && token!.isNotEmpty && agent != null;

  AuthState copyWith({String? token, Agent? agent, bool? loading}) => AuthState(
        token: token ?? this.token,
        agent: agent ?? this.agent,
        loading: loading ?? this.loading,
      );
}

class AuthNotifier extends Notifier<AuthState> {
  int _sessionEpoch = 0;

  @override
  AuthState build() {
    Future.microtask(restoreSession);
    return const AuthState(loading: true);
  }

  Future<SharedPreferences> get _prefs async => SharedPreferences.getInstance();

  /// ينتظر حتى تنتهي استعادة الجلسة أو تسجيل الدخول — قبل أي طلب API.
  Future<void> waitUntilReady() async {
    var spins = 0;
    while (state.loading && spins < 200) {
      await Future.delayed(const Duration(milliseconds: 25));
      spins++;
    }
  }

  Future<String?> _read(String key) async {
    return (await _prefs).getString(key);
  }

  Future<void> _write(String key, String value) async {
    await (await _prefs).setString(key, value);
  }

  Future<void> _delete(String key) async {
    await (await _prefs).remove(key);
  }

  Future<void> restoreSession() async {
    final epoch = _sessionEpoch;
    try {
      final token = await _read(_tokenKey);
      final agentRaw = await _read(_agentKey);
      if (epoch != _sessionEpoch) return;

      Agent? agent;
      if (agentRaw != null) {
        agent = Agent.fromJson(Map<String, dynamic>.from(jsonDecode(agentRaw) as Map));
      }

      if (token == null || token.isEmpty) {
        state = const AuthState(loading: false);
        return;
      }

      if (agent == null) {
        state = AuthState(token: token, loading: true);
        await _refreshAgent(epoch, token);
        return;
      }

      state = AuthState(token: token, agent: agent, loading: false);
    } catch (_) {
      if (epoch != _sessionEpoch) return;
      state = const AuthState(loading: false);
    }
  }

  Future<void> _refreshAgent(int epoch, String token) async {
    try {
      final me = await ref.read(apiClientProvider).me();
      if (epoch != _sessionEpoch) return;
      await _write(_agentKey, jsonEncode(me.toJson()));
      state = AuthState(token: token, agent: me, loading: false);
    } on ApiException catch (e) {
      if (epoch != _sessionEpoch) return;
      if (e.statusCode == 401) {
        await logout();
      } else {
        state = AuthState(token: token, loading: false);
      }
    } catch (_) {
      if (epoch != _sessionEpoch) return;
      state = AuthState(token: token, loading: false);
    }
  }

  Future<void> login(String username, String password) async {
    _sessionEpoch++;
    state = state.copyWith(loading: true);
    try {
      final result = await ref.read(apiClientProvider).login(username, password);
      try {
        await _write(_tokenKey, result.token);
        await _write(_agentKey, jsonEncode(result.agent.toJson()));
      } catch (_) {
        // الجلسة تبقى في الذاكرة حتى لو فشل الحفظ المحلي.
      }
      state = AuthState(token: result.token, agent: result.agent, loading: false);
    } catch (e) {
      state = const AuthState(loading: false);
      rethrow;
    }
  }

  Future<void> logout() async {
    _sessionEpoch++;
    try {
      await _delete(_tokenKey);
      await _delete(_agentKey);
    } catch (_) {}
    state = const AuthState(loading: false);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

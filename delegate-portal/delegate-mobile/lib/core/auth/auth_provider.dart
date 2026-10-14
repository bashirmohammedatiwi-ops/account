import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../api/delegate_api.dart';
import '../api/api_exception.dart';
import '../api/login_api.dart';
import '../config/app_config_notifier.dart';
import '../offline/offline_db.dart';
import 'data_refresh.dart';

const _tokenKey = 'delegateToken';
const _agentKey = 'delegateAgent';
/// المندوب الذي تعود له النسخة المحلية الحالية — لمسحها عند دخول مندوب آخر.
const _cacheOwnerKey = 'delegateCacheOwner';

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

  /// ينتظر حتى تنتهي استعادة الجلسة — قبل أي طلب API.
  Future<void> waitUntilReady() async {
    var spins = 0;
    while (state.loading && spins < 400) {
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
        try {
          agent = Agent.fromJson(Map<String, dynamic>.from(jsonDecode(agentRaw) as Map));
        } catch (_) {
          agent = null;
        }
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

      // جلسات سابقة للتحديث: نسجّل مالك النسخة المحلية إن لم يكن مسجّلاً.
      if (await _read(_cacheOwnerKey) == null) {
        await _write(_cacheOwnerKey, '${agent.id}');
      }
      state = AuthState(token: token, agent: agent, loading: false);
      ref.read(delegateDataRefreshProvider)();
      unawaited(_refreshAgent(epoch, token, fallbackAgent: agent));
    } catch (_) {
      if (epoch != _sessionEpoch) return;
      state = const AuthState(loading: false);
    }
  }

  Future<void> _refreshAgent(int epoch, String token, {Agent? fallbackAgent}) async {
    try {
      final me = await ref.read(apiClientProvider).me();
      if (epoch != _sessionEpoch) return;
      await _write(_agentKey, jsonEncode(me.toJson()));
      state = AuthState(token: token, agent: me, loading: false);
      ref.read(delegateDataRefreshProvider)();
    } on ApiException catch (e) {
      if (epoch != _sessionEpoch) return;
      if (e.statusCode == 401) {
        await logout();
      } else if (fallbackAgent != null) {
        state = AuthState(token: token, agent: fallbackAgent, loading: false);
      } else {
        state = AuthState(token: token, loading: false);
      }
    } catch (_) {
      if (epoch != _sessionEpoch) return;
      if (fallbackAgent != null) {
        state = AuthState(token: token, agent: fallbackAgent, loading: false);
      } else {
        state = AuthState(token: token, loading: false);
      }
    }
  }

  /// يحدّث الدور وعدد المندوبين الثانويين من `teamSummary` دون طلب `/me`.
  Future<void> applyAgentProfile(Map<String, dynamic> json) async {
    final current = state;
    if (current.token == null || current.agent == null) return;
    try {
      final merged = <String, dynamic>{...current.agent!.toJson(), ...json};
      final agent = Agent.fromJson(merged);
      if (agent.id != current.agent!.id) return;
      if (jsonEncode(agent.toJson()) == jsonEncode(current.agent!.toJson())) return;
      await _write(_agentKey, jsonEncode(agent.toJson()));
      state = current.copyWith(agent: agent);
    } catch (_) {}
  }

  Future<void> login(String username, String password) async {
    _sessionEpoch++;
    try {
      final config = ref.read(appConfigProvider);
      final result = await performLogin(config, username.trim(), password);
      await ref.read(apiClientProvider).resetReceiptCachesForSession();
      final previousOwner = await _read(_cacheOwnerKey);
      final newOwner = '${result.agent.id}';
      if (previousOwner != newOwner) {
        final db = OfflineDb.instance;
        final unsent = await db.pendingOutboxCount() + await db.failedOutboxCount();
        if (previousOwner != null && unsent > 0) {
          // لا نحذف عمل مندوب آخر لم يُرسل، ولا نرسله باسم مندوب مختلف.
          throw ApiException(
            'على هذا الجهاز $unsent عملية لم تُرسل بعد لمندوب آخر. '
            'سجّل الدخول بحسابه أولاً وأرسلها من «مركز المزامنة».',
          );
        }
        // مندوب آخر (أو جلسة قديمة غير معروفة المالك): لا نعرض زبائنه أو سنداته.
        await db.clearCacheEntries();
      }
      await _write(_cacheOwnerKey, newOwner);
      await _write(_tokenKey, result.token);
      await _write(_agentKey, jsonEncode(result.agent.toJson()));
      state = AuthState(token: result.token, agent: result.agent, loading: false);
      ref.read(delegateDataRefreshProvider)();
    } catch (e) {
      state = const AuthState(loading: false);
      rethrow;
    }
  }

  Future<void> logout() async {
    _sessionEpoch++;
    try {
      await ref.read(apiClientProvider).resetReceiptCachesForSession();
      await _delete(_tokenKey);
      await _delete(_agentKey);
    } catch (_) {}
    state = const AuthState(loading: false);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

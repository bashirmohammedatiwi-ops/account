import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../models/models.dart';
import '../api/api_client.dart';

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
  final _storage = const FlutterSecureStorage();

  @override
  AuthState build() {
    Future.microtask(restoreSession);
    return const AuthState(loading: true);
  }

  Future<void> restoreSession() async {
    try {
      final token = await _storage.read(key: _tokenKey);
      final agentRaw = await _storage.read(key: _agentKey);
      Agent? agent;
      if (agentRaw != null) {
        agent = Agent.fromJson(Map<String, dynamic>.from(jsonDecode(agentRaw) as Map));
      }
      if (token == null || token.isEmpty) {
        state = const AuthState(loading: false);
        return;
      }
      state = AuthState(token: token, agent: agent, loading: true);
      final me = await ref.read(apiClientProvider).me();
      state = AuthState(token: token, agent: me, loading: false);
    } catch (_) {
      await logout();
    }
  }

  Future<void> login(String username, String password) async {
    state = state.copyWith(loading: true);
    final result = await ref.read(apiClientProvider).login(username, password);
    await _storage.write(key: _tokenKey, value: result.token);
    await _storage.write(key: _agentKey, value: jsonEncode(result.agent.toJson()));
    state = AuthState(token: result.token, agent: result.agent, loading: false);
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _agentKey);
    state = const AuthState(loading: false);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

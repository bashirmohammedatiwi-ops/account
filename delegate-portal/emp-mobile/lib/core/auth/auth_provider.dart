import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../api/api_client.dart';
import '../api/api_exception.dart';

const _tokenKey = 'empToken';
const _employeeKey = 'empEmployee';

class AuthState {
  const AuthState({this.token, this.employee, this.loading = false});

  final String? token;
  final Employee? employee;
  final bool loading;

  bool get isAuthenticated => token != null && token!.isNotEmpty && employee != null;

  AuthState copyWith({String? token, Employee? employee, bool? loading}) => AuthState(
        token: token ?? this.token,
        employee: employee ?? this.employee,
        loading: loading ?? this.loading,
      );
}

class AuthNotifier extends Notifier<AuthState> {
  int _epoch = 0;

  @override
  AuthState build() {
    Future.microtask(restoreSession);
    return const AuthState(loading: true);
  }

  Future<SharedPreferences> get _prefs async => SharedPreferences.getInstance();

  Future<void> restoreSession() async {
    final epoch = _epoch;
    try {
      final token = (await _prefs).getString(_tokenKey);
      final empRaw = (await _prefs).getString(_employeeKey);
      if (epoch != _epoch) return;

      Employee? employee;
      if (empRaw != null) {
        employee = Employee.fromJson(Map<String, dynamic>.from(jsonDecode(empRaw) as Map));
      }

      if (token == null || token.isEmpty) {
        state = const AuthState(loading: false);
        return;
      }

      if (employee == null) {
        state = AuthState(token: token, loading: true);
        await _refresh(epoch, token);
        return;
      }

      state = AuthState(token: token, employee: employee, loading: false);
    } catch (_) {
      if (epoch != _epoch) return;
      state = const AuthState(loading: false);
    }
  }

  Future<void> _refresh(int epoch, String token) async {
    try {
      final me = await ref.read(apiClientProvider).me();
      if (epoch != _epoch) return;
      await (await _prefs).setString(_employeeKey, jsonEncode(me.toJson()));
      state = AuthState(token: token, employee: me, loading: false);
    } on ApiException catch (e) {
      if (epoch != _epoch) return;
      if (e.statusCode == 401) {
        await logout();
      } else {
        state = AuthState(token: token, loading: false);
      }
    } catch (_) {
      if (epoch != _epoch) return;
      state = AuthState(token: token, loading: false);
    }
  }

  Future<void> login(String username, String password) async {
    _epoch++;
    state = state.copyWith(loading: true);
    try {
      final result = await ref.read(apiClientProvider).login(username.trim(), password);
      await (await _prefs).setString(_tokenKey, result.token);
      await (await _prefs).setString(_employeeKey, jsonEncode(result.employee.toJson()));
      state = AuthState(token: result.token, employee: result.employee, loading: false);
    } catch (e) {
      state = const AuthState(loading: false);
      rethrow;
    }
  }

  Future<void> logout() async {
    _epoch++;
    await (await _prefs).remove(_tokenKey);
    await (await _prefs).remove(_employeeKey);
    state = const AuthState(loading: false);
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

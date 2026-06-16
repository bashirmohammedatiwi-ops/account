import 'dart:convert';

import 'package:dio/dio.dart';

import '../../config/app_config.dart';
import '../../models/models.dart';
import 'api_exception.dart';

class LoginResult {
  const LoginResult({required this.token, required this.agent});
  final String token;
  final Agent agent;
}

/// تسجيل دخول مباشر — بدون الاعتماد على authProvider (يتجنّب تعارض Riverpod).
Future<LoginResult> performLogin(
  AppConfig config,
  String username,
  String password,
) async {
  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  ));

  try {
    final res = await dio.post<dynamic>(
      '${config.apiBase}/login',
      data: {'username': username, 'password': password},
    );
    final data = _parseJsonMap(res.data);
    if (data['ok'] == false) {
      throw ApiException('${data['error'] ?? 'فشل تسجيل الدخول'}', statusCode: res.statusCode);
    }
    final token = data['token']?.toString();
    if (token == null || token.isEmpty) {
      throw ApiException('استجابة غير صحيحة من الخادم');
    }
    final agentRaw = data['agent'];
    if (agentRaw is! Map) {
      throw ApiException('استجابة غير صحيحة من الخادم');
    }
    return LoginResult(
      token: token,
      agent: Agent.fromJson(Map<String, dynamic>.from(agentRaw)),
    );
  } on ApiException {
    rethrow;
  } on DioException catch (e) {
    if (e.response?.statusCode == 401) {
      final body = e.response?.data;
      final msg = body is Map ? '${body['error'] ?? 'بيانات الدخول غير صحيحة'}' : 'بيانات الدخول غير صحيحة';
      throw ApiException(msg, statusCode: 401);
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      throw ApiException('فشل الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً');
    }
    final body = e.response?.data;
    if (body is Map && body['error'] != null) {
      throw ApiException('${body['error']}');
    }
    throw ApiException(e.message ?? 'فشل تسجيل الدخول');
  }
}

Map<String, dynamic> _parseJsonMap(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String && raw.isNotEmpty) {
    return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }
  return {};
}

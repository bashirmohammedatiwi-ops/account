import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../models/models.dart';
import '../auth/auth_provider.dart';
import 'api_exception.dart';
import 'login_api.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
    headers: {'Accept': 'application/json'},
  ));
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      final token = ref.read(authProvider).token;
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
      handler.next(options);
    },
    onError: (error, handler) {
      if (error.response?.statusCode == 401) {
        ref.read(authProvider.notifier).logout();
      }
      handler.next(error);
    },
  ));
  return dio;
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.read(dioProvider), ref);
});

class ApiClient {
  ApiClient(this._dio, this._ref);

  final Dio _dio;
  final Ref _ref;

  String get _base => _ref.read(appConfigProvider).apiBase;
  String get serverUrl => _ref.read(appConfigProvider).serverUrl;

  Future<Map<String, dynamic>> _json(String method, String path,
      {Map<String, dynamic>? body, Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.request<Map<String, dynamic>>(
        '$_base$path',
        data: body,
        queryParameters: query,
        options: Options(method: method, responseType: ResponseType.json),
      );
      final data = _parseMap(res.data);
      if (data['ok'] == false) {
        throw ApiException('${data['error'] ?? 'خطأ غير متوقع'}', statusCode: res.statusCode);
      }
      return data;
    } on DioException catch (e) {
      if (e.response?.data is Map) {
        throw ApiException('${(e.response!.data as Map)['error'] ?? e.message}');
      }
      throw ApiException(e.message ?? 'فشل الاتصال');
    }
  }

  Future<LoginResult> login(String username, String password) =>
      performLogin(_ref.read(appConfigProvider), username, password);

  Future<Employee> me() async {
    final data = await _json('GET', '/me');
    return Employee.fromJson(Map<String, dynamic>.from(data['employee'] as Map));
  }

  Future<List<PurchaseOrder>> listOrders({String? status}) async {
    final data = await _json('GET', '/orders', query: {
      if (status != null && status.isNotEmpty) 'status': status,
      'limit': 100,
    });
    return (data['orders'] as List)
        .map((e) => PurchaseOrder.fromJson(Map<String, dynamic>.from(e as Map), serverUrl: serverUrl))
        .toList();
  }

  Future<PurchaseOrder> getOrder(int id) async {
    final data = await _json('GET', '/orders/$id');
    return PurchaseOrder.fromJson(Map<String, dynamic>.from(data['order'] as Map), serverUrl: serverUrl);
  }

  Future<PurchaseOrder> setOrderStatus(int id, String status, {String? note}) async {
    final data = await _json('PATCH', '/orders/$id/status', body: {
      'status': status,
      if (note != null) 'note': note,
    });
    return PurchaseOrder.fromJson(Map<String, dynamic>.from(data['order'] as Map), serverUrl: serverUrl);
  }

  Future<PurchaseOrder> updateLine(int orderId, int lineId, {required num quant, required num bonus, required num tester}) async {
    final data = await _json('PATCH', '/orders/$orderId/lines/$lineId', body: {
      'quant': quant,
      'bonus': bonus,
      'tester': tester,
    });
    return PurchaseOrder.fromJson(Map<String, dynamic>.from(data['order'] as Map), serverUrl: serverUrl);
  }

  Future<PurchaseOrder> deleteLine(int orderId, int lineId) async {
    final data = await _json('DELETE', '/orders/$orderId/lines/$lineId');
    return PurchaseOrder.fromJson(Map<String, dynamic>.from(data['order'] as Map), serverUrl: serverUrl);
  }

  Future<OrderFeed> orderFeed({int sinceId = 0, String status = 'pending'}) async {
    final data = await _json('GET', '/orders/feed', query: {
      'sinceId': sinceId,
      'status': status,
    });
    return OrderFeed.fromJson(data, serverUrl: serverUrl);
  }

  Future<void> registerDevice(String token, {String platform = 'android'}) async {
    await _json('POST', '/devices', body: {'token': token, 'platform': platform});
  }

  Future<void> unregisterDevice(String token) async {
    await _json('DELETE', '/devices', body: {'token': token});
  }

  Map<String, dynamic> _parseMap(dynamic raw) {
    if (raw is Map<String, dynamic>) return raw;
    if (raw is Map) return Map<String, dynamic>.from(raw);
    if (raw is String && raw.isNotEmpty) {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    }
    return {};
  }
}

final appConfigProvider = Provider<AppConfig>((ref) => const AppConfig());

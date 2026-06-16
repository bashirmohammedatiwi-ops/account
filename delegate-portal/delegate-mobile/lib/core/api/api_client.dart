import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/app_config.dart';
import '../../models/models.dart';
import '../auth/auth_provider.dart';
import 'api_exception.dart';

class LoginResult {
  const LoginResult({required this.token, required this.agent});
  final String token;
  final Agent agent;
}

class ApiClient {
  ApiClient(this._dio, this._read);

  final Dio _dio;
  final Ref _read;

  String get _base => _read.read(appConfigProvider).apiBase;
  String get serverUrl => _read.read(appConfigProvider).serverUrl;

  Future<Map<String, dynamic>> _json(String method, String path,
      {Map<String, dynamic>? body, Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.request<Map<String, dynamic>>(
        '$_base$path',
        data: body,
        queryParameters: query,
        options: Options(method: method, responseType: ResponseType.json),
      );
      final data = res.data ?? {};
      if (data['ok'] == false) {
        throw ApiException('${data['error'] ?? 'خطأ غير متوقع'}', statusCode: res.statusCode);
      }
      return data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw ApiException('انتهت الجلسة — سجّل الدخول مجدداً', statusCode: 401);
      }
      final msg = _friendlyError(e);
      throw ApiException(msg, statusCode: e.response?.statusCode);
    }
  }

  String _friendlyError(DioException e) {
    if (e.response?.data is Map) {
      return '${(e.response!.data as Map)['error'] ?? e.message}';
    }
    if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
      return 'فشل الاتصال — تحقق من الشبكة وحاول مجدداً';
    }
    return e.message ?? 'فشل الاتصال — تحقق من الشبكة وحاول مجدداً';
  }

  Future<Uint8List> _bytes(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio.get<List<int>>(
        '$_base$path',
        queryParameters: query,
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(res.data ?? []);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw ApiException('انتهت الجلسة — سجّل الدخول مجدداً', statusCode: 401);
      }
      throw ApiException(e.message ?? 'فشل تحميل الملف', statusCode: e.response?.statusCode);
    }
  }

  Future<LoginResult> login(String username, String password) async {
    final data = await _json('POST', '/login', body: {'username': username, 'password': password});
    return LoginResult(
      token: data['token'] as String,
      agent: Agent.fromJson(Map<String, dynamic>.from(data['agent'] as Map)),
    );
  }

  Future<Agent> me() async {
    final data = await _json('GET', '/me');
    return Agent.fromJson(Map<String, dynamic>.from(data['agent'] as Map));
  }

  Future<List<AccountTree>> getTrees() async {
    final data = await _json('GET', '/trees');
    return (data['trees'] as List)
        .map((e) => AccountTree.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<BranchAccount>> getChildren(String seq) async {
    final data = await _json('GET', '/accounts/$seq/children');
    return (data['children'] as List)
        .map((e) => BranchAccount.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<AccountStatement> getStatement(String seq) async {
    final data = await _json('GET', '/accounts/$seq/statement');
    return AccountStatement.fromJson(data);
  }

  Future<Uint8List> getStatementPdf(String seq) => _bytes('/accounts/$seq/statement.pdf');

  Future<InvoiceDetail> getInvoice(String ref, {String by = 'auto', String? accSeq}) async {
    final data = await _json('GET', '/invoices/$ref', query: {
      'by': by,
      if (accSeq != null && accSeq.isNotEmpty) 'acc': accSeq,
    });
    return InvoiceDetail.fromJson(data);
  }

  Future<Uint8List> getInvoicePdf(String ref, {String by = 'auto', String? accSeq}) =>
      _bytes('/invoices/$ref.pdf', query: {
        'by': by,
        if (accSeq != null && accSeq.isNotEmpty) 'acc': accSeq,
      });

  Future<List<CatalogBranch>> getCatalogBranches() async {
    final data = await _json('GET', '/catalog/branches');
    return (data['branches'] as List)
        .map((e) => CatalogBranch.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<CatalogSection>> getCatalogSections(int branchId) async {
    final data = await _json('GET', '/catalog/branches/$branchId/sections');
    return (data['sections'] as List)
        .map((e) => CatalogSection.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<Product>> getProducts(int sectionId) async {
    final data = await _json('GET', '/catalog/sections/$sectionId/products');
    return (data['products'] as List)
        .map((e) => Product.fromJson(Map<String, dynamic>.from(e as Map), serverUrl: serverUrl))
        .toList();
  }

  Future<List<Order>> getOrders({String? status}) async {
    final data = await _json('GET', '/orders', query: status != null ? {'status': status} : null);
    return (data['orders'] as List)
        .map((e) => Order.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Order> getOrder(int id) async {
    final data = await _json('GET', '/orders/$id');
    return Order.fromJson(Map<String, dynamic>.from(data['order'] as Map));
  }

  Future<Order> submitOrder({
    required String? customerAccSeq,
    required int catalogBranchId,
    required String? notes,
    required List<OrderLine> lines,
  }) async {
    final data = await _json('POST', '/orders', body: {
      'customerAccSeq': customerAccSeq,
      'catalogBranchId': catalogBranchId,
      'notes': notes,
      'lines': lines.map((l) => l.toJson()).toList(),
      'submit': true,
    });
    return Order.fromJson(Map<String, dynamic>.from(data['order'] as Map));
  }

  Future<List<BranchAccount>> searchAccounts(String q) async {
    final data = await _json('GET', '/search', query: {'q': q});
    return (data['results'] as List? ?? [])
        .map((e) => BranchAccount.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<Product> lookupProduct(String code, {int? branchId}) async {
    final data = await _json('GET', '/products/lookup', query: {
      'code': code,
      if (branchId != null) 'branchId': branchId,
    });
    return Product.fromJson(Map<String, dynamic>.from(data['product'] as Map), serverUrl: serverUrl);
  }

  Future<SalesReportResult> getSalesReport({
    required String treeSeq,
    required String dateFrom,
    required String dateTo,
    int limit = 100,
    int offset = 0,
  }) async {
    final data = await _json('GET', '/reports/sales', query: {
      'treeSeq': treeSeq,
      'dateFrom': dateFrom,
      'dateTo': dateTo,
      'limit': limit,
      'offset': offset,
    });
    return SalesReportResult.fromJson(data);
  }
}

final dioProvider = Provider<Dio>((ref) {
  ref.watch(authProvider.select((s) => s.token));
  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 120),
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
    onError: (error, handler) async {
      if (error.response?.statusCode == 401) {
        final sent = error.requestOptions.headers['Authorization']?.toString();
        final token = ref.read(authProvider).token;
        final expected = token != null && token.isNotEmpty ? 'Bearer $token' : null;
        if (sent != null && sent == expected) {
          await ref.read(authProvider.notifier).logout();
        }
      }
      handler.next(error);
    },
  ));

  return dio;
});

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(ref.watch(dioProvider), ref));

final appConfigProvider = Provider<AppConfig>((ref) {
  throw UnimplementedError('AppConfig must be overridden');
});

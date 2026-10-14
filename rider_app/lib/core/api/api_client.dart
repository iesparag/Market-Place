import 'package:dio/dio.dart';
import '../config.dart';
import '../auth/token_store.dart';

/// Thrown when the API envelope has `ok: false` or a transport error occurs.
class ApiException implements Exception {
  final String message;
  final int? status;
  ApiException(this.message, {this.status});
  @override
  String toString() => message;
}

/// Thin wrapper over Dio: attaches `Authorization: Bearer <token>`, unwraps the
/// `{ ok, data, error }` envelope. No refresh flow — see token_store.dart for why.
class ApiClient {
  final TokenStore tokens;
  late final Dio _dio;

  /// Set once by the auth controller; called on a 401 so the app can route to login
  /// without every call site needing to know about session expiry.
  void Function()? onUnauthorized;

  ApiClient(this.tokens) {
    _dio = Dio(BaseOptions(
      baseUrl: Config.apiBaseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final t = await tokens.access();
        if (t != null) options.headers['Authorization'] = 'Bearer $t';
        handler.next(options);
      },
      onError: (e, handler) async {
        final isAuthCall = e.requestOptions.path.contains('/auth/');
        if (e.response?.statusCode == 401 && !isAuthCall) {
          await tokens.clear();
          onUnauthorized?.call();
        }
        handler.next(e);
      },
    ));
  }

  dynamic _unwrap(Response r) {
    final data = r.data;
    if (data is Map && data['ok'] == true) return data['data'];
    final msg = data is Map ? (data['error']?['message'] ?? 'Something went wrong') : 'Something went wrong';
    throw ApiException(msg.toString(), status: r.statusCode);
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      final r = await _dio.get(path, queryParameters: query);
      return _unwrap(r);
    } on DioException catch (e) {
      throw _fromDio(e);
    }
  }

  Future<dynamic> post(String path, {Object? body}) async {
    try {
      final r = await _dio.post(path, data: body);
      return _unwrap(r);
    } on DioException catch (e) {
      throw _fromDio(e);
    }
  }

  Future<dynamic> patch(String path, {Object? body}) async {
    try {
      final r = await _dio.patch(path, data: body);
      return _unwrap(r);
    } on DioException catch (e) {
      throw _fromDio(e);
    }
  }

  ApiException _fromDio(DioException e) {
    final data = e.response?.data;
    final msg = data is Map ? (data['error']?['message'] ?? e.message) : e.message;
    return ApiException((msg ?? 'Network error').toString(), status: e.response?.statusCode);
  }
}

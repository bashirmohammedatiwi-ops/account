class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

extension ApiErrorDisplay on Object {
  String get displayMessage => this is ApiException ? (this as ApiException).message : toString();
}

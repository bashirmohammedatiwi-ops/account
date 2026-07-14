/// عنوان الخادم — غيّره عند النشر أو من شاشة الإعدادات لاحقاً.
const defaultServerUrl = 'http://187.124.23.65:5005';

class AppConfig {
  const AppConfig({this.serverUrl = defaultServerUrl});

  final String serverUrl;

  String get apiBase => '$serverUrl/api/emp';
}

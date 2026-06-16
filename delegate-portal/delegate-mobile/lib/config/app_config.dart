/// عنوان الخادم ثابت — لا يُعرض للمستخدم في التطبيق.
const defaultServerUrl = 'http://187.124.23.65:5005';

class AppConfig {
  const AppConfig();

  String get serverUrl => defaultServerUrl;

  String get apiBase => '$serverUrl/api/mobile';
}

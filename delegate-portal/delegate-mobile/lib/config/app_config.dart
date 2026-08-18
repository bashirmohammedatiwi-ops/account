/// عنوان الخادم الافتراضي.
const defaultServerUrl = 'http://187.124.23.65:5005';

class AppConfig {
  const AppConfig([String? serverUrl]) : _serverUrl = serverUrl;

  final String? _serverUrl;

  String get serverUrl {
    final custom = _serverUrl?.trim();
    return (custom != null && custom.isNotEmpty) ? custom : defaultServerUrl;
  }

  String get apiBase => '$serverUrl/api/mobile';

  bool get isCustom {
    final custom = _serverUrl?.trim();
    return custom != null && custom.isNotEmpty && custom != defaultServerUrl;
  }
}

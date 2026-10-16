/// إصدار التطبيق المعروض للمندوب — يُحدَّث مع pubspec.yaml.
const appVersion = '1.3.3';

/// عنوان الخادم الافتراضي — يمكن تجاوزه للتطوير عبر
/// `--dart-define=EDARI_SERVER_URL=http://localhost:5005`.
const defaultServerUrl = String.fromEnvironment(
  'EDARI_SERVER_URL',
  defaultValue: 'http://187.124.23.65:5005',
);

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

import 'package:shared_preferences/shared_preferences.dart';

const _serverUrlKey = 'delegate_server_url';
const defaultServerUrl = 'http://187.124.23.65:5005';

class AppConfig {
  AppConfig(this._prefs);

  final SharedPreferences _prefs;

  String get serverUrl {
    final v = _prefs.getString(_serverUrlKey)?.trim();
    return (v == null || v.isEmpty) ? defaultServerUrl : v.replaceAll(RegExp(r'/$'), '');
  }

  String get apiBase => '$serverUrl/api/mobile';

  Future<void> setServerUrl(String url) async {
    await _prefs.setString(_serverUrlKey, url.trim().replaceAll(RegExp(r'/$'), ''));
  }
}

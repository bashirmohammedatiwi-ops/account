import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../config/app_config.dart';

const serverUrlPrefsKey = 'delegateServerUrl';

class AppConfigNotifier extends Notifier<AppConfig> {
  @override
  AppConfig build() {
    Future.microtask(_loadSaved);
    return const AppConfig();
  }

  Future<void> _loadSaved() async {
    final prefs = await SharedPreferences.getInstance();
    final url = prefs.getString(serverUrlPrefsKey)?.trim();
    if (url != null && url.isNotEmpty) {
      state = AppConfig(url);
    }
  }

  Future<void> setServerUrl(String raw) async {
    var url = raw.trim().replaceAll(RegExp(r'/$'), '');
    if (url.isEmpty) throw ArgumentError('عنوان الخادم مطلوب');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://$url';
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(serverUrlPrefsKey, url);
    state = AppConfig(url);
  }

  Future<void> resetServerUrl() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(serverUrlPrefsKey);
    state = const AppConfig();
  }
}

final appConfigProvider = NotifierProvider<AppConfigNotifier, AppConfig>(AppConfigNotifier.new);

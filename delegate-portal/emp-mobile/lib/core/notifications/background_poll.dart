import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import '../../config/app_config.dart';

const empBackgroundTaskName = 'empOrderPoll';
const lastOrderIdKey = 'empLastSeenOrderId';
const lastReminderKey = 'empLastReminderAt';
const tokenKey = 'empToken';

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    await runBackgroundOrderPoll();
    return Future.value(true);
  });
}

Future<void> runBackgroundOrderPoll() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final token = prefs.getString(tokenKey);
  if (token == null || token.isEmpty) return;

  final notifications = FlutterLocalNotificationsPlugin();
  const android = AndroidInitializationSettings('@mipmap/ic_launcher');
  await notifications.initialize(const InitializationSettings(android: android));
  await notifications
      .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
      ?.requestNotificationsPermission();

  final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 25),
    receiveTimeout: const Duration(seconds: 25),
    headers: {'Authorization': 'Bearer $token', 'Accept': 'application/json'},
  ));
  final base = '${defaultServerUrl}/api/emp';

  try {
    final sinceId = prefs.getInt(lastOrderIdKey) ?? 0;
    final res = await dio.get<Map<String, dynamic>>('$base/orders/feed', queryParameters: {
      'sinceId': sinceId,
      'status': 'pending',
    });
    final data = _map(res.data);
    if (data['ok'] != false) {
      final latest = data['latest'];
      final latestId = latest is Map ? (latest['id'] as num?)?.toInt() ?? sinceId : sinceId;
      if (latestId > sinceId) await prefs.setInt(lastOrderIdKey, latestId);

      final newOrders = data['newOrders'] as List? ?? [];
      for (final raw in newOrders) {
        if (raw is! Map) continue;
        final isShorja = '${raw['sourceType']}' == 'shorja';
        final title = isShorja ? 'طلب تجهيز شورجة' : 'طلب شراء جديد';
        final customer = raw['customerName'] ?? (isShorja ? raw['shorjaBranchName'] : null) ?? 'بدون زبون';
        await _showNotification(notifications, title, '${raw['orderNo']} · $customer');
      }
    }
  } catch (_) {}

  final lastReminder = prefs.getInt(lastReminderKey) ?? 0;
  final now = DateTime.now().millisecondsSinceEpoch;
  if (now - lastReminder < 15 * 60 * 1000) return;

  try {
    final res = await dio.get<Map<String, dynamic>>('$base/orders/feed', queryParameters: {'status': 'pending'});
    final data = _map(res.data);
    final n = data['pendingCount'] as int? ?? 0;
    if (n > 0) {
      await prefs.setInt(lastReminderKey, now);
      await _showNotification(notifications, 'تذكير تجهيز', '$n طلب بانتظار التجهيز');
    }
  } catch (_) {}
}

Map<String, dynamic> _map(dynamic raw) {
  if (raw is Map<String, dynamic>) return raw;
  if (raw is Map) return Map<String, dynamic>.from(raw);
  if (raw is String && raw.isNotEmpty) return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  return {};
}

Future<void> _showNotification(FlutterLocalNotificationsPlugin plugin, String title, String body) async {
  await plugin.show(
    DateTime.now().millisecondsSinceEpoch ~/ 1000,
    title,
    body,
    const NotificationDetails(
      android: AndroidNotificationDetails(
        'emp_orders',
        'طلبات التجهيز',
        channelDescription: 'إشعارات طلبات الشراء الجديدة والتذكير',
        importance: Importance.high,
        priority: Priority.high,
        playSound: true,
        enableVibration: true,
      ),
    ),
  );
}

Future<void> scheduleBackgroundPolling() async {
  await Workmanager().registerPeriodicTask(
    empBackgroundTaskName,
    empBackgroundTaskName,
    frequency: const Duration(minutes: 15),
    existingWorkPolicy: ExistingWorkPolicy.keep,
    constraints: Constraints(networkType: NetworkType.connected),
  );
}

Future<void> cancelBackgroundPolling() async {
  await Workmanager().cancelByUniqueName(empBackgroundTaskName);
}

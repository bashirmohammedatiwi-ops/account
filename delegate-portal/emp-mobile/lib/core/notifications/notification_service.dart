import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api/api_client.dart';
import '../auth/auth_provider.dart';
import 'background_poll.dart';

const _lastOrderIdKey = 'empLastSeenOrderId';
const _lastReminderKey = 'empLastReminderAt';

final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = NotificationService(ref);
  ref.onDispose(service.dispose);
  return service;
});

class NotificationService {
  NotificationService(this._ref);

  final Ref _ref;
  final _notifications = FlutterLocalNotificationsPlugin();
  Timer? _pollTimer;
  Timer? _reminderTimer;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _notifications.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
    await _notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    await _notifications
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    _initialized = true;
  }

  Future<void> start() async {
    await init();
    _pollTimer?.cancel();
    _reminderTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 45), (_) => poll());
    _reminderTimer = Timer.periodic(const Duration(minutes: 1), (_) => checkReminder());
    await poll(seed: true);
    await _registerFcmIfAvailable();
    await scheduleBackgroundPolling();
  }

  void stop() {
    _pollTimer?.cancel();
    _reminderTimer?.cancel();
    _pollTimer = null;
    _reminderTimer = null;
    unawaited(cancelBackgroundPolling());
  }

  void dispose() => stop();

  Future<void> requestPermission() async {
    await init();
    await _notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
    await _registerFcmIfAvailable();
    await scheduleBackgroundPolling();
    await poll(seed: true);
  }

  Future<void> unregisterDeviceToken() async {
    if (kIsWeb || Firebase.apps.isEmpty) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token.isNotEmpty) {
        await _ref.read(apiClientProvider).unregisterDevice(token);
      }
    } catch (e) {
      debugPrint('unregisterDevice: $e');
    }
  }

  Future<void> _registerFcmIfAvailable() async {
    if (kIsWeb || Firebase.apps.isEmpty) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty && _ref.read(authProvider).isAuthenticated) {
        await _ref.read(apiClientProvider).registerDevice(token);
        debugPrint('[emp] FCM token registered');
      } else if (token == null) {
        debugPrint('[emp] FCM token unavailable — using polling notifications');
      }
      messaging.onTokenRefresh.listen((token) async {
        if (_ref.read(authProvider).isAuthenticated) {
          await _ref.read(apiClientProvider).registerDevice(token);
        }
      });
      FirebaseMessaging.onMessage.listen((message) {
        final n = message.notification;
        showLocal(
          title: n?.title ?? 'طلب جديد',
          body: n?.body ?? '',
          payload: message.data['orderId'] != null ? 'order:${message.data['orderId']}' : null,
        );
      });
    } catch (e) {
      debugPrint('FCM unavailable: $e');
    }
  }

  Future<void> poll({bool seed = false}) async {
    if (!_ref.read(authProvider).isAuthenticated) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final sinceId = seed ? 0 : (prefs.getInt(_lastOrderIdKey) ?? 0);
      final feed = await _ref.read(apiClientProvider).orderFeed(sinceId: sinceId);
      final latestId = feed.latest?.id ?? sinceId;
      if (latestId > sinceId) {
        await prefs.setInt(_lastOrderIdKey, latestId);
      }
      if (!seed && feed.newOrders.isNotEmpty) {
        for (final order in feed.newOrders) {
          await showLocal(
            title: order.isShorja ? 'طلب تجهيز شورجة' : 'طلب شراء جديد',
            body: '${order.orderNo} · ${order.customerName ?? order.shorjaBranchName ?? 'بدون زبون'}',
            payload: 'order:${order.id}',
          );
        }
      }
    } catch (e) {
      debugPrint('poll failed: $e');
    }
  }

  Future<void> checkReminder() async {
    if (!_ref.read(authProvider).isAuthenticated) return;
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getInt(_lastReminderKey) ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - last < 15 * 60 * 1000) return;
    try {
      final feed = await _ref.read(apiClientProvider).orderFeed();
      if (feed.pendingCount > 0) {
        await prefs.setInt(_lastReminderKey, DateTime.now().millisecondsSinceEpoch);
        await showLocal(
          title: 'تذكير تجهيز',
          body: '${feed.pendingCount} طلب بانتظار التجهيز',
        );
      }
    } catch (e) {
      debugPrint('reminder failed: $e');
    }
  }

  Future<void> showLocal({required String title, required String body, String? payload}) async {
    await _notifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'emp_orders',
          'طلبات التجهيز',
          channelDescription: 'إشعارات طلبات الشراء الجديدة',
          importance: Importance.high,
          priority: Priority.high,
          playSound: true,
          enableVibration: true,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload,
    );
  }
}

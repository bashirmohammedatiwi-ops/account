import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';
import 'thermal_escpos_print.dart';

const _printerMacKey = 'thermal_printer_mac';
const _printerNameKey = 'thermal_printer_name';
const _templateKey = 'delivery_print_template_json';

class PrinterStatus {
  const PrinterStatus({
    required this.permissionGranted,
    required this.bluetoothOn,
    required this.connected,
    this.savedMac,
    this.savedName,
  });

  final bool permissionGranted;
  final bool bluetoothOn;
  final bool connected;
  final String? savedMac;
  final String? savedName;

  bool get hasSavedPrinter => savedMac != null && savedMac!.isNotEmpty;
  bool get isReady => permissionGranted && bluetoothOn && hasSavedPrinter;

  String get label {
    if (!permissionGranted) return 'يحتاج إذن البلوتوث — من إعدادات الطابعة';
    if (!bluetoothOn) return 'البلوتوث مغلق — فعّله من إعدادات الجهاز';
    if (connected) {
      return savedName?.trim().isNotEmpty == true ? 'متصل: ${savedName!.trim()}' : 'متصل بالطابعة';
    }
    if (hasSavedPrinter) {
      final name = savedName?.trim();
      if (name != null && name.isNotEmpty) return 'الطابعة: $name — غير متصل';
      return 'طابعة محفوظة — غير متصل';
    }
    return 'لم تُختر طابعة بعد — من الإعدادات';
  }
}

class ThermalPrintService {
  ThermalPrintService._();

  static const _connectTimeout = Duration(seconds: 15);
  static const _printTimeout = Duration(seconds: 45);
  static const _statusTimeout = Duration(seconds: 8);

  static Map<String, dynamic>? _cachedTemplate;

  static bool get isSupported => !kIsWeb;

  static bool _isOk(dynamic result) => result == true;

  static Future<bool> _writeBytes(List<int> bytes) async {
    if (bytes.isEmpty) return false;
    try {
      final ok = await PrintBluetoothThermal.writeBytes(bytes);
      return _isOk(ok);
    } catch (_) {
      return false;
    }
  }

  static Future<void> _disconnectQuiet() async {
    try {
      await PrintBluetoothThermal.disconnect.timeout(const Duration(seconds: 4), onTimeout: () => false);
    } catch (_) {}
  }

  static Future<void> cacheTemplate(Map<String, dynamic>? template) async {
    _cachedTemplate = template;
    final prefs = await SharedPreferences.getInstance();
    if (template == null) {
      await prefs.remove(_templateKey);
      return;
    }
    await prefs.setString(_templateKey, jsonEncode(template));
  }

  static Future<Map<String, dynamic>?> loadCachedTemplate() async {
    if (_cachedTemplate != null) return _cachedTemplate;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_templateKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      _cachedTemplate = Map<String, dynamic>.from(jsonDecode(raw) as Map);
      return _cachedTemplate;
    } catch (_) {
      return null;
    }
  }

  static Future<bool> ensurePermissions({bool requestIfNeeded = true}) async {
    if (kIsWeb) return false;
    try {
      if (Platform.isAndroid) {
        final connect = requestIfNeeded
            ? await Permission.bluetoothConnect.request()
            : await Permission.bluetoothConnect.status;
        if (!connect.isGranted) return false;

        final scan = requestIfNeeded
            ? await Permission.bluetoothScan.request()
            : await Permission.bluetoothScan.status;
        if (!scan.isGranted) return false;
      }

      return await PrintBluetoothThermal.isPermissionBluetoothGranted
          .timeout(_statusTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isBluetoothOn() async {
    if (kIsWeb) return false;
    if (!await ensurePermissions()) return false;
    try {
      return await PrintBluetoothThermal.bluetoothEnabled.timeout(_statusTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<String?> savedMac() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_printerMacKey);
  }

  static Future<String?> savedName() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_printerNameKey);
  }

  static Future<void> savePrinter(String mac, {String? name}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_printerMacKey, mac);
    if (name != null && name.trim().isNotEmpty) {
      await prefs.setString(_printerNameKey, name.trim());
    }
  }

  static Future<void> forgetPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_printerMacKey);
    await prefs.remove(_printerNameKey);
    await _disconnectQuiet();
  }

  static Future<List<BluetoothInfo>> scanPrinters() async {
    if (kIsWeb) return [];
    if (!await ensurePermissions()) return [];
    try {
      return await PrintBluetoothThermal.pairedBluetooths
          .timeout(_connectTimeout, onTimeout: () => <BluetoothInfo>[]);
    } catch (_) {
      return [];
    }
  }

  static Future<bool> connect(String mac, {String? name, bool saveOnSuccess = true}) async {
    if (kIsWeb) return false;
    if (!await ensurePermissions()) return false;
    if (!await isBluetoothOn()) return false;
    await _disconnectQuiet();
    try {
      final ok = await PrintBluetoothThermal.connect(macPrinterAddress: mac)
          .timeout(_connectTimeout, onTimeout: () => false);
      if (ok && saveOnSuccess) await savePrinter(mac, name: name);
      return ok;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> selectAndConnectPrinter(BluetoothInfo device) async {
    await savePrinter(device.macAdress, name: device.name);
    return await connect(device.macAdress, name: device.name, saveOnSuccess: false);
  }

  static Future<bool> connectSaved() async {
    final mac = await savedMac();
    if (mac == null || mac.isEmpty) return false;
    return await connect(mac, name: await savedName(), saveOnSuccess: false);
  }

  static Future<bool> isConnected() async {
    if (kIsWeb) return false;
    if (!await ensurePermissions(requestIfNeeded: false)) return false;
    try {
      return await PrintBluetoothThermal.connectionStatus.timeout(_statusTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<PrinterStatus> status({bool requestPermissions = false}) async {
    if (kIsWeb) {
      return const PrinterStatus(permissionGranted: false, bluetoothOn: false, connected: false);
    }
    final mac = await savedMac();
    final name = await savedName();
    final perm = await ensurePermissions(requestIfNeeded: requestPermissions);
    if (!perm) {
      return PrinterStatus(
        permissionGranted: false,
        bluetoothOn: false,
        connected: false,
        savedMac: mac,
        savedName: name,
      );
    }
    final bt = await isBluetoothOn();
    if (!bt) {
      return PrinterStatus(
        permissionGranted: true,
        bluetoothOn: false,
        connected: false,
        savedMac: mac,
        savedName: name,
      );
    }
    final connected = await isConnected();
    return PrinterStatus(
      permissionGranted: true,
      bluetoothOn: true,
      connected: connected,
      savedMac: mac,
      savedName: name,
    );
  }

  static Future<bool> ensureConnected({int retries = 2}) async {
    if (await isConnected()) return true;
    for (var i = 0; i <= retries; i++) {
      if (await connectSaved()) return true;
      await Future<void>.delayed(Duration(milliseconds: 500 * (i + 1)));
    }
    return false;
  }

  static Future<bool> printDeliveryReceipt(
    DeliveryReceipt receipt, {
    String? agentName,
    Map<String, dynamic>? template,
    String? serverUrl,
  }) async {
    if (kIsWeb) return false;
    try {
      return await _printDeliveryReceiptImpl(
        receipt,
        agentName: agentName,
        template: template,
        serverUrl: serverUrl,
      ).timeout(_printTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> printTestPage({String? agentName, Map<String, dynamic>? template, String? serverUrl}) async {
    if (kIsWeb) return false;
    if (!await ensureConnected()) return false;
    try {
      final tpl = template ?? await loadCachedTemplate();
      final bytes = await buildTestPrintBytes(agentName: agentName, template: tpl, serverUrl: serverUrl);
      return await _writeBytes(bytes);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> _printDeliveryReceiptImpl(
    DeliveryReceipt receipt, {
    String? agentName,
    Map<String, dynamic>? template,
    String? serverUrl,
  }) async {
    if (!await ensureConnected()) return false;

    final tpl = template ?? await loadCachedTemplate();
    final payload = buildDeliveryReceiptPrintBlocks(receipt, template: tpl, agentName: agentName);
    final bytes = await buildEscPosBytesFromPayload(payload, serverUrl: serverUrl);
    return await _writeBytes(bytes);
  }
}

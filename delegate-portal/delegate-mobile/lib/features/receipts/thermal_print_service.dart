import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';

const _printerMacKey = 'thermal_printer_mac';
const _printerNameKey = 'thermal_printer_name';
const _templateKey = 'delivery_print_template_json';

class PrinterStatus {
  const PrinterStatus({
    required this.bluetoothOn,
    required this.connected,
    this.savedMac,
    this.savedName,
  });

  final bool bluetoothOn;
  final bool connected;
  final String? savedMac;
  final String? savedName;

  bool get hasSavedPrinter => savedMac != null && savedMac!.isNotEmpty;

  String get label {
    if (!bluetoothOn) return 'البلوتوث غير مفعّل';
    if (connected) return savedName?.isNotEmpty == true ? 'متصل: ${savedName!}' : 'متصل بالطابعة';
    if (hasSavedPrinter) return 'غير متصل — اضغط ربط الطابعة';
    return 'لم تُربط طابعة بعد';
  }
}

class ThermalPrintService {
  ThermalPrintService._();

  static const _connectTimeout = Duration(seconds: 12);
  static const _printTimeout = Duration(seconds: 20);
  static const _statusTimeout = Duration(seconds: 4);

  static Map<String, dynamic>? _cachedTemplate;

  static bool get isSupported => !kIsWeb;

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

  static Future<bool> isBluetoothOn() async {
    if (kIsWeb) return false;
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

  static Future<List<BluetoothInfo>> scanPrinters() async {
    if (kIsWeb) return [];
    try {
      return await PrintBluetoothThermal.pairedBluetooths.timeout(_connectTimeout, onTimeout: () => <BluetoothInfo>[]);
    } catch (_) {
      return [];
    }
  }

  static Future<bool> connect(String mac, {String? name}) async {
    if (kIsWeb) return false;
    try {
      final ok = await PrintBluetoothThermal.connect(macPrinterAddress: mac).timeout(_connectTimeout, onTimeout: () => false);
      if (ok) await savePrinter(mac, name: name);
      return ok;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> connectSaved() async {
    final mac = await savedMac();
    if (mac == null || mac.isEmpty) return false;
    return await connect(mac, name: await savedName());
  }

  static Future<bool> isConnected() async {
    if (kIsWeb) return false;
    try {
      return await PrintBluetoothThermal.connectionStatus.timeout(_statusTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<PrinterStatus> status() async {
    if (kIsWeb) {
      return const PrinterStatus(bluetoothOn: false, connected: false);
    }
    final bt = await isBluetoothOn();
    final mac = await savedMac();
    final name = await savedName();
    if (!bt) {
      return PrinterStatus(bluetoothOn: false, connected: false, savedMac: mac, savedName: name);
    }
    final connected = await isConnected();
    return PrinterStatus(bluetoothOn: true, connected: connected, savedMac: mac, savedName: name);
  }

  static Future<bool> ensureConnected() async {
    if (await isConnected()) return true;
    return await connectSaved();
  }

  static Future<bool> printDeliveryReceipt(
    DeliveryReceipt receipt, {
    String? agentName,
    Map<String, dynamic>? template,
  }) async {
    if (kIsWeb) return false;
    try {
      return await _printDeliveryReceiptImpl(receipt, agentName: agentName, template: template).timeout(_printTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> _printDeliveryReceiptImpl(
    DeliveryReceipt receipt, {
    String? agentName,
    Map<String, dynamic>? template,
  }) async {
    if (!await ensureConnected()) return false;

    final tpl = template ?? await loadCachedTemplate();
    final lines = buildDeliveryReceiptPrintLines(receipt, template: tpl, agentName: agentName);
    for (final line in lines) {
      final ok = await PrintBluetoothThermal.writeString(
        printText: PrintTextSize(size: line.size, text: '${line.text}\n'),
      );
      if (!ok) return false;
    }
    return true;
  }
}

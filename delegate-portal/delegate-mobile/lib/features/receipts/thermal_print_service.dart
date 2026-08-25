import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';
import 'ios_ble_thermal_printer.dart';
import 'mobile_receipt_print_defaults.dart';
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

  static const _connectTimeout = Duration(seconds: 90);
  static const _scanTimeout = Duration(seconds: 12);
  static const _printTimeout = Duration(seconds: 150);
  static const _statusTimeout = Duration(seconds: 8);

  static Map<String, dynamic>? _cachedTemplate;

  static bool get isSupported => !kIsWeb;

  static String? _localError;

  /// آخر سبب فشل — يُعرض للمستخدم بدل رسالة عامة.
  static String? get lastError {
    if (_localError != null) return _localError;
    if (!kIsWeb && Platform.isIOS) return IosBleThermalPrinter.lastError;
    return null;
  }

  static bool get _useIosBle => !kIsWeb && Platform.isIOS && IosBleThermalPrinter.isActive;

  static bool _isOk(dynamic result) => result == true;

  static Future<bool> _writeBytes(List<int> bytes) async {
    if (bytes.isEmpty) return false;
    try {
      if (_useIosBle) return await IosBleThermalPrinter.writeBytes(bytes);
      final ok = await PrintBluetoothThermal.writeBytes(bytes);
      return _isOk(ok);
    } catch (_) {
      return false;
    }
  }

  static Future<void> _disconnectQuiet() async {
    if (kIsWeb) return;
    try {
      if (_useIosBle) {
        await IosBleThermalPrinter.disconnect();
        return;
      }
      if (Platform.isIOS && !await isConnected()) return;
      await PrintBluetoothThermal.disconnect.timeout(const Duration(seconds: 4), onTimeout: () => false);
    } catch (_) {}
  }

  static bool _isValidIosBleId(String id) {
    final trimmed = id.trim();
    return trimmed.isNotEmpty && Uuid.isValidUUID(fromString: trimmed);
  }

  static Future<void> cacheTemplate(Map<String, dynamic>? template) async {
    if (template == null) return;
    _cachedTemplate = Map<String, dynamic>.from(template);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_templateKey, jsonEncode(_cachedTemplate));
  }

  static Future<Map<String, dynamic>> loadCachedTemplate() async {
    if (_cachedTemplate != null) return Map<String, dynamic>.from(_cachedTemplate!);
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_templateKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        _cachedTemplate = Map<String, dynamic>.from(jsonDecode(raw) as Map);
        return Map<String, dynamic>.from(_cachedTemplate!);
      } catch (_) {}
    }
    return Map<String, dynamic>.from(kFallbackReceiptPrintTemplate);
  }

  static Future<Map<String, dynamic>> ensureAdminTemplate({
    Future<Map<String, dynamic>?> Function()? fetchFromServer,
  }) async {
    if (fetchFromServer != null) {
      try {
        final remote = await fetchFromServer();
        if (remote != null && remote.isNotEmpty) {
          await cacheTemplate(remote);
          return normalizeAdminPrintTemplate(remote);
        }
      } catch (_) {}
    }
    final cached = await loadCachedTemplate();
    return normalizeAdminPrintTemplate(cached);
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

      if (_useIosBle) return await IosBleThermalPrinter.isSupported();

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
      if (_useIosBle) return await IosBleThermalPrinter.isBluetoothOn();
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

  static List<BluetoothInfo> _toInfo(List<IosBlePrinterDevice> devices) {
    return devices.map((d) => BluetoothInfo(name: d.name, macAdress: d.id)).toList();
  }

  static Future<List<BluetoothInfo>> scanPrinters({
    void Function(List<BluetoothInfo> devices)? onUpdate,
  }) async {
    if (kIsWeb) return [];
    if (!await ensurePermissions()) return [];
    try {
      if (_useIosBle) {
        final bleDevices = await IosBleThermalPrinter.scan(
          timeout: _scanTimeout,
          onUpdate: onUpdate == null ? null : (list) => onUpdate(_toInfo(list)),
        );
        return _toInfo(bleDevices);
      }

      final list = await PrintBluetoothThermal.pairedBluetooths
          .timeout(_scanTimeout, onTimeout: () => <BluetoothInfo>[]);
      return list;
    } catch (_) {
      return [];
    }
  }

  static Future<bool> connect(String mac, {String? name, bool saveOnSuccess = true}) async {
    if (kIsWeb) return false;
    _localError = null;
    if (!await ensurePermissions()) {
      _localError = 'إذن البلوتوث غير ممنوح للتطبيق';
      return false;
    }
    if (!await isBluetoothOn()) {
      _localError = 'البلوتوث مغلق — فعّله ثم أعد المحاولة';
      return false;
    }
    try {
      var address = mac.trim();
      var resolvedName = name?.trim();

      if (_useIosBle) {
        // معرّف قديم غير صالح؟ نعتمد على الاسم بدل الرفض المباشر.
        final lookupId = _isValidIosBleId(address) ? address : '';
        if (lookupId.isEmpty && (resolvedName == null || resolvedName.isEmpty)) {
          _localError = 'معرّف الطابعة المحفوظ غير صالح — احذفها وأعد اختيارها';
          return false;
        }
        final ok = await IosBleThermalPrinter.connect(lookupId, nameHint: resolvedName)
            .timeout(_connectTimeout, onTimeout: () => false);
        if (ok && saveOnSuccess) {
          final linkedId = IosBleThermalPrinter.linkedDeviceId ?? address;
          await savePrinter(linkedId, name: resolvedName ?? name);
        } else if (ok) {
          // نحدّث المعرّف المحفوظ إن كان قديماً/غير صالح.
          final linkedId = IosBleThermalPrinter.linkedDeviceId;
          if (linkedId != null && linkedId != address) {
            await savePrinter(linkedId, name: resolvedName ?? name);
          }
        }
        return ok;
      }

      await _disconnectQuiet();

      var ok = await PrintBluetoothThermal.connect(macPrinterAddress: address)
          .timeout(_connectTimeout, onTimeout: () => false);
      if (ok && saveOnSuccess) await savePrinter(address, name: resolvedName);
      if (!ok) _localError = 'لم تستجب الطابعة لطلب الاتصال';
      return ok;
    } catch (e) {
      _localError = 'خطأ أثناء الاتصال: $e';
      return false;
    }
  }

  static Future<bool> selectAndConnectPrinter(BluetoothInfo device) async {
    return await connect(device.macAdress.trim(), name: device.name, saveOnSuccess: true);
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
      if (_useIosBle) return await IosBleThermalPrinter.isConnected();
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

  static Future<bool> ensureConnected({int retries = 1}) async {
    if (await isConnected()) return true;
    // على iOS تتكفّل IosBleThermalPrinter بإعادة المحاولة داخلياً،
    // فتكرارها هنا يضاعف زمن الانتظار بلا فائدة.
    final attempts = _useIosBle ? 0 : retries;
    for (var i = 0; i <= attempts; i++) {
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
    Future<Map<String, dynamic>?> Function()? fetchTemplate,
  }) async {
    if (kIsWeb) return false;
    try {
      return await _printDeliveryReceiptImpl(
        receipt,
        agentName: agentName,
        template: template,
        serverUrl: serverUrl,
        fetchTemplate: fetchTemplate,
      ).timeout(_printTimeout, onTimeout: () => false);
    } catch (_) {
      return false;
    }
  }

  static Future<bool> printTestPage({
    String? agentName,
    Map<String, dynamic>? template,
    String? serverUrl,
    Future<Map<String, dynamic>?> Function()? fetchTemplate,
  }) async {
    if (kIsWeb) return false;
    if (!await ensureConnected()) return false;
    try {
      final tpl = template != null
          ? normalizeAdminPrintTemplate(template)
          : await ensureAdminTemplate(fetchFromServer: fetchTemplate);
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
    Future<Map<String, dynamic>?> Function()? fetchTemplate,
  }) async {
    if (!await ensureConnected()) return false;

    final tpl = template != null
        ? normalizeAdminPrintTemplate(template)
        : await ensureAdminTemplate(fetchFromServer: fetchTemplate);
    final payload = buildDeliveryReceiptPrintBlocks(receipt, template: tpl, agentName: agentName);
    final bytes = await buildEscPosBytesFromPayload(payload, serverUrl: serverUrl);
    return await _writeBytes(bytes);
  }
}

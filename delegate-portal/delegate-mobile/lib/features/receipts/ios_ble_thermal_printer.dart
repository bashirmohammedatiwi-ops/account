import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

class IosBlePrinterDevice {
  const IosBlePrinterDevice({
    required this.id,
    required this.name,
    this.likelyPrinter = false,
  });

  final String id;
  final String name;
  final bool likelyPrinter;
}

/// iOS BLE printing the same way POS Printer / 4barcode work:
/// scan all named devices, connect the discovered peripheral, write ESC/POS.
class IosBleThermalPrinter {
  IosBleThermalPrinter._();

  static final Map<String, BluetoothDevice> _cache = {};
  static final Map<String, String> _names = {};

  static BluetoothDevice? _device;
  static BluetoothCharacteristic? _writeChar;
  static String? _linkedDeviceId;
  static String? _lastError;

  /// أكبر حجم دفعة مسموح به، ونوع الكتابة المُعتمد بعد فحص خصائص الطابعة.
  static int _payload = 20;
  static bool _withResponse = true;

  static String? get linkedDeviceId => _linkedDeviceId;
  static String? get lastError => _lastError;

  static bool get isActive => !kIsWeb && Platform.isIOS;

  static const _writeKeys = [
    '2af1', '2af0', 'ffe1', 'ffe2', 'ae01', 'ae02', 'ae03',
    'ff02', 'ff01', '6e400002', 'bef8d6c9', '8841', '2a05',
  ];

  static const _gapKeys = ['1800', '1801', '180a', '180f', '1812'];

  static const _printerHints = [
    '4b-', '2033pa', '2043pa', 'axis', 'bx10', 'powered by', '4barcode',
    'printer', 'thermal', 'barcode', 'xprinter', 'goojprt', 'mpt', 'rpp', 'tsc',
  ];

  /// Services iOS allows us to query for already-connected system peripherals.
  static final _systemServiceFilters = [
    Guid('18F0'),
    Guid('FFE0'),
    Guid('FF00'),
    Guid('AE30'),
    Guid('1101'),
    Guid('1800'),
  ];

  static Future<bool> isSupported() async {
    if (!isActive) return false;
    try {
      return await FlutterBluePlus.isSupported;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> isBluetoothOn() async {
    if (!isActive) return false;
    try {
      if (!await isSupported()) return false;
      // CoreBluetooth يبدأ بحالة unknown/resetting بعد الإقلاع مباشرة،
      // لذا ننتظر أول حالة نهائية بدل قراءة القيمة الأولى.
      final state = await FlutterBluePlus.adapterState
          .firstWhere((s) =>
              s != BluetoothAdapterState.unknown &&
              s != BluetoothAdapterState.turningOn &&
              s != BluetoothAdapterState.turningOff)
          .timeout(
            const Duration(seconds: 8),
            onTimeout: () => FlutterBluePlus.adapterStateNow,
          );
      return state == BluetoothAdapterState.on;
    } catch (_) {
      return false;
    }
  }

  static Future<void> _stopScanQuiet() async {
    try {
      await FlutterBluePlus.stopScan();
    } catch (_) {}
  }

  static Future<void> _disconnectQuiet(BluetoothDevice device) async {
    try {
      await device.disconnect(timeout: 6, queue: false);
    } catch (_) {}
  }

  static String _nameOf(ScanResult r) {
    final adv = r.advertisementData.advName.trim();
    if (adv.isNotEmpty) return adv;
    return r.device.platformName.trim();
  }

  static bool _looksLikePrinter(String name) {
    final n = name.toLowerCase();
    return _printerHints.any(n.contains);
  }

  static bool _hasKey(String uuid, List<String> keys) {
    final u = uuid.toLowerCase().replaceAll('-', '');
    return keys.any(u.contains);
  }

  static List<IosBlePrinterDevice> _snapshot() {
    return _cache.entries
        .map((e) {
          final name = _names[e.key] ?? '';
          return IosBlePrinterDevice(
            id: e.key,
            name: name,
            likelyPrinter: _looksLikePrinter(name),
          );
        })
        .where((d) => d.name.isNotEmpty)
        .toList()
      ..sort((a, b) {
        if (a.likelyPrinter != b.likelyPrinter) return a.likelyPrinter ? -1 : 1;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
  }

  static void _remember(ScanResult r) {
    final name = _nameOf(r);
    if (name.isEmpty) return;
    final id = r.device.remoteId.str;
    _cache[id] = r.device;
    _names[id] = name;
  }

  static Future<void> _addSystemDevices() async {
    try {
      final system = await FlutterBluePlus.systemDevices(_systemServiceFilters);
      for (final d in system) {
        final name = d.platformName.trim();
        if (name.isEmpty) continue;
        _cache[d.remoteId.str] = d;
        _names[d.remoteId.str] = name;
      }
    } catch (_) {}
  }

  static Future<List<IosBlePrinterDevice>> scan({
    Duration timeout = const Duration(seconds: 12),
    void Function(List<IosBlePrinterDevice> devices)? onUpdate,
  }) async {
    if (!isActive) return [];
    if (!await isBluetoothOn()) return [];

    _cache.clear();
    _names.clear();

    await _addSystemDevices();
    if (_cache.isNotEmpty) onUpdate?.call(_snapshot());

    await _stopScanQuiet();
    final sub = FlutterBluePlus.onScanResults.listen((results) {
      for (final r in results) {
        _remember(r);
      }
      onUpdate?.call(_snapshot());
    }, onError: (_) {});

    try {
      await FlutterBluePlus.startScan(
        timeout: timeout,
        androidUsesFineLocation: false,
      );
      await Future<void>.delayed(timeout);
    } catch (e) {
      if (kDebugMode) debugPrint('IosBleThermalPrinter.scan: $e');
    } finally {
      await sub.cancel();
      await _stopScanQuiet();
    }

    return _snapshot();
  }

  static BluetoothCharacteristic? _pickWrite(List<BluetoothService> services) {
    BluetoothCharacteristic? preferred;
    BluetoothCharacteristic? withResponse;
    BluetoothCharacteristic? anyWrite;

    for (final service in services) {
      if (_hasKey(service.uuid.toString(), _gapKeys)) continue;
      for (final c in service.characteristics) {
        if (!c.properties.write && !c.properties.writeWithoutResponse) continue;
        anyWrite ??= c;
        if (c.properties.write) withResponse ??= c;
        if (_hasKey(c.uuid.toString(), _writeKeys)) preferred ??= c;
      }
    }
    return preferred ?? withResponse ?? anyWrite;
  }

  static String _describe(List<BluetoothService> services) {
    final parts = <String>[];
    for (final s in services) {
      final chars = s.characteristics
          .where((c) => c.properties.write || c.properties.writeWithoutResponse)
          .map((c) => c.uuid.str)
          .join(',');
      parts.add(chars.isEmpty ? s.uuid.str : '${s.uuid.str}[$chars]');
    }
    return parts.join(' ');
  }

  static Future<bool> _link(BluetoothDevice device) async {
    await _stopScanQuiet();

    try {
      if (device.isDisconnected) {
        await device.connect(
          license: License.nonprofit,
          timeout: const Duration(seconds: 20),
          mtu: null,
        );
      }

      await Future<void>.delayed(const Duration(milliseconds: 500));

      if (device.isDisconnected) {
        _lastError = 'انقطع الاتصال بعد الربط';
        return false;
      }

      List<BluetoothService> services = [];
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          services = await device.discoverServices();
        } catch (e) {
          _lastError = 'فشل قراءة خدمات الطابعة: $e';
        }
        if (services.isNotEmpty) break;
        await Future<void>.delayed(const Duration(milliseconds: 500));
      }

      if (services.isEmpty) {
        _lastError ??= 'لم تُرجع الطابعة أي خدمات';
        await _disconnectQuiet(device);
        return false;
      }

      final writeChar = _pickWrite(services);
      if (writeChar == null) {
        _lastError = 'لا توجد قناة كتابة. الخدمات: ${_describe(services)}';
        await _disconnectQuiet(device);
        return false;
      }

      await _resolveWriteMode(device, writeChar);

      _device = device;
      _writeChar = writeChar;
      _linkedDeviceId = device.remoteId.str;
      _lastError = null;
      return true;
    } catch (e) {
      _lastError = 'تعذّر الربط: $e';
      if (kDebugMode) debugPrint('IosBleThermalPrinter._link: $e');
      await _disconnectQuiet(device);
      _device = null;
      _writeChar = null;
      _linkedDeviceId = null;
      return false;
    }
  }

  /// مطابقة اسم متحفّظة: تساوٍ تام أو احتواء باسم طويل بما يكفي،
  /// حتى لا نربط بجهاز آخر يحمل اسماً قصيراً مشابهاً.
  static bool _nameMatches(String candidate, String hint) {
    if (candidate.isEmpty || hint.isEmpty) return false;
    if (candidate == hint) return true;
    if (candidate.length < 4 || hint.length < 4) return false;
    return candidate.contains(hint) || hint.contains(candidate);
  }

  static BluetoothDevice? _fromCache(String id, String? nameHint) {
    if (id.isNotEmpty) {
      final cached = _cache[id];
      if (cached != null) return cached;
    }

    final hint = nameHint?.trim().toLowerCase() ?? '';
    if (hint.isEmpty) return null;
    for (final entry in _cache.entries) {
      final n = (_names[entry.key] ?? '').toLowerCase();
      if (_nameMatches(n, hint)) return entry.value;
    }
    return null;
  }

  static Future<BluetoothDevice?> _findLive(String id, String? nameHint) async {
    final cached = _fromCache(id, nameHint);
    if (cached != null) return cached;

    await _addSystemDevices();
    final system = _fromCache(id, nameHint);
    if (system != null) return system;

    final hint = nameHint?.trim().toLowerCase() ?? '';

    bool matches(ScanResult r) {
      if (id.isNotEmpty && r.device.remoteId.str == id) return true;
      return _nameMatches(_nameOf(r).toLowerCase(), hint);
    }

    BluetoothDevice? found;
    await _stopScanQuiet();
    final sub = FlutterBluePlus.onScanResults.listen((results) {
      if (found != null) return;
      for (final r in results) {
        _remember(r);
        if (matches(r)) {
          found = r.device;
          return;
        }
      }
    }, onError: (_) {});

    try {
      await FlutterBluePlus.startScan(
        timeout: const Duration(seconds: 12),
        androidUsesFineLocation: false,
      );
      final deadline = DateTime.now().add(const Duration(seconds: 12));
      while (found == null && DateTime.now().isBefore(deadline)) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
    } catch (e) {
      if (kDebugMode) debugPrint('IosBleThermalPrinter._findLive: $e');
    } finally {
      await sub.cancel();
      await _stopScanQuiet();
    }

    return found ?? _fromCache(id, nameHint);
  }

  static Future<bool> connect(String deviceId, {String? nameHint}) async {
    if (!isActive) return false;
    _lastError = null;
    await disconnect();

    final live = await _findLive(deviceId.trim(), nameHint);
    if (live == null) {
      _lastError = 'لم يُعثر على الطابعة أثناء البحث';
      return false;
    }

    if (await _link(live)) return true;

    // Second attempt: iOS sometimes drops the very first GATT session.
    await Future<void>.delayed(const Duration(seconds: 1));
    return _link(live);
  }

  /// الكتابة بلا استجابة أسرع وأكثر سلاسة على طابعات حرارية BLE.
  static Future<void> _resolveWriteMode(
    BluetoothDevice device,
    BluetoothCharacteristic char,
  ) async {
    if (char.properties.writeWithoutResponse) {
      _withResponse = false;
      final mtu = device.mtuNow;
      _payload = mtu > 23 ? min(mtu - 3, 180) : 20;
      return;
    }
    _withResponse = char.properties.write;
    _payload = 512;
  }

  static Future<bool> writeBytes(List<int> bytes) async {
    final char = _writeChar;
    final device = _device;
    if (char == null || device == null || bytes.isEmpty) return false;
    if (device.isDisconnected) {
      _lastError = 'الطابعة غير متصلة';
      return false;
    }

    final chunkSize = _payload.clamp(20, 512);

    try {
      for (var offset = 0; offset < bytes.length; offset += chunkSize) {
        final chunk = bytes.sublist(offset, min(offset + chunkSize, bytes.length));
        await _writeChunk(char, chunk);
        // مهلة قصيرة بين الدفعات بلا استجابة حتى لا يمتلئ مخزن الطابعة.
        if (!_withResponse && offset + chunkSize < bytes.length) {
          await Future<void>.delayed(const Duration(milliseconds: 8));
        }
      }
      return true;
    } catch (e) {
      _lastError = 'فشل الإرسال: $e';
      if (kDebugMode) debugPrint('IosBleThermalPrinter.writeBytes: $e');
      return false;
    }
  }

  static Future<void> _writeChunk(
    BluetoothCharacteristic char,
    List<int> chunk,
  ) async {
    if (_withResponse) {
      await char.write(chunk, allowLongWrite: true, timeout: 30);
      return;
    }

    // بلا استجابة: يرفض iOS الإرسال عبر canSendWriteWithoutResponse
    // حين يمتلئ مخزن الطابعة، فنتراجع تدريجياً بدل إسقاط البيانات.
    for (var attempt = 0; attempt < 12; attempt++) {
      try {
        await char.write(chunk, withoutResponse: true);
        return;
      } catch (e) {
        if (attempt == 11) rethrow;
        await Future<void>.delayed(Duration(milliseconds: 15 * (attempt + 1)));
      }
    }
  }

  static Future<void> disconnect() async {
    _writeChar = null;
    _linkedDeviceId = null;
    final device = _device;
    _device = null;
    if (device == null) return;
    if (device.isConnected) await _disconnectQuiet(device);
  }

  static Future<bool> isConnected() async {
    final device = _device;
    return device != null && _writeChar != null && device.isConnected;
  }
}

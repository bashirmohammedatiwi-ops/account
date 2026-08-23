import 'package:flutter/foundation.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/models.dart';
import '../../core/utils/formatters.dart';

const _printerMacKey = 'thermal_printer_mac';

class ThermalPrintService {
  ThermalPrintService._();

  static bool get isSupported => !kIsWeb;

  static Future<bool> isBluetoothOn() async {
    if (kIsWeb) return false;
    return await PrintBluetoothThermal.bluetoothEnabled;
  }

  static Future<String?> savedMac() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_printerMacKey);
  }

  static Future<void> saveMac(String mac) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_printerMacKey, mac);
  }

  static Future<List<BluetoothInfo>> scanPrinters() async {
    if (kIsWeb) return [];
    return await PrintBluetoothThermal.pairedBluetooths;
  }

  static Future<bool> connect(String mac) async {
    if (kIsWeb) return false;
    final ok = await PrintBluetoothThermal.connect(macPrinterAddress: mac);
    if (ok) await saveMac(mac);
    return ok;
  }

  static Future<bool> connectSaved() async {
    final mac = await savedMac();
    if (mac == null || mac.isEmpty) return false;
    return await connect(mac);
  }

  static Future<bool> printDeliveryReceipt(DeliveryReceipt receipt, {String? agentName}) async {
    if (kIsWeb) return false;
    final connected = await PrintBluetoothThermal.connectionStatus;
    if (!connected) {
      final ok = await connectSaved();
      if (!ok) return false;
    }

    final lines = _formatDeliveryReceipt(receipt, agentName: agentName);
    for (final line in lines) {
      await PrintBluetoothThermal.writeString(
        printText: PrintTextSize(size: 2, text: '$line\n'),
      );
    }
    await PrintBluetoothThermal.writeString(printText: PrintTextSize(size: 1, text: '\n\n\n'));
    return true;
  }

  static List<String> _formatDeliveryReceipt(DeliveryReceipt receipt, {String? agentName}) {
    final date = receipt.receiptDate ?? receipt.createdAt ?? '';
    final customer = receipt.customerName ?? '—';
    final amount = fmtMoney(receipt.amount);
    final agent = agentName?.trim().isNotEmpty == true ? agentName!.trim() : 'مندوب';
    return [
      '================================',
      '           Edari',
      '      وصل استلام مبلغ',
      '================================',
      'رقم: ${receipt.deliveryNo}',
      'التاريخ: $date',
      'المندوب: $agent',
      'الزبون: $customer',
      'المبلغ: $amount',
      '--------------------------------',
      'وصلني منكم المبلغ المذكور',
      'أعلاه نقداً / شيكاً',
      if (receipt.notes != null && receipt.notes!.trim().isNotEmpty) receipt.notes!.trim(),
      '================================',
      '      شكراً لتعاملكم',
      '================================',
    ];
  }
}

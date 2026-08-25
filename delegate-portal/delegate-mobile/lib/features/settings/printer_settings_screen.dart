import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/api/delegate_api.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/adaptive_shell.dart';
import '../../core/widgets/ed_components.dart';
import '../receipts/thermal_print_service.dart';

class PrinterSettingsScreen extends ConsumerStatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  ConsumerState<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends ConsumerState<PrinterSettingsScreen> {
  PrinterStatus? _status;
  List<BluetoothInfo> _devices = [];
  bool _loading = true;
  bool _scanning = false;
  bool _connecting = false;
  bool _testing = false;
  String? _selectedMac;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) _bootstrap();
  }

  Future<void> _bootstrap() async {
    setState(() => _loading = true);
    final status = await ThermalPrintService.status(requestPermissions: true);
    _selectedMac = status.savedMac;
    if (mounted) {
      setState(() {
        _status = status;
        _loading = false;
      });
    }
    if (status.permissionGranted) await _scanDevices();
  }

  Future<void> _refreshStatus() async {
    final status = await ThermalPrintService.status(requestPermissions: true);
    if (mounted) {
      setState(() {
        _status = status;
        _selectedMac = status.savedMac ?? _selectedMac;
      });
    }
  }

  Future<void> _scanDevices() async {
    setState(() {
      _scanning = true;
      _devices = [];
    });
    final list = await ThermalPrintService.scanPrinters(
      onUpdate: (devices) {
        if (!mounted) return;
        setState(() => _devices = devices);
      },
    );
    if (mounted) {
      setState(() {
        _devices = list;
        _scanning = false;
      });
    }
  }

  Future<void> _requestPermissions() async {
    final ok = await ThermalPrintService.ensurePermissions();
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('لم يُمنح إذن البلوتوث'),
          action: SnackBarAction(label: 'الإعدادات', onPressed: openAppSettings),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
    await _bootstrap();
  }

  Future<void> _selectPrinter(BluetoothInfo device) async {
    setState(() {
      _connecting = true;
      _selectedMac = device.macAdress;
    });
    try {
      final ok = await ThermalPrintService.selectAndConnectPrinter(device);
      final reason = ThermalPrintService.lastError;
      await _refreshStatus();
      if (!mounted) return;
      setState(() => _connecting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تم الاتصال بالطابعة' : (reason ?? 'تعذّر الاتصال')),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: ok ? 3 : 10),
        ),
      );
    } catch (_) {
      if (mounted) {
        setState(() => _connecting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذّر الاتصال'), behavior: SnackBarBehavior.floating),
        );
      }
    }
  }

  Future<void> _reconnect() async {
    setState(() => _connecting = true);
    final ok = await ThermalPrintService.connectSaved();
    final reason = ThermalPrintService.lastError;
    await _refreshStatus();
    if (mounted) {
      setState(() => _connecting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تم الاتصال' : (reason ?? 'تعذّر الاتصال')),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: ok ? 3 : 10),
        ),
      );
    }
  }

  Future<void> _testPrint() async {
    setState(() => _testing = true);
    final agent = ref.read(authProvider).agent?.name;
    final serverUrl = ref.read(apiClientProvider).serverUrl;
    final ok = await ThermalPrintService.printTestPage(
      agentName: agent,
      serverUrl: serverUrl,
      fetchTemplate: () => ref.read(apiClientProvider).getDeliveryReceiptPrintTemplate(),
    );
    final reason = ThermalPrintService.lastError;
    await _refreshStatus();
    if (mounted) {
      setState(() => _testing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تمت الطباعة' : (reason ?? 'فشلت الطباعة')),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
          duration: Duration(seconds: ok ? 3 : 10),
        ),
      );
    }
  }

  Future<void> _forgetPrinter() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إزالة الطابعة'),
        content: const Text('حذف الطابعة المحفوظة؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حذف')),
        ],
      ),
    );
    if (ok != true) return;
    await ThermalPrintService.forgetPrinter();
    if (!mounted) return;
    setState(() {
      _selectedMac = null;
      _devices = [];
    });
    await _refreshStatus();
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return AppPage(
        title: 'الطابعة',
        kicker: 'الإعدادات',
        showBack: true,
        onBack: () => context.pop(),
        child: const Center(child: Text('غير متاح على الويب')),
      );
    }

    final status = _status;

    return AppPage(
      title: 'الطابعة',
      kicker: 'الإعدادات',
      showBack: true,
      onBack: () => context.pop(),
      child: _loading
          ? const Center(child: Padding(padding: EdgeInsets.all(48), child: CircularProgressIndicator()))
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _StatusCard(status: status),
                const SizedBox(height: 16),
                if (status != null && !status.permissionGranted)
                  EdPrimaryButton(
                    label: 'إذن البلوتوث',
                    icon: Icons.bluetooth_rounded,
                    onPressed: _requestPermissions,
                  ),
                if (status != null && !status.permissionGranted) const SizedBox(height: 16),
                EdPanelCard(
                  title: 'الأجهزة',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _scanning ? null : _scanDevices,
                        icon: _scanning
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.refresh_rounded, size: 18),
                        label: Text(_scanning ? 'جاري البحث...' : 'تحديث القائمة'),
                      ),
                      const SizedBox(height: 12),
                      if (_devices.isEmpty && !_scanning)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 16),
                          child: Text(
                            'لا توجد أجهزة',
                            textAlign: TextAlign.center,
                            style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.muted),
                          ),
                        )
                      else
                        ..._devices.map((d) => _DeviceTile(
                              device: d,
                              selected: _selectedMac == d.macAdress,
                              connecting: _connecting && _selectedMac == d.macAdress,
                              onTap: _connecting ? null : () => _selectPrinter(d),
                            )),
                    ],
                  ),
                ),
                if (status?.hasSavedPrinter == true) ...[
                  const SizedBox(height: 16),
                  EdPanelCard(
                    title: status!.savedName?.trim().isNotEmpty == true ? status.savedName!.trim() : 'الطابعة',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _connecting ? null : _reconnect,
                                icon: const Icon(Icons.link_rounded, size: 18),
                                label: Text(_connecting ? '...' : 'اتصال'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: EdPrimaryButton(
                                label: _testing ? '...' : 'طباعة',
                                icon: Icons.print_rounded,
                                loading: _testing,
                                onPressed: _testing ? null : _testPrint,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton.icon(
                          onPressed: _forgetPrinter,
                          icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.danger),
                          label: const Text('إزالة', style: TextStyle(color: AppColors.danger)),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({this.status});

  final PrinterStatus? status;

  @override
  Widget build(BuildContext context) {
    final s = status;
    Color color = AppColors.muted;
    IconData icon = Icons.print_outlined;
    String title = '...';
    String subtitle = '';

    if (s != null) {
      if (!s.permissionGranted) {
        color = AppColors.warning;
        icon = Icons.bluetooth_disabled_rounded;
        title = 'البلوتوث';
        subtitle = 'غير مفعّل';
      } else if (!s.bluetoothOn) {
        color = AppColors.warning;
        icon = Icons.bluetooth_disabled_rounded;
        title = 'البلوتوث';
        subtitle = 'مغلق';
      } else if (s.connected) {
        color = AppColors.success;
        icon = Icons.bluetooth_connected_rounded;
        title = 'متصل';
        subtitle = s.savedName?.trim() ?? '';
      } else if (s.hasSavedPrinter) {
        color = AppColors.warning;
        icon = Icons.bluetooth_searching_rounded;
        title = 'غير متصل';
        subtitle = s.savedName?.trim() ?? '';
      } else {
        color = AppColors.accentTeal;
        icon = Icons.print_outlined;
        title = 'لا طابعة';
      }
    }

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(AppColors.radiusLg),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                if (subtitle.isNotEmpty)
                  Text(subtitle, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DeviceTile extends StatelessWidget {
  const _DeviceTile({
    required this.device,
    required this.selected,
    required this.connecting,
    this.onTap,
  });

  final BluetoothInfo device;
  final bool selected;
  final bool connecting;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final borderColor = selected ? AppColors.accentTeal : AppColors.borderLight;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? AppColors.accentTeal.withValues(alpha: 0.06) : AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: borderColor, width: selected ? 1.5 : 1),
            ),
            child: Row(
              children: [
                Icon(
                  selected ? Icons.check_circle_rounded : Icons.bluetooth_rounded,
                  color: selected ? AppColors.accentTeal : AppColors.muted,
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    device.name.trim().isNotEmpty ? device.name : 'جهاز Bluetooth',
                    style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy),
                  ),
                ),
                if (connecting)
                  const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

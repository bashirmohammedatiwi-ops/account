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
    setState(() => _scanning = true);
    final list = await ThermalPrintService.scanPrinters();
    if (mounted) {
      setState(() {
        _devices = list;
        _scanning = false;
      });
    }
    await _refreshStatus();
  }

  Future<void> _requestPermissions() async {
    final ok = await ThermalPrintService.ensurePermissions();
    if (!ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('لم يُمنح إذن البلوتوث — فعّله من إعدادات التطبيق'),
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
    final ok = await ThermalPrintService.selectAndConnectPrinter(device);
    await _refreshStatus();
    if (mounted) {
      setState(() => _connecting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تم حفظ وربط الطابعة بنجاح' : 'تم حفظ الطابعة — فشل الاتصال، تأكد أنها مفعّلة ومقترنة'),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _reconnect() async {
    setState(() => _connecting = true);
    final ok = await ThermalPrintService.connectSaved();
    await _refreshStatus();
    if (mounted) {
      setState(() => _connecting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تم الاتصال بالطابعة' : 'تعذّر الاتصال — تأكد أن الطابعة مفعّلة'),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _testPrint() async {
    setState(() => _testing = true);
    final agent = ref.read(authProvider).agent?.name;
    final tpl = await ref.read(apiClientProvider).getDeliveryReceiptPrintTemplate();
    final serverUrl = ref.read(apiClientProvider).serverUrl;
    final ok = await ThermalPrintService.printTestPage(
      agentName: agent,
      template: tpl,
      serverUrl: serverUrl,
    );
    await _refreshStatus();
    if (mounted) {
      setState(() => _testing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ok ? 'تمت طباعة الاختبار' : 'فشلت الطباعة — أعد الاتصال ثم حاول'),
          backgroundColor: ok ? AppColors.success : null,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  Future<void> _forgetPrinter() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('إزالة الطابعة'),
        content: const Text('سيتم حذف الطابعة المحفوظة. يمكنك اختيار طابعة أخرى لاحقاً.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('إزالة')),
        ],
      ),
    );
    if (ok != true) return;
    await ThermalPrintService.forgetPrinter();
    if (!mounted) return;
    setState(() => _selectedMac = null);
    await _refreshStatus();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تمت إزالة الطابعة المحفوظة'), behavior: SnackBarBehavior.floating),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) {
      return AppPage(
        title: 'الطابعة الحرارية',
        kicker: 'الإعدادات',
        showBack: true,
        onBack: () => context.pop(),
        child: const Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'الطباعة الحرارية متاحة على الهاتف والآيباد فقط',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted),
            ),
          ),
        ),
      );
    }

    final status = _status;

    return AppPage(
      title: 'الطابعة الحرارية',
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
                if (status != null && !status.permissionGranted) ...[
                  EdPanelCard(
                    title: 'إذن البلوتوث مطلوب',
                    subtitle: 'Android 12+ يحتاج إذن «الأجهزة القريبة»',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'بدون هذا الإذن يظهر التطبيق أن البلوتوث غير مفعّل حتى لو كان مفعّلاً على الجهاز.',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
                        ),
                        const SizedBox(height: 12),
                        EdPrimaryButton(label: 'منح إذن البلوتوث', icon: Icons.bluetooth_rounded, onPressed: _requestPermissions),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                EdPanelCard(
                  title: 'اختر الطابعة',
                  subtitle: 'مرة واحدة — تُحفظ تلقائياً للطباعة لاحقاً',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        '1. اقترن الطابعة من إعدادات Bluetooth في الجهاز\n2. اخترها من القائمة أدناه\n3. استخدم «طباعة اختبار» للتأكد',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted, height: 1.5),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: _scanning ? null : _scanDevices,
                              icon: _scanning
                                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                                  : const Icon(Icons.refresh_rounded, size: 18),
                              label: Text(_scanning ? 'جاري البحث...' : 'تحديث القائمة'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (_devices.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceAlt,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: AppColors.borderLight),
                          ),
                          child: const Text(
                            'لا توجد طابعات مقترنة. افتح إعدادات الجهاز → Bluetooth واقترن الطابعة ثم ارجع واضغط تحديث.',
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted),
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
                const SizedBox(height: 16),
                if (status?.hasSavedPrinter == true) ...[
                  EdPanelCard(
                    title: 'الطابعة المحفوظة',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _infoRow('الاسم', status!.savedName ?? '—'),
                        const Divider(height: 20),
                        _infoRow('MAC', status.savedMac ?? '—', ltr: true),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _connecting ? null : _reconnect,
                                icon: const Icon(Icons.link_rounded, size: 18),
                                label: Text(_connecting ? 'جاري الاتصال...' : 'إعادة الاتصال'),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: EdPrimaryButton(
                                label: _testing ? 'طباعة...' : 'طباعة اختبار',
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
                          label: const Text('إزالة الطابعة المحفوظة', style: TextStyle(color: AppColors.danger)),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _infoRow(String label, String value, {bool ltr = false}) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.muted)),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textDirection: ltr ? TextDirection.ltr : null,
            style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy),
          ),
        ),
      ],
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
    String title = 'جاري التحقق...';
    String subtitle = '';

    if (s != null) {
      if (!s.permissionGranted) {
        color = AppColors.warning;
        icon = Icons.bluetooth_disabled_rounded;
        title = 'إذن البلوتوث';
        subtitle = 'غير ممنوح';
      } else if (!s.bluetoothOn) {
        color = AppColors.warning;
        icon = Icons.bluetooth_disabled_rounded;
        title = 'البلوتوث';
        subtitle = 'مغلق على الجهاز';
      } else if (s.connected) {
        color = AppColors.success;
        icon = Icons.bluetooth_connected_rounded;
        title = 'متصل';
        subtitle = s.savedName?.trim().isNotEmpty == true ? s.savedName!.trim() : 'الطابعة جاهزة';
      } else if (s.hasSavedPrinter) {
        color = AppColors.warning;
        icon = Icons.bluetooth_searching_rounded;
        title = 'غير متصل';
        subtitle = s.savedName?.trim().isNotEmpty == true ? s.savedName!.trim() : 'أعد الاتصال من الأسفل';
      } else {
        color = AppColors.accentTeal;
        icon = Icons.print_outlined;
        title = 'لا طابعة';
        subtitle = 'اختر من القائمة أدناه';
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
                Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.navy)),
                if (subtitle.isNotEmpty)
                  Text(subtitle, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.muted)),
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
                  selected ? Icons.check_circle_rounded : Icons.print_outlined,
                  color: selected ? AppColors.accentTeal : AppColors.muted,
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        device.name.trim().isNotEmpty ? device.name : 'طابعة Bluetooth',
                        style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy),
                      ),
                      Text(
                        device.macAdress,
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.muted),
                      ),
                    ],
                  ),
                ),
                if (connecting)
                  const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                else if (selected)
                  const Text('محفوظة', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: AppColors.accentTeal)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

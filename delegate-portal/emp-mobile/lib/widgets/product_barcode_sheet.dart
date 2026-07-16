import 'package:barcode_widget/barcode_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';
import '../models/models.dart';

Barcode barcodeTypeFor(String raw) {
  final code = raw.trim();
  if (RegExp(r'^\d{13}$').hasMatch(code)) return Barcode.ean13();
  if (RegExp(r'^\d{8}$').hasMatch(code)) return Barcode.ean8();
  if (RegExp(r'^\d{12}$').hasMatch(code)) return Barcode.upcA();
  return Barcode.code128();
}

String barcodeTypeLabel(Barcode barcode) => barcode.name;

Future<void> showProductBarcodeSheet(BuildContext context, OrderLine line, {int? lineNo}) async {
  final code = line.barcode?.trim() ?? '';
  if (code.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('لا يوجد باركود لهذا المنتج')),
    );
    return;
  }

  final barcode = barcodeTypeFor(code);
  final surface = themed(context, light: AppColors.surface, dark: AppColors.surfaceDark);

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) {
      return Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(ctx).padding.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: themed(ctx, light: AppColors.border, dark: AppColors.borderDark),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.qr_code_scanner_rounded, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (lineNo != null)
                          Text('بند $lineNo', style: TextStyle(color: themed(ctx, light: AppColors.muted, dark: AppColors.mutedDark), fontWeight: FontWeight.w700, fontSize: 12)),
                        Text(line.matName, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: themed(ctx, light: AppColors.border, dark: AppColors.borderDark)),
                ),
                child: Column(
                  children: [
                    BarcodeWidget(
                      barcode: barcode,
                      data: code,
                      width: MediaQuery.of(ctx).size.width - 72,
                      height: 110,
                      drawText: false,
                      color: Colors.black,
                      backgroundColor: Colors.white,
                    ),
                    const SizedBox(height: 12),
                    SelectableText(
                      code,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 18,
                        letterSpacing: 1.2,
                        fontFamily: 'monospace',
                        color: Colors.black,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      barcodeTypeLabel(barcode),
                      style: TextStyle(color: themed(ctx, light: AppColors.muted, dark: AppColors.mutedDark), fontWeight: FontWeight.w700, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'وجّه الماسح نحو الشريط الأسود — مناسب لقراءة EAN وCode 128',
                textAlign: TextAlign.center,
                style: TextStyle(color: themed(ctx, light: AppColors.muted, dark: AppColors.mutedDark), fontSize: 12, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: code));
                        ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('تم نسخ الباركود')));
                      },
                      icon: const Icon(Icons.copy_rounded),
                      label: const Text('نسخ الرقم'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('إغلاق'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    },
  );
}

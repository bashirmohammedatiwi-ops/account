import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';

const _paperWidthDots = 384;

CapabilityProfile? _profileCache;
Generator? _generatorCache;

Future<Generator> _generator() async {
  if (_generatorCache != null) return _generatorCache!;
  _profileCache ??= await CapabilityProfile.load();
  _generatorCache = Generator(PaperSize.mm58, _profileCache!);
  return _generatorCache!;
}

bool _hasNonAscii(String text) => text.runes.any((r) => r > 127);

bool _looksArabic(String text) {
  for (final r in text.runes) {
    if ((r >= 0x0600 && r <= 0x06FF) || (r >= 0x0750 && r <= 0x077F)) return true;
  }
  return false;
}

TextAlign _toTextAlign(String? align, String text) {
  if (align == 'center') return TextAlign.center;
  if (align == 'left') return TextAlign.left;
  if (align == 'right') return TextAlign.right;
  if (_looksArabic(text)) return TextAlign.right;
  return TextAlign.center;
}

PosAlign _toPosAlign(TextAlign align) {
  switch (align) {
    case TextAlign.center:
      return PosAlign.center;
    case TextAlign.right:
      return PosAlign.right;
    default:
      return PosAlign.left;
  }
}

Future<img.Image?> _loadLogoImage(String url, String? serverUrl, int maxWidth) async {
  try {
    final fullUrl = url.startsWith('http') ? url : '${serverUrl ?? ''}$url';
    final dio = Dio();
    final resp = await dio.get<Uint8List>(
      fullUrl,
      options: Options(responseType: ResponseType.bytes, receiveTimeout: const Duration(seconds: 12)),
    );
    final bytes = resp.data;
    if (bytes == null || bytes.isEmpty) return null;
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return null;
    if (decoded.width > maxWidth) {
      return img.copyResize(decoded, width: maxWidth, interpolation: img.Interpolation.linear);
    }
    return decoded;
  } catch (_) {
    return null;
  }
}

Future<img.Image?> _rasterText(
  String text, {
  required TextAlign align,
  required double fontSize,
  required bool bold,
}) async {
  final trimmed = text.trim();
  if (trimmed.isEmpty) return null;

  final isRtl = _looksArabic(trimmed);
  final painter = TextPainter(
    text: TextSpan(
      text: trimmed,
      style: TextStyle(
        fontSize: fontSize,
        fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
        color: Colors.black,
        height: 1.15,
      ),
    ),
    textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
    textAlign: align,
    maxLines: 8,
  );
  painter.layout(maxWidth: _paperWidthDots.toDouble());

  final height = (painter.height.ceil() + 10).clamp(24, 360);
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, _paperWidthDots.toDouble(), height.toDouble()),
  );
  canvas.drawRect(
    Rect.fromLTWH(0, 0, _paperWidthDots.toDouble(), height.toDouble()),
    Paint()..color = Colors.white,
  );

  double dx = 0;
  if (align == TextAlign.center) {
    dx = (_paperWidthDots - painter.width) / 2;
  } else if (align == TextAlign.right || isRtl) {
    dx = _paperWidthDots - painter.width;
  }
  painter.paint(canvas, Offset(dx, 4));

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(_paperWidthDots, height);
  final byteData = await uiImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  uiImage.dispose();
  if (byteData == null) return null;

  final out = img.Image(width: _paperWidthDots, height: height);
  final rgba = byteData.buffer.asUint8List();
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < _paperWidthDots; x++) {
      final i = (y * _paperWidthDots + x) * 4;
      out.setPixelRgba(x, y, rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  return out;
}

Future<List<int>> _appendRasterOrText(
  Generator generator,
  List<int> bytes,
  String text, {
  required double fontSize,
  required TextAlign align,
  required bool bold,
}) async {
  if (text.trim().isEmpty) {
    bytes += generator.feed(1);
    return bytes;
  }

  if (_hasNonAscii(text)) {
    final raster = await _rasterText(text, align: align, fontSize: fontSize, bold: bold);
    if (raster != null) {
      bytes += generator.imageRaster(raster, align: _toPosAlign(align));
      return bytes;
    }
  }

  bytes += generator.text(
    text,
    styles: PosStyles(
      align: _toPosAlign(align),
      bold: bold,
      height: fontSize >= 24 ? PosTextSize.size2 : PosTextSize.size1,
      width: fontSize >= 24 ? PosTextSize.size2 : PosTextSize.size1,
    ),
  );
  return bytes;
}

Future<List<int>> _appendRow(
  Generator generator,
  List<int> bytes,
  String label,
  String value, {
  required double labelFont,
  required double valueFont,
}) async {
  final line = '$label: $value';
  return await _appendRasterOrText(
    generator,
    bytes,
    line,
    fontSize: valueFont,
    align: TextAlign.right,
    bold: false,
  );
}

Future<List<int>> buildEscPosBytesFromPayload(
  DeliveryReceiptPrintPayload payload, {
  String? serverUrl,
}) async {
  final generator = await _generator();
  var bytes = <int>[];
  bytes += generator.reset();

  for (final block in payload.blocks) {
    switch (block.type) {
      case 'logo':
        if (block.url != null && block.url!.isNotEmpty) {
          final logo = await _loadLogoImage(block.url!, serverUrl, block.maxWidth ?? 180);
          if (logo != null) {
            bytes += generator.imageRaster(logo, align: PosAlign.center);
            bytes += generator.feed(1);
          }
        }
        break;
      case 'text':
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 18).toDouble(),
          align: _toTextAlign(block.align, block.text ?? ''),
          bold: block.bold,
        );
        break;
      case 'divider':
        final ch = block.char ?? '─';
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          ch * 28,
          fontSize: 14,
          align: TextAlign.center,
          bold: false,
        );
        break;
      case 'blank':
        for (var i = 0; i < block.count.clamp(1, 5); i++) {
          bytes += generator.feed(1);
        }
        break;
      case 'row':
        bytes = await _appendRow(
          generator,
          bytes,
          block.label ?? '',
          block.value ?? '',
          labelFont: (block.labelFont ?? 16).toDouble(),
          valueFont: (block.valueFont ?? 18).toDouble(),
        );
        break;
      case 'amount':
        if (block.label != null && block.label!.trim().isNotEmpty) {
          bytes = await _appendRasterOrText(
            generator,
            bytes,
            block.label!,
            fontSize: 14,
            align: TextAlign.center,
            bold: false,
          );
        }
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.value ?? '',
          fontSize: (block.fontSize ?? 30).toDouble(),
          align: TextAlign.center,
          bold: true,
        );
        break;
    }
  }

  for (var i = 0; i < payload.footerBlankLines; i++) {
    bytes += generator.feed(1);
  }
  bytes += generator.cut(mode: PosCutMode.partial);
  return bytes;
}

Future<List<int>> buildTestPrintBytes({
  String? agentName,
  Map<String, dynamic>? template,
  String? serverUrl,
}) async {
  final tpl = template ?? {
    'version': 2,
    'branding': {'legalName': 'اختبار', 'title': 'طباعة تجريبية', 'footer': 'Edari Delegate'},
    'typography': {'bodyFont': 18, 'amountFont': 28},
    'content': {'legalText': 'اتصال ناجح مع الطابعة'},
  };
  final sample = DeliveryReceiptPrintPayload(
    blocks: [
      ...buildDeliveryReceiptPrintBlocks(
        DeliveryReceipt(
          id: 0,
          deliveryNo: 'TEST-001',
          status: 'issued',
          statusLabel: '',
          amount: 0,
          receiptDate: DateTime.now().toIso8601String().split('T').first,
        ),
        template: tpl,
        agentName: agentName,
      ).blocks,
    ],
    footerBlankLines: 3,
  );
  return await buildEscPosBytesFromPayload(sample, serverUrl: serverUrl);
}

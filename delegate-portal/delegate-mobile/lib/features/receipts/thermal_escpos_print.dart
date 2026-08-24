import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';

int _paperWidthDotsFor(int paperMm) => paperMm == 58 ? 384 : 576;

PaperSize _paperSizeFor(int paperMm) => paperMm == 58 ? PaperSize.mm58 : PaperSize.mm80;

int _dividerCharCount(int paperWidthDots) => (paperWidthDots / 12).round().clamp(24, 64);

CapabilityProfile? _profileCache;
final _generators = <int, Generator>{};

Future<Generator> _generatorFor(int paperMm) async {
  final key = _normalizePaperMm(paperMm);
  final cached = _generators[key];
  if (cached != null) return cached;
  _profileCache ??= await CapabilityProfile.load();
  final gen = Generator(_paperSizeFor(key), _profileCache!);
  _generators[key] = gen;
  return gen;
}

int _normalizePaperMm(int paperMm) => paperMm == 58 ? 58 : 80;

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
  required int paperWidthDots,
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
  painter.layout(maxWidth: paperWidthDots.toDouble());

  final height = (painter.height.ceil() + 10).clamp(24, 360);
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), height.toDouble()),
  );
  canvas.drawRect(
    Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), height.toDouble()),
    Paint()..color = Colors.white,
  );

  double dx = 0;
  if (align == TextAlign.center) {
    dx = (paperWidthDots - painter.width) / 2;
  } else if (align == TextAlign.right || isRtl) {
    dx = paperWidthDots - painter.width;
  }
  painter.paint(canvas, Offset(dx, 4));

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(paperWidthDots, height);
  final byteData = await uiImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  uiImage.dispose();
  if (byteData == null) return null;

  final out = img.Image(width: paperWidthDots, height: height);
  final rgba = byteData.buffer.asUint8List();
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < paperWidthDots; x++) {
      final i = (y * paperWidthDots + x) * 4;
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
  required int paperWidthDots,
}) async {
  if (text.trim().isEmpty) {
    bytes += generator.feed(1);
    return bytes;
  }

  if (_hasNonAscii(text)) {
    final raster = await _rasterText(text, align: align, fontSize: fontSize, bold: bold, paperWidthDots: paperWidthDots);
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

Future<List<int>> _appendDivider(
  Generator generator,
  List<int> bytes,
  String char, {
  int lines = 1,
  required int paperWidthDots,
}) async {
  final line = char * _dividerCharCount(paperWidthDots);
  for (var i = 0; i < lines; i++) {
    bytes = await _appendRasterOrText(
      generator,
      bytes,
      line,
      fontSize: 14,
      align: TextAlign.center,
      bold: false,
      paperWidthDots: paperWidthDots,
    );
  }
  return bytes;
}

Future<List<int>> _appendRow(
  Generator generator,
  List<int> bytes,
  String label,
  String value, {
  required double labelFont,
  required double valueFont,
  required int paperWidthDots,
  bool emphasis = false,
}) async {
  bytes = await _appendRasterOrText(
    generator,
    bytes,
    label,
    fontSize: labelFont,
    align: TextAlign.right,
    bold: false,
    paperWidthDots: paperWidthDots,
  );
  return await _appendRasterOrText(
    generator,
    bytes,
    value,
    fontSize: valueFont,
    align: TextAlign.right,
    bold: true,
    paperWidthDots: paperWidthDots,
  );
}

Future<List<int>> buildEscPosBytesFromPayload(
  DeliveryReceiptPrintPayload payload, {
  String? serverUrl,
}) async {
  final paperMm = _normalizePaperMm(payload.paperMm);
  final paperWidthDots = _paperWidthDotsFor(paperMm);
  final generator = await _generatorFor(paperMm);
  var bytes = <int>[];
  bytes += generator.reset();

  for (final block in payload.blocks) {
    switch (block.type) {
      case 'logo':
        if (block.url != null && block.url!.isNotEmpty) {
          final logo = await _loadLogoImage(block.url!, serverUrl, block.maxWidth ?? 240);
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
          paperWidthDots: paperWidthDots,
        );
        break;
      case 'divider':
        bytes = await _appendDivider(generator, bytes, block.char ?? '─', paperWidthDots: paperWidthDots);
        break;
      case 'doubleDivider':
        bytes = await _appendDivider(generator, bytes, block.char ?? '═', lines: 2, paperWidthDots: paperWidthDots);
        break;
      case 'ribbon':
        final ribbonChar = block.char ?? '─';
        bytes = await _appendDivider(generator, bytes, ribbonChar, paperWidthDots: paperWidthDots);
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 26).toDouble(),
          align: TextAlign.center,
          bold: true,
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendDivider(generator, bytes, ribbonChar, paperWidthDots: paperWidthDots);
        break;
      case 'titleBadge':
        final badgeChar = block.char ?? '═';
        bytes = await _appendDivider(generator, bytes, badgeChar, lines: 2, paperWidthDots: paperWidthDots);
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 28).toDouble(),
          align: TextAlign.center,
          bold: true,
          paperWidthDots: paperWidthDots,
        );
        if (block.subText != null && block.subText!.trim().isNotEmpty) {
          bytes = await _appendRasterOrText(
            generator,
            bytes,
            block.subText!,
            fontSize: (block.subFontSize ?? 14).toDouble(),
            align: TextAlign.center,
            bold: false,
            paperWidthDots: paperWidthDots,
          );
        }
        bytes = await _appendDivider(generator, bytes, badgeChar, lines: 2, paperWidthDots: paperWidthDots);
        break;
      case 'ornament':
        final ch = block.char ?? '✦';
        final n = block.repeat.clamp(1, 5);
        final ornament = List.generate(n, (_) => ch).join('  ');
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          ornament,
          fontSize: 14,
          align: TextAlign.center,
          bold: false,
          paperWidthDots: paperWidthDots,
        );
        break;
      case 'metaStart':
      case 'metaEnd':
        break;
      case 'customerBox':
        final boxChar = block.char ?? '─';
        bytes = await _appendDivider(generator, bytes, boxChar, paperWidthDots: paperWidthDots);
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.label ?? 'الزبون',
          fontSize: (block.labelFont ?? 14).toDouble(),
          align: TextAlign.right,
          bold: false,
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.value ?? '',
          fontSize: (block.valueFont ?? 24).toDouble(),
          align: TextAlign.right,
          bold: true,
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendDivider(generator, bytes, boxChar, paperWidthDots: paperWidthDots);
        break;
      case 'notesBox':
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.label ?? 'ملاحظات',
          fontSize: (block.labelFont ?? 14).toDouble(),
          align: TextAlign.center,
          bold: false,
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 18).toDouble(),
          align: TextAlign.center,
          bold: false,
          paperWidthDots: paperWidthDots,
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
          labelFont: (block.labelFont ?? 15).toDouble(),
          valueFont: (block.valueFont ?? 17).toDouble(),
          paperWidthDots: paperWidthDots,
          emphasis: block.emphasis,
        );
        break;
      case 'amount':
      case 'amountBox':
        if (block.type == 'amountBox') {
          bytes = await _appendDivider(generator, bytes, block.char ?? '═', paperWidthDots: paperWidthDots);
        }
        if (block.label != null && block.label!.trim().isNotEmpty) {
          bytes = await _appendRasterOrText(
            generator,
            bytes,
            block.label!,
            fontSize: 15,
            align: TextAlign.center,
            bold: false,
            paperWidthDots: paperWidthDots,
          );
        }
        bytes += generator.feed(1);
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.value ?? '',
          fontSize: (block.fontSize ?? 36).toDouble(),
          align: TextAlign.center,
          bold: true,
          paperWidthDots: paperWidthDots,
        );
        if (block.type == 'amountBox') {
          bytes = await _appendDivider(generator, bytes, block.char ?? '═', paperWidthDots: paperWidthDots);
        }
        break;
      case 'legalBox':
        bytes = await _appendDivider(generator, bytes, block.char ?? '─', paperWidthDots: paperWidthDots);
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 15).toDouble(),
          align: TextAlign.center,
          bold: false,
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendDivider(generator, bytes, block.char ?? '─', paperWidthDots: paperWidthDots);
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
  final built = buildDeliveryReceiptPrintBlocks(
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
  );
  final sample = DeliveryReceiptPrintPayload(
    blocks: built.blocks,
    footerBlankLines: 3,
    paperMm: built.paperMm,
  );
  return await buildEscPosBytesFromPayload(sample, serverUrl: serverUrl);
}

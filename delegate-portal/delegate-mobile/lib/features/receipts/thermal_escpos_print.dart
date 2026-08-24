import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image/image.dart' as img;

import '../../models/models.dart';
import 'delivery_receipt_print_template.dart';

int _paperWidthDotsFor(int paperMm) => paperMm == 58 ? 384 : 576;

PaperSize _paperSizeFor(int paperMm) => paperMm == 58 ? PaperSize.mm58 : PaperSize.mm80;

int _normalizePaperMm(int paperMm) => paperMm == 58 ? 58 : 80;

CapabilityProfile? _profileCache;
final _generators = <int, Generator>{};
bool _fontsReady = false;

Future<void> _ensurePrintFonts() async {
  if (_fontsReady) return;
  await GoogleFonts.pendingFonts([
    GoogleFonts.cairo(fontWeight: FontWeight.w500),
    GoogleFonts.cairo(fontWeight: FontWeight.w600),
    GoogleFonts.cairo(fontWeight: FontWeight.w700),
  ]);
  _fontsReady = true;
}

TextStyle _cairoStyle(double size, {bool bold = false, bool muted = false}) {
  return GoogleFonts.cairo(
    fontSize: size,
    fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
    color: muted ? const Color(0xFF475569) : Colors.black,
    height: 1.18,
  );
}

Future<Generator> _generatorFor(int paperMm) async {
  final key = _normalizePaperMm(paperMm);
  final cached = _generators[key];
  if (cached != null) return cached;
  _profileCache ??= await CapabilityProfile.load();
  final gen = Generator(_paperSizeFor(key), _profileCache!);
  _generators[key] = gen;
  return gen;
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

img.Image _trimWhitespace(img.Image src, {int threshold = 248}) {
  int top = 0;
  int bottom = src.height - 1;
  int left = 0;
  int right = src.width - 1;

  bool rowHasInk(int y) {
    for (var x = 0; x < src.width; x++) {
      final p = src.getPixel(x, y);
      if (p.a > 8 && (p.r < threshold || p.g < threshold || p.b < threshold)) return true;
    }
    return false;
  }

  bool colHasInk(int x) {
    for (var y = 0; y < src.height; y++) {
      final p = src.getPixel(x, y);
      if (p.a > 8 && (p.r < threshold || p.g < threshold || p.b < threshold)) return true;
    }
    return false;
  }

  while (top < bottom && !rowHasInk(top)) top++;
  while (bottom > top && !rowHasInk(bottom)) bottom--;
  while (left < right && !colHasInk(left)) left++;
  while (right > left && !colHasInk(right)) right--;

  if (right <= left || bottom <= top) return src;
  return img.copyCrop(src, x: left, y: top, width: right - left + 1, height: bottom - top + 1);
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
    final trimmed = _trimWhitespace(decoded);
    if (trimmed.width > maxWidth) {
      return img.copyResize(trimmed, width: maxWidth, interpolation: img.Interpolation.cubic);
    }
    return trimmed;
  } catch (_) {
    return null;
  }
}

Future<img.Image?> _uiImageToImg(ui.Image uiImage) async {
  final byteData = await uiImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  if (byteData == null) return null;
  final out = img.Image(width: uiImage.width, height: uiImage.height);
  final rgba = byteData.buffer.asUint8List();
  for (var y = 0; y < uiImage.height; y++) {
    for (var x = 0; x < uiImage.width; x++) {
      final i = (y * uiImage.width + x) * 4;
      out.setPixelRgba(x, y, rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  }
  uiImage.dispose();
  return out;
}

Future<img.Image?> _rasterText(
  String text, {
  required TextAlign align,
  required double fontSize,
  required bool bold,
  required bool muted,
  required bool italic,
  required int paperWidthDots,
}) async {
  await _ensurePrintFonts();
  final trimmed = text.trim();
  if (trimmed.isEmpty) return null;

  final isRtl = _looksArabic(trimmed);
  final painter = TextPainter(
    text: TextSpan(
      text: trimmed,
      style: _cairoStyle(fontSize, bold: bold, muted: muted).copyWith(
        fontStyle: italic ? FontStyle.italic : FontStyle.normal,
      ),
    ),
    textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr,
    textAlign: align,
    maxLines: 8,
  );
  painter.layout(maxWidth: paperWidthDots.toDouble());

  double dx = 0;
  if (align == TextAlign.center) {
    dx = (paperWidthDots - painter.width) / 2;
  } else if (align == TextAlign.right || isRtl) {
    dx = paperWidthDots - painter.width;
  }

  final scale = 2;
  final scaledWidth = paperWidthDots * scale;
  final scaledHeight = ((painter.height + 6) * scale).ceil();

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, scaledWidth.toDouble(), scaledHeight.toDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(
    Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), scaledHeight / scale),
    Paint()..color = Colors.white,
  );
  painter.paint(canvas, Offset(dx, 2));

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(scaledWidth, scaledHeight);
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  if (hi.width == paperWidthDots) return hi;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

Future<img.Image?> _rasterPairRow(
  String label,
  String value, {
  required double labelFont,
  required double valueFont,
  required int paperWidthDots,
}) async {
  await _ensurePrintFonts();
  final labelPainter = TextPainter(
    text: TextSpan(text: label, style: _cairoStyle(labelFont, muted: true)),
    textDirection: TextDirection.rtl,
    textAlign: TextAlign.right,
    maxLines: 1,
  );
  labelPainter.layout(maxWidth: paperWidthDots * 0.45);

  final valuePainter = TextPainter(
    text: TextSpan(text: value, style: _cairoStyle(valueFont, bold: true)),
    textDirection: _looksArabic(value) ? TextDirection.rtl : TextDirection.ltr,
    textAlign: TextAlign.left,
    maxLines: 2,
  );
  valuePainter.layout(maxWidth: paperWidthDots * 0.52);

  final rowHeight = (labelPainter.height > valuePainter.height ? labelPainter.height : valuePainter.height) + 6;
  final scale = 2;
  final scaledWidth = paperWidthDots * scale;
  final scaledHeight = (rowHeight * scale).ceil();

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, scaledWidth.toDouble(), scaledHeight.toDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(
    Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), rowHeight),
    Paint()..color = Colors.white,
  );

  labelPainter.paint(
    canvas,
    Offset(paperWidthDots - labelPainter.width - 4, (rowHeight - labelPainter.height) / 2),
  );
  valuePainter.paint(
    canvas,
    Offset(4, (rowHeight - valuePainter.height) / 2),
  );

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(scaledWidth, scaledHeight);
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

Future<img.Image?> _rasterRule(int paperWidthDots) async {
  const height = 10;
  const scale = 2;
  final scaledWidth = paperWidthDots * scale;
  final scaledHeight = height * scale;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, scaledWidth.toDouble(), scaledHeight.toDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), height.toDouble()), Paint()..color = Colors.white);
  final paint = Paint()
    ..color = Colors.black
    ..strokeWidth = 1.2
    ..style = PaintingStyle.stroke;
  canvas.drawLine(
    Offset(24, height / 2),
    Offset(paperWidthDots - 24, height / 2),
    paint,
  );
  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(scaledWidth, scaledHeight);
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

Future<List<int>> _appendRasterImage(
  Generator generator,
  List<int> bytes,
  img.Image? raster, {
  PosAlign align = PosAlign.center,
}) async {
  if (raster != null) {
    bytes += generator.imageRaster(raster, align: align);
  }
  return bytes;
}

Future<List<int>> _appendRasterOrText(
  Generator generator,
  List<int> bytes,
  String text, {
  required double fontSize,
  required TextAlign align,
  required bool bold,
  required bool muted,
  required bool italic,
  required int paperWidthDots,
}) async {
  if (text.trim().isEmpty) return bytes;

  if (_hasNonAscii(text)) {
    final raster = await _rasterText(
      text,
      align: align,
      fontSize: fontSize,
      bold: bold,
      muted: muted,
      italic: italic,
      paperWidthDots: paperWidthDots,
    );
    return await _appendRasterImage(generator, bytes, raster, align: _toPosAlign(align));
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

Future<List<int>> buildEscPosBytesFromPayload(
  DeliveryReceiptPrintPayload payload, {
  String? serverUrl,
}) async {
  await _ensurePrintFonts();
  final paperMm = _normalizePaperMm(payload.paperMm);
  final paperWidthDots = _paperWidthDotsFor(paperMm);
  final generator = await _generatorFor(paperMm);
  var bytes = <int>[];
  bytes += generator.reset();

  for (final block in payload.blocks) {
    switch (block.type) {
      case 'logo':
        if (block.url != null && block.url!.isNotEmpty) {
          final logo = await _loadLogoImage(block.url!, serverUrl, block.maxWidth ?? 200);
          if (logo != null) {
            bytes += generator.imageRaster(logo, align: PosAlign.center);
          }
        }
        break;
      case 'text':
      case 'title':
      case 'hero':
      case 'caption':
      case 'receiptId':
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.text ?? '',
          fontSize: (block.fontSize ?? 18).toDouble(),
          align: block.type == 'receiptId' ? TextAlign.center : _toTextAlign(block.align, block.text ?? ''),
          bold: block.bold || block.type == 'hero' || block.type == 'title',
          muted: block.muted || block.type == 'receiptId' || block.type == 'caption',
          italic: block.italic,
          paperWidthDots: paperWidthDots,
        );
        break;
      case 'rule':
        final rule = await _rasterRule(paperWidthDots);
        bytes = await _appendRasterImage(generator, bytes, rule);
        break;
      case 'spacer':
        final feeds = block.count.clamp(1, 4);
        for (var i = 0; i < feeds; i++) {
          bytes += generator.feed(1);
        }
        break;
      case 'blank':
        for (var i = 0; i < block.count.clamp(1, 3); i++) {
          bytes += generator.feed(1);
        }
        break;
      case 'pair':
        final pair = await _rasterPairRow(
          block.label ?? '',
          block.value ?? '',
          labelFont: (block.labelFont ?? 14).toDouble(),
          valueFont: (block.valueFont ?? 18).toDouble(),
          paperWidthDots: paperWidthDots,
        );
        bytes = await _appendRasterImage(generator, bytes, pair);
        break;
      case 'amount':
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.value ?? '',
          fontSize: (block.fontSize ?? 38).toDouble(),
          align: TextAlign.center,
          bold: true,
          muted: false,
          italic: false,
          paperWidthDots: paperWidthDots,
        );
        break;
      // توافق مع القوالب القديمة
      case 'divider':
      case 'doubleDivider':
      case 'ribbon':
      case 'titleBadge':
      case 'ornament':
      case 'metaStart':
      case 'metaEnd':
      case 'customerBox':
      case 'notesBox':
      case 'row':
      case 'amountBox':
      case 'legalBox':
        bytes = await _appendLegacyBlock(
          generator,
          bytes,
          block,
          paperWidthDots: paperWidthDots,
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

Future<List<int>> _appendLegacyBlock(
  Generator generator,
  List<int> bytes,
  DeliveryReceiptPrintBlock block, {
  required int paperWidthDots,
}) async {
  switch (block.type) {
    case 'divider':
      final rule = await _rasterRule(paperWidthDots);
      return await _appendRasterImage(generator, bytes, rule);
    case 'doubleDivider':
      final rule = await _rasterRule(paperWidthDots);
      bytes = await _appendRasterImage(generator, bytes, rule);
      return await _appendRasterImage(generator, bytes, rule);
    case 'row':
      return await _appendRasterImage(
        generator,
        bytes,
        await _rasterPairRow(
          block.label ?? '',
          block.value ?? '',
          labelFont: (block.labelFont ?? 14).toDouble(),
          valueFont: (block.valueFont ?? 18).toDouble(),
          paperWidthDots: paperWidthDots,
        ),
      );
    case 'amount':
    case 'amountBox':
      if (block.label != null && block.label!.trim().isNotEmpty) {
        bytes = await _appendRasterOrText(
          generator,
          bytes,
          block.label!,
          fontSize: 14,
          align: TextAlign.center,
          bold: false,
          muted: true,
          italic: false,
          paperWidthDots: paperWidthDots,
        );
      }
      return await _appendRasterOrText(
        generator,
        bytes,
        block.value ?? '',
        fontSize: (block.fontSize ?? 36).toDouble(),
        align: TextAlign.center,
        bold: true,
        muted: false,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
    case 'legalBox':
    case 'caption':
      bytes = await _appendRasterOrText(
        generator,
        bytes,
        block.text ?? '',
        fontSize: (block.fontSize ?? 14).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      return bytes;
    case 'notesBox':
      bytes = await _appendRasterOrText(
        generator,
        bytes,
        block.label ?? 'ملاحظات',
        fontSize: (block.labelFont ?? 14).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      return await _appendRasterOrText(
        generator,
        bytes,
        block.text ?? '',
        fontSize: (block.fontSize ?? 16).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: false,
        italic: true,
        paperWidthDots: paperWidthDots,
      );
    case 'customerBox':
      bytes = await _appendRasterOrText(
        generator,
        bytes,
        block.label ?? 'الزبون',
        fontSize: (block.labelFont ?? 14).toDouble(),
        align: TextAlign.right,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      return await _appendRasterOrText(
        generator,
        bytes,
        block.value ?? '',
        fontSize: (block.valueFont ?? 24).toDouble(),
        align: TextAlign.right,
        bold: true,
        muted: false,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
    case 'titleBadge':
    case 'ribbon':
      bytes = await _appendRasterOrText(
        generator,
        bytes,
        block.text ?? '',
        fontSize: (block.fontSize ?? 26).toDouble(),
        align: TextAlign.center,
        bold: true,
        muted: false,
        italic: false,
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
          muted: true,
          italic: false,
          paperWidthDots: paperWidthDots,
        );
      }
      return bytes;
    case 'ornament':
      return bytes;
    case 'metaStart':
    case 'metaEnd':
      return bytes;
    default:
      return bytes;
  }
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

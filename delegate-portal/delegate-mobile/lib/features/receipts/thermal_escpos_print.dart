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

/// 2× للنص العربي — 1× يظهر خشناً على طابعات 203dpi.
const _kRasterScale = 2;

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
  final width = uiImage.width;
  final height = uiImage.height;
  final byteData = await uiImage.toByteData(format: ui.ImageByteFormat.rawRgba);
  uiImage.dispose();
  if (byteData == null) return null;
  return img.Image.fromBytes(
    width: width,
    height: height,
    bytes: byteData.buffer,
    numChannels: 4,
    order: img.ChannelOrder.rgba,
  );
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

  const scale = _kRasterScale;
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
  const scale = _kRasterScale;
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

/// شريط العنوان بخلفية سوداء ونص أبيض — يبرز نوع المستند فوراً.
Future<img.Image?> _rasterBadge(
  String text, {
  required double fontSize,
  required int paperWidthDots,
}) async {
  await _ensurePrintFonts();
  final trimmed = text.trim();
  if (trimmed.isEmpty) return null;

  final painter = TextPainter(
    text: TextSpan(
      text: trimmed,
      style: GoogleFonts.cairo(fontSize: fontSize, fontWeight: FontWeight.w700, color: Colors.white, height: 1.2),
    ),
    textDirection: _looksArabic(trimmed) ? TextDirection.rtl : TextDirection.ltr,
    textAlign: TextAlign.center,
    maxLines: 1,
  );
  painter.layout(maxWidth: paperWidthDots * 0.8);

  final boxHeight = painter.height + 18;
  final totalHeight = boxHeight + 12;
  const scale = _kRasterScale;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, (paperWidthDots * scale).toDouble(), (totalHeight * scale).ceilToDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), totalHeight), Paint()..color = Colors.white);

  final boxWidth = painter.width + 56;
  final boxLeft = (paperWidthDots - boxWidth) / 2;
  canvas.drawRRect(
    RRect.fromRectAndRadius(
      Rect.fromLTWH(boxLeft, 6, boxWidth, boxHeight),
      const Radius.circular(6),
    ),
    Paint()..color = Colors.black,
  );
  painter.paint(canvas, Offset(boxLeft + 28, 6 + (boxHeight - painter.height) / 2));

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(paperWidthDots * scale, (totalHeight * scale).ceil());
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

/// صندوق المبلغ — إطار واضح يمنع اللبس في قيمة الاستلام.
Future<img.Image?> _rasterAmountBox(
  String label,
  String value,
  String? sub, {
  required double valueFont,
  required double labelFont,
  required int paperWidthDots,
}) async {
  await _ensurePrintFonts();
  if (value.trim().isEmpty) return null;

  TextPainter build(String text, double size, FontWeight weight) {
    final p = TextPainter(
      text: TextSpan(
        text: text,
        style: GoogleFonts.cairo(fontSize: size, fontWeight: weight, color: Colors.black, height: 1.2),
      ),
      textDirection: _looksArabic(text) ? TextDirection.rtl : TextDirection.ltr,
      textAlign: TextAlign.center,
      maxLines: 1,
    );
    p.layout(maxWidth: paperWidthDots * 0.82);
    return p;
  }

  final labelPainter = build(label, labelFont, FontWeight.w600);
  final valuePainter = build(value, valueFont, FontWeight.w700);
  final subPainter = (sub != null && sub.trim().isNotEmpty) ? build(sub, labelFont, FontWeight.w600) : null;

  const padV = 14.0;
  final inner = labelPainter.height + 6 + valuePainter.height + (subPainter != null ? 4 + subPainter.height : 0);
  final boxHeight = inner + padV * 2;
  final totalHeight = boxHeight + 16;
  const scale = _kRasterScale;
  const margin = 26.0;

  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, (paperWidthDots * scale).toDouble(), (totalHeight * scale).ceilToDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), totalHeight), Paint()..color = Colors.white);

  canvas.drawRRect(
    RRect.fromRectAndRadius(
      Rect.fromLTWH(margin, 8, paperWidthDots - margin * 2, boxHeight),
      const Radius.circular(8),
    ),
    Paint()
      ..color = Colors.black
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2,
  );

  var y = 8 + padV;
  labelPainter.paint(canvas, Offset((paperWidthDots - labelPainter.width) / 2, y));
  y += labelPainter.height + 6;
  valuePainter.paint(canvas, Offset((paperWidthDots - valuePainter.width) / 2, y));
  if (subPainter != null) {
    y += valuePainter.height + 4;
    subPainter.paint(canvas, Offset((paperWidthDots - subPainter.width) / 2, y));
  }

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(paperWidthDots * scale, (totalHeight * scale).ceil());
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

/// سطر توقيع الزبون.
Future<img.Image?> _rasterSignature(String label, int paperWidthDots) async {
  await _ensurePrintFonts();
  final painter = TextPainter(
    text: TextSpan(
      text: label,
      style: GoogleFonts.cairo(fontSize: 15, fontWeight: FontWeight.w600, color: const Color(0xFF334155), height: 1.2),
    ),
    textDirection: TextDirection.rtl,
    maxLines: 1,
  );
  painter.layout(maxWidth: paperWidthDots * 0.5);

  final totalHeight = painter.height + 34;
  const scale = _kRasterScale;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, (paperWidthDots * scale).toDouble(), (totalHeight * scale).ceilToDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), totalHeight), Paint()..color = Colors.white);

  final lineY = 18.0;
  canvas.drawLine(
    Offset(paperWidthDots * 0.12, lineY),
    Offset(paperWidthDots * 0.62, lineY),
    Paint()
      ..color = Colors.black
      ..strokeWidth = 1.4,
  );
  painter.paint(canvas, Offset(paperWidthDots * 0.66, lineY - painter.height / 2));

  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(paperWidthDots * scale, (totalHeight * scale).ceil());
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

/// فاصل منقّط — أخف بصرياً من الخط المصمت ويفصل الأقسام بوضوح.
Future<img.Image?> _rasterDashedRule(int paperWidthDots) async {
  const height = 12;
  const scale = _kRasterScale;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(
    recorder,
    Rect.fromLTWH(0, 0, (paperWidthDots * scale).toDouble(), (height * scale).toDouble()),
  );
  canvas.scale(scale.toDouble());
  canvas.drawRect(Rect.fromLTWH(0, 0, paperWidthDots.toDouble(), height.toDouble()), Paint()..color = Colors.white);
  final paint = Paint()
    ..color = Colors.black
    ..strokeWidth = 1.6;
  const dash = 8.0;
  const gap = 6.0;
  for (var x = 24.0; x < paperWidthDots - 24; x += dash + gap) {
    final end = (x + dash).clamp(0.0, paperWidthDots - 24.0);
    canvas.drawLine(Offset(x, height / 2), Offset(end, height / 2), paint);
  }
  final picture = recorder.endRecording();
  final uiImage = await picture.toImage(paperWidthDots * scale, height * scale);
  final hi = await _uiImageToImg(uiImage);
  if (hi == null) return null;
  return img.copyResize(hi, width: paperWidthDots, interpolation: img.Interpolation.cubic);
}

Future<img.Image?> _rasterRule(int paperWidthDots) async {
  const height = 10;
  const scale = _kRasterScale;
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

/// ارتفاع سطر التغذية الواحد على طابعة 203dpi.
const _feedLineDots = 8;

/// يجمّع الفاتورة كلها في صورة واحدة. إرسالها كأمر رسم واحد يجعل الورق
/// يخرج بحركة متصلة، بدل توقف الطابعة بين كل عنصر وآخر بانتظار البيانات.
class _ReceiptCanvas {
  _ReceiptCanvas(this.width);

  final int width;
  final List<img.Image> _parts = [];

  void add(img.Image? raster) {
    if (raster == null) return;
    _parts.add(raster.width == width ? raster : _center(raster));
  }

  void feed(int lines) {
    if (lines <= 0) return;
    _parts.add(_blank(lines * _feedLineDots));
  }

  img.Image _blank(int height) {
    final im = img.Image(width: width, height: height);
    img.fill(im, color: img.ColorRgb8(255, 255, 255));
    return im;
  }

  img.Image _center(img.Image src) {
    final scaled = src.width > width
        ? img.copyResize(src, width: width, interpolation: img.Interpolation.average)
        : src;
    final canvas = _blank(scaled.height);
    img.compositeImage(canvas, scaled, dstX: ((width - scaled.width) / 2).round());
    return canvas;
  }

  img.Image? build() {
    if (_parts.isEmpty) return null;
    final height = _parts.fold<int>(0, (sum, p) => sum + p.height);
    final out = _blank(height);
    var y = 0;
    for (final part in _parts) {
      img.compositeImage(out, part, dstY: y);
      y += part.height;
    }
    return out;
  }
}

Future<void> _addText(
  _ReceiptCanvas canvas,
  String text, {
  required double fontSize,
  required TextAlign align,
  required bool bold,
  required bool muted,
  required bool italic,
  required int paperWidthDots,
}) async {
  if (text.trim().isEmpty) return;
  canvas.add(await _rasterText(
    text,
    align: align,
    fontSize: fontSize,
    bold: bold,
    muted: muted,
    italic: italic,
    paperWidthDots: paperWidthDots,
  ));
}

Future<List<int>> buildEscPosBytesFromPayload(
  DeliveryReceiptPrintPayload payload, {
  String? serverUrl,
}) async {
  await _ensurePrintFonts();
  final paperMm = _normalizePaperMm(payload.paperMm);
  final paperWidthDots = _paperWidthDotsFor(paperMm);
  final generator = await _generatorFor(paperMm);
  final canvas = _ReceiptCanvas(paperWidthDots);

  for (final block in payload.blocks) {
    await _renderBlock(canvas, block, paperWidthDots: paperWidthDots, serverUrl: serverUrl);
  }

  var bytes = <int>[];
  bytes += generator.reset();

  final composite = canvas.build();
  if (composite != null) {
    bytes += generator.imageRaster(_padRasterHeight(_trimVertical(composite)), align: PosAlign.center);
  }

  // سطر واحد للتمزيق. cut() على طابعات BLE بدون قاطع يفرّغ ورقاً طويلاً.
  bytes += generator.feed(1);
  return bytes;
}

/// ارتفاع الصورة يجب أن يكون مضاعف 8 حتى لا تظهر خطوط بيضاء بين صفوف النقط.
img.Image _padRasterHeight(img.Image src) {
  final rem = src.height % 8;
  if (rem == 0) return src;
  final padded = img.Image(width: src.width, height: src.height + (8 - rem));
  img.fill(padded, color: img.ColorRgb8(255, 255, 255));
  img.compositeImage(padded, src);
  return padded;
}

img.Image _trimVertical(img.Image src) {
  var top = 0;
  var bottom = src.height - 1;

  bool rowHasInk(int y) {
    for (var x = 0; x < src.width; x++) {
      final p = src.getPixel(x, y);
      if (p.a > 8 && (p.r < 248 || p.g < 248 || p.b < 248)) return true;
    }
    return false;
  }

  while (top < bottom && !rowHasInk(top)) {
    top++;
  }
  while (bottom > top && !rowHasInk(bottom)) {
    bottom--;
  }

  final pad = 4;
  top = (top - pad).clamp(0, src.height - 1);
  bottom = (bottom + pad).clamp(0, src.height - 1);
  if (bottom <= top) return src;
  return img.copyCrop(src, x: 0, y: top, width: src.width, height: bottom - top + 1);
}

Future<void> _renderBlock(
  _ReceiptCanvas canvas,
  DeliveryReceiptPrintBlock block, {
  required int paperWidthDots,
  String? serverUrl,
}) async {
  switch (block.type) {
    case 'logo':
      if (block.url != null && block.url!.isNotEmpty) {
        final logo = await _loadLogoImage(block.url!, serverUrl, block.maxWidth ?? 200);
        if (logo != null) {
          canvas.add(logo);
          canvas.feed(1);
        }
      }
      return;
    case 'text':
    case 'title':
    case 'hero':
    case 'caption':
    case 'receiptId':
      await _addText(
        canvas,
        block.text ?? '',
        fontSize: (block.fontSize ?? 18).toDouble(),
        align: block.type == 'receiptId' ? TextAlign.center : _toTextAlign(block.align, block.text ?? ''),
        bold: block.bold || block.type == 'hero' || block.type == 'title',
        muted: block.muted || block.type == 'receiptId' || block.type == 'caption',
        italic: block.italic,
        paperWidthDots: paperWidthDots,
      );
      return;
    case 'rule':
    case 'divider':
      canvas.add(await _rasterRule(paperWidthDots));
      return;
    case 'dashedRule':
      canvas.add(await _rasterDashedRule(paperWidthDots));
      return;
    case 'signature':
      canvas.add(await _rasterSignature(block.label ?? 'توقيع المستلم', paperWidthDots));
      return;
    case 'doubleDivider':
      canvas.add(await _rasterRule(paperWidthDots));
      canvas.add(await _rasterRule(paperWidthDots));
      return;
    case 'spacer':
      canvas.feed(block.count.clamp(1, 4));
      return;
    case 'blank':
      canvas.feed(block.count.clamp(1, 3));
      return;
    case 'pair':
    case 'row':
      canvas.add(await _rasterPairRow(
        block.label ?? '',
        block.value ?? '',
        labelFont: (block.labelFont ?? 14).toDouble(),
        valueFont: (block.valueFont ?? 18).toDouble(),
        paperWidthDots: paperWidthDots,
      ));
      return;
    case 'amount':
    case 'amountBox':
      canvas.add(await _rasterAmountBox(
        block.label ?? 'المبلغ المستلم',
        block.value ?? '',
        block.subText,
        valueFont: (block.fontSize ?? 38).toDouble(),
        labelFont: (block.labelFont ?? 15).toDouble(),
        paperWidthDots: paperWidthDots,
      ));
      return;
    case 'legalBox':
      await _addText(
        canvas,
        block.text ?? '',
        fontSize: (block.fontSize ?? 14).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      return;
    case 'notesBox':
      await _addText(
        canvas,
        block.label ?? 'ملاحظات',
        fontSize: (block.labelFont ?? 14).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      await _addText(
        canvas,
        block.text ?? '',
        fontSize: (block.fontSize ?? 16).toDouble(),
        align: TextAlign.center,
        bold: false,
        muted: false,
        italic: true,
        paperWidthDots: paperWidthDots,
      );
      return;
    case 'customerBox':
      await _addText(
        canvas,
        block.label ?? 'الزبون',
        fontSize: (block.labelFont ?? 14).toDouble(),
        align: TextAlign.right,
        bold: false,
        muted: true,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      await _addText(
        canvas,
        block.value ?? '',
        fontSize: (block.valueFont ?? 24).toDouble(),
        align: TextAlign.right,
        bold: true,
        muted: false,
        italic: false,
        paperWidthDots: paperWidthDots,
      );
      return;
    case 'titleBadge':
    case 'ribbon':
      canvas.add(await _rasterBadge(
        block.text ?? '',
        fontSize: (block.fontSize ?? 26).toDouble(),
        paperWidthDots: paperWidthDots,
      ));
      if (block.subText != null && block.subText!.trim().isNotEmpty) {
        await _addText(
          canvas,
          block.subText!,
          fontSize: (block.subFontSize ?? 14).toDouble(),
          align: TextAlign.center,
          bold: false,
          muted: true,
          italic: false,
          paperWidthDots: paperWidthDots,
        );
      }
      return;
    default:
      return;
  }
}

Future<List<int>> buildTestPrintBytes({
  String? agentName,
  Map<String, dynamic>? template,
  String? serverUrl,
}) async {
  final built = buildDeliveryReceiptPrintBlocks(
    DeliveryReceipt(
      id: 0,
      deliveryNo: 'WR-20260824-0001',
      status: 'issued',
      statusLabel: '',
      amount: 250000,
      receiptDate: DateTime.now().toIso8601String().split('T').first,
      customerName: 'محل الأمين / بغداد',
      customerNum: '1201042',
      treeName: 'شجرة بغداد',
    ),
    template: template,
    agentName: agentName,
  );
  final sample = DeliveryReceiptPrintPayload(
    blocks: built.blocks,
    footerBlankLines: 1,
    paperMm: built.paperMm,
  );
  return await buildEscPosBytesFromPayload(sample, serverUrl: serverUrl);
}

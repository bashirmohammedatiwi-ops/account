import 'dart:io';
import 'dart:typed_data';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

Future<void> saveAndOpenPdf(List<int> bytes, String filename) async {
  final dir = await getTemporaryDirectory();
  final file = File('${dir.path}/$filename');
  await file.writeAsBytes(bytes);
  await OpenFilex.open(file.path);
}

Future<void> saveAndOpenPdfFromBytes(Uint8List bytes, String filename) =>
    saveAndOpenPdf(bytes, filename);

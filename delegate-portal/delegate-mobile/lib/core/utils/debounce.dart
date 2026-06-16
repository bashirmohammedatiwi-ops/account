import 'dart:async';

import 'package:flutter/foundation.dart';

/// تأخير بسيط للبحث — يقلّل إعادة البناء أثناء الكتابة
class Debouncer {
  Debouncer({this.duration = const Duration(milliseconds: 280)});

  final Duration duration;
  Timer? _timer;

  void run(VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(duration, action);
  }

  void dispose() => _timer?.cancel();
}

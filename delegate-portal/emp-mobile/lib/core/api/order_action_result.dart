import '../../models/models.dart';

class OrderActionResult {
  const OrderActionResult({required this.order, this.notify});

  final PurchaseOrder order;
  final Map<String, dynamic>? notify;
}

String notifyUserMessage(Map<String, dynamic>? notify) {
  if (notify == null) return '';
  if (notify['ok'] == true && notify['alreadyNotified'] == true) {
    return 'الطلب مُرسل مسبقاً لتطبيق الأدمن';
  }
  if (notify['ok'] == true && notify['skipped'] == true) {
    return 'تم التجهيز — إرسال الأدمن غير مفعّل على الخادم';
  }
  if (notify['ok'] == true) {
    return 'تم التجهيز — أُرسل الطلب لتطبيق الأدمن ✓';
  }
  final err = notify['error']?.toString();
  if (err != null && err.isNotEmpty) {
    return 'تم التجهيز لكن تعذّر الإرسال للأدمن: $err';
  }
  return 'تم التجهيز لكن تعذّر الإرسال لتطبيق الأدمن';
}

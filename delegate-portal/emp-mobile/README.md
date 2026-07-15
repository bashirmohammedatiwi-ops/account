# Edari Emp — تطبيق موظفي تجهيز الطلبات (Flutter) v2.0

تطبيق هاتف احترافي لموظفي التجهيز يتصل بـ `/api/emp` على خادم delegate-portal.

## الميزات

- **تصميم جديد بالكامل** — واجهة عصرية مع تدرجات وألوان واضحة
- **3 تبويبات:** الطلبات · الإحصائيات · حسابي
- **بحث** في الطلبات (رقم، زبون، فرع، فاتورة شورجة)
- **فلاتر** حسب المصدر (شورجة / مندوبين) والحالة
- **لوحة إحصائيات** مع عدادات يومية
- **الوضع الداكن** من شاشة الحساب
- تفاصيل الطلب مع شريط إجراءات سفلي سريع
- تعديل الكمية والهدايا والتيستر لكل بند
- إشعارات عند وصول طلب جديد

## التشغيل

```bash
cd delegate-portal
npm start

cd emp-mobile
flutter pub get
flutter run
```

## عنوان الخادم

عدّل `lib/config/app_config.dart`:

```dart
const defaultServerUrl = 'http://YOUR_SERVER:5005';
```

## الإشعارات

### بدون إعداد (يعمل مباشرة)

- التطبيق يفحص الطلبات الجديدة كل 45 ثانية ويعرض إشعاراً محلياً.

### إشعارات FCM (اختياري — للخلفية)

1. أنشئ مشروع Firebase وأضف تطبيق Android.
2. ضع `google-services.json` في `emp-mobile/android/app/`.
3. على الخادم أضف في `.env`:

```
FCM_SERVER_KEY=your_firebase_server_key
```

4. عند إرسال طلب جديد من المندوب، يُرسل إشعار push لجميع أجهزة الموظفين المسجّلة.

## بناء APK

```bash
cd emp-mobile
flutter build apk --release
```

الملف: `build/app/outputs/flutter-apk/app-release.apk`

## حساب الدخول

- المستخدم: `allemp` (أو `EMP_USER` من `.env`)
- كلمة المرور: من `EMP_PASS` في `.env`

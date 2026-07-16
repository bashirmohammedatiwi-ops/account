# Edari Emp — تطبيق موظفي تجهيز الطلبات (Flutter) v3.8

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

1. أنشئ مشروع Firebase وأضف تطبيق Android و iOS.
2. ضع `google-services.json` في `emp-mobile/android/app/`.
3. ضع `GoogleService-Info.plist` في `emp-mobile/ios/Runner/` وأضفه في Xcode.
4. على الخادم أضف في `.env`:

```
FCM_SERVER_KEY=your_firebase_server_key
```

5. عند إرسال طلب جديد من المندوب، يُرسل إشعار push لجميع أجهزة الموظفين المسجّلة.

## بناء Android (APK)

```bash
cd emp-mobile
flutter build apk --release
```

الملف: `build/app/outputs/flutter-apk/app-release.apk`

## بناء iOS والرفع عبر Xcode

**المتطلبات:** Mac، Xcode، حساب Apple Developer.

| البند | القيمة |
|--------|--------|
| Bundle ID | `com.edari.edariEmp` |
| اسم التطبيق | تجهيز الطلبات |
| الإصدار | من `pubspec.yaml` (مثلاً `3.8.0+9`) |

### 1. تجهيز المشروع

```bash
cd delegate-portal/emp-mobile
flutter pub get
cd ios && pod install && cd ..
```

### 2. فتح Xcode

```bash
open ios/Runner.xcworkspace
```

> افتح **Runner.xcworkspace** وليس `Runner.xcodeproj`.

### 3. التوقيع (Signing)

1. اختر هدف **Runner** من القائمة اليسرى.
2. تبويب **Signing & Capabilities**.
3. فعّل **Automatically manage signing**.
4. اختر **Team** (حساب Apple Developer).
5. تأكد أن Bundle Identifier = `com.edari.edariEmp`.

### 4. الأرشفة والرفع

1. من القائمة: **Product → Destination → Any iOS Device (arm64)**.
2. **Product → Archive**.
3. عند اكتمال الأرشفة: **Distribute App → App Store Connect → Upload**.

أو من الطرفية:

```bash
flutter build ipa --release
```

ثم ارفع الملف من `build/ios/ipa/*.ipa` عبر تطبيق **Transporter**.

### 5. قبل الرفع

- تأكد أن عنوان الخادم في `app_config.dart` يشير إلى السيرفر الإنتاجي.
- أنشئ التطبيق في [App Store Connect](https://appstoreconnect.apple.com) بنفس Bundle ID.
- عند سؤال التشفير في App Store Connect: التطبيق **لا يستخدم تشفيراً معفى** (`ITSAppUsesNonExemptEncryption = false`).

## حساب الدخول

- المستخدم: `allemp` (أو `EMP_USER` من `.env`)
- كلمة المرور: من `EMP_PASS` في `.env`

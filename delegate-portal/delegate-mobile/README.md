# Edari Delegate — تطبيق المندوب (Flutter)

تطبيق **Flutter** للهاتف والتابلت يتصل بنفس واجهة ويب المندوب `/api/mobile` — بتصميم مميز ومتجاوب.

## الميزات (مطابقة ويب المندوب + أكثر)

| القسم | الوظائف |
|--------|---------|
| **كشوف الحساب** | الأشجار → الزبائن → كشف الحركات → PDF → تفاصيل الفاتورة |
| **المنتجات** | فروع → أقسام → بطاقات منتجات + كمية/هدية → فاتورة حية → إرسال طلب |
| **طلباتي** | قائمة الطلبات + تفاصيل + حالة |
| **سند قبض** | اختيار زبون + مبلغ/عمولة/حسم → إرسال للمراجعة |
| **زبون جديد** | اختيار شجرة + بيانات الزبون → إرسال للمراجعة |
| **تقارير** | ملخص مبيعات/مردود/صافي + قائمة فواتير |

## التصميم

- واجهة عربية RTL + خط Cairo
- **هاتف:** شبكة تطبيقات 2–3 أعمدة، بطاقات مميزة، سحب للتحديث
- **تابلت (≥900px):** شريط تنقل جانبي ثابت + تخطيط عمودين للنماذج
- **iPad كبير:** كشوف حساب بثلاثة أعمدة، منتجات بلوحة جانبية

## التشغيل

```bash
cd delegate-portal/delegate-mobile
flutter pub get
flutter run -d chrome      # Windows بدون محاكي
flutter run -d windows     # يتطلب Developer Mode
flutter run -d android     # هاتف أو محاكي
```

### تسجيل الدخول

حساب **مندوب** من لوحة الإدارة (اسم مستخدم + كلمة مرور).  
الخادم الافتراضي: `http://187.124.23.65:5005` — يُغيّر من الإعدادات.

## البنية

```
lib/
├── core/          # API، Auth، Theme، Router، Widgets
├── features/      # auth, home, accounts, commerce, orders, receipts, customers, reports
├── models/        # نماذج JSON
└── config/        # عنوان الخادم
```

## البناء للإنتاج

```bash
flutter build apk --release
flutter build appbundle --release   # Google Play
```

## بناء iOS والرفع عبر TestFlight / Xcode

**المتطلبات:** Mac، Xcode، حساب Apple Developer.

| البند | القيمة |
|--------|--------|
| Bundle ID | `com.edari.edariDelegate` |
| اسم التطبيق | المندوب |
| الإصدار | `1.2.2+7` |

### 1. تجهيز المشروع

```bash
cd delegate-portal/delegate-mobile
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
5. تأكد أن Bundle Identifier = `com.edari.edariDelegate`.

### 4. الأرشفة والرفع إلى TestFlight

1. من القائمة: **Product → Destination → Any iOS Device (arm64)**.
2. **Product → Archive**.
3. عند اكتمال الأرشفة: **Distribute App → App Store Connect → Upload**.

أو من الطرفية:

```bash
flutter build ipa --release --export-options-plist=ios/ExportOptions.plist
```

ثم ارفع الملف من `build/ios/ipa/*.ipa` عبر تطبيق **Transporter** أو من Xcode Organizer.

### 5. قبل الرفع

- تأكد أن عنوان الخادم في `lib/config/app_config.dart` يشير إلى السيرفر الإنتاجي (`http://187.124.23.65:5005`).
- أنشئ التطبيق في [App Store Connect](https://appstoreconnect.apple.com) بنفس Bundle ID `com.edari.edariDelegate`.
- بعد الرفع: من App Store Connect → **TestFlight** → أضف المختبرين الداخليين أو الخارجيين.
- عند سؤال التشفير: التطبيق **لا يستخدم تشفيراً معفى** (`ITSAppUsesNonExemptEncryption = false`).

## الإصدار

**1.2.2** — إصلاح الجلسة على iOS، جلب البيانات بعد الدخول، iOS 15+.

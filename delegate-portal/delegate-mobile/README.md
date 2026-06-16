# Edari Delegate — تطبيق المندوب (Flutter)

تطبيق iOS/Android (مُحسّن للآيباد) يتصل بنفس واجهة ويب المندوب `/api/mobile`.

## الميزات

| القسم | الوظائف |
|--------|---------|
| **كشوف الحساب** | الأشجار → الزبائن → كشف الحركات → PDF → تفاصيل الفاتورة |
| **المنتجات** | فروع → أقسام → بطاقات منتجات + كمية/هدية → فاتورة حية → إرسال للإدارة |
| **طلباتي** | قائمة الطلبات + تفاصيل + حالة |
| **تقارير** | ملخص مبيعات/مردود/صافي + قائمة فواتير + تحميل المزيد |

## التشغيل

```bash
cd delegate-portal/delegate-mobile
flutter pub get
flutter devices
flutter run -d chrome    # Windows بدون Android/iOS
# أو
flutter run -d windows   # يتطلب تفعيل Developer Mode في Windows
```

### Windows (بدون هاتف أو محاكي)

المشروع يدعم **Chrome** و **Windows desktop** بالإضافة إلى Android/iOS.

| المنصة | الأمر | ملاحظة |
|--------|-------|--------|
| **Chrome** | `flutter run -d chrome` | يعمل مباشرة |
| **Windows** | `flutter run -d windows` | فعّل **Developer Mode** من: الإعدادات → الخصوصية والأمان → للمطورين |
| **Android** | `flutter run -d android` | يحتاج محاكي أو هاتف USB |

### تسجيل الدخول

سجّل دخول بحساب **مندوب** من لوحة الإدارة (اسم مستخدم + كلمة مرور).

## البنية

```
lib/
├── core/          # API، Auth، Theme، Router
├── features/      # الشاشات (auth, home, accounts, commerce, reports)
├── models/        # نماذج JSON
└── config/        # عنوان الخادم
```

## iPad

- **≥1000px**: كشوف الحساب بثلاثة أعمدة (أشجار | زبائن | كشف)
- **≥900px**: NavigationRail جانبي
- RTL + خط Cairo

## ميزات إضافية

- بحث شامل في الحسابات (`/api/mobile/search`)
- باركود المنتج (`/api/mobile/products/lookup`)
- مسودة فاتورة محفوظة + متابعة
- PDF لكل فاتورة من كشف الحساب
- عرض الديون في الكشف

## البناء للإنتاج

```bash
# iOS (يتطلب Mac + Xcode)
flutter build ipa

# Android
flutter build apk --release
```

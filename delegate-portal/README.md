# Edari Delegate Portal

Backend + **Admin desktop app** + APIs for delegate account statements.

## تشغيل تطبيق الإدارة (سطح المكتب)

```
delegate-portal\start-admin.vbs
```

أو:

```
delegate-portal\admin-app\start.vbs
```

يفتح **لوحة التحكم** مباشرة بدون تسجيل دخول.

## ماذا تفعل لوحة التحكم؟

1. **رفع البيانات** — من EdariNX إلى السيرفر (زر تحديث ورفع)
2. **المندوبون** — إضافة مندوب + تعيين الشجرات المسموحة
3. **شجرات الحسابات** — عرض المجموعات بعد الرفع

## أوامر إضافية

```powershell
cd delegate-portal
npm install
npm start          # السيرفر فقط (بدون Electron)
npm run sync       # رفع يدوي من EdariNX
```

## API المندوب (لتطبيق الهاتف لاحقاً)

| Method | Endpoint |
|--------|----------|
| POST | `/api/mobile/login` |
| GET | `/api/mobile/trees` |
| GET | `/api/mobile/accounts/:seq/statement` |

## صلاحيات المندوبين

في **المندوبون** → عيّن شجرة (مثل `12106`). المندوب يرى فقط زبائن هذه الشجرة.

## Environment

`.env` — `PORT`, `SYNC_API_KEY`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASS`

# Edari Account System

نظام كشوف حساب المندوبين مع EdariNX.

## المشاريع

| المجلد | الوصف |
|--------|--------|
| `delegate-portal/` | Backend + لوحة تحكم + تطبيق المندوب (Docker على المنفذ 5005) |
| `edari-reader/` | قراءة EdariNX محلياً عبر ODBC + أداة المزامنة |

## التشغيل السريع

```powershell
cd delegate-portal
npm install
npm start
```

## Docker

```powershell
cd delegate-portal
docker compose up -d --build
```

- Admin: http://localhost:5005/admin
- Mobile: http://localhost:5005/m

## المزامنة من Windows

```powershell
cd delegate-portal
npm run sync
```

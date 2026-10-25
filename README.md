# FieldOps

أساس Field Service Dispatch & Maintenance Management System. التنفيذ الحالي **Stage 1 فقط**. راجع [Architecture وRoadmap](docs/architecture.ar.md) لتصميم النظام وعلاقات الوحدات والقرارات.

## التشغيل المحلي

المتطلبات: Node.js 24، npm، Docker Engine مع Docker Compose.

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma migrate deploy
npm run dev
```

القيم في `.env.example` مخصصة للتطوير المحلي؛ عند تغيير كلمة مرور PostgreSQL حدّث `DATABASE_URL` أيضاً. لا تستخدمها في production ولا ترفع `.env` إلى Git. تغيير password بعد إنشاء volume لا يغير password داخل قاعدة البيانات تلقائياً.

Frontend على port 5173، API على port 3000، وSwagger في `/api/docs`. Vite يمرر `/api` إلى backend؛ production يحتاج reverse proxy مماثلاً. يتم تشغيل dev servers من workspace الخاص بكل تطبيق حتى يقرأ backend ملف `.env` الصحيح.

```bash
npm run typecheck
npm test
npm run build
curl --fail http://127.0.0.1:3000/api/v1/health
curl --fail http://127.0.0.1:3000/api/v1/health/ready
```

اختبارات Jest/Supertest تختبر HTTP health مع database mock، واختبارات Vitest تختبر API contract والأخطاء. readiness request إلى الخادم الجاري يفحص PostgreSQL الحقيقي. لا توجد اختبارات لميزات غير مطبّقة.

لإعادة تطبيق migrations الموجودة دون إنشاء migration جديدة:

```bash
npm exec -w @fieldops/api -- prisma migrate deploy
```

إيقاف الخوادم بـ Ctrl+C، وقاعدة البيانات بـ `docker compose down`. البيانات تبقى في volume؛ `docker compose down -v` يحذف بيانات التطوير نهائياً.

## ما لم يُنفّذ بعد

Authentication، الأدوار، tenant authorization، Requests، Work Orders، Tracking، Uploads، Notifications وAnalytics تصميم موثّق فقط. النظام الحالي ليس تطبيقاً جاهزاً للإنتاج. لن تبدأ Stage 2 دون موافقة صريحة.

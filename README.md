# FieldOps

نظام Field Service Dispatch & Maintenance Management مبني باستخدام React + TypeScript + Vite وNestJS وPostgreSQL وPrisma.

## الحالة الحالية — 26 أكتوبر 2026

- **Stages 1–5:** الأساس ودورة الصيانة الأساسية منفذة.
- **Stage 6A:** Tracking Backend وخريطة React Leaflet ومشاركة موقع صريحة ومحمية منفذة على فرع التطوير.
- **Stage 6B:** Technician Availability وSkills وTime Off والجدولة ومنع تعارض المواعيد منفذة كأساس وظيفي.
- **المتبقي:** Smart Dispatch، استكمال Notifications وتحسينات الصور، Security Audit حديث، Docker/CI متكاملان، ثم Deployment والاختبارات النهائية.

راجع [تقرير حالة المراحل والبرومتات المتبقية بالعربية](docs/status/FieldOps-roadmap-progress.ar.md) قبل متابعة التنفيذ. بعض تقارير الحالة الأقدم تصف حالة ما قبل Tracking/Scheduling.

**فرع التطوير الحالي:** `feature/stage-6a-tracking-backend`. هذه التغييرات لم تُدمج في `main` بعد.

المراجع:
- [Architecture وRoadmap](docs/architecture.ar.md)
- [المصادقة والصلاحيات](docs/authentication.ar.md)
- [تصميم قاعدة البيانات والعزل](docs/database.ar.md)
- [معمارية الواجهة](docs/frontend.ar.md)
- [دورة العمل وSocket.IO والاختبارات](docs/workflow.ar.md)
- [Stage 6A — Tracking Backend](docs/tracking-backend-hardening.ar.md)
- [Stage 6A — Tracking Frontend](docs/tracking-frontend.ar.md)
- [Stage 6B — Availability & Scheduling](docs/scheduling-stage-6b.ar.md)

## التشغيل المحلي

المتطلبات: Node.js 24، npm، Docker Engine مع Docker Compose.

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
npm ci
npm run auth:configure-local -w @fieldops/api
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

اختبارات Jest/Supertest تختبر HTTP health مع database mock، واختبارات Vitest تختبر API contract والأخطاء. readiness request إلى الخادم الجاري يفحص PostgreSQL الحقيقي. اختبارات PostgreSQL الحقيقية منفصلة: راجع docs/database.ar.md.

لإعادة تطبيق migrations الموجودة دون إنشاء migration جديدة:

```bash
npm exec -w @fieldops/api -- prisma migrate deploy
```

إيقاف الخوادم بـ Ctrl+C، وقاعدة البيانات بـ `docker compose down`. البيانات تبقى في volume؛ `docker compose down -v` يحذف بيانات التطوير نهائياً.

## نطاق التنفيذ الحالي

دورة العمل الأساسية هي Request → Review → WorkOrder → Assignment → Accept → In Progress → Completed → Verified → Closed، مع صور Before/After، التقدم والإلغاء وإعادة التعيين وسجل النشاط. REST/PostgreSQL مصدر الحقيقة، وSocket.IO يرسل إشارات تحديث مصادقاً عليها.

Tracking متاح على فرع التطوير: يبدأ الفني مشاركة الموقع بموافقة صريحة أثناء عمل نشط فقط، وتعرض خريطة Leaflet المواقع الفعلية المصرح بها. Scheduling يدعم التوفر والمهارات والإجازات ونوافذ العمل ومنع التداخل. **Smart Dispatch لم يُنفّذ بعد**؛ راجع تقرير حالة المراحل والبرومتات لتفاصيل ما بقي.


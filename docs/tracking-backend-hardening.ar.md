# Stage 6A — Tracking Backend security and verification

## النطاق

هذا التنفيذ يخص NestJS/Prisma/PostgreSQL فقط، ولا يقوم بتفعيل جمع الموقع تلقائياً في React ولا يضيف Leaflet أو Smart Dispatch.

- تعتمد جميع الكتابات على `PrismaService.forOrganization` بمعاملات `Serializable` و`fieldops_app` مع RLS.
- تأتي هوية الفني و`authSessionId` من JWT مُتحقق منه، وليست من الـbody.
- `POST /tracking/sessions` يحتاج `consent: true` وتكليفاً `ACTIVE` و`acceptedAt` وحالة `IN_PROGRESS`.
- تجدد العينة الناجحة المهلة إلى 120 ثانية، مع حد أدنى 15 ثانية بين العينات ونافذة عمر العينة 30 ثانية وتسامح وقت مستقبلي 5 ثوانٍ.
- تخزن الجلسة **آخر موقع فقط**؛ لا تكتب العينة إلى `TechnicianLocationUpdate` أو `AuditLog` أو `OutboxEvent`.
- `GET /tracking/mine` يعيد معلومات الجلسة دون إحداثيات ولا يعيد تفعيل Geolocation.
- `GET /tracking/locations` متاح لـAdmin وDispatcher النشطين بالمؤسسة فقط، ولا يرجع جلسات منتهية أو فاقدة للصلاحية.
- `DELETE /tracking/sessions/:id` يمحو كل حقول الموقع وينهي الجلسة.

## سحب الصلاحية والتزامن

- `TrackingSession.authSessionId` يرتبط بـ`AuthSession`. Trigger يلغي التتبع عند سحب الجلسة، ويعمل أيضاً عند الإلغاء بعد تغيير كلمة المرور.
- Triggers المرحلة السابقة تلغي التتبع عند تغيير التكليف أو حالة أمر العمل، أو تعليق العضوية وتغيير دورها، أو تعطيل الحساب.
- دوال `SECURITY DEFINER` صغيرة تتحقق من الجلسة وتقفلها بالترتيب `User → AuthSession`، وتقفل عضوية المؤسسة دون منح التطبيق صلاحية تحديثها. لا تُمنح جداول كلمات المرور أو Refresh Tokens لتطبيق `fieldops_app`.
- Lock ordering في العمليات: `WorkOrder → Assignment → TrackingSession`. لا تستخدم عمليات التتبع مسارات مالك قاعدة البيانات لطلبات HTTP.
- Partial unique index يمنع أكثر من جلسة نشطة لكل فني في مؤسسة واحدة.
- انقضاء الجلسة أو انتهاء التفويض يمنع الإرسال فوراً؛ تنظيف الخلفية يمسح الإحداثيات دورياً. عند انقضاء المهلة ضمن طلب تحديث الموقع، يحدث المسح ضمن Transaction ناجحة قبل إعادة `409`.

## مسارات HTTP

جميعها تحت `/api/v1/organizations/:organizationId/tracking` وتحتاج Bearer token.

| Method | Path | Access |
| --- | --- | --- |
| POST | /sessions | Assigned TECHNICIAN with explicit consent |
| DELETE | /sessions/:id | Session owner |
| POST | /sessions/:id/location | Same TECHNICIAN and JWT AuthSession |
| GET | /mine | TECHNICIAN, metadata only |
| GET | /locations | ADMIN / DISPATCHER only |

جميع الاستجابات لها `Cache-Control: private, no-store`. كل HTTP writes تتطلب `Origin` مطابقاً لـ`WEB_ORIGIN`.

## Windows PowerShell

داخل جذر المستودع:

```powershell
git fetch origin
git switch feature/stage-6a-tracking-backend
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma validate
npm exec -w @fieldops/api -- prisma migrate status
npm exec -w @fieldops/api -- prisma migrate deploy
npm run typecheck
npm run build
npm test
```

إنشاء قاعدة الاختبار فقط إن لم تكن موجودة:

```powershell
docker compose exec -T postgres psql -U fieldops -d postgres -c "CREATE DATABASE fieldops_test;"
$env:TEST_DATABASE_URL = "postgresql://fieldops:local-development-only@localhost:5432/fieldops_test?schema=public"
npm run test:integration -w @fieldops/api
```

تحذير: لا توجّه `TEST_DATABASE_URL` إلى قاعدة التطوير. سكربت الاختبار يرفض قواعد لا ينتهي اسمها بـ`_test`، ويجري Migrations دون Reset. لا تشغّل `prisma migrate reset` على بيانات المشروع.

## ملاحظات وقيود

- قاعدة البيانات تستخدم `authSessionId` اختيارياً للسجلات القديمة، لكن migration تنهي وتعقم جميع الجلسات النشطة السابقة عند تثبيتها. لا يمكن استنتاج الموافقة من جلسة قديمة.
- حالات HTTP مضمونة في خادم التطبيق فقط؛ قاعدة البيانات تستخدم Tenant RLS مع صلاحيات خدمة، ولا تفوض الفني لإجراء SQL مباشر على جدول التتبع.
- لا تُحذف metadata الخاصة بالجلسات المنتهية تلقائياً؛ يجب إضافة سياسة Retention ونسخ احتياطي تراعي البيانات الشخصية عند التجهيز للإنتاج.
- لا تمس migrations الجديدة بيانات `TechnicianLocationUpdate` القديمة. يحتاج الجدول القديم إلى سياسة تنظيف منفصلة بعد مراجعة احتياجات العمل.
- العامل الدوري يعتمد على استمرار عملية API؛ إذا توقف الخادم فلن يجري المسح حتى يعود. ومع ذلك تستبعد قراءات REST الجلسات منتهية الصلاحية.
- إذا طُلب logout دون Refresh Cookie صالح فلن يعرف مسار المصادقة الحالي أي `AuthSession` يجب إلغاؤها. دون اتصال مستمر، ستنتهي مهلة التتبع تلقائياً خلال 120 ثانية من آخر إرسال.
- Rate limiting على مستوى IP محلي للخادم؛ يمنع الخادم أيضاً الإرسال المتقارب زمنياً ضمن قاعدة البيانات. يحتاج التشغيل متعدد العقد إلى مخزن Rate Limiter مشترك.
- عناوين URL ووكلاء HTTP الخارجية وسجلات Reverse Proxy يجب ألا تسجل Request Bodies التي تحتوي إحداثيات.
- اختبارات Integration تعتمد PostgreSQL حقيقية؛ راجع `.github/workflows/stage6a-tracking.yml` لتشغيلها على فرع التطوير.

## الملفات التنفيذية

- `apps/api/src/tracking/tracking.service.ts`
- `apps/api/src/tracking/tracking.controller.ts`
- `apps/api/src/tracking/tracking.module.ts`
- `apps/api/src/tracking/tracking.policy.ts`
- `apps/api/src/tracking/tracking.dto.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261026000900_tracking_sessions/migration.sql`
- `apps/api/prisma/migrations/20261026001000_tracking_auth_session_hardening/migration.sql`
- `apps/api/test/tracking.policy.spec.ts`
- `apps/api/test/integration/tracking.spec.ts`

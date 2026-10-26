# Stage 6 — Analytics وAudit viewer

أضيفت واجهتان فعليتان: `/analytics` للـAdmin/Dispatcher و`/audit-logs` للـAdmin فقط. تستعملان PostgreSQL عبر REST، دون mock fallback. هذه دفعة جزئية؛ لا تعني اكتمال Stage6.

## المعمارية والتعريفات

ReportingModule يجمع endpoints للقراءة فقط، مع DTO validation وJWT/Organization guards الموجودة وPrismaService.forOrganization وRLS. الحسابات التجميعية داخل PostgreSQL، بينما TanStack Query يحتفظ بنتائج الواجهة ويتلقى invalidation عبر اتصال الأحداث الموجود.

- `completed`: عدد الأعمال التي يقع completedAt لها ضمن الفترة.
- `closed`: عدد الأعمال التي يقع closedAt لها ضمن الفترة.
- `averageResolutionHours`: متوسط الزمن من إنشاء WorkOrder إلى إغلاقه، للأعمال المغلقة خلال الفترة؛ لا تشمل الملغاة ولا الطلبات غير المغلقة. غياب النتائج يعيد null.
- `overdue`: الأعمال غير المنتهية التي تجاوزت scheduledAt الآن. هذا تأخر عن موعد البدء، وليس موعد نهاية أوSLA؛ scheduled end غير منفذ بعد.
- `workload`: عدد التكليفات ACTIVE حالياً لكل فني، حتى100 فني، مستقل عن الفترة المختارة.
- `trends`: عدد الإكمالات لكل يوم UTC ضمن الفترة؛ الأيام دون إكمال لا تظهر كسجلات.

الفترة نصف مفتوحة: from مشمول وto غير مشمول، UTC ISO فقط، افتراضياً آخر30 يوماً وبحد366 يوماً. لا نحمّل كل WorkOrders إلى الواجهة للحساب. قوائم Audit محدودة بـ100 سجل للصفحة وبحد1000 صفحة، بترتيب الوقت ثمUUID لضمان ترتيب ثابت؛ قد تتغير حدود الصفحات مع وصول سجلات جديدة.

## الصلاحيات والخصوصية

فحوص الدور في backend، وRLS يعزل المؤسسة حتى في aggregation SQL. Audit viewer يعرض actor/action/timestamp/resource فقط؛ لا يعرض metadata أوtokens أوصوراً أوإحداثيات. لا endpoints لتعديل/حذف AuditLog، وتبقى صلاحية database runtime append-only كما في Stage5.

## التحقق

نجح typecheck وbuild و28 اختباراً عادياً و49 integration tests، ومنها فحص مؤشرات مقارنة بقاعدة البيانات، عزل المؤسسة، أدوار الوصول للـreports، فلاترAudit وpagination ورفض الفترات غير الصحيحة. اختبار المتصفح الموسع يفتح واجهتي التقارير والسجل بعد تسجيل Admin حقيقي، إضافة لاختبار دورة الصيانة القائمة.

## الحالة المتبقية بوضوح

لم يُنفّذ Tracking Backend أوLeaflet map أوSmart Dispatch ومنع تعارض الجدولة. مكوّن الموافقة على الموقع لا يزال غير مفعل. تحسينات unread counters وstatus-change notifications لم تدخل هذه الدفعة. الصور الخاصة وإشعارات التعيين ودورة الصيانة منStage5 محفوظة. لا توجد migrations جديدة في هذه الدفعة.

التشغيل: `npm run dev`. التحقق: `npm run typecheck` و`npm test` و`npm run build`؛ integration تحتاج TEST_DATABASE_URL لقاعدة `_test` مستقلة. لا تعتبر نجاح الاختبارات معالجة لتنبيهات dependencies السابقة أوإعلان جاهزية production.

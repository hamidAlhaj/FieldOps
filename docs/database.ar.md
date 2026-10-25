# Stage 2 — Database Architecture

هذه المرحلة تنفذ قاعدة البيانات وطبقة الوصول فقط. لا توجد business HTTP endpoints أو Authentication جديدة، ولم تتغير الواجهة. WorkOrderService داخلية لاختبار transactions وقواعد الانتقال؛ لا يُمرّر actorId من العميل إليها مستقبلاً، بل من JWT موثّق.

## العلاقات

```mermaid
erDiagram
  User ||--o{ Membership : joins
  Role ||--o{ Membership : grants
  Organization ||--o{ Membership : contains
  Membership ||--o| TechnicianProfile : has
  Membership ||--o| CustomerProfile : has
  Organization ||--o{ Team : owns
  Team ||--o{ TeamMember : includes
  Membership ||--o{ TeamMember : participates
  CustomerProfile ||--o{ MaintenanceRequest : submits
  MaintenanceRequest ||--o{ WorkOrder : generates
  Team |o--o{ WorkOrder : handles
  WorkOrder ||--o{ Assignment : retains
  TechnicianProfile ||--o{ Assignment : receives
  WorkOrder ||--o{ WorkOrderStatusHistory : records
  TechnicianProfile ||--o{ TechnicianLocationUpdate : sends
  MaintenanceRequest |o--o{ Attachment : documents
  WorkOrder |o--o{ Attachment : documents
  Membership ||--o{ Notification : receives
  Membership ||--o{ AuditLog : acts
```

- **Organization:** حد المؤسسة؛ جميع موارد الأعمال تحمل organizationId.
- **User:** هوية عالمية وemail موحّد lowercase؛ يمكن للشخص الانضمام إلى أكثر من مؤسسة دون نسخ هويته. لا credentials تجريبية أو passwordHash وهمية؛ Authentication مرحلة لاحقة.
- **Role / Membership:** Role catalog ثابت: ADMIN وDISPATCHER وTECHNICIAN وCUSTOMER. Membership تربط User بمؤسسة ودور واحد، مع ACTIVE أوSUSPENDED. قيد unique يمنع عضويتين للشخص في المؤسسة نفسها. يمكن أن يختلف دوره بين المؤسسات. إدارة هذه الجداول ليست متاحة للـruntime role حالياً.
- **TechnicianProfile / CustomerProfile:** امتدادات اختيارية واحد إلى واحد للعضوية، حتى تبقى بيانات الفني والعميل خاصة بالمؤسسة. التحقق من دور الفني الفعلي وحالته يحدث عند التكليف؛ وجود profile وحده لا يمنحه صلاحية.
- **Team / TeamMember:** علاقة many-to-many عبر جدول مستقل، وunique يمنع تكرار العضوية داخل الفريق. WorkOrder يمكن أن يرتبط بفريق واحد اختياري.
- **MaintenanceRequest / WorkOrder:** العميل يقدم طلباً؛ Dispatcher أوAdmin ينشئ له أمراً أو أكثر، مثلاً لفصل إصلاح الكهرباء عن التكييف. لا WorkOrder دون Request. الأولوية LOW/MEDIUM/HIGH/URGENT.
- **Assignment:** سجل تكليف مستقل يحتفظ بمن كلّف الفني وموعد انتهاء التكليف وسببه. partial unique index يسمح بتكليف ACTIVE واحد فقط لكل WorkOrder. هذا قرار Stage 2؛ العمل الجماعي المتزامن يتطلب تغييراً مقصوداً لاحقاً.
- **WorkOrderStatusHistory:** أحداث غير قابلة للتعديل عبر runtime role، فيها الحالة السابقة والتالية وMembership التي نفذت التغيير. حدث الإنشاء fromStatus=null. إعادة التكليف قد تسجل ASSIGNED → ASSIGNED لتوثيق القرار حتى دون تغيير الحالة.
- **Location:** عينات append-only مع recordedAt من الجهاز وcreatedAt للاستلام، ودقة اختيارية. indexes تدعم آخر موقع لكل فني. retention والتوصيل realtime خارج هذه المرحلة.
- **Attachment:** metadata فقط، مع requestId أوworkOrderId حصراً عبر CHECK XOR؛ الملف الفعلي في private object storage لاحقاً. seed يتضمن metadata توضيحية ولا ينشئ ملفات حقيقية.
- **Notification:** تتبع المستلم وreadAt؛ التوصيل ليس منفذاً بعد.
- **AuditLog:** سجل append-only للفاعل والعملية والمورد. entityType/entityId مرجع منطقي متعدد الأنواع وليس FK إلى جدول محدد؛ يجب على services كتابة مورد موجود ضمن transaction. لا تحفظ passwords أوtokens في metadata.

كل PK من نوع UUID؛ default(uuid()) يولده Prisma. العلاقات بين موارد المؤسسات تستخدم `[organizationId, parentId]` إلى `[organizationId, id]`، ولذلك لا يمكن تركيب مورد في مؤسسة A على parent في B حتى باتصال owner. استخدمنا Restrict للحذف لحماية التاريخ؛ تعطيل العضوية أفضل من حذفها. User.email وRole.name فريدان عالمياً، أما اسم الفريق وemployeeCode ففريدان داخل المؤسسة. indexes تغطي FK والاستعلامات الشائعة حسب المؤسسة والحالة والوقت. السجلات القابلة للتعديل لها createdAt/updatedAt؛ الأحداث والصور المرفوعة لها createdAt فقط لأنها append-only.

## دورة العمل

```text
MaintenanceRequest: SUBMITTED → ACCEPTED → RESOLVED
                               ↘ CANCELLED (وفق قواعد الإلغاء)
WorkOrder: OPEN → ASSIGNED → IN_PROGRESS → COMPLETED → VERIFIED → CLOSED
             ↘ CANCELLED  ↙          ↙
```

- `create`: يقبل طلباً غير منتهٍ، وينشئ OPEN ويحول الطلب إلى ACCEPTED.
- `assign`: ينشئ Assignment ويحول الأمر إلى ASSIGNED؛ فقط ADMIN/DISPATCHER، والفني يجب أن يكون عضواً نشطاً بدور TECHNICIAN ومستخدمه نشطاً.
- `transition`: الفني المكلف الحالي يمكنه IN_PROGRESS وCOMPLETED فقط؛ ADMIN/DISPATCHER ينفذان VERIFIED وCLOSED. لا قفز بين الحالات ولا إعادة فتح CLOSED/CANCELLED.
- `assign` لإعادة التكليف: فقط قبل COMPLETED. السبب إلزامي، ينهي السابق بـREASSIGNED ويبدأ جديداً ACTIVE داخل transaction واحدة. لو كان العمل IN_PROGRESS يرجع إلى ASSIGNED حتى يقبل الفني الجديد البدء. الفني القديم يفقد صلاحية تقدم هذا الأمر.
- `transition(CANCELLED)`: يسمح من OPEN/ASSIGNED/IN_PROGRESS مع سبب، ويُنهي التكليف النشط. لا يلغي الطلب تلقائياً لأن الطلب قد يحتوي أوامر أخرى أو يحتاج أمراً بديلاً.
- `cancelRequest`: العميل يستطيع إلغاء طلبه SUBMITTED فقط؛ ADMIN/DISPATCHER يستطيعان إلغاء طلب غير منتهٍ وإلغاء أوامره غير المنتهية وتكليفاتها معاً. يرفض إذا كان هناك عمل COMPLETED أوVERIFIED أوCLOSED كي لا يخفي عملاً منفذاً؛ التسوية/إعادة الفتح خارج النطاق.
- بعد CLOSED، يتحول الطلب إلى RESOLVED إذا انتهت بقية أوامره بـCLOSED/CANCELLED. الإلغاء الكامل الصريح للطلب يبقيه CANCELLED.
- version يدعم optimistic concurrency. `Serializable` يحمي عمليات الإنشاء/الإلغاء والتكليف المتزامنة؛ Prisma P2034 يتحول إلى ConflictException (409 عند استخدام HTTP لاحقاً). على المستدعي إعادة تحميل الحالة قبل المحاولة مجدداً؛ لا automatic retry يخفي قرار المستخدم.
- كل قرار Service يكتب History وAudit داخل transaction نفسها. القواعد الكاملة للانتقالات تخص هذه service؛ اتصال owner المباشر يستطيع تجاوزها، لذا لا يُستخدم لطلبات الأعمال.

## عزل Organizations وحدود الثقة

`PrismaService` تحتوي PrismaClient خاصاً غير مُصدّر. استعمل:

```ts
await prisma.forOrganization(
  { organizationId: authorizedOrganizationId, actorId: authenticatedUserId },
  tx => tx.workOrder.findMany(),
);
```

داخل transaction: `SET LOCAL ROLE fieldops_app` ثم سياق مؤسسة ومستخدم عبر set_config بمعاملات آمنة. PostgreSQL RLS لا يعيد صفوفاً دون عضوية ACTIVE ومستخدم نشط في المؤسسة المطلوبة، حتى إذا نسي استعلام Prisma فلتر organizationId. SET LOCAL ينتهي مع commit/rollback ولا يتسرب عبر pool. لا تستخدم raw SQL من إدخال المستخدم ولا تحفظ tx لاستعماله بعد callback.

`fieldops_app` هو NOLOGIN/NOSUPERUSER/NOBYPASSRLS. جداول الهوية والعضويات والأدوار read-only لهذا الدور، وسجلات Audit/History/Location/Attachment متاحة للقراءة والإضافة فقط. باقي موارد الأعمال قابلة للتعديل داخل المؤسسة؛ resource-level rules داخل كل مؤسسة تحتاج service مخصصة، وليست RLS المؤسسة بديلاً عنها. حالياً تم تنفيذ قواعد صلاحيات WorkOrderService فقط، ولا business endpoints يمكن استدعاؤها من المستخدم.

الدالة `fieldops_can_access` تعمل SECURITY DEFINER مع search_path ثابت وschema-qualified tables لتفادي recursion في Membership RLS؛ execute غير متاح لـPUBLIC. مالك migrations/table owner يتجاوز RLS عمداً لإدارة البيانات والتحقق من العضوية داخل الدالة. يجب أن يكون owner موثوقاً ويملك إنشاء role ومنح SET ROLE؛ migration تفشل إذا كان fieldops_app يملك bypass. لا تستخدم مستخدم التطبيق مالكاً للجداول. في production استعمل migration connection مستقلة وruntime login محدوداً يستطيع SET ROLE إلى fieldops_app؛ لا تمنحه ملكية الجداول أوBYPASSRLS. أي default privileges إضافية يجب أن تُراجع بدلاً من فتح جميع الجداول تلقائياً.

**actorId ليس credential**: هذه الطبقة تفترض أن backend موثوق تحقّق من هوية الفاعل. لا تقبل actorId من body/header غير موثّق. JWT وguards وإنشاء memberships عبر API مؤجلة. Prisma Studio وseed وmigration تعمل باتصال إداري ويمكنها رؤية المؤسسات كلها، وليست واجهة للعملاء.

## إعداد وتشغيل

من root بعد إعداد `.env` و`apps/api/.env` كما في README:

```bash
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma migrate deploy
ALLOW_DEMO_SEED=true npm run db:seed -w @fieldops/api
npm run dev -w @fieldops/api
```

الـseed اختياري للتطوير، يرفض NODE_ENV=production ويتطلب opt-in. ينشئ مؤسستين في دمشق وحلب، وخمسة مستخدمين لكل مؤسسة، وفنيين وفريقاً وعميل clinic، وأوامر مغلقة ونشطة مع إعادة تكليف وملغاة ومفتوحة. UUIDs ثابتة وupsert يجعل تكراره آمناً دون حذف بيانات أو إعادة ضبط الحالات المعدلة. email ينتهي بـexample.test ولا توجد login passwords. لا تستخدمه ضد بيانات production.

لا تعدّل migration مطبقة. تغييرات schema اللاحقة: `npm exec -w @fieldops/api -- prisma migrate dev --name descriptive_name`. احتفظ بـSQL migrations اليدوية الخاصة بـRLS وCHECK وpartial indexes؛ Prisma schema وحدها لا تعبر عن جميع هذه القيود، لذلك لا تستبدل migrations بـdb push.

## Prisma Studio

```bash
npm run db:studio -w @fieldops/api -- --hostname 127.0.0.1 --port 5555 --browser none
```

في بيئة cloud الحالية يلزم cache قابل للكتابة قبل الأمر: `mkdir -p /tmp/fieldops-cache` ثم شغّله مع `XDG_CACHE_HOME=/tmp/fieldops-cache`. تم التحقق من هذا التشغيل؛ هذا لا يغير DATABASE_URL أوصلاحيات قاعدة البيانات.

افتح Studio محلياً على port 5555، واستعرض Organization ثم Membership وRole ثم WorkOrder، وتابع relations نحو Assignment وStatusHistory. لا تعرض Studio على الإنترنت؛ يستخدم DATABASE_URL الإداري وقد يرى ويعدل جميع المؤسسات. داخل cloud استخدم اتصالاً محلياً آمناً مدعوماً من بيئتك، وليس رابط preview عاماً.

## اختبار التكامل

أنشئ قاعدة اختبار منفصلة مرة واحدة:

```bash
docker compose exec -T postgres psql -U fieldops -d postgres -c 'CREATE DATABASE fieldops_test;'
# Example for the local development credentials only:
export TEST_DATABASE_URL='postgresql://fieldops:local-development-only@localhost:5432/fieldops_test?schema=public'
npm run test:integration -w @fieldops/api
npm run typecheck
npm test
npm run build
```

runner يرفض URL دون اسم قاعدة ينتهي بـ_test أوschema غير public، ثم يطبّق migrations ويشغّل Jest على PostgreSQL الحقيقي. لا يحذف database ولا يعيد reset؛ fixtures تضيف أوامر UUID جديدة بكل تشغيل. القاعدة مخصصة للاختبارات وقد تتراكم فيها هذه البيانات؛ يمكن حذفها وإعادة إنشائها يدوياً حين لا تحتاجها. لا تضع credentials حقيقية في أوامر محفوظة أوGit.

الاختبارات تغطي: seed repeatability، العضويات المزوّرة/الموقوفة، RLS للقراءة والتعديل والإضافة، foreign keys عبر المؤسسات، سياق pool، منع تعديل Audit/العضويات، قيود الموقع والمرفقات، lifecycle الكامل، atomic rollback، versions، reassign/cancel، وتكليفين متزامنين.

للتحقق من التطبيق الجاري: GET `/api/v1/health` و`/api/v1/health/ready`، وSwagger في `/api/docs`. لا توجد WorkOrder endpoints حتى المرحلة التالية.

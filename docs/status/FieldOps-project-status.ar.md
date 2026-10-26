<style>
/* ===== Base ===== */
body {
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
    Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: #000000;
  margin: 0;
  padding: 0;
}

/* ===== H1: main title - BLUE ===== */
h1 {
  font-size: 24px;
  font-weight: 700;
  color: #1671d3;
  margin-top: 24px;
  margin-bottom: 12px;
  border: none;
  padding: 0;
}

/* ===== H2: main sections - BLUE ===== */
h2 {
  font-size: 19px;
  font-weight: 700;
  color: #1671d3;
  margin-top: 22px;
  margin-bottom: 10px;
  border: none;
  padding: 0;
}

/* ===== H3: sub-sections - BLUE ===== */
h3 {
  font-size: 16px;
  font-weight: 700;
  color: #1671d3;
  margin-top: 18px;
  margin-bottom: 8px;
  border: none;
  padding: 0;
}

/* ===== H4: minor - black ===== */
h4,
h5,
h6 {
  font-size: 14px;
  font-weight: 700;
  color: #000000;
  margin-top: 14px;
  margin-bottom: 6px;
}

/* ===== Paragraphs ===== */
p {
  margin: 8px 0;
  color: #000000;
}

strong {
  font-weight: 700;
  color: #000000;
}

em {
  font-style: italic;
}

/* ===== Code inline ===== */
code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  background-color: #f5f5f5;
  color: #000000;
  padding: 1px 4px;
  border-radius: 2px;
  border: none;
}

/* ===== Code blocks ===== */
pre {
  background-color: #f5f5f5;
  border: none;
  border-radius: 2px;
  padding: 12px 14px;
  margin: 10px 0;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.5;
}

pre code {
  background: none;
  color: #000000;
  padding: 0;
  font-size: 100%;
  border: none;
}

/* ===== Tables ===== */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 13.5px;
}

th {
  background-color: #f5f5f5;
  border: 1px solid #cccccc;
  padding: 7px 10px;
  text-align: left;
  font-weight: 700;
  color: #000000;
}

td {
  border: 1px solid #cccccc;
  padding: 7px 10px;
  text-align: left;
  color: #000000;
}

/* ===== Lists ===== */
ul,
ol {
  padding-left: 22px;
  margin: 8px 0;
}

li {
  margin-bottom: 3px;
  color: #000000;
}

/* ===== Blockquotes ===== */
blockquote {
  border-left: 3px solid #1671d3;
  padding: 4px 12px;
  margin: 10px 0;
  color: #333333;
  background: #f8fafc;
}

/* ===== Horizontal rule ===== */
hr {
  border: none;
  border-top: 1px solid #cccccc;
  margin: 18px 0;
}

/* ===== Links ===== */
a {
  color: #1671d3;
  text-decoration: none;
}

/* ===== Print ===== */
@media print {
  h1,
  h2,
  h3,
  h4 {
    page-break-after: avoid;
  }
  pre,
  table,
  blockquote {
    page-break-inside: avoid;
  }
  @page {
    margin: 0.75in;
  }
}
/* ===== Code Block - Styled ===== */

pre {
  background: #1e1e1e;
  color: #d4d4d4;
  border: 1px solid #333333;
  border-left: 4px solid #1671d3;
  border-radius: 6px;
  padding: 16px 18px;
  margin: 14px 0;
  overflow-x: auto;

  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;

  font-size: 13px;
  line-height: 1.6;

  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

/* Code inside the block */
pre code {
  background: transparent;
  color: #d4d4d4;
  border: none;
  padding: 0;
  margin: 0;

  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;

  font-size: 13px;
  line-height: 1.6;
}

/* Inline code */
code {
  background: #f1f3f5;
  color: #c7254e;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 13px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

/* Scrollbar inside code blocks */
pre::-webkit-scrollbar {
  height: 8px;
}

pre::-webkit-scrollbar-track {
  background: #1e1e1e;
}

pre::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

pre::-webkit-scrollbar-thumb:hover {
  background: #777;
}

/* ===== Code Blocks - Light Print Style ===== */

pre {
  background-color: #f1f3f5 !important;
  color: #111111 !important;

  border: 1px solid #d6d9dd !important;
  border-left: 4px solid #1671d3 !important;
  border-radius: 5px !important;

  padding: 15px 17px !important;
  margin: 14px 0 !important;

  overflow-x: auto;

  font-family:
    "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
    monospace !important;

  font-size: 13px !important;
  line-height: 1.6 !important;

  white-space: pre-wrap;
  word-break: normal;

  /* Keep background when exporting/printing */
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}

pre code {
  background: transparent !important;
  color: #111111 !important;

  padding: 0 !important;
  margin: 0 !important;
  border: none !important;

  font-family:
    "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo,
    monospace !important;

  font-size: 13px !important;
  line-height: 1.6 !important;
}

/* Arabic report: direction only; preserve the supplied palette and typography. */
body { direction: rtl; text-align: right; }
th, td { text-align: right; }
ul, ol { padding-right: 22px; padding-left: 0; }
blockquote { border-left: none; border-right: 3px solid #1671d3; }
pre { direction: ltr; text-align: left; unicode-bidi: isolate; }
code { direction: ltr; unicode-bidi: isolate; }
a { overflow-wrap: anywhere; }
@media print { thead { display: table-header-group; } tr { break-inside: avoid; } table { page-break-inside: auto; } }

</style>

# FieldOps — تقرير المشروع والمراحل

**تاريخ التقرير:** 26 أكتوبر 2026  
**المستودع:** hamidAlhaj/FieldOps  
**الفرع:** main  
**مرجع النسخة البرمجية المفحوصة:** `628048c`  
**نوع التقرير:** مراجعة حالة التنفيذ، وليست شهادة جاهزية للنشر الإنتاجي.

## 1. نبذة عن المشروع

FieldOps نظام لإدارة خدمات الصيانة الميدانية وتوزيع المهام. يربط العميل الذي يبلغ عن مشكلة، والموظف الذي يراجع الطلب ويوزع العمل، والفني الذي ينفذه، ومدير المؤسسة الذي يدير الصلاحيات ويتابع النتائج.

الهدف هو الاحتفاظ بدورة واضحة للعمل منذ إنشاء طلب الصيانة وحتى التحقق من التنفيذ وإغلاقه، مع الصور والملاحظات والإشعارات وسجل النشاط. يدعم النظام مؤسسات متعددة مع عزل بيانات كل مؤسسة.

### الأدوار

| الدور | المسؤولية |
| --- | --- |
| Admin | إدارة الموارد والصلاحيات داخل مؤسسته، والاطلاع على التقارير وسجل التدقيق |
| Dispatcher | مراجعة الطلبات، تعيين الفنيين، متابعة الأعمال والتحقق من إنجازها |
| Technician | الوصول إلى الأعمال المصرح بها، قبول التكليف، التنفيذ ورفع الصور والتقدم |
| Customer | إنشاء طلباته ومتابعة حالتها والأعمال المرتبطة بها |

## 2. أين وصل المشروع الآن؟

**من أصل ست مراحل محددة في طلبات المشروع: أربع مراحل مكتملة ضمن نطاقها، ومرحلتان غير مكتملتين.**

| المرحلة | العنوان المعتمد | الحالة |
| --- | --- | --- |
| Stage 1 | تأسيس المشروع والمعمارية وبيئة التشغيل | مكتملة ضمن نطاق التأسيس |
| Stage 2 | PostgreSQL وPrisma وتصميم قاعدة البيانات | مكتملة ضمن النطاق الأصلي |
| Stage 3 | Authentication وAuthorization | مكتملة ضمن النطاق الأصلي |
| Stage 4 | الواجهة وتجربة الاستخدام | مكتملة جزئياً |
| Stage 5 | دورة الصيانة وأوامر العمل | مكتملة ضمن نطاقها |
| Stage 6 | القدرات المتقدمة | مكتملة جزئياً |

**عدد المراحل المتبقية للإغلاق: مرحلتان، هما Stage 4 وStage 6.** هذا عدد مراحل، وليس تقديراً زمنياً أوعدد مهام متساوية الحجم. لا توجد في الطلبات الحالية مرحلة سابعة محددة يمكن احتسابها.

هذا التقرير يعتمد ترقيم طلبات المستخدم الأحدث. بعض وثائق التأسيس القديمة تحتوي خارطة إرشادية مختلفة في أسماء المراحل؛ لا تُستخدم تلك الخارطة لتحديد حالة الإنجاز الحالية.

## 3. التقنيات المستخدمة

| المجال | التقنيات |
| --- | --- |
| Frontend | React، TypeScript، Vite، Tailwind CSS |
| تنظيم الواجهة | React Router، TanStack Query، Zustand |
| النماذج والتحقق | React Hook Form، Zod، class-validator |
| Backend | NestJS، TypeScript، REST API |
| قاعدة البيانات | PostgreSQL، Prisma، migrations |
| المصادقة | Passport، JWT، Argon2، rotating Refresh Tokens |
| التحديثات الفورية | Socket.IO، Transactional Outbox |
| الصور | sharp لإعادة الترميز، Attachment metadata وPhotoContent داخل PostgreSQL |
| التوثيق والاختبارات | Swagger، Jest، Supertest، Vitest، Playwright |
| التشغيل المحلي | npm workspaces، Docker Compose لخدمة PostgreSQL |
| الخرائط المستهدفة | Leaflet وOpenStreetMap؛ التكامل غير منفذ في النسخة المفحوصة |

## 4. المعمارية الحالية

النظام مبني على Modular Monolith: تطبيق NestJS بوحدات واضحة، وتطبيق React مستقل، وقاعدة PostgreSQL مشتركة ذات عزل للمؤسسات. لا توجد حاجة حالية لتقسيمه إلى Microservices.

```text
React pages and shared components
        |
        v
TanStack Query + Zod contracts + HTTP client
        |
        v
NestJS REST Controllers + validated DTOs
        |
        v
JWT / active session / organization / role checks
        |
        v
Business Services + resource ownership checks
        |
        v
PrismaService: tenant context + Serializable transactions
        |
        v
PostgreSQL: business data + RLS + audit + private photo bytes
        |
        v
Transactional Outbox -> Socket.IO -> invalidate queries -> REST refetch
```

### توزيع المسؤوليات

- **Controllers:** استقبال الطلبات وتطبيق DTO validation وتوجيهها للخدمات.
- **Guards:** التحقق من الهوية والعضوية والدور؛ إخفاء الأزرار في الواجهة لا يمنح الصلاحيات.
- **Business Services:** قواعد الانتقال بين الحالات، ملكية المورد، التعيين والتقدم والصور.
- **PrismaService:** تنفيذ العمليات ضمن المؤسسة وداخل transactions مع ضبط سياق قاعدة البيانات.
- **PostgreSQL:** حفظ الحقيقة النهائية، وفرض RLS وForeign Keys وقيود منع التعيين النشط المكرر.
- **TanStack Query:** الاحتفاظ ببيانات الخادم وإعادة قراءتها بعد تغييرات العمل والأحداث.
- **Zustand:** الهوية الحالية والمؤسسة المختارة والثيم وحالة الواجهة الخفيفة.
- **ReportingModule:** قراءة المؤشرات والسجلات مع صلاحيات المؤسسة والدور.

### لماذا قاعدة البيانات مصدر الحقيقة؟

يحفظ الخادم تغيير العمل وسجله وحدث Outbox داخل transaction واحدة. Socket.IO يرسل إشارات تحديث محدودة، ثم تعيد الواجهة قراءة البيانات من REST. عند إعادة الاتصال توجد مزامنة، ولا يُعتمد على وصول كل حدث بالترتيب لتحديد الحالة النهائية.

### بنية الملفات الرئيسية

```text
FieldOps/
  apps/
    api/
      prisma/
        schema.prisma
        migrations/
        seed.cjs
      src/
        auth/
        config/
        health/
        prisma/
        resources/
        work-orders/
        realtime/
        reporting/
      test/
    web/
      src/
        components/
        features/
          auth/
          operations/
          workflow/
          reporting/
          tracking/       # inactive client foundation
        services/
        state/
        styles.css
      e2e/
  packages/contracts/
  docs/
  compose.yaml
```

## 5. Stage 1 — تأسيس المشروع

**الحالة: مكتملة ضمن النطاق المطلوب.**

أُنجز إعداد Monorepo باستخدام npm workspaces، وأساس React وNestJS، وإعدادات TypeScript والتشغيل، وDocker Compose لقاعدة البيانات، وSwagger وHealth/Readiness endpoints وأوامر الفحص والبناء.

اكتمال التأسيس لا يعني أن CI/CD أوLoad Testing أوخطة النشر الإنتاجي الشاملة قد أُنجزت؛ هذه متطلبات تشغيلية منفصلة.

## 6. Stage 2 — تصميم قاعدة البيانات

**الحالة: مكتملة ضمن النطاق الأصلي.**

أُنجزت نماذج Organizations وUsers وRoles وMemberships وTechnician Profiles وTeams وCustomer Profiles وRequests وWorkOrders وAssignments وStatus History وAttachments وNotifications وAudit Logs. توجد أيضاً بنية قديمة لـTechnicianLocationUpdate، لكن وجود جدول للموقع لا يعني وجود خدمة تتبع عاملة.

النماذج تستعمل UUID وForeign Keys مركبة وIndexes وقيوداً مناسبة. توجد migrations وseed واختبارات عزل المؤسسات، وPrismaService قابل لإعادة الاستخدام. تمت إضافة نماذج مساندة لاحقاً للجلسات والصور والتقدم وOutbox.

**ما سيضاف لاحقاً:** توسعات جلسات مشاركة الموقع والمهارات والتوفر والمواعيد اللازمة لـStage6؛ هذه لا تجعل تصميم Stage2 الأصلي ناقصاً.

## 7. Stage 3 — المصادقة والصلاحيات

**الحالة: مكتملة ضمن نطاق الطلب الأصلي.**

- التسجيل والدخول والخروج وCurrent User.
- تجزئة كلمات المرور باستخدام Argon2.
- Access Tokens وجلسات Refresh Tokens مع rotation وrevocation وكشف إعادة الاستخدام.
- JWT Strategy وGuards وDecorators وDTO validation وSwagger authentication.
- صلاحيات الأدوار وملكية الموارد وعزل المؤسسات واختبارات رفض الوصول.

Access Token محفوظ في ذاكرة العميل، وRefresh Token في HttpOnly cookie؛ لا تُحفظ كلمات المرور أوالتوكنات في localStorage.

**غير منفذ كميزات حساب متقدمة:** Password Reset وMFA وEmail Verification. ولا توجد واجهة Profile/Settings كاملة لتغيير بيانات الحساب وكلمة المرور؛ هذه ضمن الأعمال المتبقية للواجهة مع Backend اللازم لها.

## 8. Stage 4 — الواجهة وتجربة الاستخدام

**الحالة: مكتملة جزئياً؛ ليست الصفحات الاثنتا عشرة كلها مكتملة.**

الموجود: Design system، هوية بنفسجي/أخضر، Typography، Shell وتنقل، Login/Registration، Overview مشتركة تتكيف مع الدور، قوائم وتفاصيل الأعمال، Responsive layouts، Light/Dark، وحالات تحميل وفراغ وأخطاء. البيانات التجريبية معزولة، وAPI هو الوضع الافتراضي.

### مراجعة الواجهات الاثنتي عشرة

| الواجهة المطلوبة | الحالة الفعلية |
| --- | --- |
| Login وRegistration | منفذتان ومربوطتان بالمصادقة |
| Admin Dashboard | Overview حسب الدور وتقارير فعلية؛ ليست لوحة إدارة شاملة لكل المستخدمين والفرق والإعدادات |
| Dispatcher Dashboard | Overview وواجهات دورة العمل والتعيين اليدوي؛ الخريطة والتوصيات الذكية ناقصتان |
| Technician Dashboard | Overview وأعمال مصرح بها وواجهات القبول والتنفيذ والصور؛ مشاركة الموقع غير مفعّلة |
| Customer Portal | إنشاء الطلبات ومتابعة التفاصيل والحالة والأعمال المرتبطة بها |
| Work Order Management | دورة العمل الأساسية والبحث والفلاتر وتفاصيل الأعمال |
| Maintenance Request Details | منفذة مع المراجعة والإلغاء وإنشاء WorkOrder حسب الصلاحية |
| Technician Assignment Interface | تعيين وإعادة تعيين يدويان؛ Smart Dispatch والجدولة المتقدمة غير منفذين |
| Live Tracking Map | غير منفذة |
| Notifications Center | إشعارات التعيين وقائمة وتعليم مقروء؛ عداد غير المقروء وتغطية تغيّر الحالات ناقصان |
| Analytics and Reports | واجهة فعلية ومؤشرات من قاعدة البيانات؛ تعريفات وحدود المؤشرات موضحة أدناه |
| Profile and Settings | الثيم والقائمة الحسابية موجودان؛ الإدارة المتقدمة للملف والحساب والمؤسسة غير مكتملة |

### ما يلزم لإغلاق Stage 4

1. واجهات إدارة المستخدمين وعضويات المؤسسة والأدوار وحالاتها.
2. واجهات إدارة الفرق وعضوياتها.
3. Profile/Settings مع حفظ فعلي وآمن، بما فيه تغيير كلمة المرور عند تنفيذه.
4. ربط الخريطة وتوصيات الفنيين بعد اكتمال Backend الخاص بها.
5. استكمال مركز الإشعارات وعداد غير المقروء.
6. مراجعة جميع الواجهات مع أدوار فعلية واختبارات وصولية ومتصفح ومقاسات مختلفة.

الواجهات تعتمد على صلاحيات Backend؛ لا يكفي إضافة أزرار أوصفحات شكلية لإعلان المرحلة مكتملة.

## 9. Stage 5 — دورة الصيانة الأساسية

**الحالة: مكتملة ضمن نطاقها.**

```text
Maintenance Request -> Review -> Work Order -> Assignment
                    -> Accept -> In Progress -> Completed
                    -> Verified -> Closed
```

أُنجز إنشاء الطلب ومراجعته، وإنشاء أمر العمل، والتعيين وإعادة التعيين، وقبول الفني وبدء العمل، وصور Before/After، وملاحظات التقدم والإكمال، والتحقق والإغلاق وحفظ السجل.

- الانتقالات تُفحص على الخادم، مع version لمنع الكتابة على حالة قديمة.
- Serializable transactions وقيود قاعدة البيانات تحمي من التعيين النشط المكرر والتحديثات المتزامنة.
- إعادة التعيين تنهي التكليف السابق وتحفظ تاريخه، وتحتاج قبولاً وصوراً للتكليف الجديد.
- الإلغاء يحتاج سبباً ويفحص وضع الطلب والأعمال المرتبطة به.
- الصور خاصة، تُفحص وتُعاد صياغتها WebP، ولا تُعرض عبر public URLs.
- Socket.IO مصادق عليه، وOutbox محفوظ مع تغييرات العمل، مع مزامنة عند إعادة الاتصال.

هذه مرحلة دورة العمل الأساسية؛ منع تعارض المواعيد بين مهام مختلفة وGPS وSmart Dispatch ليست مكتملة فيها.

## 10. Stage 6 — القدرات المتقدمة

**الحالة: مكتملة جزئياً.**

| الوحدة | أُنجز | بقي |
| --- | --- | --- |
| Technician Location Tracking | مكوّن موافقة وإيقاف مشاركة في العميل، مع اختبارات | Backend للجلسات وexpiry والصلاحيات، التكامل مع دورة العمل، Leaflet/OpenStreetMap map، والتفعيل واختبارات التكامل |
| Smart Dispatch | التعيين اليدوي الأساسي موجود منStage5 | المهارات والتوفر والجدولة، شرح النقاط، المسافة المصرح بها، override مدقق، ومنع التعارض المتزامن |
| Photo Management | رفع خاص Before/After، فحص نوع وحجم، ارتباط بالتكليف، وعرض مصرح | مراجعة إغلاق متطلبات Stage6 وتغطية تاريخ المرفقات والصلاحيات كاملة |
| Notifications | إشعارات التعيين الفورية، حفظ فيDB، وتعليم مقروء | عداد غير المقروء الكامل وإشعارات تغيّر الحالات والتغطية الشاملة للمتلقين |
| Analytics | endpoints وواجهة فعلية للنتائج والعبء والتأخر والاتجاهات | مواءمة تعريف التأخر مع الجدولة المتقدمة عند تنفيذها ومراجعة ختامية للمتطلبات |
| Audit Logging | سجل محمي وواجهة Admin مع فلاتر وpagination | تسجيل أحداث Tracking وSmart Dispatch وبقية الميزات حين تُنفّذ |

### حالة مشاركة الموقع بدقة

وجود ملفات LocationSharing وSharingController لا يعني جمع مواقع المستخدمين. المكوّن غير مربوط بالصفحات، وTracking Backend والخريطة غير منفذين. النسخة المفحوصة لا توفر Live GPS tracking عاملاً.

قبل التفعيل يجب ربط الموافقة بجلسة مصادق عليها وتكليف نشط، وإنهاء المشاركة عند سحب الموافقة أوانتهاء العمل أوإعادة التعيين أوإبطال الجلسة، مع صلاحيات الخادم ومدة صلاحية وحذف أوتقليل الاحتفاظ بالإحداثيات. لا تُستخدم إحداثيات تجريبية لإظهار ميزة غير موجودة كأنها عاملة.

### تعريفات Analytics الحالية

| المؤشر | التعريف الفعلي |
| --- | --- |
| Completed | أعمال يقع completedAt لها ضمن الفترة المختارة |
| Closed | أعمال يقع closedAt لها ضمن الفترة |
| Average resolution time | متوسط الزمن من إنشاء WorkOrder حتى إغلاقه، للأعمال المغلقة ضمن الفترة |
| Technician workload | عدد التكليفات ACTIVE حالياً، حتى100 فني، مستقل عن الفترة |
| Overdue | أعمال غير منتهية تجاوز scheduledAt لها الآن؛ تأخر عن موعد البدء وليس SLA أوموعد نهاية |
| Performance trend | عدد الإكمالات اليومي حسبUTC؛ الأيام دون إكمال لا تظهر كسجلات |

الفترة نصف مفتوحة: from مشمول وto غير مشمول. الافتراضي آخر30 يوماً، والحد الأعلى366 يوماً. الحسابات داخل قاعدة البيانات ومقيّدة بالمؤسسة.

## 11. خطة الإكمال وعدد المراحل المتبقية

**بقي إغلاق مرحلتين من أصل ست: Stage6 ثم بقية Stage4 التي تعتمد عليها.** توجد بينهما ميزات مشتركة؛ إنهاء الخريطة مثلاً يخدم متطلبات المرحلتين ولا يمثل مشروعين منفصلين.

| الترتيب المقترح | الدفعة | النتيجة المطلوبة |
| --- | --- | --- |
| 1 | Tracking end-to-end | Backend محمي، موافقة، توقف فعلي، خريطة ومواقع قديمة واضحة |
| 2 | Smart Dispatch والجدولة | مهارات وتوفر، توصيات مفسرة، ومنع تعارض المواعيد |
| 3 | الإشعارات والصور والتدقيق | استكمال العدادات وتغيّر الحالات وتاريخ الصور وأحداث الميزات الجديدة |
| 4 | مراجعة Analytics وStage6 | توحيد التعريفات مع الجدولة واختبارات قبول كاملة |
| 5 | إدارة المستخدمين والفرق والحساب | إغلاق واجهات الإدارة وProfile/Settings فيStage4 |
| 6 | مراجعة الواجهات الاثنتي عشرة | وظائف حقيقية وصلاحيات وحالات تحميل وأخطاء ومتصفح وصور فعلية |

هذه ست دفعات عمل مقترحة لإغلاق المرحلتين المتبقيتين، وليست ست مراحل جديدة. لم تُحدَّد مدة أوتكلفة أوتاريخ إنجاز، لذلك لا يعطي التقرير تقديراً زمنياً أونسبة إنجاز رقمية غير مقاسة.

## 12. الاختبارات والأدلة المسجلة

آخر نتائج تنفيذ مسجلة للنسخة البرمجية المرجعية:

| التحقق | النتيجة المسجلة |
| --- | --- |
| TypeScript typecheck | ناجح للتطبيقين |
| Production build | ناجح للتطبيقين |
| الاختبارات العادية | 28 اختباراً ناجحاً |
| PostgreSQL integration tests | 49 اختباراً ناجحاً |
| API browser tests | اختباران ناجحان، أحدهما يتضمن فتح Analytics وAudit |

هذه نتائج سابقة موثقة أثناء التنفيذ، ولم تُعد هذه المجموعة عند كتابة هذا التقرير الوثائقي. لا تعني الاختبارات نجاح Tracking أوSmart Dispatch؛ هاتان الميزتان غير منفذتين أصلاً. ولا تعني اختبارات المتصفح تغطية كل الواجهات والمقاسات والإجراءات الممكنة.

### أبرز المراجع البرمجية

| Commit | التغيير |
| --- | --- |
| db94d79 | دورة الصيانة وعملياتها وصورها والتحديثات الفورية |
| 78a1745 | أساس موافقة مشاركة الموقع في العميل، دون تفعيل |
| 54c5b64 | Analytics وAudit querying مع صلاحيات المؤسسة |
| 628048c | واجهات Analytics وAudit واختبارات متصفح موسعة |

## 13. الأمان والخصوصية والأداء وحدود الإنتاج

- عزل المؤسسات يجمع JWT والعضوية الحالية وصلاحيات المورد وPostgreSQL RLS وComposite Foreign Keys.
- الصور الخاصة محفوظة حالياً كبيانات فيDB؛ Private Object Storage ليس منفذاً. التوسع يحتاج سياسة احتفاظ ونسخ احتياطي مناسبة.
- Audit viewer يعرض الفاعل والفعل والوقت والمورد، ولا يعرض metadata الحساسة.
- التشغيل الفوري الحالي يدعم API instance واحدة. تعدد العقد يحتاج shared Socket.IO adapter وتصميم توزيع أحداث مناسب؛ SKIP LOCKED وحده لا يوزع البث على كل العقد.
- بعض القوائم الحالية حتى100 سجل، وpagination الخاصة بها محلية. سجل التدقيق يمتلك pagination من الخادم بحدود محددة.
- آخر فحص dependencies مسجّل سابقاً أظهر14 تنبيهاً:13 high و1 moderate. لم يُعد الفحص عند إعداد التقرير؛ لا يُقدَّم هذا الرقم كفحص أمني حي.
- CI/CD وobservability واختبارات الضغط وخطة backup/restore ومراجعة النشر الشاملة ليست منجزات مثبتة هنا.

**اكتمال مرحلة وظيفية لا يساوي إعلان جاهزية Production.**

## 14. التشغيل المحلي

المتطلبات: Node.js24 وnpm وDocker Engine وDocker Compose.

### الإعداد لأول مرة

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

لا تستبدل ملفات .env الموجودة عند تحديث بيئة سبق إعدادها، ولا ترفع الأسرار إلىGit. إعدادات المثال للتطوير فقط. يقرأ كل تطبيق إعداداته من workspace الخاص به، ويجب أن يطابق WEB_ORIGIN عنوان المتصفح الفعلي.

### الفحص وPrisma Studio

```bash
npm run typecheck
npm test
npm run build
npm run db:studio -w @fieldops/api
```

اختبارات التكامل والمتصفح تحتاج TEST_DATABASE_URL لقاعدة مستقلة ينتهي اسمها بـ_test. لا تستخدم قاعدة التطوير لهذه الاختبارات. Studio أداة owner محلية لفحص البيانات، وليس بوابة آمنة لعملاء المؤسسات.

## 15. استخدام الستايل المرفق وتصدير التقرير

ملف Markdown هذا يحتوي CSS المرفق داخل style block، مع تعديلات اتجاه للعربية: RTL للنص والجداول، وLTR للأكواد. حُفظت العناوين الزرقاء والجداول وخلفيات الأكواد حسب الملف المرفق. النسخة المصاحبة markdown-pdf.css تحمل نفس التنسيق مع إضافات العربية.

التنسيق يتطلب عارض Markdown يسمح بـHTML وCSS أوأداة تصدير تدعم ذلك. GitHub وبعض العوارض تتجاهل style blocks؛ هذا سلوك العارض ولا يعني فقدان محتوى الملف. عند استعمال إضافة Markdown PDF يمكن اختيار CSS المصاحب في إعداد markdown-pdf.styles وتعطيل الستايل الافتراضي إذا غيّر المظهر.

التقرير مبني على طلبات المستخدم وحالة الكود والوثائق الأحدث؛ التعليقات الموجودة داخل CSS استُخدمت كمرجع تنسيق فقط، وليست تعليمات عمل أوتغيير في نطاق المشروع.

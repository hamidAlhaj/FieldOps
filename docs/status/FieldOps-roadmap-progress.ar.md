# FieldOps — حالة المشروع وخطة البرومتات المتبقية

> آخر مراجعة: 26 أكتوبر 2026  
> الفرع الذي تمت مراجعته: `feature/stage-6a-tracking-backend`  
> آخر commit برمجي تمت مراجعته قبل هذا التقرير: `3d1b7b7` — `test(scheduling): verify cancellation releases reservations and conflict rollback on reschedule`

## الخلاصة التنفيذية

المشروع تقدّم أبعد من خطة الحالة القديمة: **Stage 6A منفذة، وأساس Stage 6B الخاص بالتوفر والجدولة ومنع تعارض المواعيد منفذ أيضاً**. لم يعد صحيحاً أن GPS Backend أو Leaflet Map غير موجودين؛ كلاهما موجود في هذا الفرع، ولهما اختبارات وتوثيق.

المتبقي الأساسي هو:
1. **Smart Dispatch**: محرك توصية شفاف لاختيار الفني الأنسب؛ غير منفذ.
2. **Stage 6C**: استكمال الإشعارات وتحسين إدارة الصور/المرفقات؛ الموجود أساس صالح لكنه يحتاج إغلاق المتطلبات والاختبارات.
3. **Stage 7A**: فحص أمني جديد ومعالجة الثغرات المؤكدة في التبعيات والكود.
4. **Stage 7B**: Docker للـAPI والواجهة، CI عام متكامل، نشر فعلي، واختبارات قبول نهائية.

## حالة الفرع وGitHub

- الفرع: [feature/stage-6a-tracking-backend](https://github.com/hamidAlhaj/FieldOps/tree/feature/stage-6a-tracking-backend).
- عند بدء هذه المراجعة كان الفرع **متقدماً بـ101 commit عن `main`، دون commits متأخرة عنه**. أُضيف هذا التقرير لاحقاً على الفرع، لذلك قد يزيد العدد بسببه.
- لم يكن هناك Pull Request مفتوح للمشروع وقت المراجعة.
- الفرع **لم يُدمج في `main`**. لا تفترض أن تغييرات الجدولة والتتبع موجودة في `main`؛ استخدم الفرع المذكور إلى أن تتم مراجعة الدمج.
- أحدث GitHub Actions run شوهد أثناء المراجعة نجح على commit `3d1b7b7`: [Stage 6A Tracking Backend — successful run](https://github.com/hamidAlhaj/FieldOps/actions/runs/40388981578).
- نجاح هذا الـworkflow دليل على نجاح الخطوات التي يشغلها ذلك الـworkflow في ذلك الـcommit، وليس شهادة Production Readiness.

## ما تم إنجازه

### Stages 1–5 — الأساس ودورة العمل

- Monorepo باستخدام npm workspaces، مع React + TypeScript + Vite وNestJS.
- PostgreSQL وPrisma مع migrations وعزل بيانات المؤسسات (tenant isolation/RLS).
- Authentication وJWT وAuthorization على مستوى الأدوار والموارد.
- واجهات FieldOps الأساسية ونظام التصميم والتنقل.
- دورة العمل من Maintenance Request إلى Work Order والتعيين والقبول والتنفيذ والإكمال والتحقق والإغلاق.
- رفع صور Before/After خاصة، سجل نشاط، وتحديثات Socket.IO؛ REST/PostgreSQL مصدر الحقيقة.
- Analytics وAudit viewer أُضيفا سابقاً، مع بقاء بعض تحسينات التكامل والتدقيق مطلوبة بعد الميزات الجديدة.

### Stage 6A — Tracking Backend + Leaflet Map

**الحالة: منفذة في هذا الفرع، ومغطاة باختبارات وتوثيق.**

- Tracking sessions مرتبطة بموافقة صريحة وبجلسة المصادقة والتكليف النشط.
- بدء/إيقاف المشاركة وتحديث الموقع وقراءة المواقع المسموح بها.
- انتهاء صلاحية المشاركة، منع العينات المتقاربة، إبطال الجلسات عند تغيّر التفويض، وإخفاء/مسح الإحداثيات عند الإيقاف أو انتهاء الصلاحية.
- تقييد المشاهدة بـAdmin/Dispatcher داخل المؤسسة، ومنع وصول العميل أو المؤسسة الأخرى.
- React Leaflet map فعلية تعرض مواقع مستلمة من API فقط، ولا تستخدم مواقع تجريبية.
- واجهة الفني تتطلب الموافقة والبدء الصريح، ولا تعيد تشغيل GPS تلقائياً.
- تحديث الخريطة عبر polling مصادق عليه؛ Socket.IO يُستخدم لإشارة إعادة الجلب ولا يحمل الإحداثيات.
- اختبارات Backend/PostgreSQL وواجهة ومتصفح موثقة في `docs/tracking-backend-hardening.ar.md` و`docs/tracking-frontend.ar.md`.

**حدود معروفة:** الاحتفاظ بالموقع الحالي فقط، ومدة الصلاحية 120 ثانية؛ التنظيف الدوري يعتمد على استمرار عملية API. تعدد عقد API يحتاج Rate Limiter وSocket.IO adapter مشتركين. يجب مراجعة سياسة الاحتفاظ والـproxy والخصوصية قبل النشر.

### Stage 6B — Technician Availability & Scheduling

**الحالة: الأساس منفذ؛ Smart Dispatch ليس جزءاً منه بعد.**

- التوفر وحالات Unavailable وOff Duty، مع اشتقاق Busy من العمل الفعلي/المواعيد المحجوزة.
- Working hours بحسب المنطقة الزمنية، Time off، كتالوج Skills وربط المهارات بالفنيين وأوامر العمل.
- جدولة بداية ونهاية ومدة متسقة، والتحقق من صيغة ISO 8601 ومناطق التوقيت وDST.
- منع حجز فترتين متداخلتين عبر PostgreSQL GiST exclusion constraint، مع معاملات Serializable والتعامل مع التعارضات بـHTTP 409.
- تكامل التحقق مع التعيين وإعادة التعيين والإلغاء والإكمال؛ توثيق وواجهة فني/Dispatcher واختبارات.
- Migration أساسية: `20261026001100_scheduling_foundation`.
- التوثيق التفصيلي: [docs/scheduling-stage-6b.ar.md](../scheduling-stage-6b.ar.md).

**حدود معروفة:** التكليفات القديمة غير المجدولة لا تحجز نافذة زمنية حتى تُجدول. عدم ضبط working hours يعني عدم فرض قيد ساعات العمل. لا يوجد حتى الآن محرك Smart Dispatch أوتحسين مسارات أوتكامل تقويم خارجي.

## سجل commits ممثل

هذه أمثلة من commits الفرع، وليست قائمة كاملة بكل التغييرات:

| Commit | ما يثبته |
| --- | --- |
| [c871758](https://github.com/hamidAlhaj/FieldOps/commit/c871758) | إنشاء خدمة Tracking التي تتعامل مع الموافقة والجلسات والصلاحيات |
| [5881acd](https://github.com/hamidAlhaj/FieldOps/commit/5881acd) | توثيق حماية Tracking والخصوصية وأوامر Windows |
| [48ba44f](https://github.com/hamidAlhaj/FieldOps/commit/48ba44f) | إضافة React Leaflet map للمواقع المصرح بها |
| [8123454](https://github.com/hamidAlhaj/FieldOps/commit/8123454) | اختبار متصفح لتدفق موافقة GPS والإيقاف ورفض العميل |
| [2cda57f](https://github.com/hamidAlhaj/FieldOps/commit/2cda57f) | توسيع Prisma لدعم التوفر والإجازات والمهارات ونوافذ التكليف |
| [3bdb498](https://github.com/hamidAlhaj/FieldOps/commit/3bdb498) | جداول RLS ومنع تداخل نوافذ الجدولة عبر GiST |
| [841fee1](https://github.com/hamidAlhaj/FieldOps/commit/841fee1) | اختبارات PostgreSQL/Supertest للتوفر والمهارات والعزل والتداخل |
| [cdb3931](https://github.com/hamidAlhaj/FieldOps/commit/cdb3931) | دليل Stage 6B بالعربية |
| [55473d1](https://github.com/hamidAlhaj/FieldOps/commit/55473d1) | إصلاح تغيير حالة Off Duty أثناء عمل نشط غير مجدول |
| [3d1b7b7](https://github.com/hamidAlhaj/FieldOps/commit/3d1b7b7) | اختبار الإلغاء وإطلاق الحجز والتراجع عند فشل إعادة الجدولة |

## حالة البرومتات العشرة

هذه الحالة تخص تنفيذ الكود على الفرع الذي تمت مراجعته، وليست ادعاءً بأن كل سيناريو Production اختُبر يدوياً.

| # | البرومت | الحالة | الملاحظات |
| --- | --- | --- | --- |
| 1 | Stage 6A — Tracking Backend | **منجز** | جلسات التتبع وREST وPrisma والموافقات والصلاحيات |
| 2 | Stage 6A — Security Hardening & Tests | **منجز مبدئياً ومختبَر في CI** | RLS، انتهاء الجلسة، إبطال التفويض، اختبارات PostgreSQL؛ تبقى مراجعة أمنية شاملة في Stage 7A |
| 3 | Stage 6A — Leaflet Map & React Integration | **منجز** | خريطة فعلية، واجهة موافقة وإيقاف، polling واختبارات متصفح |
| 4 | Stage 6B — Availability & Scheduling | **منجز كأساس وظيفي** | التوفر والمهارات والإجازات والجدولة ومنع التداخل والواجهة والاختبارات |
| 5 | Stage 6B — Smart Dispatch Engine | **متبقٍ** | توصيات مفسرة بحسب المهارات والتوفر والعبء والمسافة المتاحة |
| 6 | Stage 6C — Notifications | **متبقٍ** | مراجعة/استكمال unread counter وإشعارات تغيّر الحالات ومنع التكرار والتزامن |
| 7 | Stage 6C — Photo Management | **تحسينات متبقية** | الأساس الخاص موجود؛ راجع تاريخ المرفقات والحذف والاحتفاظ والتخزين والاختبارات |
| 8 | Stage 7A — Security Audit | **متبقٍ** | إعادة فحص التبعيات والكود ثم إصلاح الثغرات المؤكدة دون ترقيات عشوائية |
| 9 | Stage 7B — Docker & CI | **متبقٍ جزئياً** | يوجد Compose لـPostgreSQL وworkflow يتحقق من التتبع؛ لا يوجد بعد Docker متكامل للـAPI والواجهة وCI عام نهائي |
| 10 | Stage 7B — Final QA & Deployment | **متبقٍ** | اختبارات قبول شاملة، استضافة فعلية، HTTPS، مراقبة، نسخ احتياطي وخطة استعادة |

**النتيجة:** 4 برومتات من أصل 10 منجزة على مستوى التنفيذ الأساسي. المتبقي 6 برومتات (5–10)، مع وجود تحسينات نهائية متوقعة ضمن المراجعة الأمنية والاختبار النهائي.

## الخطوات التالية بالترتيب

### Prompt 5 — Smart Dispatch

نفّذ محرك توصية حتمياً وقابلاً للتفسير، يعتمد على المهارات المطلوبة والتوفر والعبء والمسافة عند وجود GPS مصرح به. يجب إعادة التحقق من الجدول والصلاحيات عند حفظ التعيين، وعدم اعتبار التوصية بديلاً عن قواعد منع التعارض الموجودة.

### Prompt 6 — Notifications

أكمل الإشعارات الحالية بدلاً من إنشاء نظام مكرر: unread counter، تعليم كمقروء، تغييرات حالة العمل، وصول مخصص للمستخدم، منع التكرار، ومزامنة بعد انقطاع الاتصال.

### Prompt 7 — Photo Management

راجع الكود الحالي أولاً؛ لا تستبدل رفع الصور الآمن. أكمل اختبارات الخصوصية والصلاحيات وتاريخ المرفقات وسياسات الحذف والاحتفاظ، وقيّم تخزين الملفات الخاص دون فرض نقل سحابي غير ضروري.

### Prompt 8 — Security Audit

نفّذ `npm audit --omit=dev` من جديد وافحص النتيجة الحالية. التقرير القديم سجّل 14 تنبيهاً (13 High و1 Moderate)، لكنه **رقم تاريخي وليس نتيجة فحص حالية**. أصلح ما يمكن التحقق منه واختبر التوافق؛ لا تستخدم `npm audit fix --force` بشكل أعمى.

### Prompt 9 — Docker & CI

أضف Dockerfile إنتاجياً للـAPI وآخر للواجهة، ثم Compose مناسباً للتطوير/التحقق، ومراحل CI تشمل lint/typecheck/tests/build/security. لا تكرر إعداد PostgreSQL الموجود ولا تضع أسراراً داخل المستودع.

### Prompt 10 — Final QA & Deployment

نفّذ اختباراً نهائياً متكاملاً لكل الأدوار والـworkflows، تحقق من البناء والتبعيات والترحيلات ونسخ البيانات واستعادتها، ثم جهّز النشر. لا تدّعِ Production Ready قبل نشر فعلي والتحقق من البيئة.

## أوامر التحقق على Windows PowerShell

من جذر المستودع:

```powershell
git fetch origin
git switch feature/stage-6a-tracking-backend
git pull --ff-only origin feature/stage-6a-tracking-backend
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma validate
npm exec -w @fieldops/api -- prisma migrate status
npm exec -w @fieldops/api -- prisma migrate deploy
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

اختبارات PostgreSQL تحتاج قاعدة منفصلة اسمها ينتهي بـ`_test`، وفق توثيق المشروع. لا توجّه `TEST_DATABASE_URL` إلى قاعدة التطوير، ولا تستخدم `prisma migrate reset` على بيانات المشروع.

## قرار الدمج

لا تدمج الفرع إلى `main` لمجرد نجاح الـworkflow. قبل الدمج:
1. أكمل الميزات المتبقية أو حدّد بوضوح ما سيؤجل.
2. راجع نتائج Security Audit.
3. تأكد من migrations على قاعدة اختبار منفصلة.
4. راجع diff كاملاً ثم افتح Pull Request وشغّل CI على الـPR.

**هذا التقرير هو مرجع حالة المراحل والبرومتات بعد تحديث Tracking وScheduling.** قد تبقى بعض تقارير الحالة الأقدم في المستودع بمعلومات تاريخية؛ استخدم هذا الملف عند تحديد ما بقي.

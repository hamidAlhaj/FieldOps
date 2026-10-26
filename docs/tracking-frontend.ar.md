# Stage 6A — React technician sharing and live dispatcher tracking

هذه الدفعة تفعّل الواجهة الأمامية لنظام التتبع المحمي الموجود في NestJS. **لا يوجد أي تشغيل تلقائي لـGPS**، ولا يتم إدراج إحداثيات تجريبية في لوحة التتبع الحقيقية.

## الإضافة للواجهات

- عند دخول الفني إلى WorkOrderDetails، يظهر LocationSharing فقط إذا كان هو صاحب Assignment نشط ومقبول وحالة WorkOrder هي IN_PROGRESS.
- يلزم وضع علامة الموافقة ثم ضغط Start صراحة. يبدأ Geolocation فقط بعد نجاح إنشاء جلسة HTTP على الخادم.
- Stop أو رفض إذن المتصفح أو انتهاء صلاحية المشاركة أو إخفاء التبويب أو انقطاع الشبكة أو مغادرة الصفحة يؤدي إلى إيقاف Geolocation ومحاولة إلغاء جلسة الخادم؛ لا يعيد النظام التشغيل تلقائياً.
- تظهر صفحة /tracking داخل القائمة لـADMIN وDISPATCHER في اتصال API الحقيقي فقط. تحميها RouteGuard أيضاً، والخادم يجري التحقق النهائي من JWT وعضوية المؤسسة.
- تستعلم الخريطة عن GET /tracking/locations بواسطة عميل HTTP الموجود. يستخدم TanStack Query تحديثاً كل 15 ثانية، وتستخدم أحداث Socket.IO من بنية FieldOps الموجودة **لتنبيه إعادة الجلب فقط** (لا تحمل GPS). يوجد إعادة جلب عند استعادة الشبكة وتفعيل التبويب.
- الخريطة تحمل مواقع فعلية فقط، ولا تركّب Leaflet أو تجلب بلاطات OSM عندما لا توجد مواقع مُبلّغ عنها. لا تظهر المواقع القديمة إذا فشل الاتصال أو حصل خطأ في الصلاحية.
- تعرض قائمة الفنيين الاسم والمهمة الجارية وآخر تحديث ودقة GPS وتحذير stale بعد 30 ثانية؛ Sessions بلا إصلاح GPS تظهر كـ Waiting for GPS.
- تستخدم الواجهة CSS variables الموجودة في FieldOps وثيم light/dark وتصميم responsive.

## الملفات

- apps/web/src/features/tracking/TrackingPage.tsx
- apps/web/src/features/tracking/TrackingMap.tsx
- apps/web/src/features/tracking/useTrackingLocations.ts
- apps/web/src/features/tracking/LocationSharing.tsx (مكوّن سابق تم تفعيله)
- apps/web/src/features/tracking/sharing.controller.ts (المنطق السابق للموافقة والإيقاف)
- apps/web/src/features/tracking/tracking.api.ts (العقود الموجودة)
- apps/web/src/App.tsx
- apps/web/src/components/AppShell.tsx
- apps/web/src/features/workflow/WorkOrderDetails.tsx
- apps/web/src/styles.css
- apps/web/package.json وpackage-lock.json

## تشغيل Windows PowerShell

```powershell
git fetch origin
git switch feature/stage-6a-tracking-backend
git pull --ff-only origin feature/stage-6a-tracking-backend
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma migrate status
npm exec -w @fieldops/api -- prisma migrate deploy
npm run typecheck
npm test
npm run build
npm run dev
```

واجهة التشغيل: http://localhost:5173 (يسمح HTTP فقط على localhost للسياق الآمن للمتصفح، أما الوصول الخارجي فيتطلب HTTPS).

## الاختبارات

```powershell
npm run test -w @fieldops/web
npm run typecheck -w @fieldops/web
npm run build -w @fieldops/web

# Database test only; never use your development database:
$env:TEST_DATABASE_URL = "postgresql://fieldops:local-development-only@localhost:5432/fieldops_test?schema=public"
npm run test:integration -w @fieldops/api
npx playwright install chromium
npm run test:e2e:api -w @fieldops/web
```

يتحقق السيناريو E2E الفعلي من أن: الفني لا يرسل GPS قبل الموافقة، يبدأ التتبع بعد الموافقة، تظهر البيانات لمشرف موثق، ثم يتوقف التتبع وتختفي البيانات عند Stop؛ ولا يتمكن العميل CUSTOMER من دخول /tracking.

## الحماية والقيود

- حماية الواجهة من الدخول غير المصرّح به ليست بديلاً عن حماية API. ما يزال NestJS المصدر الموثوق للتحقق من الجلسة والصلاحية والتكليف.
- Socket.IO الموجود لا يبث GPS؛ تعتمد حداثة المواقع على Polling مصادق عليه كل 15 ثانية، وتتغير الإشارات تلقائياً بحدث العمليات أو بعد إعادة الاتصال.
- البيانات المرسلة إلى OSM tile server تتضمن نطاق بلاطات الخريطة وعنوان IP الخاص بالمشاهد. لا تحتوي الطلبات على Authorization أو أسماء الفنيين؛ لكن نطاق البلاطات قد يسمح باستنتاج المنطقة، لذا ينبغي اعتماد OSM deployment policy أو tile proxy عند الإنتاج إذا كانت الخصوصية أعلى.
- إذا فشل Stop بسبب فقد الاتصال، يتوقف Watch فوراً في المتصفح؛ يستمر Lease الخادم فقط حتى انتهاء المهلة المضمونة (120 ثانية من آخر عينة ناجحة) إن لم تلغ الجلسة مباشرة.
- no-store HTTP ولا persistence لبيانات GPS. TanStack Query يزيل cache عند فك تركيب TrackingPage.
- إغلاق المتصفح بشكل قسري أو فقد الشبكة قد يمنع وصول DELETE للخادم؛ لا يمكن وعد المستخدم بإلغاء فوري دون رد HTTP. الخادم يمنع العينات بعد انتهاء Lease ويزيل الإحداثيات دورياً.
- لا يوجد Smart Dispatch أو سجل GPS history ولا يتم دمج الكود في main.

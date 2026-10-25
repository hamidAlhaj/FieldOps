> تحديث Stage 5: هذا سجل الدفعة التأسيسية. التشغيل الآن API افتراضياً؛ تفاصيل الأعمال والإشعارات وSocket.IO أصبحت منفذة كما في [دورة العمل](workflow.ar.md). القيود المؤجلة أدناه تصف Stage 4 فقط.

# Stage 4 — Design system وApplication shell، الدفعة الأولى

هذه دفعة تأسيسية للواجهة، وليست تنفيذ الصفحات الاثنتي عشرة كاملة. الواجهة باللغة الإنجليزية، والتوثيق بالعربية. لم نغير API أوصلاحيات Stage 3.

## ما تم تنفيذه

- Design tokens موحدة للألوان والسطوح والحدود والـspacing، مع gradient الهوية `linear-gradient(135deg, #3d00b8 0%, #21dda2 100%)`.
- خطا DM Sans للنصوص وManrope للعناوين، مستضافان محلياً عبر npm، دون طلب fonts من خدمة خارجية.
- Light/Dark themes، Sidebar وmobile navigation وaccount menu وorganization switching، مع skip link وfocus indicators وreduced motion.
- Login وRegistration باستخدام React Hook Form وZod، متصلان بـNestJS عند اختيار API mode. أخطاء الحقول مرتبطة بـaria-describedby، مع password visibility control وحالة submitting.
- Overview مشتركة تتكيف مع ADMIN/DISPATCHER/TECHNICIAN/CUSTOMER. ليست أربع صفحات analytics كاملة؛ تختلف النصوص والروابط ونطاق البيانات حسب الدور.
- قائمة read-only لأوامر العمل أوطلبات العميل، مع search وstatus filter وpagination ونافذة تفاصيل. صفحة العميل تعرض طلباته فقط، والفني تكليفاته النشطة. الخادم يبقى المرجع الحقيقي للصلاحيات.
- Skeletons وempty states وerror/retry states وtoast وrender ErrorBoundary.
- Notifications dialog تجريبية في Demo فقط. illustration المواقع صورة SVG توضيحية مكتوب عليها Sample view، وليست live map.

**مؤجل للدفعات التالية:** إنشاء/تحرير الأعمال عبر نماذج كاملة، assignment interface، صفحة Maintenance Request تفصيلية كاملة، Live Tracking بـLeaflet/Socket.IO، Notifications Center متصل بالخادم، Analytics/Reports، وProfile/Settings forms. العناصر المؤجلة في navigation مكتوبة تحت Coming next ولا تتظاهر بأنها روابط عاملة. القائمة الحالية تعرض بيانات ولا تغيّر حالة الأعمال.

## Component architecture

```text
apps/web/src/
  App.tsx                       # Providers، bootstrap، Router، protected routes
  components/
    ui.tsx                      # Button، Badge، Modal، Toast، Skeleton، Empty/Error states
    AppShell.tsx                # Sidebar، topbar، navigation، account controls
    ErrorBoundary.tsx           # fallback لأخطاء rendering
  features/
    auth/AuthPage.tsx           # forms والتبديل بين Login/Registration
    operations/Overview.tsx     # query + overview حسب الدور
    operations/JobList.tsx      # table، search/filter، pagination، details dialog
  services/
    contracts.ts               # أنواع TypeScript وZod contracts
    http.ts                    # HTTP errors، Bearer، single-flight refresh
    api.ts                     # production API adapter
    session-events.ts          # إبطال هوية التبويبات الأخرى عند login/logout
    index.ts                   # اختيار adapter صريح
    mocks/data.ts              # fixtures فقط
    mocks/service.ts           # demo adapter دون credentials أوطلبات شبكة
  state/store.ts               # Zustand للهوية الحالية والمؤسسة والثيم وtoast
  styles.css                   # design tokens وcomponents وresponsive layout
```

**React Router** يحدد الصفحات، ويحوّل المستخدم غير الموثّق إلى login. Customer لا يفتح work-orders route، وبقية الأدوار لا تفتح requests route الخاصة ببوابته. هذا UX guard؛ لا يمنح صلاحيات backend.

**TanStack Query** يحتفظ بنتائج الخدمات؛ query key يتضمن organizationId والدور، ويُمسح cache عند logout أوتغيير الهوية/المؤسسة/دور demo. Lists تعيد المحاولة مرة واحدة عند فشل التحميل وتسمح بمحاولة صريحة. لا نخزّن server records في Zustand.

**Zustand** يحتفظ بـUser الحالي وorganization selection وUI state. يُحفظ الثيم محلياً، مع timestamp غير سري لتزامن التبويبات عند الحاجة إلى fallback؛ لا access token أوpassword أوUser snapshot في localStorage. access token داخل module memory، وrefresh cookie تديرها API كما في Stage 3.

**Radix Dialog/Dropdown** توفر focus trapping وEscape والإرجاع إلى trigger وkeyboard menu navigation. باقي المكونات تستخدم HTML semantics الأصلية: label/input/select وtable/headings وbuttons. Tailwind 4 يقدم reset/utilities، وCSS tokens/classes تعطي الهوية المشتركة دون تكرار ألوان داخل كل feature.

**Typed API client** يتحقق من responses بـZod. يجدد الجلسة مرة واحدة عند 401 على موارد الأعمال ثم يعيد الطلب. Promise مشتركة تمنع refresh متوازية داخل التبويب، وWeb Locks تسلسل التدوير عبر التبويبات حين تدعمها المنصة. BroadcastChannel يبطل الهوية والكاش في التبويبات الأخرى عند login/logout؛ يوجد storage-event fallback غير سري. المتصفحات التي لا تدعم Web Locks ينبغي أن تستخدم تبويب auth واحداً لتجنب replay revocation. أخطاء API لا تتحول تلقائياً إلى بيانات mock.

## Demo مقابل API

في `npm run dev` الافتراضي: Demo، واضح بشريط ثابت. شاشة الدخول تقدم اختيار الدور ولا تجمع email/password؛ لا حسابات حقيقية تُنشأ. تغيير الدور محاكاة منفصلة، والـdemo session غير محفوظة بعد reload. البيانات والعناوين والإشعارات والفريق في `services/mocks/` حصراً.

لربط backend الحقيقي:

```bash
# جهّز backend كما في README، ثم شغّله:
npm run dev -w @fieldops/api
# في terminal آخر:
VITE_DATA_SOURCE=api npm run dev -w @fieldops/web
```

يستخدم Vite port 5173 وproxy `/api` إلى port 3000. افتح الواجهة بالـhostname المطابق تماماً لـWEB_ORIGIN؛ القيمة المحلية الافتراضية `http://localhost:5173`. تغيير localhost إلى 127.0.0.1 يغير Origin وقد يرفضه backend. `FIELDOPS_API_PROXY` إعداد Vite server اختياري، وليس secret ولا browser token. جميع متغيرات VITE_* عامة ضمن build؛ لا تضع credentials فيها.

في production build، الوضع الافتراضي API. `VITE_DATA_SOURCE=demo` اختيار صريح لبناء demo فقط. النشر يحتاج SPA fallback إلى index.html وreverse proxy لنفس origin لمسارات `/api`، مع HTTPS وWEB_ORIGIN متطابق. Auth bootstrap يعيد refresh ثم me؛ فشل الخادم يعرض retry، وفقدان الجلسة يعيد login. لا fallback من API إلى Demo.

API الحالية تعيد حتى 100 record كحد أعلى، دون ضمان ترتيب عالمي؛ search/filter/pagination في هذه الدفعة تعمل محلياً على هذه النتائج فقط، والواجهة تصرّح بذلك. الأرقام في cards مشتقة من النتائج الحالية، وليست organization-wide analytics أوSLA claims. لا endpoint لأسماء الفنيين في قائمة API الحالية؛ لا تُختلق أسماء، بينما mock تعرض أمثلة واضحة.

## الاختبارات والتشغيل

```bash
npm ci --cache /tmp/fieldops-npm-cache
npm run dev -w @fieldops/web
npm run typecheck -w @fieldops/web
npm run test -w @fieldops/web
npm run build -w @fieldops/web

# على جهاز يدعم تنزيل متصفحات Playwright:
npm exec -w @fieldops/web -- playwright install chromium
npm run test:e2e -w @fieldops/web
```

في البيئة الحالية يوجد Chromium مثبت، واستُخدم بدلاً من تنزيل Playwright المحجوب:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e -w @fieldops/web
```

اختبارات demo تستخدم port 5174. تشمل search/filter/pagination/details وrole switching وdark theme وmobile navigation وtablet overflow وkeyboard entry، مع axe WCAG A/AA على Desktop بثيمين وصفحة دخول Demo.

اختبار المتصفح مع backend حقيقي يحتاج `TEST_DATABASE_URL` لقاعدة مستقلة ينتهي اسمها بـ_test:

```bash
npm run build -w @fieldops/api
# اضبط TEST_DATABASE_URL بشكل آمن كما في database.ar.md
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e:api -w @fieldops/web
```

يشغّل runner API اختبارية على 3001 وVite API mode على 5175، ويطبق migrations على قاعدة الاختبار فقط. لا reset لقاعدة التطوير. الاختبار ينشئ account/organization تجريبيين عبر الواجهة، ثم يتحقق من حفظ cookie واستعادة الجلسة بعد reload، وفشل تحميل بيانات ثم retry، وlogout ومنع route محمية. حقن response 503 داخل المتصفح متعمد لاختبار error state؛ auth وبيانات القاعدة تستخدم NestJS/PostgreSQL الحقيقيين.

الفحص الآلي للوصولية لا يغني عن مراجعة بشرية بقارئ شاشة. تم فحص لقطات Light/Dark وMobile بصرياً، ولم تُنفّذ بعد جميع صفحات المنتج المذكورة في الخطة.

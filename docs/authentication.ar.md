# Stage 3 — Authentication & Authorization

التنفيذ Backend فقط، ولا انتقال إلى المرحلة التالية دون موافقة. يستعمل NestJS وPassport وPrisma وPostgreSQL وArgon2id. الواجهة لم تتغير.

## الهوية والتسجيل

`POST /api/v1/auth/register` يأخذ email وpassword وdisplayName وorganizationName. email يحوّل إلى lowercase بعد trim. password بين 12 و128 حرفاً، ويُحفظ Argon2id hash فقط، بكلفة memory=64MiB وtime=3 وparallelism=1. المستخدم ومؤسسته وMembership بدور ADMIN والجلسة تُنشأ ضمن transaction واحدة. لا يقبل التسجيل role أوorganizationId؛ لذلك لا يستطيع شخص ترقية نفسه داخل مؤسسة قائمة.

للانضمام إلى مؤسسة قائمة: الشخص يسجّل حسابه، ثم Admin تلك المؤسسة يضيفه عبر email المستخدم المسجّل، مع دور وحالة عضويته. هذا منح عضوية صريح من Admin، وليس public self-enrollment أوemail invitation workflow. التسجيل ينشئ مؤسسة للشخص أيضاً؛ invitation acceptance وemail verification وpassword recovery خارج هذه المرحلة. مستخدمو seed القديمة بلا passwordHash، ولذلك لا يمكن تسجيل الدخول بهم في قاعدة التطوير. الاختبارات وحدها تضيف كلمات مرور لfixtures داخل قاعدة _test.

`POST /auth/login` يعيد accessToken وexpiresIn=900 مع معلومات المستخدم الآمنة. الأخطاء العامة لا تفرّق بين كلمة مرور خاطئة وحساب غير فعال أوغير موجود؛ الحساب غير الموجود يجري Argon2 verify ضد dummy hash لتقليل فرق التوقيت. duplicate registration تعيد 409 عامة. كلمات المرور وrefresh tokens لا تُعاد في JSON ولا تُسجّل في logs.

## JWT Strategy وGuards وDecorators

- **JWT Strategy:** Passport يستخرج Bearer token من Authorization header. يتحقق من توقيع HS256 ومن issuer=`fieldops-api` وaudience=`fieldops-web` وexpiration. يتحقق أيضاً من UUID claims: sub وsid. ثم يفحص AuthSession وUser في DB عند كل طلب؛ session ملغاة أومنتهية أوuser معطل تعني 401. لا نثق بـrole داخل token ولا نحتاج تضمينه فيه.
- **JwtAuthGuard:** Global guard، يحمي endpoints تلقائياً. الاستثناءات تُعلّم بـ`@Public()` صراحة؛ registration/login/refresh/logout وhealth عامة من ناحية JWT فقط. لا تعني Public تجاوز validation أوOrigin checks أوrate limiting.
- **OrganizationGuard:** يقرأ organizationId من route، ثم يستخدم PrismaService.forOrganization للتحقق من العضوية الحالية عبر RLS. `@Roles(...)` يحصر الأدوار المسموحة ويعتمد على DB. تغيير الدور أوتعليق العضوية يسري على الطلب التالي دون انتظار انتهاء JWT. يحظر role-restricted handler بلا organization context.
- **Resource checks:** الدور يحدد نوع العملية، لكن service تفحص المورد نفسه. Customer request query تضيف customer.membershipId الحالي، وTechnician work-order query تشترط Assignment ACTIVE للفني نفسه. مورد غير مرئي يعيد 404، بينما role أوorganization غير مسموحة تعيد 403.
- **Decorators:** `@CurrentUser()` يعطي principal موثّقاً وضعته Passport؛ لا يأخذ userId من body. `@Roles('ADMIN')` تصف policy وتنفذها Guard. `@Public()` استثناء واضح وليس الوضع الافتراضي.

مثال تدفق الطلب:

```text
Bearer JWT → Passport signature/claims → active DB session
           → organization membership + role guard
           → service ownership check → tenant transaction + PostgreSQL RLS
```

Health endpoints لا تحتاج هوية. `/auth/me` يعرض بيانات المستخدم نفسه وعضوياته النشطة فقط، دونpasswordHash. معظم قوائم الموارد محدودة بـ100 نتيجة؛ pagination الكاملة مرحلة لاحقة.

## Access وRefresh Token Rotation

Access token عمره 15 دقيقة، يُعاد في JSON، ويُحفظ لاحقاً في ذاكرة frontend فقط، وليس localStorage. Refresh token عبارة عن 48 random bytes (64 base64url characters)، داخل cookie باسم fieldops_refresh: HttpOnly، SameSite=Strict، Path=/api/v1/auth، وSecure في production. لا domain attribute، لذلك cookie تخص host الحالي. جميع استجابات auth الحساسة تحمل Cache-Control: no-store.

DB تحتفظ بـSHA-256 fingerprint للـrefresh token العشوائي عالي entropy، وليس قيمته. Argon2 مخصص لكلمات المرور البشرية؛ SHA-256 مناسب لمقارنة token عشوائي بهذا الحجم.

- **AuthSession:** عائلة الجلسة، مرتبطة بمستخدم، ولها expiresAt مطلق بعد 14 يوماً وrevokedAt.
- **RefreshToken:** سجل لكل جيل، مع tokenHash فريد وconsumedAt. لا تحذف الأجيال المستهلكة قبل انتهاء العائلة؛ تحتاجها لكشف replay.
- **Refresh:** lock على صف AuthSession بـFOR UPDATE، ثم إعادة قراءة token. يُستهلك القديم ويُضاف البديل داخل transaction واحدة.
- **Replay:** أي استخدام لتوكن مستهلك يلغي العائلة كلها. الإلغاء يُحفظ بالـcommit أولاً ثم يرجع 401؛ رمي exception داخل transaction قبل commit كان سيعيد الإلغاء للخلف، لذلك لا نفعل ذلك.
- **Concurrency:** طلبا refresh بالتوكن نفسه لا ينتجان فرعين صالحين؛ أحدهما يدوّر، والثاني يكشف replay ويلغي العائلة حتى للطلب الأول. العميل المستقبلي يجب أن يستعمل single-flight refresh ويمنع requests متوازية من tabs متعددة. لا grace period تخفف الكشف في هذه المرحلة.
- **Logout:** يستعمل refresh cookie لإلغاء عائلتها ويزيل cookie، ويرجع 204 حتى إن كانت مفقودة. إلغاء الجلسة يعطّل access tokens التابعة لها فوراً. Logout لا يلغي بقية أجهزة المستخدم؛ logout-all وإدارة الأجهزة مؤجلان.

انتهاء الجلسة مطلق وليس sliding؛ cookie تستمر 14 يوماً بعد آخر إرسال لكن الخادم يرفضها بعد expiresAt الأصلي. تغيير JWT signing key يلغي access tokens القديمة؛ لإبطال كل الثقة القديمة يجب إلغاء AuthSessions أيضاً. key ring/rotation التشغيلية متعددة المفاتيح ليست منفذة.

## CSRF وConfiguration

كل POST على auth يحتاج `Origin` يطابق WEB_ORIGIN تماماً، بما فيه login/register وrefresh/logout. المفقود أوالمختلف يعيد 403. هذا يمنع login CSRF وcookie refresh/logout CSRF؛ SameSite=Strict طبقة إضافية. CORS يسمح origin المحدد فقط مع credentials. بقية endpoints تتطلب Bearer وليست cookie-authenticated، فلا تعتمد على ambient cookie.

في production: WEB_ORIGIN يجب أن يكون HTTPS، وcookie Secure، وTLS على proxy. النشر الحالي يفترض frontend وAPI ضمن same-site حتى تعمل Strict cookies؛ cross-site hosting يحتاج تصميماً صريحاً مختلفاً. لا تفعل trust proxy عشوائياً؛ الثقة تكون في proxy محدد كي لا تتلاعب الأطراف بعنوان IP.

تهيئة التطوير:

```bash
npm ci
# بعد تجهيز ملفات .env كما في README:
npm run auth:configure-local -w @fieldops/api
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma migrate deploy
npm run dev -w @fieldops/api
```

أمر configure-local يولد JWT_ACCESS_SECRET عشوائياً داخل apps/api/.env غير المتعقب إذا لم يوجد. لا يطبع القيمة ولا يستبدل القيمة القائمة، ويرفض NODE_ENV=production. production يحتاج secret قوي 64+ characters من secret manager وWEB_ORIGIN HTTPS. لا تضع secrets في Git أوchat. `AuthService` تحتفظ باتصال identity store إداري خاص، دون تصدير PrismaClient، للـlogin والجلسات والتسجيل وعمليات العضوية المحدودة. تغيير العضوية يعيد التحقق من ADMIN ضمن transaction مقفلة على Organization، ويمنع إزالة آخر Admin نشط. عزل هذه الصلاحيات في database identity role أدق مطلوب قبل نشر متعدد الخدمات؛ لا تمنح fieldops_app صلاحيات الهوية.

migration الرابعة تضيف passwordHash وAuthSession وRefreshToken. تسحب SELECT الشامل على User من fieldops_app وتمنحه الأعمدة العامة فقط. لذلك لا يمكن accidental Prisma user.findMany() كشف hash من tenant context. جداول الجلسات والـtokens لا يمكن لهذا الدور قراءتها أصلاً. لا تتجاوز scoped API باستعمال identity store في business services.

Rate limiting مفعلة: 120/min افتراضياً لكل IP/handler، register=3/min، login=10/min، refresh=30/min. المخزن الحالي in-memory لكل instance؛ production متعدد instances يحتاج shared storage وproxy configuration موثوقاً ومراقبة محاولات الحسابات. Email verification وpassword reset وMFA وsession cleanup وshared throttler storage ليست منفذة؛ لا يعتبر هذا إعلان readiness للإنتاج، خاصة مع تحذيرات dependencies السابقة.

## Endpoints والصلاحيات

جميع مسارات الجدول نسبية إلى `/api/v1`. Auth cookie mutating routes تحتاج Origin.

| Endpoint | Policy |
| --- | --- |
| POST auth/register, auth/login | Public + Origin + throttle + DTO validation |
| POST auth/refresh, auth/logout | Refresh cookie + Origin |
| GET auth/me | Active Bearer session |
| GET/POST organizations/:organizationId/users | ADMIN؛ POST يمنح عضوية لمستخدم مسجّل |
| PATCH organizations/:organizationId/users/:id | ADMIN؛ id هو Membership، role/status ضمن المؤسسة فقط |
| GET/POST teams، PATCH/DELETE teams/:id ضمن organization route | ADMIN؛ FK Restrict يمنع حذف فريق مرتبط بعمل |
| GET requests وGET requests/:id ضمن organization route | ADMIN/DISPATCHER أوCUSTOMER مالك الطلب |
| POST requests ضمن organization route | CUSTOMER؛ owner مشتق من الهوية |
| POST requests/:id/cancel ضمن organization route | ADMIN/DISPATCHER، أوCUSTOMER لطلبه SUBMITTED |
| GET work-orders وGET work-orders/:id ضمن organization route | ADMIN/DISPATCHER، أوTECHNICIAN ذو Assignment ACTIVE |
| POST work-orders وPOST work-orders/:id/assignments ضمن organization route | ADMIN/DISPATCHER |
| PATCH work-orders/:id/status ضمن organization route | ADMIN/DISPATCHER، أوالفني الحالي لـIN_PROGRESS/COMPLETED فقط |

لا admin عالمي؛ Admin مؤسسة A لا يدير B. User.isActive حالة هوية عالمية لا يسمح Admin مؤسسة بتعديلها؛ يستطيع تعليق Membership داخل مؤسسته فقط. تغيير role مع Profile غير متوافق يرجع 409 كي لا يترك بيانات فني/عميل متناقضة. قيود workflow وexpectedVersion من Stage 2 باقية.

## Swagger وتجربة API

Swagger متاح خارج production في `/api/docs` وOpenAPI في `/api/docs-json`. يتضمن Bearer scheme وrefreshCookie scheme وDTO schemas. احصل على accessToken عبر API ثم أدخله في Authorize. لأن Swagger يُخدم من API origin بينما WEB_ORIGIN غالباً frontend origin، لن ينجح login عبر Try it out إذا اختلف Origin؛ لا نوسّع سياسة CSRF لتجاوز ذلك. جرّب auth من frontend origin أوHTTP client محلي يرسل Origin الموثّق. المتصفح لا يسمح بإدخال Cookie header يدوياً عبر Swagger.

مثال محلي ببيانات تجريبية غير حقيقية:

```bash
umask 077
curl -i -c /tmp/fieldops-cookies.txt \
  -H 'Origin: http://localhost:5173' -H 'Content-Type: application/json' \
  -d '{"email":"manager@example.test","password":"Example-development-password-2026!","displayName":"Manager","organizationName":"Demo Services"}' \
  http://127.0.0.1:3000/api/v1/auth/register

curl -i -b /tmp/fieldops-cookies.txt -c /tmp/fieldops-cookies.txt \
  -H 'Origin: http://localhost:5173' -X POST \
  http://127.0.0.1:3000/api/v1/auth/refresh

curl -i -b /tmp/fieldops-cookies.txt -H 'Origin: http://localhost:5173' \
  -X POST http://127.0.0.1:3000/api/v1/auth/logout
```

احفظ cookie jar محلياً بصلاحيات ضيقة واحذفه بعد التجربة. لا تضع قيم tokens الحقيقية في logs أوGit.

## التحقق

```bash
npm run typecheck
npm test
# TEST_DATABASE_URL يشير إلى قاعدة مستقلة ينتهي اسمها بـ_test؛ راجع database.ar.md
npm run test:integration -w @fieldops/api
npm run build
```

اختبارات HTTP تستخدم AppModule وconfigureApp الفعليين، وPassport الحقيقي وArgon2 وPostgreSQL، دون mock للهوية. تغطي التسجيل الذري ومنع role injection وArgon2id وcookie flags وDTO validation وgeneric login errors وOrigin وJWT expired/tampered/wrong audience وRBAC وownership وcross-organization access وmembership suspension وlast Admin وadmin membership grants وexpired sessions وdisabled users وrotation/replay/concurrent refresh/logout وSwagger وrate limiting. اختبارات Stage 2 بقيت، مع اختبار حجب password hashes وبيانات الجلسات عن tenant runtime.

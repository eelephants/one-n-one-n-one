# 배포

두 타깃이 있고 절차가 완전히 다르다. 공통 백엔드는 Supabase 하나다.

---

## 1. Supabase (공통, 먼저)

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

### 이메일 템플릿 — 반드시 바꿔야 한다

로컬은 `supabase/templates/*.html` 로 설정돼 있지만 **호스티드 프로젝트는 대시보드에서 따로 바꿔야 한다.**
안 바꾸면 기본 템플릿의 `{{ .ConfirmationURL }}` 이 PKCE(`?code=`) 나 implicit(`#access_token=`) 로
떨어지고, 우리 `/auth/confirm` 은 `token_hash` 를 읽으므로 **로그인이 조용히 실패한다.**

Authentication → Email Templates 에서 **Magic Link** 와 **Confirm signup** 둘 다:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink">로그인하기</a>
```

(Confirm signup 은 `type=signup`)

### SMTP — 두 가지가 여기 걸려 있다

기본 제공자 상태에서는 **실측 기준 시간당 2통**(`rate_limit_email_sent = 2`)이고,
더 중요한 건 **이메일 템플릿 수정 자체가 거부된다**는 것이다:

> Email template modification is not available for free tier projects using the default email provider.

즉 커스텀 SMTP 없이는 `token_hash` 플로우를 쓸 수 없고, `/auth/confirm` 은 죽어 있다.
(그래서 앱은 `/auth/callback` PKCE 경로도 함께 받는다. 대신 **링크를 연 기기에서만** 로그인된다.)

설정 순서 — 스크립트 두 개로 끝난다:

```bash
# 1) Resend 등에서 API 키를 받은 뒤 (도메인 인증 전이면 onboarding@resend.dev)
SMTP_PASS='re_xxxxxxxx' npm run setup-smtp -- onboarding@resend.dev

# 2) SMTP 가 붙은 뒤에야 템플릿이 적용된다
npm run push-templates
```

`setup-smtp` 는 발송 제한도 시간당 30통으로 올린다. 다른 공급자는
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` 로 덮어쓴다.

**도메인 인증 전에는 가입한 본인 이메일로만 발송된다.** 지금은 가입이 차단돼 있어 사용자가
한 명뿐이므로 문제되지 않는다. 사람을 받으려면 도메인 인증이 먼저다.

### URL 설정

Authentication → URL Configuration:
- Site URL: `https://<도메인>`
- Redirect URLs: `https://<도메인>/auth/confirm`

---

## 2. 공개 웹 (Vercel)

모노레포지만 추가 설정은 필요 없었다. 실측으로 확인함 (빌드 21초, TypeScript 통과 = 루트 밖
`packages/domain` 해석 성공).

| 항목 | 값 |
|---|---|
| Root Directory | `apps/web` |
| Include files outside root directory | 건드리지 않음 — 기본값으로 `packages/domain` 이 잡힌다 |
| Install / Build Command | 기본값 |

현재 프로젝트: `prj_41RI5Gb3N3fEti3StgsrniUO7LjL` (team `sangchokims-projects`)

### 접근 보호

Hobby 플랜은 **프로덕션 URL 에 Vercel Authentication 을 걸 수 없다** (프리뷰만 가능).
저장소가 public 이므로 프로덕션의 실질적 방어선은 **Supabase 신규 가입 차단**이다.
`supabase/config.toml` 의 `[auth] enable_signup = false` 를 프로덕션 대시보드에도 반영할 것.

환경변수:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   ← Production 만. Preview 에는 넣지 않는다
```

> Preview 에 서비스 키를 안 넣으므로 Preview 에서는 계정 삭제가 동작하지 않는다.
> `deleteAccount` 가 정체불명의 에러 대신 명시적 메시지를 던지도록 되어 있다 (의도된 동작).

### 배포 전 게이트

```bash
npm test && npm run typecheck && npm run lint
npm run test:e2e
npm -w apps/web run build && npm run check-key-leak
```

`check-key-leak` 은 **키 값 자체**를 빌드 산출물에서 찾는다.
`curl / | grep service_role` 같은 검사는 문자열만 보므로 실제 유출을 놓친다.

### 배포 후 스모크

1. 매직링크로 로그인 → `/` 로 이동
2. 세션 시작 → 새로고침 → 타이머 유지
3. 끝내기 → 히스토리에 기록
4. `/icon.svg`, `/apple-icon`, `/manifest.webmanifest` 가 **로그아웃 상태에서도** 200 (307 이면 미들웨어 matcher 문제)
5. 로그아웃 → `/login`

---

## 3. 앱인토스 미니앱

**웹처럼 `git push` 로 끝나지 않는다.** 콘솔 등록 → 샌드박스 → 출시 검수를 거친다.

### 선행 조건 (콘솔에서 받아와야 함)

- `appName` — `granite.config.ts` 와 콘솔이 일치해야 한다
- 브랜드 (displayName, primaryColor, icon), 필요 권한
- 토스 로그인 클라이언트 자격증명 (인가코드 → 토큰 교환용)
- CORS 오리진 등록: `https://<appName>.web.tossmini.com`, 샌드박스 `https://<appName>.private-web.tossmini.com`

### 아직 안 된 것

- `@apps-in-toss/framework` 미설치, `granite.config.ts` 에 `appsInToss` 플러그인 미적용
  → 위 콘솔 값이 있어야 채울 수 있다
- 토스 로그인 → Supabase 세션 발급 API (Next.js 라우트, spec D12)
- 미니앱 화면 구현 (현재 `src/pages/index.tsx` 는 도메인 패키지 배선 확인용 임시 화면)

### 빌드

```bash
cd apps/toss && npm run build   # dist/*.ait
```

**화면 검증은 토스 샌드박스 앱에서만 가능하다** (spec D14). 자동 검증은 타입체크·빌드까지다.

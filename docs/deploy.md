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

### SMTP — 출시 전에 반드시

기본 내장 SMTP 는 **시간당 한 자릿수**로 제한되고 프로덕션용이 아니다. 그대로 두면
출시일에 매직링크가 조용히 안 가기 시작한다. Authentication → SMTP Settings 에 커스텀 SMTP 를 넣는다.

### URL 설정

Authentication → URL Configuration:
- Site URL: `https://<도메인>`
- Redirect URLs: `https://<도메인>/auth/confirm`

---

## 2. 공개 웹 (Vercel)

모노레포이므로 프로젝트 설정이 중요하다.

| 항목 | 값 |
|---|---|
| Root Directory | `apps/web` |
| Include files outside root directory | **켠다** (`packages/domain` 이 필요하다) |
| Install Command | `npm install --workspaces --include-workspace-root` (기본값으로 안 되면) |
| Build Command | 기본 (`next build`) |

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

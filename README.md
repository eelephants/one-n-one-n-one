# 하루에 하나씩

하루에 딱 하나의 일을, 한 시간 동안만.

해결책은 기능 추가가 아니라 **제약**이다. 그래서 규칙은 UI 조건문이 아니라 **DB 제약과 서버 함수**에 있다.

- 스펙 · 불변 규칙 · 설계 결정 — [`docs/spec.md`](docs/spec.md)
- 용어와 금지 사항 — [`CONTEXT.md`](CONTEXT.md)
- 구현 계획 — [`docs/superpowers/plans/2026-08-17-one-hour-a-day.md`](docs/superpowers/plans/2026-08-17-one-hour-a-day.md)
- 배포 절차 — [`docs/deploy.md`](docs/deploy.md)

## 구조

npm workspaces. Turborepo·Nx 는 쓰지 않는다 (앱 2개 + 공유 패키지 1개에 과하다).

```
packages/domain/   순수 함수. SQL 생성 컬럼의 TS 미러라 복사 금지 — 공유해야 한다
apps/web/          Next.js 공개 웹 (이메일 매직링크) → Vercel
apps/toss/         Granite RN 앱인토스 미니앱 (토스 로그인) → .ait 번들
supabase/          마이그레이션 · RLS · RPC. 클라이언트 무관
tests/             불변 규칙 테스트(PostgREST 경유 = 공격자와 같은 경로) + Playwright
```

## 개발

Docker 가 필요하다 (로컬 Supabase).

```bash
npm install
npx supabase start
cp apps/web/.env.local.example apps/web/.env.local   # npx supabase status 값으로 채운다
npm run dev                                          # http://127.0.0.1:3100
```

비밀번호 로그인이 없어서 로컬에서는 링크를 직접 뽑아 쓴다:

```bash
npm run login-link
```

히스토리 화면을 채워서 보려면:

```bash
npm run seed-history -- 100
```

## 검증

```bash
npm test                 # 도메인 + 불변 규칙 (로컬 Supabase 필요)
npm run typecheck        # root · domain · web
npm run lint
npm run test:e2e         # Playwright. 프로덕션 빌드로 돈다
npm run check-key-leak   # service_role 키가 클라이언트 번들에 없는지 (배포 게이트)
```

미니앱은 별도다:

```bash
cd apps/toss && npm run build   # .ait 번들. 화면 확인은 토스 샌드박스 앱에서만 가능
```

## 알아둘 것

- **웹 화면 검증은 프로덕션 빌드로 한다.** `next dev` 를 프리뷰 프록시 뒤에서 열면 청크 하나가
  403 이 나서 하이드레이션이 붙지 않는다. 코드 문제가 아니다.
- **웹 사용자와 토스 사용자는 별개 계정이다** (spec D11). 같은 사람이 양쪽을 쓰면 기록이 갈라진다.
- 하루 경계는 **KST 04:00** 이고, 그 계산은 DB 생성 컬럼과 `packages/domain` 양쪽에 있다.
  둘이 어긋나면 안 되므로 `tests/invariants.test.ts` 가 실제 DB 와 대조한다.

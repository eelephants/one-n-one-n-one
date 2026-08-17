# 하루에 하나씩 (One Hour a Day) — Spec

## 제품 정의

할 일은 항상 많고, 다 하지 못하고, 못하면 후회하고, 그래서 마음이 급해지는 사람들을 위한
루틴 앱. 해결책은 기능 추가가 아니라 **제약**이다. 하루에 딱 하나의 일을, 한 시간 동안만 한다.

### 철학 (모든 UI 문구·상호작용의 판정 기준)

1. **제약이 곧 기능이다.** 더 많이 하게 만드는 앱이 아니라, 하나만 하게 만드는 앱이다.
2. **죄책감이 아니라 완결감을 준다.** 실패/미달성 같은 부정적 라벨을 쓰지 않는다.
   중단해도 "37분 했음"으로 기록되지, "실패"로 기록되지 않는다.
3. **감시하지 않는다.** 타이머 중 다른 앱으로 가도 막거나 추적하지 않는다. 신뢰 기반이다.
4. **비어 있는 화면이 기본값이다.** 오늘 할 일이 없으면 아무것도 없는 게 정상이다.
   빈 화면에서 재촉하는 카피를 쓰지 않는다.

---

## 불변 규칙 (Invariants)

UI 조건문이 아니라 **DB 제약과 서버 함수로 강제**한다. 클라이언트를 조작해도 우회할 수 없다.

| ID | 규칙 | 강제 수단 |
|---|---|---|
| **INV-1'** | 사용자·서비스일 기준 `status in ('running','completed')` 행은 최대 1개 | `unique index (user_id, service_date) where status in ('running','completed')` |
| **INV-1''** | 사용자·서비스일 기준 총 행 수는 최대 2개. 2번째 행은 1번째가 `stopped`일 때만 생성 | 앞 절반(총 2행)은 `unique index (user_id, service_date, attempt)` + `check attempt in (1,2)`. **뒤 절반("stopped 뒤에만")은 제약이 아니라 `start_session` PL/pgSQL 가드다** — 다른 행을 참조해야 해서 CHECK 로 표현할 수 없다. 클라이언트에는 INSERT 권한이 없으므로 실효는 같지만, 이건 구조적 강제가 아니다 |
| **INV-2** | 세션 길이는 정확히 60분. 사용자가 늘리거나 줄일 수 없다 | 길이 컬럼이 **존재하지 않는다**. 종료 시각은 항상 `started_at + interval '1 hour'` |
| **INV-3** | `running` 세션이 있는 동안 새 세션을 만들 수 없다 (전역, 날짜 무관) | `unique index (user_id) where status = 'running'` |
| **INV-4** | 남은 시간의 기준은 서버가 기록한 `started_at`. 클라이언트 시계는 표시용 | RPC에 시각 인자 없음. `started_at default now()`. 응답에 `server_now` 동봉 |
| **INV-5** | 종료된 세션은 **클라이언트로부터** 수정·삭제 불가 | RLS에 UPDATE/DELETE 정책 부재 + `before update` 트리거. `service_role` 은 BYPASSRLS 이므로 서비스 키를 쥔 쪽(= 이 앱의 `deleteAccount`)은 지울 수 있다. 의도된 트레이드지만 "불변"이 아니라 "클라이언트로부터 불변"이 정확하다 |
| **INV-6** | "하루"의 경계는 KST 04:00 | `service_date` 생성 컬럼 (`GENERATED ALWAYS AS ... STORED`) |

> **INV-1 원문 정정**: 원 브리프의 "하루 최대 1개"는 "재시작 1회 허용"과 문자 그대로 모순이다.
> 실제 규칙은 위 INV-1' / INV-1''이다. 하루에 **완료 가능한 세션 1개**, **총 행 2개**.

---

## 결정된 사양

| 항목 | 결정 |
|---|---|
| 하루 세션 수 | 완료 가능한 세션 1개. 완료하면 그날 끝 |
| 중도 중단 | 그날 1회에 한해 재시작 허용. 중단 기록은 그대로 남는다 |
| 조기 종료 | 60분 전 종료 → `stopped` + 실제 진행 시간. 실패 아님 |
| 하루 경계 | KST 04:00 |
| 타이머 | 서버 `started_at` 기준. 일시정지 없음 |
| 종료 액션 | 사용자에게는 "끝내기" 하나. 서버가 시각을 보고 `completed`/`stopped`를 결정 |
| 알림 | MVP 범위 밖 |

### Phase 0에서 확정한 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| **D0** | **localStorage 정적 페이지가 아니라 서버를 쓴다** | 가장 뻔한 게으른 대안이므로 명시적으로 기각한다. 이유는 "적대적 클라이언트 방어"가 **아니다** — 이 앱의 유일한 공격자는 사용자 본인이고 속여서 얻을 게 없다. 진짜 이유는 둘: ① **기기 간 정합성** — 같은 타이머가 폰과 노트북에서 같아야 하고, 새로고침·앱 종료에 살아남아야 하고, 동시 시작 레이스가 없어야 한다. ② **제약의 실재성** — 철학 1이 "제약이 곧 기능"이다. 개발자 도구로 5초면 우회되는 제약은 제약이 아니라 권고이고, 사용자가 그걸 알기 때문에 효력이 사라진다 |
| D1 | **`ends_at` 컬럼을 두지 않는다** | 항상 `started_at + 1h`. 존재하지 않는 필드는 드리프트하거나 조작될 수 없다 (INV-2). 만료 스캔은 `where status='running'` 부분 인덱스만 타면 되므로 인덱스도 불필요 |
| D2 | **`service_date`는 DB 생성 컬럼** | 제약을 강제하는 주체가 키를 계산해야 한다. 앱이 보내면 조작된 요청 하나로 INV-1 우회. 생성 컬럼은 삽입 경로(RPC/시드/마이그레이션)와 무관하게 항상 맞다 |
| D3 | **종료 RPC는 `finish_session()` 하나** | `completed`/`stopped` 구분은 시각의 함수다. 클라이언트가 고르게 두면 그 자체가 우회 통로 |
| D4 | **만료 세션은 지연 확정. 크론 없음. 단 읽기 경로에서도 확정한다** | 최초 판단("쓰기 시점에만 확정하면 충분")은 **틀렸다.** 화면 C 에는 버튼이 없어서 사용자가 어떤 쓰기도 일으킬 수 없고, 그러면 행이 다음 `start_session` 까지 `running` 으로 남아 히스토리·잔디·연속 일수에서 통째로 빠진다. `today_state()` 를 `volatile security definer` 로 만들어 반환 전에 `finalize_overdue()` 를 부르고, `/history` 도 select 전에 부른다. 비용은 사용자당 최대 1행짜리 부분 인덱스 UPDATE |
| D5 | **`finished_at`은 `[started_at, started_at+1h]`로 클램프** | `now()`로 확정하면 3일 뒤 접속한 사용자에게 3일짜리 세션이 기록된다 |
| D6 | **날짜 라이브러리 추가 안 함** | `Intl.DateTimeFormat({ timeZone })`이 네이티브로 처리. `service_date`는 이미 순수 날짜 문자열이라 연속 일수 계산에 타임존이 개입하지 않는다 |
| D7 | **`before delete` 트리거를 만들지 않는다** | 계정 삭제 시 `auth.users` → `sessions` cascade까지 막힌다. DELETE는 "RLS에 DELETE 정책 부재"로만 막는다 |
| D8 | **불변 규칙 테스트는 pgTAP이 아니라 Vitest + 로컬 Supabase** | DoD가 "RPC를 직접 호출해 우회 시도가 막힌다"이다. 공격자는 PostgREST로 들어오므로 테스트도 같은 경로로 때려야 한다. pgTAP은 RLS/PostgREST 계층을 건너뛴다 |
| D9 | **`today_state()` 단일 읽기 RPC** | 오늘 화면이 필요한 것(오늘의 `service_date`, 행들, `server_now`)을 한 번에 준다. 시계 오차 보정용 `server_now`가 어차피 필요하므로 왕복이 늘지 않는다 |
| D10 | **03:00–04:00 시작 세션이 하루 2회를 가능하게 하는 것을 허용** | `service_date`가 달라지므로 발생. 막으려면 설명 불가능한 UI가 필요하고 철학 3번에 어긋난다. 발동 조건이 극히 좁다 |

---

## 상태 전이

```
                          ┌───────────────────────┐
                          │  없음  (화면 A)         │
                          │  오늘 service_date에    │
                          │  행이 0개 또는          │
                          │  stopped(a=1) 1개       │
                          └───────────┬───────────┘
                                      │ start_session(title)
                                      ▼
        ┌──────────────────────────────────────────────────┐
        │  running  (화면 B)                                │
        │  기준: 서버 started_at.  종료: started_at + 60분    │
        │  사용자당 전역 1개 (날짜 무관)                       │
        └───────┬──────────────────────────────────┬───────┘
                │ finish_session()                 │ finish_session()
                │ now() <  started_at+1h           │ now() >= started_at+1h
                │ finished_at = now()              │ finished_at = started_at+1h
                │                                  │  ─── 또는 ───
                │                                  │ finalize_overdue() (다음 쓰기 시)
                ▼                                  ▼
        ┌───────────────┐                  ┌──────────────────┐
        │  stopped      │                  │  completed       │
        │  "37분 했음"   │                  │  화면 C · 그날 끝  │
        └───────┬───────┘                  └──────────────────┘
                │
                ├── attempt = 1 ──▶ start_session() → running (attempt=2)
                └── attempt = 2 ──▶ 화면 C · 그날 끝
```

허용 전이 표 (이외는 전부 거부):

| from | 이벤트 | to | 가드 |
|---|---|---|---|
| 없음 | `start_session` | running a=1 | 오늘 행 0개 · 전역 running 없음 |
| stopped a=1 | `start_session` | running a=2 | 같은 service_date · 전역 running 없음 · 오늘 completed 없음 |
| running | `finish_session` | stopped | `now() < started_at+1h` |
| running | `finish_session` | completed | `now() >= started_at+1h` |
| running | `finalize_overdue` | completed | `now() >= started_at+1h` (내부 호출 전용) |
| completed · stopped | 무엇이든 | ✗ | INV-5 |

**화면 C의 정의** = 더 이상 시작할 수 없는 상태: 오늘 `completed`가 있다 **또는** 오늘 행이 2개다
**또는** 만료된 `running`이 있다. 화면 C에는 시작 버튼을 **렌더링하지 않는다** (disabled도 아니고 부재).

---

## 배포 타깃 (2026-08-17 피벗)

**두 곳에 배포한다. 백엔드는 하나다.**

| 타깃 | 스택 | 인증 |
|---|---|---|
| **공개 웹** | Next.js (App Router, RSC) → Vercel | Supabase 이메일 매직링크 (token-hash) |
| **앱인토스 미니앱** | Granite RN (`@granite-js/react-native` + `@apps-in-toss/framework`) → `.ait` 번들 | **토스 로그인 (`appLogin`)** |
| 공통 백엔드 | Supabase (Postgres / RLS / RPC) — **Phase 1 그대로** | — |

### 앱인토스에서 확인된 제약

| # | 사실 | 영향 |
|---|---|---|
| T1 | **자사·타사 로그인 금지.** "자사 로그인이나 기타 로그인 방식은 제공하지 않아요" | 미니앱은 토스 로그인만. 이메일 인증은 **정책 위반** |
| T2 | 인가코드 → 토큰 교환 → 사용자 정보 조회는 **반드시 파트너 서버에서** | Next.js API 라우트가 이 역할을 겸한다 (어차피 배포하므로 Edge Function 추가 안 함) |
| T3 | RN 미니앱은 **Granite 위에서만** 동작. Expo 아님 | 별도 프로젝트. `npm create granite-app` |
| T4 | WebView 모드는 **SSR 금지** (CSR/SSG만) | 현 Next.js 웹앱은 RSC 기반이라 WebView 미니앱으로 전용 불가. 그래서 RN 별도 구현 |
| T5 | CORS 오리진을 콘솔에 등록해야 함 | `https://<appName>.web.tossmini.com`, 샌드박스는 `.private-web.tossmini.com` |
| T6 | 콘솔 등록 + 샌드박스 검증 + 출시 검수 | 배포가 `git push` 가 아니다. 리드타임을 계획에 넣을 것 |
| T7 | TDS 는 로컬 테스트 불가, 샌드박스에서만 확인 가능. CLI 자체가 에이전트 사용 시 비권장 안내 | **TDS 안 씀. `StyleSheet` 로 간다** |
| T8 | 서드파티 네이티브 모듈은 앱인토스가 지원하는 범위 안에서만 | 이 앱은 타이머·텍스트·그리드뿐이라 해당 없음 |

### 추가 결정

| # | 결정 | 근거 |
|---|---|---|
| **D11** | **웹 사용자와 토스 사용자는 별개 계정이다** | 같은 사람이 양쪽을 쓰면 Supabase 유저가 둘이 되고 기록이 갈라진다. 연결하려면 CI 기반 아이덴티티 링킹이 필요한데 Supabase 가 토스를 OAuth 공급자로 모른다. **MVP 는 별개로 두고 이 문장을 UI 어딘가가 아니라 여기 문서에 남긴다.** 실제로 문제가 되면 그때 `profiles.toss_ci` 로 병합한다 |
| **D12** | **토스 세션 발급은 Next.js API 라우트** | 인가코드를 받아 토큰 교환 → 토스 사용자 식별자로 Supabase 유저를 찾거나 만들고 → 세션을 발급해 미니앱에 돌려준다. service key 가 필요하므로 반드시 서버 |
| **D13** | **도메인 로직은 npm workspaces 로 공유** | `lib/domain.ts` 는 SQL 생성 컬럼의 미러다. 복사하면 반드시 갈라진다. Metro `watchFolders` 설정이 필요할 수 있음 — Granite 스캐폴드를 실제로 보고 확정 |
| **D14** | **RN 미니앱은 내가 화면을 검증할 수 없다** | 토스 샌드박스 앱 + 콘솔 등록이 선행 조건. 타입체크·빌드까지만 자동 검증하고 화면 확인은 사용자가 한다. 이 비대칭을 DoD 에 명시할 것 |

## 화면 (MVP)

1. **인증** — 이메일 매직링크
2. **오늘 (홈)** — 상태 A(단일 인풋) / B(남은 시간 + 제목, 그 외 없음) / C(오늘 한 일 + 소요 시간)
3. **히스토리** — 월별 그리드(잔디) + 리스트 + 연속 일수 + 총 누적 시간
4. **설정** — 로그아웃, 계정 삭제

## 범위 밖

두 종류를 구분해서 적는다. 안 그러면 6개월 뒤에 "지금 안 만든다"가 조용히 "만든다"가 된다.

### 영원히 안 만든다 (이게 제품의 정체성이다)

태그·카테고리, 통계 대시보드, 소셜/친구, 결제, 세션 중 메모, 세션 일시정지,
하루 2개 이상, 60분 외의 길이, **타임존 지원** — 이 제품은 한국 거주 사용자 대상이다.

### 지금은 안 만든다 (나중에 재검토)

푸시 알림·리마인더, 다크모드, 다국어, 위젯, Realtime 구독, pg_cron, 오프라인 서비스워커

> **리마인더 — 검토 후 범위 밖 유지 (2026-08-17 확정).**
> 하루 1회 습관 앱에서 리마인더 부재는 알려진 실패 모드이고 리뷰에서 critical 로 지적됐다.
> 그럼에도 유지하는 이유: 개인용으로 먼저 써보고 **실제로 잊는지** 확인한 뒤 넣는 것이 순서다.
> 성공 기준(아래)이 정확히 그걸 측정한다 — 30일 중 20일에 미달하면 원인 후보 1순위가 리마인더다.
> 재검토 목록의 맨 위이며, 아이콘·매니페스트보다 먼저다.

### 성공 기준

> **앞으로 30일 중 20일을 내가 직접 열고 세션을 시작하지 않으면, 제약 가설이 틀린 것이고 중단한다.**

계측에 추가 코드는 필요 없다. `sessions` 의 `service_date` distinct count 가 그대로 답이다.
이 기준은 엔지니어링 DoD 와 별개다 — `npm test` 가 전부 green 이어도 이 숫자가 안 나오면 실패다.

배포 후 30일이 되는 날 히스토리를 열어 `active_days` 를 확인한다.

### 검토 후 유지된 결정 (리뷰어가 반대했으나 사양 유지)

| 항목 | 리뷰 지적 | 결정 (2026-08-17) |
|---|---|---|
| 일시정지 없음 + 재시작 1회 | 전화·회의로 두 번 끊기면 그날이 잠긴다. 제약이 대상 사용자를 벌준다 (CEO, high) | **유지.** 일시정지를 허용하면 "60분"이 벽시계 시간이 아니게 되고 INV-2·INV-4 의 의미가 흐려진다. 철학 1 의 핵심 |
| 리마인더 범위 밖 | MVP 실패 모드 1번 (CEO, critical) | **유지.** 위 참조 |

---

## 엣지 케이스와 처리

| # | 케이스 | 처리 |
|---|---|---|
| E1 | 04:00 경계를 걸치는 세션 (03:30 시작 → 04:30 종료) | `service_date`는 어제. 타이머는 `started_at` 기준이라 정상. 히스토리는 어제 칸. 04:30 이후 오늘치를 또 시작할 수 있음 — **허용** (D10) |
| E2 | 60분 경과 후 미접속 | 표시는 파생, 저장은 다음 쓰기 시 `finalize_overdue()`. `finished_at = started_at+1h`로 클램프 (D4, D5) |
| E3 | 여러 탭/기기 동시 생성 | RPC 첫 줄 `pg_advisory_xact_lock(hashtextextended(user_id::text,0))`로 직렬화. 그래도 충돌하면 유니크 인덱스가 23505. UI는 **에러를 띄우지 않고** 재조회해서 B/C 표시 |
| E4 | 서버-클라이언트 시계 오차 | `today_state()`가 `server_now` 동봉. 클라이언트가 `skew = server_now - Date.now()` 1회 계산. `setInterval`은 다시 그리기만 하고, 매 tick 절대 시각 재계산(백그라운드 throttle 면역) |
| E5 | 해외 사용자 / KST 하드코딩 | 지금은 생성 컬럼에 `Asia/Seoul` 고정. 미래: `profiles.timezone` 추가 → 생성 컬럼을 일반 컬럼으로 전환(생성 컬럼은 타 테이블 참조 불가). **기존 행은 재계산하지 않는다** — 그때의 KST 기준이 그 시점의 사실이다 |
| E6 | 재시작 후 다시 중단 | `stopped(a=2)` → 화면 C. 두 기록의 합을 중립 서술 ("오늘 23분 + 37분"). "두 번 다 실패" 금지 |
| E7 | `completed` 후 재시작 시도 | RPC 거부. UI는 버튼 자체를 렌더링하지 않음 |
| E8 | 계정 삭제 | `on delete cascade`. `auth.users` 삭제는 service_role 필요 → 서버 액션에서 `auth.admin.deleteUser`. 서비스 키가 클라이언트 번들에 없는지 Phase 5에서 확인 |
| E9 | `auth.uid()`가 null (anon 키 직접 호출) | RPC 첫 줄에서 `raise exception 'unauthenticated'` |
| E10 | `security definer` + 가변 `search_path` | 권한 상승 경로. 모든 definer 함수에 `set search_path = ''` + 스키마 명시 |
| E11 | NTP 되감기로 `finished_at < started_at` | `least(greatest(now(), started_at), started_at + 1h)` 클램프 + CHECK 제약 |
| E12 | 제목 공백/이모지/60자 초과 | 서버 `btrim` + `char_length(btrim(title)) between 1 and 60`. 클라이언트 `maxLength=60` 이중 |
| E13 | 매직링크가 다른 기기에서 열림 | **초안이 틀렸다.** `createBrowserClient` 는 기본이 PKCE 이고 verifier 쿠키가 링크를 연 기기에 있어야 한다 — 다른 기기에서 열면 `exchangeCodeForSession` 이 실패하고 설명 없이 `/login` 으로 돌아간다. token-hash 플로우(`/auth/confirm` + `verifyOtp`)로 바꿔 기기 무관하게 만든다 |
| E15 | `pg_dump` 는 stored 생성 컬럼을 덤프하지 않고 복원 시 재계산한다 | E5 의 "기존 행은 재계산하지 않는다"는 dump/restore 를 건너면 성립하지 않는다. KST 는 1988년 이후 +09:00 고정이라 실질 위험 0 이지만, 타임존을 바꾸는 날에는 함정이 된다 |
| E16 | Supabase 가 `alter default privileges ... grant all on functions to anon, authenticated` 를 깔아둔다 | `revoke ... from public` 은 PUBLIC 유사롤만 지우고 이 명시적 role grant 는 남긴다. 0003 첫 줄에서 기본값을 끄고 모든 revoke 에 롤을 명시한다. 테스트로 검증 |
| E17 | 호스티드 Supabase 기본 SMTP 는 시간당 한 자릿수 제한 | 출시일에 매직링크가 조용히 안 가기 시작한다. 커스텀 SMTP 를 Phase 5 스텝으로 |
| E14 | `force row level security` | 사용 **금지**. definer 함수가 테이블 소유자로 실행되므로 FORCE는 자기 RPC의 쓰기까지 차단한다 |

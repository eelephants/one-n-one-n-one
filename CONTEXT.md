# CONTEXT — 하루에 하나씩 (One Hour a Day)

하루에 딱 하나의 일을, 한 시간 동안만 하는 루틴 앱.
해결책은 기능이 아니라 **제약**이고, 제약은 UI 조건문이 아니라 DB 제약으로 강제한다.

**두 곳에 배포한다.** 공개 웹(Next.js, 이메일 로그인) + 앱인토스 미니앱(Granite RN, 토스 로그인).
백엔드는 Supabase 하나이고, 규칙은 전부 DB 에 있다.

```
one-n-one-n-one/            npm workspaces (Turborepo·Nx 안 씀 — 필요 없다)
├── packages/domain/        순수 함수. SQL 생성 컬럼의 TS 미러이므로 복사 금지, 공유해야 한다
├── apps/web/               Next.js — 공개 웹 + 토스 토큰 교환 API
├── apps/toss/              Granite RN 미니앱 (예정)
├── supabase/               마이그레이션 · RLS · RPC. 클라이언트 무관
└── tests/                  불변 규칙 테스트 (PostgREST 경유 = 공격자와 같은 경로)
```

- **스펙 · 불변 규칙 · 설계 결정(D0–D14) · 앱인토스 제약(T1–T8) · 엣지 케이스**: [`docs/spec.md`](docs/spec.md)
- **구현 계획 (태스크 16개)**: [`docs/superpowers/plans/2026-08-17-one-hour-a-day.md`](docs/superpowers/plans/2026-08-17-one-hour-a-day.md)
- **리뷰 근거**: `.dev-flow/autoplan.md` (gitignored)

## 용어

| 용어 | 뜻 |
|---|---|
| **세션 (session)** | 한 번의 "한 시간". 이 앱의 유일한 엔티티. `sessions` 테이블 한 행 |
| **서비스일 (service_date)** | 이 앱의 "하루". **KST 04:00 에 바뀐다** (자정 아님 — 밤늦게 하는 사람 때문). DB 생성 컬럼이라 클라이언트가 보낼 수 없다 |
| **attempt** | 그날의 몇 번째 시도인지. 1 또는 2. **하루 최대 2행이라는 상한을 유니크 인덱스로 표현하기 위해서만 존재한다** |
| **running** | 진행 중. 사용자당 전역 1개 (날짜 무관) |
| **completed** | 60분을 채움. `finished_at = started_at + 1h` 정확히 |
| **stopped** | 60분 전에 끝냄. **실패가 아니다** — "37분 했음"으로 기록된다 |
| **만료 (overdue)** | `running` 인데 `now() >= started_at + 1h`. 읽기·쓰기 어느 쪽이든 다음 접근 때 `completed` 로 확정된다. 크론 없음 |
| **화면 A / B / C** | A = 시작할 수 있음, B = 진행 중, C = 오늘은 끝 (시작 버튼을 **렌더링하지 않는다**) |

## 절대 하지 말 것

- `service_date` · `started_at` · `status` · `attempt` 를 클라이언트가 보내게 하는 것
- `sessions` 에 직접 INSERT/UPDATE/DELETE 정책을 여는 것 (쓰기는 RPC 3개뿐)
- `force row level security` (definer RPC 자신의 쓰기까지 막힌다)
- `before delete` 트리거 (계정 삭제 cascade 가 막힌다)
- 재촉·죄책감 카피. "실패", "미달성", "화이팅" 류 전부
- 날짜 라이브러리 추가 (`Intl.DateTimeFormat` 으로 충분)

## 성공 기준

배포 후 30일 중 20일을 직접 열고 세션을 시작하지 못하면 제약 가설이 틀린 것이고 중단한다.
계측은 `service_date` distinct count — 추가 코드 없음.

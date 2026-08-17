# 하루에 하나씩 (One Hour a Day) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 하루에 한 가지 일을 한 시간만 하도록 강제하는 루틴 앱을, 클라이언트를 조작해도 규칙이 깨지지 않는 DB 제약 위에 만든다.

**Architecture:** Postgres가 유일한 시계이자 유일한 심판이다. 세션의 생성·종료는 `security definer` RPC 세 개로만 일어나고, 테이블 직접 쓰기는 RLS로 전부 막힌다. 하루 경계(KST 04:00)는 생성 컬럼으로 DB가 계산하며, 클라이언트는 서버가 준 `started_at`/`server_now`를 표시용으로만 쓴다. Next.js는 서버 컴포넌트에서 상태를 읽고 서버 액션으로 RPC를 호출하는 얇은 껍데기다.

**Tech Stack:** Next.js (App Router) · TypeScript strict · Supabase (Auth 매직링크 / Postgres / RLS) · Tailwind CSS · Vitest · Playwright · Vercel

**Spec:** `docs/spec.md`

## Global Constraints

- **새 라이브러리 추가 금지.** 아래 목록 밖의 의존성은 추가 전에 사용자에게 이유를 묻는다.
  런타임: `next` `react` `react-dom` `@supabase/supabase-js` `@supabase/ssr` `tailwindcss`
  개발: `typescript` `vitest` `@playwright/test` `supabase` `eslint` `eslint-config-next`
- **날짜 라이브러리 금지.** date-fns / dayjs / luxon / moment 전부. `Intl.DateTimeFormat({ timeZone })`과 `Date.UTC`로 처리한다 (spec D6).
- **TypeScript strict.** `tsconfig.json`의 `"strict": true` 유지. `any` 금지.
- **UI 문구는 한국어.** 재촉·죄책감 유발 카피 금지 (spec 철학 2·4). "실패", "미달성", "놓쳤어요",
  "아직 시작 안 했어요", "오늘도 화이팅" 류 전부 금지. 중단은 소요 시간으로만 서술한다.
- **커밋은 한 줄 영어.** Phase 단위로 작게. 자동 커밋 금지 — 각 태스크의 커밋 스텝에서만 커밋한다.
- **세션 길이 상수는 한 곳에만.** TS는 `lib/domain.ts`의 `SESSION_MS`, SQL은 `interval '1 hour'` 리터럴.
- **하루 경계**: KST 04:00. 하드코딩 문자열은 `'Asia/Seoul'`과 `4` 두 곳(SQL 생성 컬럼, `lib/domain.ts`)뿐이며
  두 구현이 일치하는지 Task 2·6에서 테스트로 대조한다.
- **`security definer` 함수는 전부 `set search_path = ''`** + 모든 참조에 스키마 명시 (spec E10).
- **`force row level security` 사용 금지** (spec E14).
- **`before delete` 트리거 작성 금지** (spec D7).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/0001_sessions.sql` | 테이블 · CHECK 제약 · 유니크 인덱스. INV-1'/1''/2/6의 구조적 강제 |
| `supabase/migrations/0002_rls.sql` | RLS 활성화 · SELECT 정책 하나 · grant/revoke. INV-5의 절반 |
| `supabase/migrations/0003_rpc.sql` | `finalize_overdue` `start_session` `finish_session` `today_state` + 불변 트리거 |
| `lib/domain.ts` | 순수 함수만. 시간 포맷, 서비스 날짜, 화면 상태 판정, 연속 일수, 월 그리드 |
| `lib/supabase/{client,server,middleware}.ts` | Supabase 클라이언트 3종. 쿠키 처리 외 로직 없음 |
| `middleware.ts` | 세션 쿠키 갱신 + 보호 라우트 리다이렉트 |
| `app/actions.ts` | 서버 액션. RPC 호출 + `revalidatePath`만. 도메인 로직 없음 |
| `app/page.tsx` | 오늘 화면. `today_state()` 한 번 읽고 A/B/C 분기 |
| `components/Timer.tsx` | 유일한 클라이언트 컴포넌트. 시계 오차 보정 + 재동기화 |
| `app/history/page.tsx` + `components/MonthGrid.tsx` | 히스토리 |
| `tests/domain.test.ts` | `lib/domain.ts` 단위 테스트 |
| `tests/invariants.test.ts` | PostgREST를 통한 INV-1~6 우회 시도 |
| `tests/helpers/supabase.ts` | 테스트 사용자 생성, service_role 시드 |

`lib/domain.ts`가 순수 함수만 담는 이유: Phase 1에서 UI 없이 전부 테스트되어야 하고,
서버 컴포넌트와 클라이언트 컴포넌트가 같은 판정 로직을 공유해야 한다.

---

## Phase 1 — 도메인 + 스키마 (TDD)

### Task 1: 프로젝트 스캐폴드와 로컬 Supabase

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `tests/global-setup.ts`, `.gitignore`, `.env.local.example`
- Create: `supabase/config.toml` (CLI가 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `npm test`가 동작하는 Vitest 환경. `process.env.API_URL` / `ANON_KEY` / `SERVICE_ROLE_KEY`가
  로컬 Supabase를 가리킨다.

- [ ] **Step 1: git 저장소와 Next.js 스캐폴드**

현재 디렉토리는 빈 상태이고 git 저장소가 아니다.

```bash
git init -b main
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

추가 프롬프트가 뜨면 기본값을 수락한다. 완료 후 `tsconfig.json`에 `"strict": true`가 있는지 확인한다.

- [ ] **Step 2: 의존성 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install -D vitest supabase
```

Global Constraints의 허용 목록에 있는 것만 설치한다. `@playwright/test`는 Phase 5에서 설치한다.

- [ ] **Step 3: 로컬 Supabase 초기화 및 기동**

```bash
npx supabase init
npx supabase start
```

`supabase start`는 Docker가 필요하다. 출력의 `API URL` / `anon key` / `service_role key`를 확인한다.

- [ ] **Step 4: Vitest 설정과 글로벌 셋업**

`tests/global-setup.ts`:

```ts
import { execFileSync } from 'node:child_process'

// 로컬 Supabase 의 URL/키를 process.env 로 주입한다.
// 키가 CLI 버전마다 달라질 수 있으므로 하드코딩하지 않고 매번 읽는다.
export default function setup() {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return // supabase 가 안 떠 있어도 도메인 테스트는 돌아야 한다
  }
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2]
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 20_000,
    // 불변 규칙 테스트는 같은 테이블의 유니크 인덱스를 공유하므로 순차 실행한다
    fileParallelism: false,
  },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
})
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: `.gitignore`와 환경변수 템플릿**

`.gitignore` 끝에 추가:

```
.dev-flow/
.env.local
```

`.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`npx supabase status`의 값으로 `.env.local`을 만든다 (커밋하지 않는다).

- [ ] **Step 6: 스캐폴드가 도는지 확인**

Run: `npm run build && npm test`
Expected: 빌드 성공. Vitest는 "No test files found"로 종료 — 아직 테스트가 없으므로 정상.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "chore: scaffold next.js app with supabase and vitest"
```

---

### Task 2: 도메인 순수 함수 (TDD)

**Files:**
- Create: `lib/domain.ts`
- Test: `tests/domain.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `SESSION_MS: number` (3_600_000)
  - `type SessionStatus = 'running' | 'completed' | 'stopped'`
  - `type Session = { id: string; title: string; started_at: string; finished_at: string | null; status: SessionStatus; attempt: 1 | 2; service_date: string }`
  - `serviceDateKST(instant: Date): string` — `'YYYY-MM-DD'`
  - `remainingMs(startedAt: string, nowMs: number): number`
  - `formatRemaining(ms: number): string` — `'42:07'`
  - `elapsedMinutes(s: Pick<Session,'started_at'|'finished_at'>): number`
  - `totalMinutes(list: Pick<Session,'started_at'|'finished_at'>[]): number`
  - `todayState(rows: Session[], nowMs: number): 'A' | 'B' | 'C'`
  - `shiftDay(ymd: string, days: number): string`
  - `streak(activeDates: Iterable<string>, today: string): number`
  - `monthCells(year: number, month: number): string[]` — month는 1-indexed

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  SESSION_MS, elapsedMinutes, formatRemaining, monthCells, remainingMs,
  serviceDateKST, shiftDay, streak, todayState, totalMinutes, type Session,
} from '@/lib/domain'

const session = (o: Partial<Session>): Session => ({
  id: 'x', title: '일', started_at: '2026-08-17T01:00:00.000Z', finished_at: null,
  status: 'running', attempt: 1, service_date: '2026-08-17', ...o,
})

describe('serviceDateKST — KST 04:00 경계 (INV-6)', () => {
  it('KST 03:59:59 는 전날에 속한다', () => {
    // 2026-08-18 03:59:59 KST === 2026-08-17 18:59:59 UTC
    expect(serviceDateKST(new Date('2026-08-17T18:59:59Z'))).toBe('2026-08-17')
  })
  it('KST 04:00:00 부터 새 날이다', () => {
    expect(serviceDateKST(new Date('2026-08-17T19:00:00Z'))).toBe('2026-08-18')
  })
  it('KST 23:00 과 다음날 KST 01:00 은 같은 날이다', () => {
    expect(serviceDateKST(new Date('2026-08-17T14:00:00Z'))).toBe('2026-08-17')
    expect(serviceDateKST(new Date('2026-08-17T16:00:00Z'))).toBe('2026-08-17')
  })
  it('월말 경계를 넘긴다', () => {
    // 2026-09-01 03:00 KST === 2026-08-31 18:00 UTC → 서비스일은 8월 31일
    expect(serviceDateKST(new Date('2026-08-31T18:00:00Z'))).toBe('2026-08-31')
    expect(serviceDateKST(new Date('2026-08-31T19:00:00Z'))).toBe('2026-09-01')
  })
})

describe('remainingMs / formatRemaining (INV-2)', () => {
  const started = '2026-08-17T01:00:00.000Z'
  it('시작 직후에는 60분이 남는다', () => {
    expect(remainingMs(started, Date.parse(started))).toBe(SESSION_MS)
    expect(formatRemaining(SESSION_MS)).toBe('60:00')
  })
  it('음수로 내려가지 않는다', () => {
    expect(remainingMs(started, Date.parse(started) + SESSION_MS + 99_999)).toBe(0)
    expect(formatRemaining(0)).toBe('00:00')
  })
  it('초 단위를 올림해서 00:00 은 진짜 0 일 때만 나온다', () => {
    expect(formatRemaining(1)).toBe('00:01')
    expect(formatRemaining(61_000)).toBe('01:01')
    expect(formatRemaining(7 * 60_000 + 500)).toBe('07:01')
  })
})

describe('elapsedMinutes — 완결감 표기 (철학 2)', () => {
  it('37 분 세션은 37 을 준다', () => {
    expect(elapsedMinutes({
      started_at: '2026-08-17T01:00:00Z', finished_at: '2026-08-17T01:37:00Z',
    })).toBe(37)
  })
  it('아주 짧아도 0 분이라고 하지 않는다', () => {
    expect(elapsedMinutes({
      started_at: '2026-08-17T01:00:00Z', finished_at: '2026-08-17T01:00:20Z',
    })).toBe(1)
  })
  it('진행 중인 세션은 0 을 준다', () => {
    expect(elapsedMinutes({ started_at: '2026-08-17T01:00:00Z', finished_at: null })).toBe(0)
  })
  it('여러 세션을 합산한다', () => {
    expect(totalMinutes([
      { started_at: '2026-08-17T01:00:00Z', finished_at: '2026-08-17T01:23:00Z' },
      { started_at: '2026-08-18T01:00:00Z', finished_at: '2026-08-18T02:00:00Z' },
    ])).toBe(83)
  })
})

describe('todayState — 화면 A/B/C 판정', () => {
  const now = Date.parse('2026-08-17T01:30:00Z')
  it('행이 없으면 A', () => {
    expect(todayState([], now)).toBe('A')
  })
  it('진행 중이고 60 분 안이면 B', () => {
    expect(todayState([session({ status: 'running' })], now)).toBe('B')
  })
  it('진행 중이지만 60 분이 지났으면 C 로 보인다', () => {
    expect(todayState([session({ status: 'running' })],
      Date.parse('2026-08-17T02:30:00Z'))).toBe('C')
  })
  it('completed 가 있으면 C', () => {
    expect(todayState([session({ status: 'completed', finished_at: '2026-08-17T02:00:00Z' })],
      now)).toBe('C')
  })
  it('stopped 가 하나면 다시 A — 그날 1 회 재시작 가능', () => {
    expect(todayState([session({ status: 'stopped', finished_at: '2026-08-17T01:20:00Z' })],
      now)).toBe('A')
  })
  it('stopped 가 둘이면 C — 그날은 끝', () => {
    expect(todayState([
      session({ status: 'stopped', attempt: 1, finished_at: '2026-08-17T01:10:00Z' }),
      session({ status: 'stopped', attempt: 2, finished_at: '2026-08-17T01:25:00Z' }),
    ], now)).toBe('C')
  })
})

describe('streak / shiftDay / monthCells', () => {
  it('shiftDay 는 월 경계를 넘는다', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('오늘 포함 연속 일수를 센다', () => {
    expect(streak(['2026-08-17', '2026-08-16', '2026-08-15'], '2026-08-17')).toBe(3)
  })
  it('오늘 아직 안 했어도 어제까지의 연속은 유지된다', () => {
    expect(streak(['2026-08-16', '2026-08-15'], '2026-08-17')).toBe(2)
  })
  it('하루라도 비면 거기서 끊긴다', () => {
    expect(streak(['2026-08-16', '2026-08-14'], '2026-08-17')).toBe(1)
  })
  it('기록이 없으면 0', () => {
    expect(streak([], '2026-08-17')).toBe(0)
  })
  it('monthCells 는 그 달의 날짜를 전부 준다', () => {
    expect(monthCells(2026, 2)).toHaveLength(28)
    expect(monthCells(2024, 2)).toHaveLength(29)
    const aug = monthCells(2026, 8)
    expect(aug).toHaveLength(31)
    expect(aug[0]).toBe('2026-08-01')
    expect(aug.at(-1)).toBe('2026-08-31')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/domain.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/domain"`

- [ ] **Step 3: 최소 구현**

`lib/domain.ts`:

```ts
export const SESSION_MS = 60 * 60 * 1000
const DAY_BOUNDARY_MS = 4 * 60 * 60 * 1000 // KST 04:00 (INV-6)

export type SessionStatus = 'running' | 'completed' | 'stopped'

export type Session = {
  id: string
  title: string
  started_at: string
  finished_at: string | null
  status: SessionStatus
  attempt: 1 | 2
  service_date: string
}

// 'en-CA' 는 YYYY-MM-DD 로 포맷한다. 날짜 라이브러리를 쓰지 않는 이유.
const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})

/**
 * SQL 생성 컬럼 sessions.service_date 의 TS 미러.
 * SQL: ((started_at at time zone 'Asia/Seoul') - interval '4 hours')::date
 * KST 는 DST 가 없으므로 4시간을 빼고 KST 달력 날짜를 읽는 것과 동치다.
 * 두 구현의 일치는 tests/invariants.test.ts 에서 실제 DB 와 대조한다.
 */
export function serviceDateKST(instant: Date): string {
  return KST_DATE.format(instant.getTime() - DAY_BOUNDARY_MS)
}

export function remainingMs(startedAt: string, nowMs: number): number {
  return Math.max(0, Date.parse(startedAt) + SESSION_MS - nowMs)
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** 끝난 세션의 소요 분. 20 초를 했어도 "0 분"이라고 말하지 않는다 (철학 2). */
export function elapsedMinutes(s: Pick<Session, 'started_at' | 'finished_at'>): number {
  if (!s.finished_at) return 0
  const ms = Date.parse(s.finished_at) - Date.parse(s.started_at)
  return Math.max(1, Math.round(ms / 60_000))
}

export function totalMinutes(list: Pick<Session, 'started_at' | 'finished_at'>[]): number {
  return list.reduce((sum, s) => sum + elapsedMinutes(s), 0)
}

/**
 * 화면 A/B/C 판정. start_session RPC 의 가드와 같은 규칙이어야 한다.
 * A = 시작할 수 있음, B = 진행 중, C = 오늘은 끝
 */
export function todayState(rows: Session[], nowMs: number): 'A' | 'B' | 'C' {
  const running = rows.find((r) => r.status === 'running')
  if (running) return nowMs < Date.parse(running.started_at) + SESSION_MS ? 'B' : 'C'
  if (rows.some((r) => r.status === 'completed')) return 'C'
  return rows.length >= 2 ? 'C' : 'A'
}

/** 'YYYY-MM-DD' 달력 산술. service_date 는 순수 날짜라 타임존이 개입하지 않는다. */
export function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 오늘 아직 안 했어도 어제까지 이어졌으면 유지한다 — 04:00 에 연속이 끊기지 않게 (철학 4). */
export function streak(activeDates: Iterable<string>, today: string): number {
  const done = new Set(activeDates)
  let cursor = done.has(today) ? today : shiftDay(today, -1)
  let n = 0
  while (done.has(cursor)) {
    n += 1
    cursor = shiftDay(cursor, -1)
  }
  return n
}

/** month 는 1-indexed. */
export function monthCells(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return Array.from({ length: days }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`)
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/domain.test.ts`
Expected: PASS — 25개 내외 전부 green

- [ ] **Step 5: 커밋**

```bash
git add lib/domain.ts tests/domain.test.ts
git commit -m "feat: add pure domain functions for KST day boundary and session display"
```

---

### Task 3: 불변 규칙 테스트 하네스 (전부 RED)

**Files:**
- Create: `tests/helpers/supabase.ts`
- Create: `tests/invariants.test.ts`

**Interfaces:**
- Consumes: `serviceDateKST` from `lib/domain.ts`
- Produces:
  - `admin(): SupabaseClient` — service_role 클라이언트
  - `makeUser(): Promise<{ id: string; client: SupabaseClient }>`
  - `seedSession(userId, row): Promise<SessionRow>` — RPC 를 우회한 직접 삽입 (테스트 전용)
  - `inTodayServiceDay(minutesAgo: number): string` — 반드시 현재 서비스일 안에 있는 과거 ISO 시각

이 태스크는 **테스트만 작성하고 전부 실패시킨다.** Task 4/5/6이 순서대로 green으로 만든다.

- [ ] **Step 1: 테스트 헬퍼를 쓴다**

`tests/helpers/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceDateKST } from '@/lib/domain'

function env(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`${key} 없음 — \`npx supabase start\` 를 먼저 실행하세요`)
  return v
}

export function admin(): SupabaseClient {
  return createClient(env('API_URL'), env('SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient(): SupabaseClient {
  return createClient(env('API_URL'), env('ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

let seq = 0

/** 확인된 사용자 하나를 만들고 로그인된 클라이언트를 준다. */
export async function makeUser(): Promise<{ id: string; client: SupabaseClient }> {
  const email = `u${Date.now()}-${seq++}@example.test`
  const password = 'test-password-1234'
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error) throw created.error
  const client = anonClient()
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw signedIn.error
  return { id: created.data.user.id, client }
}

export type SeedRow = {
  title?: string
  started_at: string
  finished_at?: string | null
  status: 'running' | 'completed' | 'stopped'
  attempt?: 1 | 2
}

/** service_role 로 임의 시각의 세션을 심는다. RPC 를 우회하므로 테스트 전용. */
export async function seedSession(userId: string, row: SeedRow) {
  const { data, error } = await admin()
    .from('sessions')
    .insert({
      user_id: userId,
      title: row.title ?? '테스트',
      attempt: row.attempt ?? 1,
      started_at: row.started_at,
      finished_at: row.finished_at ?? null,
      status: row.status,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** 지금으로부터 n 분 전. 서비스일 경계를 신경 쓰지 않는다. */
export function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString()
}

/**
 * 지금으로부터 n 분 전. 단, 현재 서비스일(KST 04:00 시작)을 벗어나지 않도록 잘라낸다.
 * 04:00 직후에 테스트가 돌 때 시드가 어제로 넘어가 버리는 플레이키를 막는다.
 *
 * "같은 날인지"가 중요한 테스트(INV-1', INV-1'')에만 쓴다.
 * "60 분이 지났는지"가 중요한 테스트(INV-2 만료 확정)에는 minutesAgo() 를 쓴다 —
 * 서비스일 첫 한 시간에는 "오늘 안이면서 60 분 전"인 시각이 존재하지 않기 때문이다.
 */
export function inTodayServiceDay(n: number): string {
  const now = Date.now()
  const dayStart = Date.parse(`${serviceDateKST(new Date(now))}T04:00:00+09:00`)
  return new Date(Math.max(now - n * 60_000, dayStart + 1_000)).toISOString()
}
```

- [ ] **Step 2: 불변 규칙 테스트를 쓴다**

`tests/invariants.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { serviceDateKST } from '@/lib/domain'
import { admin, anonClient, inTodayServiceDay, makeUser, minutesAgo, seedSession } from './helpers/supabase'

const HOUR = 3_600_000

beforeAll(() => {
  if (!process.env.API_URL) throw new Error('`npx supabase start` 를 먼저 실행하세요')
})

describe("INV-1': 하루에 완료 가능한 세션은 하나", () => {
  it('진행 중일 때 두 번째 세션은 거부된다', async () => {
    const u = await makeUser()
    expect((await u.client.rpc('start_session', { p_title: '첫 번째' })).error).toBeNull()
    const second = await u.client.rpc('start_session', { p_title: '두 번째' })
    expect(second.error?.message).toContain('already_running')
  })

  it('completed 뒤에는 재시작할 수 없다', async () => {
    const u = await makeUser()
    const started = inTodayServiceDay(120)
    await seedSession(u.id, {
      started_at: started, status: 'completed',
      finished_at: new Date(Date.parse(started) + HOUR).toISOString(),
    })
    const again = await u.client.rpc('start_session', { p_title: '또 하기' })
    expect(again.error?.message).toContain('day_exhausted')
  })
})

describe("INV-1'': 하루 총 2행, 2번째는 stopped 뒤에만", () => {
  it('stopped 뒤에는 딱 한 번 재시작할 수 있고 attempt 는 2 가 된다', async () => {
    const u = await makeUser()
    const started = inTodayServiceDay(90)
    await seedSession(u.id, {
      started_at: started, status: 'stopped', attempt: 1,
      finished_at: new Date(Date.parse(started) + 600_000).toISOString(),
    })
    const retry = await u.client.rpc('start_session', { p_title: '다시' })
    expect(retry.error).toBeNull()
    expect(retry.data.attempt).toBe(2)
  })

  it('두 번 중단하면 그날은 끝난다', async () => {
    const u = await makeUser()
    for (const attempt of [1, 2] as const) {
      const started = inTodayServiceDay(120 - attempt * 30)
      await seedSession(u.id, {
        started_at: started, status: 'stopped', attempt,
        finished_at: new Date(Date.parse(started) + 300_000).toISOString(),
      })
    }
    const third = await u.client.rpc('start_session', { p_title: '세 번째' })
    expect(third.error?.message).toContain('day_exhausted')
  })

  it('attempt 3 은 CHECK 제약이 막는다', async () => {
    const u = await makeUser()
    // 실패 "이유"를 못박는다. rejects.toBeTruthy() 는 테이블이 아예 없어도 통과한다.
    await expect(seedSession(u.id, {
      started_at: inTodayServiceDay(10), status: 'running', attempt: 3 as never,
    })).rejects.toMatchObject({
      code: '23514', message: expect.stringContaining('sessions_attempt_valid'),
    })
  })
})

describe('INV-2: 세션 길이는 정확히 60 분', () => {
  // 긍정 + 부정을 한 테스트에 넣는다. 인자를 틀리면 PGRST202("함수를 스키마 캐시에서 못 찾음")가
  // 오는데, 그건 "함수가 아예 없음"과 구분이 안 된다. 정상 호출이 먼저 통과해야 의미가 있다.
  it('start_session 의 시그니처는 p_title 하나뿐이다', async () => {
    const u = await makeUser()
    expect((await u.client.rpc('start_session', { p_title: '정상' })).error).toBeNull()
    expect((await u.client.rpc('start_session', { p_title: 'x', p_minutes: 180 })).error?.code)
      .toBe('PGRST202')
  })

  it('60 분 전에 끝내면 stopped 이고 실제 소요 시간이 남는다', async () => {
    // D3 은 이 앱에서 가장 중요한 서버 판단이다. completed 쪽만 테스트하면 절반만 검증한 것이다.
    const u = await makeUser()
    await u.client.rpc('start_session', { p_title: '짧게' })
    const done = await u.client.rpc('finish_session')
    expect(done.error).toBeNull()
    expect(done.data.status).toBe('stopped')
    const ms = Date.parse(done.data.finished_at) - Date.parse(done.data.started_at)
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(ms).toBeLessThan(HOUR)
  })

  it('만료된 세션을 끝내면 정확히 3600 초로 확정된다', async () => {
    const u = await makeUser()
    // 서비스일 안쪽으로 자르지 않는다 — 여기서 중요한 건 "60 분이 지났다"이지 "오늘이다"가 아니다
    const started = minutesAgo(200)
    await seedSession(u.id, { started_at: started, status: 'running' })
    const done = await u.client.rpc('finish_session')
    expect(done.error).toBeNull()
    expect(done.data.status).toBe('completed')
    expect(Date.parse(done.data.finished_at) - Date.parse(done.data.started_at)).toBe(HOUR)
  })

  it('completed 는 finished_at 이 정확히 started_at + 60 분이어야 한다', async () => {
    const u = await makeUser()
    const started = minutesAgo(200)
    // 초과도 막히고
    await expect(seedSession(u.id, {
      started_at: started, status: 'completed',
      finished_at: new Date(Date.parse(started) + HOUR + 1000).toISOString(),
    })).rejects.toMatchObject({
      code: '23514', message: expect.stringContaining('sessions_timing_valid'),
    })
    // 미달도 막힌다 — 이게 예전 제약이 놓쳤던 구멍이다
    await expect(seedSession(u.id, {
      started_at: started, status: 'completed',
      finished_at: new Date(Date.parse(started) + 600_000).toISOString(),
    })).rejects.toMatchObject({
      code: '23514', message: expect.stringContaining('sessions_timing_valid'),
    })
  })

  it('stopped 는 60 분을 채울 수 없다', async () => {
    const u = await makeUser()
    const started = minutesAgo(200)
    await expect(seedSession(u.id, {
      started_at: started, status: 'stopped',
      finished_at: new Date(Date.parse(started) + HOUR).toISOString(),
    })).rejects.toMatchObject({ code: '23514' })
  })
})

describe('INV-3: 진행 중에는 새 세션을 만들 수 없다', () => {
  it('같은 날 running 이 둘일 수 없다', async () => {
    const u = await makeUser()
    await seedSession(u.id, { started_at: inTodayServiceDay(5), status: 'running' })
    await expect(seedSession(u.id, {
      started_at: inTodayServiceDay(1), status: 'running', attempt: 2,
    })).rejects.toMatchObject({ code: '23505' })
  })

  it('서비스일이 달라도 running 은 하나뿐이다 (sessions_one_running)', async () => {
    // 위 테스트는 sessions_one_live_per_day 가 먼저 잡는다. INV-3 이 유일하게 담당하는
    // "날짜를 건너뛴 동시 진행"은 서비스일이 다른 두 행으로만 검증된다.
    const u = await makeUser()
    await seedSession(u.id, { started_at: new Date(Date.now() - 30 * HOUR).toISOString(), status: 'running' })
    await expect(seedSession(u.id, { started_at: minutesAgo(1), status: 'running' }))
      .rejects.toMatchObject({ message: expect.stringContaining('sessions_one_running') })
  })

  it('어제의 만료된 running 은 자동 확정되고 오늘 세션을 막지 않는다', async () => {
    const u = await makeUser()
    const yesterday = new Date(Date.now() - 30 * HOUR).toISOString()
    const stale = await seedSession(u.id, { started_at: yesterday, status: 'running' })

    const today = await u.client.rpc('start_session', { p_title: '오늘 할 일' })
    expect(today.error).toBeNull()

    const { data: closed } = await admin()
      .from('sessions').select('*').eq('id', stale.id).single()
    expect(closed.status).toBe('completed')
    expect(Date.parse(closed.finished_at) - Date.parse(closed.started_at)).toBe(HOUR)
  })
})

describe('INV-4: 시간의 기준은 서버', () => {
  it('start_session 은 started_at 을 인자로 받지 않는다', async () => {
    const u = await makeUser()
    const past = new Date(Date.now() - 10 * HOUR).toISOString()
    const r = await u.client.rpc('start_session', { p_title: '조작', p_started_at: past })
    expect(r.error?.code).toBe('PGRST202')
  })

  it('사용자가 직접 INSERT 할 수 없다', async () => {
    const u = await makeUser()
    const r = await u.client.from('sessions').insert({
      user_id: u.id, title: '직접', status: 'running', attempt: 1,
      started_at: new Date(Date.now() - 10 * HOUR).toISOString(),
    })
    // 42501 = permission denied. "테이블이 없음"이 아니라 "권한이 없음"임을 못박는다.
    expect(r.error?.code).toBe('42501')
  })

  it('service_date 는 INSERT 로 지정할 수 없다 (생성 컬럼)', async () => {
    const u = await makeUser()
    const { error } = await admin().from('sessions').insert({
      user_id: u.id, title: '날짜 조작', status: 'running', attempt: 1,
      service_date: '2000-01-01',
    } as never)
    expect(error).not.toBeNull()
  })

  it('started_at 은 호출 전후 시각 사이의 서버 시각이다', async () => {
    const u = await makeUser()
    const before = Date.now()
    const r = await u.client.rpc('start_session', { p_title: '지금' })
    const after = Date.now()
    const started = Date.parse(r.data.started_at)
    // 로컬 컨테이너와 호스트 사이의 소소한 오차를 허용한다
    expect(started).toBeGreaterThan(before - 5_000)
    expect(started).toBeLessThan(after + 5_000)
  })

  it('today_state 는 server_now 를 함께 준다', async () => {
    const u = await makeUser()
    const { data, error } = await u.client.rpc('today_state')
    expect(error).toBeNull()
    expect(typeof data.server_now).toBe('string')
    expect(data.service_date).toBe(serviceDateKST(new Date(Date.parse(data.server_now))))
    expect(data.sessions).toEqual([])
    expect(data.running).toBeNull()
  })

  it('today_state 는 진행 세션을 running 키로 따로 준다', async () => {
    const u = await makeUser()
    const started = new Date(Date.now() - 20 * 60_000).toISOString()
    await seedSession(u.id, { started_at: started, status: 'running' })
    const { data } = await u.client.rpc('today_state')
    expect(data.running).not.toBeNull()
    expect(data.running.started_at).toBe(started)
  })

  // 알려진 테스트 공백: "service_date 가 어제인데 아직 만료 안 된 running" 은 KST 04:00~05:00
  // 사이에만 존재해서 시각으로 구성할 수 없다. `running` 키에서 service_date 술어를 빼는 것이
  // 이 케이스의 유일한 방어이므로, 0003 의 해당 주석을 지우지 말 것.

  it('today_state 는 읽기만 해도 만료 세션을 확정한다', async () => {
    // 화면 C 에는 버튼이 없어서 사용자가 어떤 쓰기도 일으킬 수 없다.
    // 읽기 경로에서 확정하지 않으면 그 행은 다음 start_session 까지 running 으로 남는다.
    const u = await makeUser()
    const stale = await seedSession(u.id, {
      started_at: new Date(Date.now() - 30 * HOUR).toISOString(), status: 'running',
    })
    const { data } = await u.client.rpc('today_state')
    expect(data.running).toBeNull()

    const { data: closed } = await admin().from('sessions').select('*').eq('id', stale.id).single()
    expect(closed.status).toBe('completed')
    expect(Date.parse(closed.finished_at) - Date.parse(closed.started_at)).toBe(HOUR)
  })

  it('today_state 는 user_id 를 내보내지 않는다', async () => {
    const u = await makeUser()
    await u.client.rpc('start_session', { p_title: '노출 확인' })
    const { data } = await u.client.rpc('today_state')
    expect(data.running).not.toHaveProperty('user_id')
    expect(data.sessions[0]).not.toHaveProperty('user_id')
  })
})

describe('INV-5: 기록은 불변', () => {
  it('사용자는 자기 세션을 수정할 수 없다', async () => {
    const u = await makeUser()
    const created = await u.client.rpc('start_session', { p_title: '원래 제목' })
    const upd = await u.client.from('sessions')
      .update({ title: '바뀐 제목' }).eq('id', created.data.id).select()

    // 0002 는 UPDATE 권한 자체를 revoke 한다 → PostgREST 가 42501 에러를 준다.
    // (정책 부재라면 200 + [] 이고 에러가 없다. 우리는 권한 거부 쪽이다.)
    // `upd.data ?? []` 로 단언하면 네트워크 실패·테이블 부재·오타에도 통과한다.
    expect(upd.error?.code).toBe('42501')

    const { data: after } = await u.client.from('sessions')
      .select('title').eq('id', created.data.id).single()
    expect(after.title).toBe('원래 제목')
  })

  it('사용자는 자기 세션을 삭제할 수 없다', async () => {
    const u = await makeUser()
    const created = await u.client.rpc('start_session', { p_title: '지울 일' })
    const del = await u.client.from('sessions').delete().eq('id', created.data.id)
    expect(del.error?.code).toBe('42501')

    const { data } = await u.client.from('sessions').select('id').eq('id', created.data.id)
    expect(data).toHaveLength(1)
  })

  it('종료된 세션은 service_role 로도 수정할 수 없다 (트리거)', async () => {
    const u = await makeUser()
    const started = inTodayServiceDay(90)
    const row = await seedSession(u.id, {
      started_at: started, status: 'stopped',
      finished_at: new Date(Date.parse(started) + 600_000).toISOString(),
    })
    const { error } = await admin().from('sessions')
      .update({ title: '관리자가 고침' }).eq('id', row.id)
    expect(error?.message).toContain('record_is_immutable')
  })

  it('이미 끝난 세션에 finish_session 을 또 부르면 거부된다', async () => {
    const u = await makeUser()
    await u.client.rpc('start_session', { p_title: '한 번만' })
    expect((await u.client.rpc('finish_session')).error).toBeNull()
    expect((await u.client.rpc('finish_session')).error?.message).toContain('no_running_session')
  })
})

describe('INV-6: 하루 경계는 KST 04:00', () => {
  const cases: [string, string][] = [
    ['2026-03-16T18:59:59Z', '2026-03-16'], // KST 03:59:59 (3/17) → 3/16
    ['2026-03-16T19:00:00Z', '2026-03-17'], // KST 04:00:00 (3/17) → 3/17
    ['2026-03-17T14:00:00Z', '2026-03-17'], // KST 23:00
    ['2026-03-17T16:00:00Z', '2026-03-17'], // KST 01:00 (3/18)
    ['2026-08-31T18:00:00Z', '2026-08-31'], // 월말 경계
    ['2026-08-31T19:00:00Z', '2026-09-01'],
  ]

  it('DB 의 service_date 가 KST 04:00 경계를 따르고, TS 미러와 일치한다', async () => {
    // 케이스마다 새 사용자를 만든다. 6 개 중 3 개가 service_date = 2026-03-17 로 겹치는데
    // seedSession 의 attempt 기본값이 1 이라 같은 사용자면 sessions_attempt_per_day 가
    // 두 번째 삽입을 거부한다 — 테스트가 아예 실패한다.
    for (const [iso, expected] of cases) {
      const u = await makeUser()
      const row = await seedSession(u.id, {
        started_at: iso, status: 'stopped',
        finished_at: new Date(Date.parse(iso) + 600_000).toISOString(),
      })
      expect(row.service_date, iso).toBe(expected)
      expect(serviceDateKST(new Date(iso)), iso).toBe(expected)
    }
  })
})

describe('동시성과 테넌시', () => {
  it('동시에 5 번 시작해도 정확히 하나만 만들어진다', async () => {
    const u = await makeUser()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => u.client.rpc('start_session', { p_title: `동시 ${i}` })),
    )
    expect(results.filter((r) => !r.error)).toHaveLength(1)
    const { data } = await admin().from('sessions').select('id').eq('user_id', u.id)
    expect(data).toHaveLength(1)
  })

  it('다른 사용자의 세션은 보이지 않는다', async () => {
    const a = await makeUser()
    const b = await makeUser()
    await a.client.rpc('start_session', { p_title: 'A 의 일' })
    expect((await b.client.from('sessions').select('*')).data).toEqual([])
    // today_state 로도 새지 않는다 (definer 이므로 RLS 가 아니라 auth.uid() 술어가 방어선이다)
    const { data } = await b.client.rpc('today_state')
    expect(data.sessions).toEqual([])
    expect(data.running).toBeNull()
  })

  it('anon 키로는 어떤 RPC 도 실행할 수 없다', async () => {
    // Supabase 의 alter default privileges 가 anon 에게 EXECUTE 를 깔아두기 때문에
    // `revoke ... from public` 만으로는 부족하다. 이 테스트가 그 실수를 잡는다.
    const anon = anonClient()
    for (const fn of ['start_session', 'finish_session', 'today_state', 'finalize_overdue']) {
      const r = await anon.rpc(fn as never, fn === 'start_session' ? { p_title: '익명' } as never : undefined)
      expect(r.error, fn).not.toBeNull()
    }
  })

  it('finalize_overdue 는 남의 세션을 건드릴 수 없다', async () => {
    // 인자가 없으므로 auth.uid() 밖으로 나갈 수 없다. 권한 설정이 틀려도 이건 성립한다.
    const a = await makeUser()
    const b = await makeUser()
    const stale = await seedSession(b.id, {
      started_at: new Date(Date.now() - 30 * HOUR).toISOString(), status: 'running',
    })
    await a.client.rpc('finalize_overdue')
    const { data } = await admin().from('sessions').select('status').eq('id', stale.id).single()
    expect(data.status).toBe('running')
  })

  it('제목은 공백만일 수 없고 60 자를 넘을 수 없다', async () => {
    const u = await makeUser()
    expect((await u.client.rpc('start_session', { p_title: '   ' })).error?.code).toBe('23514')
    expect((await u.client.rpc('start_session', { p_title: 'ㄱ'.repeat(61) })).error?.code).toBe('23514')
    // 경계의 통과하는 쪽도 확인한다 — 60 자가 거부되면 그것도 버그다
    expect((await u.client.rpc('start_session', { p_title: 'ㄱ'.repeat(60) })).error).toBeNull()
  })
})
```

- [ ] **Step 3: 전부 실패하는지, 그리고 올바른 이유로 실패하는지 확인한다**

Run: `npx vitest run tests/invariants.test.ts`
Expected: FAIL — **전부**. 하나도 통과하면 안 된다.

이게 이 태스크에서 가장 중요한 스텝이다. `rejects.toBeTruthy()` 나 `error).not.toBeNull()`
같은 느슨한 단언은 **테이블이 없어도 통과한다** — 스키마가 없다는 것도 "뭔가 잘못됨"이기 때문이다.
그래서 위 테스트들은 전부 SQLSTATE(`23514`, `23505`, `42501`, `PGRST202`) 또는 제약 이름을
못박았다. RED 단계에서 통과하는 테스트가 하나라도 있으면, 그 테스트는 아무것도 검증하지 않는
테스트다. 발견하는 즉시 실패 이유를 못박도록 고친 다음 Step 4 로 간다.

- [ ] **Step 4: 커밋**

```bash
git add tests/helpers/supabase.ts tests/invariants.test.ts
git commit -m "test: add failing invariant tests for INV-1 through INV-6"
```

---

### Task 4: 마이그레이션 0001 — 테이블 · 제약 · 인덱스

**Files:**
- Create: `supabase/migrations/0001_sessions.sql`

**Interfaces:**
- Consumes: 없음
- Produces: `public.sessions` 테이블. 컬럼 `id, user_id, title, started_at, finished_at, status, attempt, service_date`.
  `service_date`는 생성 컬럼이므로 INSERT 시 지정할 수 없다.

- [ ] **Step 1: 마이그레이션을 쓴다**

`supabase/migrations/0001_sessions.sql`:

```sql
-- 하루에 하나씩 — 세션 테이블
-- ends_at 컬럼은 의도적으로 두지 않는다: 항상 started_at + 1 hour 이며,
-- 존재하지 않는 필드는 드리프트하거나 조작될 수 없다 (INV-2, spec D1).
--
-- pgcrypto 확장은 걸지 않는다: gen_random_uuid() 는 PG13 부터 pg_catalog 내장이다.

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null,
  attempt      smallint not null,

  -- INV-6: 하루 경계는 KST 04:00. 제약을 강제하는 주체(DB)가 키를 계산한다 (spec D2).
  -- lib/domain.ts 의 serviceDateKST() 가 이 식의 TS 미러다.
  -- 주의: pg_dump 는 stored 생성 컬럼을 덤프하지 않고 복원 시 재계산한다. 즉 spec E5 의
  -- "기존 행은 재계산하지 않는다"는 dump/restore 를 건너면 성립하지 않는다. KST 는 1988 년
  -- 이후 +09:00 고정이라 실질 위험은 0 이지만, 타임존을 바꾸는 날에는 이게 함정이 된다.
  service_date date generated always as
    (((started_at at time zone 'Asia/Seoul') - interval '4 hours')::date) stored,

  constraint sessions_title_length
    check (char_length(btrim(title)) between 1 and 60),
  constraint sessions_status_valid
    check (status in ('running', 'completed', 'stopped')),
  constraint sessions_attempt_valid
    check (attempt in (1, 2)),

  -- INV-2 를 상태별로 못박는다. 이 제약 하나가 세 가지를 동시에 강제한다:
  --   running   → finished_at 없음
  --   completed → finished_at 이 정확히 started_at + 60분 (그 외 값은 completed 일 수 없다)
  --   stopped   → [started_at, started_at + 60분) 안. 60분을 채웠으면 stopped 가 아니다
  -- NTP 되감기(spec E11)도 하한으로 함께 막힌다.
  constraint sessions_timing_valid check (
    (status = 'running'   and finished_at is null)
    or (status = 'completed' and finished_at = started_at + interval '1 hour')
    or (status = 'stopped'   and finished_at >= started_at
                             and finished_at <  started_at + interval '1 hour')
  )
);

-- INV-1': 사용자·서비스일 기준 살아있거나 확정된 세션은 하나뿐
create unique index sessions_one_live_per_day
  on public.sessions (user_id, service_date)
  where status in ('running', 'completed');

-- INV-1'': 사용자·서비스일 기준 총 2행 상한.
-- attempt 컬럼이 존재하는 유일한 이유가 이 "그룹당 최대 N행"을 유니크 인덱스로 표현하는 것이다.
-- 히스토리 조회 (user_id = ? order by service_date desc) 도 이 인덱스를 후방 스캔으로 탄다.
create unique index sessions_attempt_per_day
  on public.sessions (user_id, service_date, attempt);

-- INV-3: 진행 중인 세션은 사용자당 전역 하나 (날짜 무관)
create unique index sessions_one_running
  on public.sessions (user_id)
  where status = 'running';
```

- [ ] **Step 2: 마이그레이션을 적용하고 생성 컬럼이 받아들여지는지 확인한다**

```bash
npx supabase db reset
```

Expected: 에러 없이 완료.

`timezone(text, timestamptz)`(= `timestamptz_zone`, oid 2038)는 카탈로그상 IMMUTABLE이고,
`timestamp - interval`과 `timestamp::date`도 IMMUTABLE이므로 **이 생성 컬럼은 통과한다.**
STABLE인 것은 `timestamptz::date`와 `date_trunc(text, timestamptz)`인데 둘 다 여기 없다.
폴백 분기는 두지 않는다 — 있으면 실행자가 더 나쁜 설계로 빠질 구실이 된다.

- [ ] **Step 3: 이 태스크가 green으로 만드는 테스트를 확인한다**

Run: `npx vitest run tests/invariants.test.ts -t 'INV-6'`
Expected: PASS

Run: `npx vitest run tests/invariants.test.ts -t 'CHECK 제약이 막는다'`
Expected: PASS (attempt 3, 60분 초과 finished_at 두 건)

Run: `npx vitest run tests/invariants.test.ts -t 'running 이 둘일 수 없다'`
Expected: PASS

나머지는 여전히 FAIL — RPC가 아직 없다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/0001_sessions.sql
git commit -m "feat: add sessions table with invariant constraints and unique indexes"
```

---

### Task 5: 마이그레이션 0002 — RLS

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

**Interfaces:**
- Consumes: `public.sessions` (Task 4)
- Produces: `authenticated`는 자기 행을 SELECT만 할 수 있다. INSERT/UPDATE/DELETE 정책은 존재하지 않는다.

- [ ] **Step 1: RLS 마이그레이션을 쓴다**

`supabase/migrations/0002_rls.sql`:

```sql
-- INV-5 의 절반: 쓰기 정책을 만들지 않는 것으로 수정·삭제를 막는다.
-- 나머지 절반(종료된 행의 변경 금지)은 0003 의 트리거가 담당한다.

alter table public.sessions enable row level security;
-- force row level security 는 쓰지 않는다: security definer RPC 가 테이블 소유자로
-- 실행되므로 FORCE 를 켜면 자기 RPC 의 쓰기까지 막힌다 (spec E14).

-- Supabase 의 기본 grant 를 걷어내고 필요한 것만 다시 준다
revoke all on table public.sessions from anon, authenticated;
grant select on table public.sessions to authenticated;

-- 읽기 정책 하나뿐. INSERT / UPDATE / DELETE 정책은 의도적으로 부재 = 전부 거부.
-- (select auth.uid()) 로 감싸면 행마다 재평가되지 않고 initplan 으로 한 번만 계산된다.
create policy sessions_select_own
  on public.sessions
  for select
  to authenticated
  using (user_id = (select auth.uid()));
```

- [ ] **Step 2: 적용하고 확인한다**

```bash
npx supabase db reset
```

Run: `npx vitest run tests/invariants.test.ts -t '다른 사용자의 세션은 보이지 않는다'`
Expected: PASS

Run: `npx vitest run tests/invariants.test.ts -t '사용자는 자기 세션을 삭제할 수 없다'`
Expected: FAIL — `start_session` RPC가 아직 없어 세션을 만들지 못한다. Task 6에서 green.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat: enable rls with read-only policy on sessions"
```

---

### Task 6: 마이그레이션 0003 — RPC와 불변 트리거

**Files:**
- Create: `supabase/migrations/0003_rpc.sql`

**Interfaces:**
- Consumes: `public.sessions` (Task 4), RLS (Task 5)
- Produces (PostgREST에 노출되는 것 — `authenticated` 만):
  - `public.start_session(p_title text) returns public.sessions`
  - `public.finish_session() returns public.sessions`
  - `public.today_state() returns jsonb` — `{ server_now, service_date, running, sessions[] }`
    (`running` 은 날짜 무관 전역 진행 세션 또는 `null`. `sessions` 는 오늘 service_date 의 행들)
  - `public.finalize_overdue()` — 무인자. `/history` 가 select 전에 호출
  - 노출되지 않음: `public.block_terminal_mutation()` (trigger 반환형이라 PostgREST 가 안 잡는다)
- **`anon` 은 위 어느 것도 실행할 수 없다.** Supabase 기본 role grant 를 `alter default privileges`
  로 끄고 모든 revoke 에 롤을 명시했기 때문이다. 이 사실 자체를 Task 6 Step 2 에서 테스트한다
- 에러 메시지는 기계 판독용 키다: `unauthenticated` / `day_exhausted` / `already_running` /
  `no_running_session` / `record_is_immutable`

- [ ] **Step 1: RPC 마이그레이션을 쓴다**

`supabase/migrations/0003_rpc.sql`:

```sql
-- 세션의 생성·종료가 일어나는 유일한 경로.
-- 모든 definer 함수는 search_path 를 고정하고 스키마를 명시한다 (spec E10).

-- ⚠ Supabase 는 부트스트랩에서
--   alter default privileges for role postgres in schema public
--     grant all on functions to postgres, anon, authenticated, service_role;
-- 을 실행한다. 이건 PUBLIC 유사롤이 아니라 **명시적 role grant** 라서
-- `revoke ... from public` 으로는 지워지지 않는다. 기본값을 먼저 끄고,
-- 이후 모든 revoke 에 롤 이름을 명시한다.
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ── 만료 세션 지연 확정 ────────────────────────────────────────────────
-- 60 분이 지났는데 아무도 안 닫은 running 행을 확정한다. 멱등.
-- 크론을 쓰지 않는다 (spec D4). 대신 start_session 과 today_state 양쪽에서 부른다 —
-- 쓰기 경로에만 두면 화면 C 에 갇힌 사용자가 아무 쓰기도 일으킬 수 없어 행이 영영 running 으로 남는다.
-- finished_at 을 now() 로 찍으면 3 일 뒤 접속한 사용자에게 3 일짜리 세션이 남는다 (spec D5).
--
-- 인자를 받지 않고 auth.uid() 를 쓴다. p_user 를 받으면 설령 노출되더라도가 아니라
-- **노출되면** 남의 세션을 닫는 크로스테넌트 쓰기 프리미티브가 된다. 인자를 없애면
-- 권한 설정이 틀려도 자기 행밖에 못 건드린다.
create or replace function public.finalize_overdue()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sessions
     set status = 'completed',
         finished_at = started_at + interval '1 hour'
   where user_id = (select auth.uid())
     and status = 'running'
     and now() >= started_at + interval '1 hour';
$$;

-- ── 세션 시작 ─────────────────────────────────────────────────────────
create or replace function public.start_session(p_title text)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_today   date;
  v_attempt smallint;
  v_row     public.sessions;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- 여러 탭/기기의 동시 요청을 에러 대신 순서로 바꾼다 (spec E3).
  -- 그래도 충돌하면 유니크 인덱스가 최종 심판이다.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  perform public.finalize_overdue();

  v_today := ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date;

  -- INV-3
  if exists (select 1 from public.sessions
              where user_id = v_user and status = 'running') then
    raise exception 'already_running' using errcode = 'P0001';
  end if;

  -- INV-1': 그날 살아있거나 확정된 세션이 이미 있으면 끝
  if exists (select 1 from public.sessions
              where user_id = v_user
                and service_date = v_today
                and status in ('running', 'completed')) then
    raise exception 'day_exhausted' using errcode = 'P0001';
  end if;

  -- INV-1'': attempt 는 서버가 센다. 클라이언트는 보내지 않는다.
  select coalesce(max(attempt), 0) + 1 into v_attempt
    from public.sessions
   where user_id = v_user and service_date = v_today;

  if v_attempt > 2 then
    raise exception 'day_exhausted' using errcode = 'P0001';
  end if;

  insert into public.sessions (user_id, title, status, attempt)
  values (v_user, btrim(p_title), 'running', v_attempt)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 세션 종료 ─────────────────────────────────────────────────────────
-- 사용자에게 보이는 액션은 "끝내기" 하나. completed / stopped 구분은 시각의 함수이므로
-- 클라이언트가 고르게 두지 않는다 (spec D3).
create or replace function public.finish_session()
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now  timestamptz := now();
  v_id   uuid;
  v_row  public.sessions;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select id into v_id
    from public.sessions
   where user_id = v_user and status = 'running'
     for update;

  if v_id is null then
    raise exception 'no_running_session' using errcode = 'P0001';
  end if;

  update public.sessions
     set status = case
                    when v_now >= started_at + interval '1 hour' then 'completed'
                    else 'stopped'
                  end,
         -- [시작, 시작+60분] 으로 클램프: 만료 확정과 NTP 되감기를 한 식으로 처리
         finished_at = least(greatest(v_now, started_at),
                             started_at + interval '1 hour')
   where id = v_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 오늘 화면이 필요한 전부 ────────────────────────────────────────────
-- server_now 는 클라이언트 시계 오차 보정용이다 (INV-4, spec E4).
--
-- stable 이 아니라 volatile + security definer 다. 이유 두 가지:
--   1) 만료 행을 여기서 확정해야 한다. 화면 C 에 갇힌 사용자는 버튼이 없어서
--      어떤 쓰기도 일으킬 수 없고, 그러면 그 행은 다음 start_session 까지 running 으로 남아
--      히스토리·연속 일수에서 통째로 빠진다.
--   2) 'running' 키는 service_date 로 필터하지 않는다. 03:30 KST 에 시작한 세션은
--      service_date 가 어제인데, 04:00 에 d.today 가 넘어가면 진행 중인 세션이 payload 에서
--      사라져 화면 A 가 뜬다. 사용자가 입력하면 already_running 이 나고 조용히 삼켜져서
--      04:30 까지 무반응 루프가 된다. 전역 running 을 따로 실어 보내 이걸 막는다.
--
-- to_jsonb(s.*) - 'user_id': 나중에 컬럼이 추가돼도 자동으로 클라이언트에 노출되지 않게.
create or replace function public.today_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_today date;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform public.finalize_overdue();

  v_today := ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date;

  return jsonb_build_object(
    'server_now',   now(),
    'service_date', v_today,
    -- 날짜 무관. 경계를 걸친 진행 중 세션을 잃지 않기 위해.
    'running', (select to_jsonb(s.*) - 'user_id'
                  from public.sessions s
                 where s.user_id = v_user and s.status = 'running'),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s.*) - 'user_id' order by s.attempt)
        from public.sessions s
       where s.user_id = v_user and s.service_date = v_today
    ), '[]'::jsonb)
  );
end;
$$;

-- ── INV-5: 종료된 기록은 누구도 못 바꾼다 ───────────────────────────────
-- BEFORE DELETE 트리거는 만들지 않는다: auth.users 의 on delete cascade 까지
-- 막혀서 계정 삭제가 실패한다 (spec D7). 삭제는 RLS 정책 부재로만 막는다.
create or replace function public.block_terminal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'running' then
    raise exception 'record_is_immutable' using errcode = 'P0001';
  end if;
  if new.user_id    is distinct from old.user_id
     or new.started_at is distinct from old.started_at
     or new.title      is distinct from old.title
     or new.attempt    is distinct from old.attempt then
    raise exception 'record_is_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sessions_block_terminal_mutation
  before update on public.sessions
  for each row execute function public.block_terminal_mutation();

-- ── 권한 ──────────────────────────────────────────────────────────────
-- 롤 이름을 명시한다. `from public` 만으로는 Supabase 의 기본 role grant 가 안 지워진다.
revoke all on function public.finalize_overdue()     from public, anon, authenticated;
revoke all on function public.start_session(text)    from public, anon, authenticated;
revoke all on function public.finish_session()       from public, anon, authenticated;
revoke all on function public.today_state()          from public, anon, authenticated;

grant execute on function public.finalize_overdue()  to authenticated;  -- /history 가 부른다
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.finish_session()    to authenticated;
grant execute on function public.today_state()       to authenticated;
```

- [ ] **Step 2: 적용하고 전체 불변 규칙 테스트를 돌린다**

```bash
npx supabase db reset
npx vitest run tests/invariants.test.ts
```

Expected: PASS — 22개 내외 전부 green

- [ ] **Step 3: 전체 테스트로 회귀를 확인한다**

Run: `npm test`
Expected: PASS — 도메인 + 불변 규칙 전부

- [ ] **Step 4: 타입 생성**

```bash
npx supabase gen types typescript --local > lib/database.types.ts
```

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/0003_rpc.sql lib/database.types.ts
git commit -m "feat: add session rpcs and immutability trigger enforcing all invariants"
```

**Phase 1 DoD:** `npm test` green. RPC를 직접 호출해 INV-1~6을 우회하려는 시도가 전부 막힌다.
UI 없이 규칙이 완성되었다. → **사용자 승인 대기**

---

## Phase 2 — 인증

### Task 7: Supabase 클라이언트와 보호 라우트

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`

**Interfaces:**
- Consumes: `lib/database.types.ts` (Task 6)
- Produces:
  - `createClient(): SupabaseClient<Database>` from `@/lib/supabase/client` (브라우저)
  - `createClient(): Promise<SupabaseClient<Database>>` from `@/lib/supabase/server` (RSC · 서버 액션)
  - `updateSession(request: NextRequest): Promise<NextResponse>` from `@/lib/supabase/middleware`

- [ ] **Step 1: 브라우저 클라이언트**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 2: 서버 클라이언트**

`lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 미들웨어가 갱신하므로 무시해도 된다.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 3: 미들웨어 세션 갱신 + 보호 라우트**

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/auth']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getSession() 이 아니라 getUser() — 쿠키의 JWT 를 서버에서 실제로 검증한다
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}
```

`middleware.ts`:

```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|ico)$).*)'],
}
```

- [ ] **Step 4: 타입 체크와 빌드**

Run: `npx tsc --noEmit && npm run build`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/supabase middleware.ts
git commit -m "feat: add supabase clients and auth middleware with protected routes"
```

---

### Task 8: 로그인 · 매직링크 콜백 · 로그아웃

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`
- Create: `app/actions.ts` (`signOut`만; 세션 액션은 Task 9–11에서 추가)
- Modify: `app/page.tsx` (기존 create-next-app 기본 페이지를 임시 확인 화면으로 교체)
- Modify: `app/layout.tsx` (`lang="ko"`, 기본 타이포)

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`, `@/lib/supabase/client`
- Produces: `signOut(): Promise<void>` from `@/app/actions`

- [ ] **Step 1: 로그인 페이지**

`app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setBusy(false)
    if (!error) setSent(true)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">하루에 하나씩</h1>
      {sent ? (
        <p className="text-sm leading-relaxed text-neutral-600">
          {email} 으로 링크를 보냈습니다.<br />메일함에서 열어주세요.
        </p>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-3">
          <input
            type="email" required autoFocus value={email} placeholder="이메일"
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
          />
          <button
            type="submit" disabled={busy}
            className="rounded-lg bg-neutral-900 px-4 py-3 text-base text-white disabled:opacity-40"
          >
            링크 받기
          </button>
        </form>
      )}
    </main>
  )
}
```

- [ ] **Step 2: 매직링크 콜백**

`app/auth/callback/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.redirect(new URL('/login', request.url))
}
```

- [ ] **Step 3: 로그아웃 서버 액션**

`app/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 4: 홈을 임시 확인 화면으로 교체**

`app/page.tsx`:

```tsx
import { signOut } from '@/app/actions'
import { createClient } from '@/lib/supabase/server'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <p className="text-sm text-neutral-600">{user?.email}</p>
      <form action={signOut}>
        <button className="text-sm text-neutral-400 underline">로그아웃</button>
      </form>
    </main>
  )
}
```

`app/layout.tsx`의 `<html lang="en">`을 `<html lang="ko">`로 바꾸고, `metadata`를
`{ title: '하루에 하나씩', description: '하루에 딱 하나의 일을, 한 시간 동안만.' }`으로 교체한다.

- [ ] **Step 5: 수동 검증**

```bash
npm run dev
```

로컬 Supabase의 메일함 `http://127.0.0.1:54324` (Inbucket)에서 매직링크를 연다. 확인 항목:

1. 미로그인으로 `/` → `/login` 리다이렉트
2. 매직링크 클릭 → `/`로 이동, 이메일 표시
3. 하드 리프레시(Cmd+Shift+R) → 로그인 유지
4. 로그인 상태로 `/login` 접근 → `/`로 리다이렉트
5. 로그아웃 → `/login`, 이후 `/` 접근 시 다시 `/login`

- [ ] **Step 6: 커밋**

```bash
git add app lib
git commit -m "feat: add magic link login, callback and sign out"
```

**Phase 2 DoD:** 로그인 / 로그아웃 / 새로고침 유지. 보호 라우트 동작. → **사용자 승인 대기**

---

## Phase 3 — 오늘 화면 + 타이머

### Task 9: 오늘 화면 골격과 상태 A

**Files:**
- Modify: `app/page.tsx`
- Create: `components/TodayInput.tsx`
- Modify: `app/actions.ts` (`startSession` 추가)
- Test: `tests/domain.test.ts` (이미 `todayState` 커버 — 새 테스트 없음)

**Interfaces:**
- Consumes: `today_state()` RPC (Task 6), `todayState` from `@/lib/domain`
- Produces:
  - `startSession(formData: FormData): Promise<void>` from `@/app/actions`
  - `type TodayPayload = { server_now: string; service_date: string; sessions: Session[] }`

- [ ] **Step 1: `startSession` 서버 액션**

`app/actions.ts`에 추가:

```ts
import { revalidatePath } from 'next/cache'
import type { Session } from '@/lib/domain'

export type TodayPayload = {
  server_now: string
  service_date: string
  /** 날짜 무관 전역 진행 세션. 경계를 걸친 세션을 잃지 않기 위해 sessions 와 별도로 온다 */
  running: Session | null
  /** 오늘 service_date 의 행들 (0~2개) */
  sessions: Session[]
}

export async function startSession(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const supabase = await createClient()
  const { error } = await supabase.rpc('start_session', { p_title: title })

  // ponytail: 에러를 화면에 띄우지 않고 최신 상태로 되돌린다.
  // 도달 가능한 실패는 (a) 다른 탭이 먼저 시작함 → 재조회하면 B/C 가 보이는 게 정답이고,
  // (b) 제목 길이 → input 의 maxLength=60 이 먼저 막는다.
  // 사용자에게 보여줄 세 번째 실패 유형이 생기면 그때 useActionState 로 문구를 붙인다.
  if (error) console.error('start_session', error.message)
  revalidatePath('/')
}
```

- [ ] **Step 2: 상태 A 컴포넌트**

`components/TodayInput.tsx`:

```tsx
import { startSession } from '@/app/actions'

export function TodayInput() {
  return (
    <form action={startSession} className="flex flex-col gap-3">
      <input
        name="title" required autoFocus maxLength={60} autoComplete="off"
        placeholder="오늘 할 일 하나"
        className="w-full border-b border-neutral-300 bg-transparent pb-3 text-xl outline-none placeholder:text-neutral-300 focus:border-neutral-900"
      />
      <button type="submit" className="self-start text-sm text-neutral-400">
        한 시간 시작
      </button>
    </form>
  )
}
```

빈 화면이 기본값이다 (철학 4). 인풋과 버튼 외에 아무 문구도 두지 않는다.

- [ ] **Step 3: 오늘 화면 분기**

`app/page.tsx`:

```tsx
import { TodayInput } from '@/components/TodayInput'
import { todayState, type Session } from '@/lib/domain'
import { createClient } from '@/lib/supabase/server'
import type { TodayPayload } from '@/app/actions'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('today_state')

  // 읽기 실패를 화면 A 로 렌더하면 안 된다. `payload?.sessions ?? []` → todayState([]) → 'A' 는
  // 이미 끝낸 날에 인풋을 띄우고, 사용자가 입력하면 day_exhausted 가 삼켜져 무반응이 된다.
  if (error || !data) redirect('/login')
  const payload = data as unknown as TodayPayload

  const serverNow = payload.server_now
  // running 은 날짜 무관이다. 경계를 걸친 세션이 sessions 에서 빠져도 B 를 유지한다.
  const state = payload.running
    ? todayState([payload.running], Date.parse(serverNow))
    : todayState(payload.sessions, Date.parse(serverNow))

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {state === 'A' && <TodayInput />}
      {state === 'B' && <p>진행 중</p>}
      {state === 'C' && <p>오늘 끝</p>}
    </main>
  )
}
```

`redirect` 를 `next/navigation` 에서 import 한다. B/C는 Task 10·11에서 채운다.

- [ ] **Step 4: 확인**

Run: `npm run dev` → `/`에서 인풋에 "테스트"를 넣고 제출
Expected: "진행 중"으로 바뀐다. 새로고침해도 유지된다. 다시 제출할 인풋이 없다.

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app components
git commit -m "feat: add today screen state A with start session action"
```

---

### Task 10: 상태 B — 타이머 (INV-4)

**Files:**
- Create: `components/Timer.tsx`
- Modify: `app/page.tsx`
- Modify: `app/actions.ts` (`finishSession` 추가)

**Interfaces:**
- Consumes: `remainingMs` `formatRemaining` from `@/lib/domain`
- Produces:
  - `finishSession(): Promise<void>` from `@/app/actions`
  - `<Timer startedAt serverNow title />`

- [ ] **Step 1: `finishSession` 서버 액션**

`app/actions.ts`에 추가:

```ts
export async function finishSession() {
  const supabase = await createClient()
  const { error } = await supabase.rpc('finish_session')
  // 다른 탭이 먼저 끝냈으면 no_running_session 이 온다. 정상 상황이므로 조용히 넘어간다.
  if (error) console.error('finish_session', error.message)
  revalidatePath('/')
}
```

- [ ] **Step 2: 타이머 컴포넌트**

`components/Timer.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { finishSession } from '@/app/actions'
import { formatRemaining, remainingMs } from '@/lib/domain'

export function Timer({ startedAt, serverNow, title }: {
  startedAt: string
  serverNow: string
  title: string
}) {
  const router = useRouter()
  // INV-4: 서버 시각과 브라우저 시각의 차이를 한 번 재서 모든 표시에 반영한다.
  // 사용자가 OS 시계를 바꿔도 흡수되고, 못 바꾸는 건 어차피 DB 행이다.
  const [skew] = useState(() => Date.parse(serverNow) - Date.now())
  const [now, setNow] = useState(() => Date.now() + skew)

  useEffect(() => {
    // 경과를 누적하지 않고 매 tick 절대 시각을 다시 읽는다.
    // 백그라운드 탭에서 setInterval 이 throttle 돼도 표시가 어긋나지 않는다.
    const id = setInterval(() => setNow(Date.now() + skew), 1000)
    const resync = () => { if (!document.hidden) router.refresh() }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [skew, router])

  const left = remainingMs(startedAt, now)
  const done = left === 0

  useEffect(() => {
    if (done) void finishSession()
  }, [done])

  return (
    <div className="flex flex-col gap-10">
      <p className="text-xl leading-snug">{title}</p>
      <p className="font-mono text-6xl tabular-nums tracking-tight">{formatRemaining(left)}</p>
      <form action={finishSession}>
        <button className="self-start text-sm text-neutral-400">끝내기</button>
      </form>
    </div>
  )
}
```

화면 B에는 이것 말고 아무것도 없다 (spec 화면 정의).

- [ ] **Step 3: 오늘 화면에 연결**

`app/page.tsx`의 `state === 'B'` 분기를 교체:

```tsx
{state === 'B' && (() => {
  const running = sessions.find((s) => s.status === 'running')!
  return <Timer startedAt={running.started_at} serverNow={serverNow} title={running.title} />
})()}
```

- [ ] **Step 4: 시간 조작 검증 (Phase 3 DoD의 핵심)**

`npm run dev`로 세션을 시작한 뒤 확인:

1. 브라우저 콘솔에서 `Date.now = () => 0` 또는 OS 시계를 +3시간 변경
   → 표시는 흔들릴 수 있으나 **새로고침하면 정확한 남은 시간이 복구된다**
2. DB 확인: `npx supabase db reset` 없이
   `psql "$DB_URL" -c "select status, started_at from sessions"` → `running` 유지, `started_at` 불변
3. 탭을 다른 탭으로 5분간 전환 후 복귀 → 즉시 정확한 값으로 재동기화
4. 두 탭을 열고 한쪽에서 "끝내기" → 다른 탭에 포커스하면 상태 C로 전환

- [ ] **Step 5: 커밋**

```bash
git add app components
git commit -m "feat: add server-anchored timer with clock skew correction and resync"
```

---

### Task 11: 상태 C — 오늘 한 일

**Files:**
- Create: `components/TodayDone.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `elapsedMinutes` `SESSION_MS` from `@/lib/domain`
- Produces: `<TodayDone sessions serverNow />`

- [ ] **Step 1: 상태 C 컴포넌트**

`components/TodayDone.tsx`:

```tsx
import { SESSION_MS, elapsedMinutes, type Session } from '@/lib/domain'

export function TodayDone({ sessions, serverNow }: { sessions: Session[]; serverNow: string }) {
  const nowMs = Date.parse(serverNow)

  return (
    <div className="flex flex-col gap-6">
      {sessions.map((s) => {
        // 만료됐지만 아직 DB 에 확정되지 않은 running 은 60 분으로 보여준다 (spec D4).
        const minutes = s.status === 'running'
          ? Math.min(60, Math.round((nowMs - Date.parse(s.started_at)) / 60_000))
          : elapsedMinutes(s)
        const full = s.status === 'completed'
          || (s.status === 'running' && nowMs - Date.parse(s.started_at) >= SESSION_MS)
        return (
          <div key={s.id} className="flex flex-col gap-1">
            <p className="text-xl leading-snug">{s.title}</p>
            <p className="text-sm text-neutral-400">
              {full ? '한 시간 했음' : `${minutes}분 했음`}
            </p>
          </div>
        )
      })}
    </div>
  )
}
```

"실패", "미달성", "아쉽네요" 같은 표현을 쓰지 않는다 (철학 2). 시작 버튼도 렌더링하지 않는다.

- [ ] **Step 2: 오늘 화면에 연결**

`app/page.tsx`의 `state === 'C'` 분기를 `<TodayDone sessions={sessions} serverNow={serverNow} />`로 교체.

- [ ] **Step 3: 세 상태를 전부 확인한다**

로컬에서 시나리오를 돌린다:

1. 새 사용자 → A (인풋만)
2. 시작 → B (제목 + 60:00 카운트다운 + 끝내기)
3. 즉시 끝내기 → A (인풋 + 위에 "1분 했음" 없음 — 상태 A는 인풋만 보여준다)
4. 다시 시작 → B → 끝내기 → C ("N분 했음" 두 줄, 인풋 없음)
5. `seedSession`으로 만료된 running을 심고 새로고침 → C ("한 시간 했음")

- [ ] **Step 4: 확인**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add app components
git commit -m "feat: add today done state with neutral duration copy"
```

**Phase 3 DoD:** 개발자 도구로 시간을 조작해도 서버 상태가 바뀌지 않는다.
탭 복귀 시 즉시 재동기화. → **사용자 승인 대기**

---

## Phase 4 — 히스토리

### Task 12: 월별 그리드와 리스트

**Files:**
- Create: `app/history/page.tsx`, `components/MonthGrid.tsx`
- Test: `tests/domain.test.ts` (Task 2에서 `monthCells` 커버 완료)

**Interfaces:**
- Consumes: `monthCells` `elapsedMinutes` `serviceDateKST` from `@/lib/domain`
- Produces: `<MonthGrid year month minutesByDate today />`

- [ ] **Step 1: 월 그리드 컴포넌트**

`components/MonthGrid.tsx`:

```tsx
import { monthCells } from '@/lib/domain'

// 잔디 색: 0 / 1~19 / 20~39 / 40~59 / 60분
const SHADES = ['bg-neutral-100', 'bg-neutral-300', 'bg-neutral-500', 'bg-neutral-700', 'bg-neutral-900']

function shade(minutes: number): string {
  if (minutes <= 0) return SHADES[0]
  return SHADES[Math.min(4, Math.ceil(minutes / 15))]
}

export function MonthGrid({ year, month, minutesByDate, today }: {
  year: number
  month: number
  minutesByDate: Record<string, number>
  today: string
}) {
  const cells = monthCells(year, month)
  // 1일이 무슨 요일인지 — service_date 는 순수 날짜라 UTC 로 읽어도 안전하다
  const leading = new Date(`${cells[0]}T00:00:00Z`).getUTCDay()

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: leading }, (_, i) => <div key={`pad-${i}`} />)}
      {cells.map((date) => {
        const minutes = minutesByDate[date] ?? 0
        const future = date > today
        return (
          <div
            key={date}
            title={minutes > 0 ? `${date} · ${minutes}분` : date}
            className={`aspect-square rounded-sm ${future ? 'bg-transparent' : shade(minutes)}`}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 히스토리 페이지**

`app/history/page.tsx`:

```tsx
import { MonthGrid } from '@/components/MonthGrid'
import { elapsedMinutes, serviceDateKST, type Session } from '@/lib/domain'
import { createClient } from '@/lib/supabase/server'

export default async function HistoryPage({ searchParams }: {
  searchParams: Promise<{ m?: string }>
}) {
  const supabase = await createClient()
  // ponytail: 400 행(약 13 개월) 이면 잔디 + 연속 일수에 충분하다.
  // 2 년 넘게 쓰는 사용자가 생기면 그때 월 단위 범위 쿼리로 바꾼다.
  const { data } = await supabase
    .from('sessions')
    .select('id,title,started_at,finished_at,status,attempt,service_date')
    .neq('status', 'running')
    .order('service_date', { ascending: false })
    .limit(400)

  const sessions = (data ?? []) as Session[]
  const today = serviceDateKST(new Date())
  const { m } = await searchParams
  const [year, month] = (m ?? today.slice(0, 7)).split('-').map(Number)

  const minutesByDate: Record<string, number> = {}
  for (const s of sessions) {
    minutesByDate[s.service_date] = (minutesByDate[s.service_date] ?? 0) + elapsedMinutes(s)
  }

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`
  const listed = sessions.filter((s) => s.service_date.startsWith(monthPrefix))

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-8 px-6 py-12">
      <h1 className="text-sm text-neutral-400">{year}년 {month}월</h1>
      <MonthGrid year={year} month={month} minutesByDate={minutesByDate} today={today} />
      <ul className="flex flex-col gap-4">
        {listed.map((s) => (
          <li key={s.id} className="flex justify-between gap-4 text-sm">
            <span className="truncate">{s.title}</span>
            <span className="shrink-0 text-neutral-400">
              {s.service_date.slice(5)} · {elapsedMinutes(s)}분
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 3: 데이터 0 / 1 / 100 상태를 확인한다**

로그인한 뒤 `select id from auth.users` 로 자기 `user_id` 를 확인하고, 100일치를 심는다:

```bash
psql "$(npx supabase status -o env | grep DB_URL | cut -d'"' -f2)"
```

```sql
insert into public.sessions (user_id, title, status, attempt, started_at, finished_at)
select '<USER_ID>'::uuid,
       '기록 ' || g,
       case when g % 5 = 0 then 'stopped' else 'completed' end,
       1,
       now() - (g || ' days')::interval,
       now() - (g || ' days')::interval
         + case when g % 5 = 0 then interval '23 minutes' else interval '1 hour' end
from generate_series(1, 100) g;
```

확인: 0개 → 빈 그리드만, 재촉 문구 없음 / 1개 → 셀 하나 / 100개 → 레이아웃 정상, 스크롤 정상

- [ ] **Step 4: 커밋**

```bash
git add app/history components/MonthGrid.tsx
git commit -m "feat: add history month grid and session list"
```

---

### Task 13: 연속 일수 · 누적 시간 · 설정

**Files:**
- Modify: `app/history/page.tsx`
- Create: `app/settings/page.tsx`
- Modify: `app/actions.ts` (`deleteAccount` 추가)
- Modify: `app/layout.tsx` (하단 내비게이션)

**Interfaces:**
- Consumes: `streak` `totalMinutes` from `@/lib/domain`
- Produces: `deleteAccount(): Promise<void>` from `@/app/actions`

- [ ] **Step 1: 히스토리 상단에 연속 일수 · 누적 시간**

`app/history/page.tsx`의 `<h1>` 앞에 삽입:

```tsx
const days = streak(sessions.map((s) => s.service_date), today)
const total = totalMinutes(sessions)
```

```tsx
<div className="flex gap-8">
  <div>
    <p className="text-3xl tabular-nums">{days}</p>
    <p className="text-xs text-neutral-400">연속 일수</p>
  </div>
  <div>
    <p className="text-3xl tabular-nums">{Math.floor(total / 60)}</p>
    <p className="text-xs text-neutral-400">누적 시간</p>
  </div>
</div>
```

`streak` `totalMinutes`를 import에 추가한다. 0일 때도 "0"을 그대로 보여주고
"시작해보세요" 같은 문구를 붙이지 않는다 (철학 4).

- [ ] **Step 2: 계정 삭제 서버 액션**

`app/actions.ts`에 추가:

```ts
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // auth.users 삭제에는 service_role 이 필요하다. 이 키는 서버 액션 밖으로 나가지 않는다.
  // sessions 는 on delete cascade 로 함께 지워진다 — 이래서 BEFORE DELETE 트리거를
  // 만들지 않았다 (spec D7).
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  await admin.auth.admin.deleteUser(user.id)
  await supabase.auth.signOut()
  redirect('/login')
}
```

- [ ] **Step 3: 설정 페이지**

`app/settings/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { deleteAccount, signOut } from '@/app/actions'

export default function SettingsPage() {
  const [confirming, setConfirming] = useState(false)

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-8 px-6 py-12">
      <form action={signOut}>
        <button className="text-sm text-neutral-600">로그아웃</button>
      </form>

      {confirming ? (
        <form action={deleteAccount} className="flex flex-col items-start gap-2">
          <p className="text-sm text-neutral-600">
            계정과 지금까지의 기록이 모두 삭제됩니다. 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-4">
            <button className="text-sm text-red-600">삭제합니다</button>
            <button type="button" onClick={() => setConfirming(false)} className="text-sm text-neutral-400">
              취소
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setConfirming(true)} className="self-start text-sm text-neutral-400">
          계정 삭제
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: 하단 내비게이션**

`app/layout.tsx`의 `<body>` 안, `{children}` 뒤에 삽입:

```tsx
<nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-sm justify-center gap-8 px-6 py-4 text-xs text-neutral-400">
  <a href="/">오늘</a>
  <a href="/history">기록</a>
  <a href="/settings">설정</a>
</nav>
```

`/login`에서는 미들웨어가 통과시키므로 내비게이션이 보인다 — `app/login/page.tsx`가
`min-h-dvh`로 중앙 정렬돼 있어 시각적으로 문제없다. 신경 쓰이면 로그인 페이지를
별도 라우트 그룹으로 뺀다 (지금은 하지 않는다).

- [ ] **Step 5: 확인**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: 전부 통과

수동: 계정 삭제 → `/login`으로 이동, 같은 이메일로 다시 로그인하면 기록이 비어 있다.

- [ ] **Step 6: 커밋**

```bash
git add app
git commit -m "feat: add streak, cumulative hours and account settings"
```

**Phase 4 DoD:** 데이터 0개 / 1개 / 100개 모두 정상. → **사용자 승인 대기**

---

## Phase 5 — 마감

### Task 14: PWA 매니페스트와 메타데이터

**Files:**
- Create: `app/manifest.ts`, `app/icon.svg`, `app/apple-icon.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: `/manifest.webmanifest`

- [ ] **Step 1: 매니페스트**

`app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '하루에 하나씩',
    short_name: '하루하나',
    description: '하루에 딱 하나의 일을, 한 시간 동안만.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#171717',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
```

- [ ] **Step 2: 아이콘**

`app/icon.svg` — 새 아이콘 라이브러리를 쓰지 않는다:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#171717"/>
  <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" stroke-width="4"/>
  <path d="M32 20v12h9" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
</svg>
```

`app/apple-icon.tsx` — iOS 홈 화면용 180×180. `next/og`는 `next`에 포함돼 있으므로
이미지 툴체인을 새로 들이지 않는다:

```tsx
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: '#171717', color: '#fff', fontSize: 96,
        }}
      >
        1
      </div>
    ),
    size,
  )
}
```

- [ ] **Step 3: 메타데이터**

`app/layout.tsx`의 `metadata`를 교체:

```ts
export const metadata: Metadata = {
  title: '하루에 하나씩',
  description: '하루에 딱 하나의 일을, 한 시간 동안만.',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '하루하나' },
  openGraph: { title: '하루에 하나씩', description: '하루에 딱 하나의 일을, 한 시간 동안만.', locale: 'ko_KR' },
}

export const viewport: Viewport = {
  themeColor: '#171717',
  viewportFit: 'cover',
}
```

`import type { Metadata, Viewport } from 'next'`를 추가한다.

- [ ] **Step 4: 확인**

Run: `npm run build`
Expected: 경고 0. `/manifest.webmanifest`가 라우트 목록에 나타난다.

- [ ] **Step 5: 커밋**

```bash
git add app
git commit -m "feat: add pwa manifest, icons and metadata"
```

---

### Task 15: Playwright 핵심 플로우 1개

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/flow.spec.ts`
- Modify: `package.json` (`test:e2e` 스크립트)

**Interfaces:**
- Consumes: 로컬 Supabase + `npm run dev`
- Produces: `npm run test:e2e`

- [ ] **Step 1: Playwright 설치**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: 설정**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/login',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

`package.json`에 `"test:e2e": "playwright test"` 추가.

- [ ] **Step 3: 시나리오**

`tests/e2e/flow.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'

function localEnv() {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const env: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  return env
}

test('가입 → 등록 → 완료 → 히스토리', async ({ page }) => {
  const env = localEnv()
  const email = `e2e-${Date.now()}@example.test`
  const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // 메일 서버를 파싱하는 대신 링크를 직접 발급받는다. 링크를 브라우저로 여는 이후 경로
  // (Supabase 검증 → /auth/callback → 쿠키 발급 → /) 는 실제 플로우 그대로다.
  await admin.auth.admin.createUser({ email, email_confirm: true })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'http://127.0.0.1:3000/auth/callback' },
  })
  expect(error).toBeNull()

  await page.goto(data!.properties.action_link)
  await expect(page).toHaveURL('http://127.0.0.1:3000/')

  await page.getByPlaceholder('오늘 할 일 하나').fill('E2E 테스트 작성')
  await page.getByRole('button', { name: '한 시간 시작' }).click()

  await expect(page.getByText('E2E 테스트 작성')).toBeVisible()
  await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible()

  await page.getByRole('button', { name: '끝내기' }).click()
  await expect(page.getByPlaceholder('오늘 할 일 하나')).toBeVisible() // stopped → 재시작 가능

  await page.goto('/history')
  await expect(page.getByText('E2E 테스트 작성')).toBeVisible()
  await expect(page.getByText('연속 일수')).toBeVisible()
  // 부정적 라벨이 어디에도 없어야 한다 (철학 2)
  await expect(page.getByText(/실패|미달성/)).toHaveCount(0)
})
```

`supabase/config.toml`의 `[auth] site_url`이 `http://127.0.0.1:3000`인지 확인한다.
아니면 `additional_redirect_urls`에 `http://127.0.0.1:3000/auth/callback`을 추가하고
`npx supabase stop && npx supabase start`로 반영한다.

- [ ] **Step 4: 실행**

Run: `npm run test:e2e`
Expected: 1 passed

- [ ] **Step 5: 커밋**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json
git commit -m "test: add playwright end-to-end flow"
```

---

### Task 16: Vercel 배포

**Files:**
- Create: `README.md`
- Modify: 없음 (설정은 Vercel/Supabase 대시보드)

- [ ] **Step 1: Supabase 프로덕션 프로젝트에 마이그레이션 적용**

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Supabase 대시보드 > Authentication > URL Configuration에서
Site URL과 Redirect URLs에 `https://<도메인>/auth/callback`을 추가한다.

- [ ] **Step 2: Vercel 환경변수**

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY   ← Production 만. Preview 에는 넣지 않는다.
```

- [ ] **Step 3: 배포하고 서비스 키 노출을 확인한다**

배포 후 브라우저에서 확인:

```bash
curl -s https://<도메인>/ | grep -c 'service_role'
```

Expected: `0`. 클라이언트 번들 어디에도 service_role 키가 없어야 한다 (spec E8).

- [ ] **Step 4: 프로덕션 스모크 테스트**

1. 매직링크로 로그인 → `/`로 리다이렉트
2. 세션 시작 → 새로고침 → 타이머 유지
3. 끝내기 → 히스토리에 기록
4. 로그아웃 → `/login`

- [ ] **Step 5: README**

`README.md`:

```markdown
# 하루에 하나씩

하루에 딱 하나의 일을, 한 시간 동안만.

- 스펙: `docs/spec.md`
- 구현 계획: `docs/superpowers/plans/2026-08-17-one-hour-a-day.md`

## 개발

```bash
npm install
npx supabase start      # Docker 필요
cp .env.local.example .env.local   # npx supabase status 값으로 채운다
npm run dev
```

## 테스트

```bash
npm test          # 도메인 + 불변 규칙 (로컬 Supabase 필요)
npm run test:e2e  # Playwright
```
```

- [ ] **Step 6: 커밋**

```bash
git add README.md
git commit -m "docs: add readme with setup and test instructions"
```

**Phase 5 DoD:** Vercel 배포 완료. Playwright 1 시나리오 green. `next build` 경고 0.
`tsc --noEmit` 통과. → **완료**

---

# 리뷰 반영 — 각 태스크 착수 전 필독

`/autoplan` 리뷰(CEO·디자인·엔지니어링 독립 서브에이전트 3 + Codex)에서 나온 확정 수정 사항이다.
Phase 1(Task 1–6)에는 이미 인라인 반영했다. 아래는 Task 2 및 Phase 2–5 분.
전체 근거는 `.dev-flow/autoplan.md`.

## Task 2 추가 — `minutesOf` 공유 헬퍼

`TodayDone` 과 히스토리가 "확정 전 running 도 파생으로 센다"는 같은 로직을 각자 구현하면 갈라진다.
`lib/domain.ts` 에 추가하고 양쪽에서 쓴다:

```ts
/** 확정 전 running 도 파생으로 센다 (spec D4). 화면 C 와 히스토리가 공유한다. */
export function minutesOf(
  s: Pick<Session, 'started_at' | 'finished_at' | 'status'>, nowMs: number,
): number {
  if (s.status !== 'running') return elapsedMinutes(s)
  return Math.min(60, Math.max(1, Math.round((nowMs - Date.parse(s.started_at)) / 60_000)))
}
```

테스트: running·completed·stopped 각각, 그리고 만료 running 이 60 을 넘지 않는 것.

## Task 8 (인증) — 매직링크를 token-hash 플로우로

**현재 계획의 `/auth/callback` 은 E2E 테스트와 기기 간 로그인 양쪽에서 깨진다.**
`createBrowserClient` 는 기본이 PKCE 라서 verifier 쿠키가 **링크를 연 기기에** 있어야 한다.
다른 기기에서 열면 `exchangeCodeForSession` 이 실패하고 아무 설명 없이 `/login` 으로 돌아간다
(spec E13 의 "그 기기에 로그인됨"은 사실이 아니다). 그리고 `generateLink` 는 code challenge 가
없어서 implicit 플로우로 떨어지고 토큰을 **URL fragment** 로 보내므로 `searchParams.get('code')`
가 항상 null 이다 → Task 15 가 작성 시점부터 실패한다.

`app/auth/callback/route.ts` 대신 `app/auth/confirm/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const token_hash = p.get('token_hash')
  const type = p.get('type') as EmailOtpType | null
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.redirect(new URL('/login', request.url))
}
```

`emailRedirectTo` 를 `/auth/confirm` 으로. `PUBLIC_PATHS` 의 `/auth` 접두사가 이미 커버한다.
spec E13 을 "기기 무관하게 로그인된다"로 정정.

또한 `{email} 으로 링크를 보냈습니다.` 는 조사 버그가 둘이다 — JSX 공백이 그대로 렌더되고,
`.kr` 주소는 `으로` 가 아니라 `로` 다. 조사가 안 붙게 재구성:
`메일로 링크를 보냈습니다.` + 주소는 다음 줄. 매직링크 발송 실패(레이트리밋 ~60초)도
중립 한 줄로 표시한다.

## Task 9 (화면 A)

- **pending 상태.** `components/SubmitButton.tsx` 를 `useFormStatus`(React 내장, 새 의존성 0)로.
  왕복 300–1500ms 동안 화면이 그대로면 사용자가 다시 누른다
- **입력 보존.** 실패 시 폼이 비어서 재렌더 → 입력한 제목이 설명 없이 사라진다. 데이터 손실이다.
  `useActionState` 로 값과 중립 에러 문구를 함께 반환
- **에러를 전부 삼키지 않는다.** `if (error && error.code !== 'P0001') throw error` —
  동시성(P0001)만 조용히 넘기고 나머지는 에러 바운더리로. 네트워크 실패는 원래 주석의
  "도달 가능한 실패 둘"에 없었다
- **시작 버튼 위계.** 현재 `text-sm text-neutral-400` 로 nav 링크와 같은 무게다.
  `/login` 의 `링크 받기` 는 `rounded-lg bg-neutral-900 px-4 py-3 text-base text-white` 인데
  훨씬 덜 중요한 액션이다. 둘 중 하나로 통일
- **포커스 관리.** `<main tabIndex={-1} key={state}>` + 전환 시 포커스 이동 + polite live region.
  A→B, B→C 모두 서브트리를 통째 교체하므로 포커스가 body 로 떨어진다

## Task 10 (타이머)

- **skew 가 첫 마운트에 고정돼 있다.** `useState(() => …)` 는 재실행되지 않으므로
  `router.refresh()` 로 새 `serverNow` 가 와도 skew 가 갱신되지 않는다 —
  이 컴포넌트가 존재하는 이유인 재동기화 경로가 정확히 안 듣는다.
  `<Timer key={serverNow} … />` 로 해결
- **자동 종료 중복 호출.** StrictMode 이중 실행 + 다중 탭. `useRef` in-flight 가드 +
  `startTransition` + `no_running_session` 을 에러로 취급하지 않기
- **스크린리더.** 시각 노드에 `aria-hidden`, 별도 sr-only 노드에 `role="timer" aria-live="polite"`
  로 **분 단위** 텍스트(`N분 남음`). 초 단위 live region 은 3600번 읽는다
- 무효한 `self-start` 제거 (`<form>` 이 flex 가 아니다)
- 터치 타깃: `끝내기` 가 약 34×20px. `-m-3 p-3`

## Task 11 (화면 C)

- **상태 A 가 오늘의 이전 `stopped` 기록을 보여준다.** 현재 Step 3 은 "인풋만"이라고 지시하는데,
  그러면 방금 한 37분이 화면에서 사라진다. 스펙 철학 2의 대표 예시가 "37분 했음"이다.
  기록이 있으면 `autoFocus` 도 끈다 — 중단 300ms 뒤에 키보드가 올라오는 건 카피 없는 재촉이다
- **마침표.** 화면 C 에 `오늘은 여기까지.` 한 줄. 09:05 와 22:40 의 화면이 동일하면 완결감이 아니라 원장이다
- **스펙 E6 구현.** 2행일 때 합계 표기
- `minutesOf` 를 쓰고 자체 파생 로직을 삭제

## Task 12 (히스토리)

- **`.neq('status','running')` 제거.** 만료·미확정 세션이 잔디·리스트·연속 일수에서 사라진다.
  `minutesOf` 로 파생 계산. `today_state()` 가 확정하지만 `/history` 에 직접 진입할 수 있으므로
  select 전에 `await supabase.rpc('finalize_overdue')` 도 호출
- **잔디 색이 이 앱의 유일한 구분을 못 한다.** `Math.ceil(minutes/15)` 의 실제 구간은
  1–15/16–30/31–45/**46–60** 이라 46분 중단과 60분 완주가 같은 색이다.
  그라데이션을 버리고 상태를 인코딩:
  `minutes <= 0 ? 'bg-neutral-100' : minutes >= 60 ? 'bg-neutral-900' : 'bg-neutral-400'`
- **월 이동 UI 가 없다.** `searchParams.m` 을 읽는데 그걸 세팅하는 링크가 없어 지난달에 도달 불가.
  Phase 4 DoD 에 "월 이동"이 있는데 코드가 빠졌다. `m` 은 `/^\d{4}-\d{2}$/` 로 검증할 것
  (`?m=abc` → "NaN년 undefined월")
- 잔디 셀에 `role="img" aria-label="8월 17일, 37분"` + 일~토 헤더 행.
  현재는 `title` 속성뿐이라 터치 기기에서 아예 못 본다
- `.limit(400)` 주석의 "약 13개월" → "최악 200일"

## Task 13 (통계·설정)

- **`total === 0` 이면 통계 블록을 렌더하지 않는다.** 신규 사용자 첫 방문 화면 최상단이
  `text-3xl` 크기의 0 두 개다. Task 12 는 이미 "0개 → 빈 그리드만"이라 했는데 여기서 안 지켰다
- **누적 시간이 주 지표, 연속 일수는 보조** (2026-08-17 결정). 현재 계획은 둘 다 `text-3xl` 이라
  아무 입장도 안 취했다. 누적 시간은 오르기만 하고 빈 날에 비용이 없다 — 연속 일수의 반죄책감
  버전이다. 라벨도 `연속 일수` → `이어서 5일` 로 (전자는 점수판 언어, 후자는 서술):
  ```tsx
  <div className="flex items-baseline gap-8">
    <div>
      <p className="text-3xl tabular-nums">{총 시간 문자열}</p>
      <p className="text-xs text-neutral-500">누적</p>
    </div>
    <p className="text-sm text-neutral-500">이어서 {days}일</p>
  </div>
  ```
- **단위와 바닥.** `Math.floor(total/60)` 이라 55분이 `0` 으로 뜬다. `elapsedMinutes` 는
  20초도 "1분"이라 하는데 같은 레포가 정반대로 행동한다. `5일`, `43시간`, 1시간 미만은 `55분`
- **누적 시간이 400행에서 잘린다.** 라벨은 "누적"인데 값은 최근 400행 합계다. 집계 RPC 하나 추가:
  ```sql
  create or replace function public.lifetime_stats()
  returns jsonb language sql stable security definer set search_path = '' as $$
    select jsonb_build_object(
      'total_minutes', coalesce(sum(extract(epoch from (finished_at - started_at)) / 60)::int, 0),
      'active_days',   count(distinct service_date))
    from public.sessions
    where user_id = (select auth.uid()) and finished_at is not null;
  $$;
  ```
  revoke/grant 는 다른 RPC 와 동일하게
- **nav 를 `layout.tsx` 에서 뺀다.** 스펙은 화면 B 를 "남은 시간, 제목. 다른 건 아무것도 없다"로
  규정한다. `/history`·`/settings` 와 상태 A·C 에서만 렌더. `next/link` 사용(현재 `<a href>` 라
  탭 전환마다 문서 전체 리로드) + `aria-current="page"` + 히스토리 하단 패딩(마지막 항목이 nav 밑에 깔린다)
- **`deleteAccount` 가 실패를 삼킨다.** `deleteUser` 의 결과를 버리고 로그아웃 후 리다이렉트하므로
  실패해도 사용자는 자기 기록이 지워졌다고 믿는다. 이건 삼키면 안 되는 유일한 에러 경로다.
  `const { error } = await admin.auth.admin.deleteUser(user.id); if (error) throw …`
- Preview 에 서비스 키가 없으므로 `!` 단언 대신 키 부재 시 명시적 에러

## Task 14 (PWA)

- **`/apple-icon` 이 미들웨어 matcher 에 걸린다.** matcher 는 확장자로 제외하는데
  `app/apple-icon.tsx` 는 `/apple-icon?<hash>` 로 서빙돼 **확장자가 없다**. 로그아웃 상태
  (=`/login`, 아이콘이 처음 요청되는 곳)에서 307 로 `/login` HTML 을 아이콘으로 반환한다.
  matcher 의 negative lookahead 에 `apple-icon` 추가
- **`globals.css` 의 다크 블록을 지운다.** 다크 **토글**은 범위 밖이지만 다크 **렌더링**은
  `prefers-color-scheme` 로 자동 발생한다. 컴포넌트 색이 전부 라이트 고정이라
  다크 폰에서 잔디가 의미상 반전된다. `color-scheme: light` 로 고정
- 서비스워커 없는 `display: standalone` 은 오프라인에서 앱 크롬 안에 브라우저 에러를 띄운다.
  최소 오프라인 폴백을 넣거나 `standalone` 을 뺀다

## Task 15 (E2E)

`generateLink` + `?code=` 조합은 위 Task 8 이유로 실패한다.
`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink` 로 이동할 것.

## Task 16 (배포)

- **서비스 키 유출 검사가 검사하려는 것을 못 잡는다.** 현재는 HTML 한 장에서
  `service_role` 이라는 **문자열**을 grep 한다 — 키 값이 JS 청크에 있어도 `0` 을 보고한다:
  ```bash
  npm run build && grep -rl "$SUPABASE_SERVICE_ROLE_KEY" .next/static && echo LEAK || echo ok
  ```
- **호스티드 Supabase 기본 SMTP 는 시간당 한 자릿수로 제한된다.** 출시일에 매직링크가
  조용히 안 가기 시작한다. 커스텀 SMTP 설정을 Phase 5 스텝으로 넣을 것 (발견이 아니라 계획으로)

## 전역 — 타이포·색 역할

6개 화면에 글자 크기 7종이 역할 없이 흩어져 있고, 같은 의미의 요소가 파일마다 다르게 렌더된다
(페이지 제목: `/login` 은 `text-2xl font-semibold`, `/history` 는 `text-sm text-neutral-400`,
`/` 는 없음). 토큰 파일을 만들 필요는 없고 표 하나로 고정한다:

| 역할 | 클래스 |
|---|---|
| 카운트다운 | `font-mono text-6xl tabular-nums tracking-tight` |
| 지금 하는 일 / 페이지 제목 | `text-xl leading-snug` (`<h1>`) |
| 주 액션 | `rounded-lg bg-neutral-900 px-5 py-3 text-base text-white` |
| 보조 액션 | `text-sm text-neutral-600 -m-3 p-3` |
| 보조 텍스트 | `text-sm text-neutral-500` |
| 라벨 | `text-xs text-neutral-500` |
| placeholder | `placeholder:text-neutral-400` |

`text-neutral-400`(#a3a3a3) on white = **2.52:1** 로 WCAG AA(4.5:1) 미달이다.
`neutral-500`(#737373)=4.74:1, `neutral-600`=7.8:1. 접근성 기본은 타협 대상이 아니다.

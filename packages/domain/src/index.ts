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

/**
 * 확정 전 running 도 파생으로 센다 (spec D4).
 * 화면 C 와 히스토리가 공유한다 — 각자 구현하면 갈라진다.
 */
export function minutesOf(
  s: Pick<Session, 'started_at' | 'finished_at' | 'status'>, nowMs: number,
): number {
  if (s.status !== 'running') return elapsedMinutes(s)
  return Math.min(60, Math.max(1, Math.round((nowMs - Date.parse(s.started_at)) / 60_000)))
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

/**
 * 'YYYY-MM-DD' 달력 산술. service_date 는 순수 날짜라 타임존이 개입하지 않는다.
 *
 * 기본값 NaN 은 캐스팅을 피하기 위한 정직한 표현이다 — 자리가 비면 Number(undefined) 도
 * 어차피 NaN 이고, 형식이 깨진 입력은 toISOString() 에서 즉시 던진다.
 * 조용히 이상한 날짜를 만들어 잔디와 연속 일수를 망가뜨리는 것보다 낫다.
 */
export function shiftDay(ymd: string, days: number): string {
  const [y = NaN, m = NaN, d = NaN] = ymd.split('-').map(Number)
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

/**
 * 잔디 단계. 그라데이션이 아니라 **상태**를 인코딩한다.
 *
 * 초안은 `Math.ceil(minutes / 15)` 로 5단계를 만들었는데, 실제 구간이
 * 1–15 / 16–30 / 31–45 / **46–60** 이라 46분 중단과 60분 완주가 같은 색이었다.
 * 이 앱이 구별하려는 단 하나가 완주 vs 중단인데 잔디가 그걸 못 하면 잔디가 틀린 것이다.
 */
export function grassLevel(minutes: number): 0 | 1 | 2 {
  if (minutes <= 0) return 0
  return minutes >= 60 ? 2 : 1
}

/** 'YYYY-MM' 월 이동. shiftDay 와 같은 이유로 순수 문자열 산술이다. */
export function shiftMonthKey(ym: string, delta: number): string {
  const [y = NaN, m = NaN] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

/** month 는 1-indexed. */
export function monthCells(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return Array.from({ length: days }, (_, i) => `${year}-${mm}-${String(i + 1).padStart(2, '0')}`)
}

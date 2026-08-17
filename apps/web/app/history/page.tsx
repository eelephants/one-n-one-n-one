import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  minutesOf, serviceDateKST, shiftMonthKey, streak, type Session,
} from '@onehour/domain'
import { MonthGrid } from '@/components/MonthGrid'
import { Nav } from '@/components/Nav'
import { createClient } from '@/lib/supabase/server'

type LifetimeStats = { total_minutes: number; active_days: number }

function formatTotal(minutes: number): string {
  // 1 시간 미만을 floor 해서 "0" 이라고 말하지 않는다 — elapsedMinutes 와 같은 원칙 (철학 2).
  if (minutes < 60) return `${minutes}분`
  return `${Math.floor(minutes / 60)}시간`
}

export default async function HistoryPage({ searchParams }: PageProps<'/history'>) {
  const supabase = await createClient()

  // 만료·미확정 세션을 여기서도 확정한다. /history 로 바로 들어오면 today_state 를 안 거치므로
  // 이게 없으면 잔디에 구멍이 남는다 (spec D4).
  await supabase.rpc('finalize_overdue')

  // ponytail: 400 행이면 잔디와 리스트에 충분하다. 하루 최대 2 행이므로 최악 200 일치.
  // 연속 일수도 이 창에서 계산하므로 200 일을 넘는 연속은 과소 집계된다 — 그때 가서 늘린다.
  // 누적 통계만은 창에 걸리면 라벨이 거짓말이 되므로 별도 집계 RPC 를 쓴다.
  const [{ data, error }, { data: statsData }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id,title,started_at,finished_at,status,attempt,service_date')
      .order('service_date', { ascending: false })
      .limit(400),
    supabase.rpc('lifetime_stats'),
  ])

  if (error) redirect('/login')

  const sessions = (data ?? []) as Session[]
  const stats = statsData as unknown as LifetimeStats | null
  const now = new Date()
  const nowMs = now.getTime()
  const today = serviceDateKST(now)

  const { m } = await searchParams
  // ?m=abc 는 "NaN년 undefined월" 을 그리고, ?m=2026-13 은 존재하지 않는 달을 그린다.
  const monthKey = typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7)
  const [year = NaN, month = NaN] = monthKey.split('-').map(Number)

  const minutesByDate: Record<string, number> = {}
  for (const s of sessions) {
    minutesByDate[s.service_date] = (minutesByDate[s.service_date] ?? 0) + minutesOf(s, nowMs)
  }

  const days = streak(Object.keys(minutesByDate), today)
  const totalMinutesAll = stats?.total_minutes ?? 0
  const listed = sessions.filter((s) => s.service_date.startsWith(monthKey))
  const isCurrentMonth = monthKey >= today.slice(0, 7)

  return (
    <>
      <main className="mx-auto flex w-full max-w-sm flex-col gap-8 px-6 pt-12 pb-28">
        {/* 기록이 하나도 없으면 통계 블록 자체를 그리지 않는다. 첫 방문 화면 맨 위에
            커다란 0 두 개를 띄우는 건 이 제품에서 가장 죄책감에 가까운 요소다 (철학 4). */}
        {totalMinutesAll > 0 && (
          <div className="flex items-baseline gap-8">
            <div>
              <p className="text-3xl tabular-nums">{formatTotal(totalMinutesAll)}</p>
              <p className="text-xs text-neutral-500">누적</p>
            </div>
            {/* 누적이 주 지표다. 오르기만 하고 빈 날에 비용이 없다.
                연속 일수는 보조로 두고 "이어서 N일"로 서술한다 — 점수판 언어를 피한다. */}
            {days > 0 && <p className="text-sm text-neutral-500">이어서 {days}일</p>}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h1 className="text-sm text-neutral-500">
            {year}년 {month}월
          </h1>
          <div className="flex gap-1">
            <Link
              href={`/history?m=${shiftMonthKey(monthKey, -1)}`}
              aria-label="이전 달"
              className="-m-1 px-3 py-1 text-sm text-neutral-600"
            >
              ←
            </Link>
            {isCurrentMonth ? (
              <span aria-hidden="true" className="-m-1 px-3 py-1 text-sm text-neutral-300">
                →
              </span>
            ) : (
              <Link
                href={`/history?m=${shiftMonthKey(monthKey, 1)}`}
                aria-label="다음 달"
                className="-m-1 px-3 py-1 text-sm text-neutral-600"
              >
                →
              </Link>
            )}
          </div>
        </div>

        <MonthGrid year={year} month={month} minutesByDate={minutesByDate} today={today} />

        <ul className="flex flex-col gap-4">
          {listed.map((s) => (
            <li key={s.id} className="flex justify-between gap-4 text-sm">
              <span className="truncate">{s.title}</span>
              <span className="shrink-0 text-neutral-500">
                {Number(s.service_date.slice(8))}일 · {minutesOf(s, nowMs)}분
              </span>
            </li>
          ))}
        </ul>
      </main>
      <Nav current="/history" />
    </>
  )
}

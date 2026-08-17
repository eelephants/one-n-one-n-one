import { redirect } from 'next/navigation'
import { todayState } from '@onehour/domain'
import { Nav } from '@/components/Nav'
import { RecordList } from '@/components/RecordList'
import { Timer } from '@/components/Timer'
import { TodayDone } from '@/components/TodayDone'
import { TodayInput } from '@/components/TodayInput'
import { createClient } from '@/lib/supabase/server'
import type { TodayPayload } from '@/app/actions'

const ANNOUNCEMENT = {
  A: '오늘 할 일을 입력할 수 있어요',
  B: '세션이 진행 중이에요',
  C: '오늘은 끝났어요',
} as const

export default async function TodayPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('today_state')

  // 읽기 실패를 화면 A 로 렌더하면 안 된다. `data?.sessions ?? []` → todayState([]) → 'A' 는
  // 이미 끝낸 날에 인풋을 띄우고, 사용자가 입력하면 day_exhausted 가 삼켜져 무반응이 된다.
  if (error || !data) redirect('/login')

  const payload = data as unknown as TodayPayload
  const { server_now: serverNow, running, sessions } = payload
  const nowMs = Date.parse(serverNow)

  // running 은 날짜 무관이다. 03:30 에 시작한 세션이 04:00 에 service_date 롤오버로
  // sessions 에서 빠져도 B 를 유지한다.
  const state = running ? todayState([running], nowMs) : todayState(sessions, nowMs)

  return (
    <>
    <main
      key={state}
      tabIndex={-1}
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 outline-none"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {ANNOUNCEMENT[state]}
      </p>

      {state === 'A' && (
        <div className="flex flex-col gap-10">
          {/* 방금 중단한 기록을 지우지 않는다. 스펙 철학 2 의 대표 예시가 "37분 했음"이다. */}
          {sessions.length > 0 && <RecordList sessions={sessions} nowMs={nowMs} />}
          <TodayInput autoFocus={sessions.length === 0} />
        </div>
      )}

      {state === 'B' && running && (
        <Timer
          key={serverNow}
          startedAt={running.started_at}
          serverNow={serverNow}
          title={running.title}
        />
      )}

      {/* running 이 있으면 항상 B 다: today_state 가 반환 전 같은 트랜잭션에서 finalize_overdue 를
          돌리고 server_now 도 같은 now() 라, payload 의 running 은 만료 전임이 보장된다.
          따라서 C 는 오늘의 확정된 행들만 보면 된다. */}
      {state === 'C' && <TodayDone sessions={sessions} nowMs={nowMs} />}
    </main>
    {/* 화면 B 에는 nav 를 그리지 않는다 — "다른 건 아무것도 없다"(스펙). */}
    {state !== 'B' && <Nav current="/" />}
    </>
  )
}

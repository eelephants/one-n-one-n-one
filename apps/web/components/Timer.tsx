'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatRemaining, remainingMs } from '@onehour/domain'
import { finishSession } from '@/app/actions'

/**
 * 화면 B. 남은 시간과 지금 하는 일 제목. 다른 건 아무것도 없다 (스펙).
 *
 * 호출부에서 `key={serverNow}` 를 줘야 한다 — skew 는 마운트 시 한 번만 계산되므로
 * key 가 없으면 router.refresh() 로 새 serverNow 가 와도 갱신되지 않는다.
 * 그러면 이 컴포넌트가 존재하는 이유인 재동기화가 정확히 안 듣는다.
 */
export function Timer({ startedAt, serverNow, title }: {
  startedAt: string
  serverNow: string
  title: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // INV-4: 서버 시각과 브라우저 시각의 차이를 한 번 재서 모든 표시에 반영한다.
  // 사용자가 OS 시계를 바꿔도 흡수되고, 못 바꾸는 건 어차피 DB 행이다.
  const [skew] = useState(() => Date.parse(serverNow) - Date.now())
  const [now, setNow] = useState(() => Date.now() + skew)

  useEffect(() => {
    // 경과를 누적하지 않고 매 tick 절대 시각을 다시 읽는다.
    // 백그라운드 탭에서 setInterval 이 throttle 돼도 표시가 어긋나지 않는다.
    const id = setInterval(() => setNow(Date.now() + skew), 1000)
    const resync = () => {
      if (!document.hidden) router.refresh()
    }
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

  // 카운트다운이 0 이 되면 finish_session 을 쏘지 않고 **서버에 다시 물어본다.**
  //
  // 클라이언트가 종료를 개시하면, 세션 도중에 OS 시계가 틀어진 사용자의 세션이
  // 본인 의사와 무관하게 끝나 버린다 (직접 재현했다: 시계를 +3h 하니 225초짜리
  // stopped 로 기록됐다). 마운트 시점의 skew 보정은 "처음부터 틀린 시계"만 흡수한다.
  //
  // refresh 하면 today_state 가 서버 시각으로 판정한다:
  //   진짜 만료   → finalize_overdue 가 정확히 60분짜리 completed 로 확정 → 화면 C
  //   시계 오류   → 새 server_now 로 Timer 가 remount(key) 되어 카운트다운이 복구된다
  // 어느 쪽이든 수렴하므로 무한 루프가 아니다.
  const asked = useRef(false)
  useEffect(() => {
    if (!done || asked.current) return
    asked.current = true
    startTransition(() => {
      router.refresh()
    })
  }, [done, router])

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-xl leading-snug">{title}</h1>

      <p aria-hidden="true" className="font-mono text-6xl tabular-nums tracking-tight">
        {formatRemaining(left)}
      </p>
      {/* 초 단위로 aria-live 를 걸면 3600 번 읽는다. 분 단위로만 내용이 바뀌게 한다. */}
      <p role="timer" aria-live="polite" className="sr-only">
        {done ? '한 시간을 다 했어요' : `${Math.ceil(left / 60_000)}분 남음`}
      </p>

      <form action={finishSession}>
        <button className="-m-3 p-3 text-sm text-neutral-600">끝내기</button>
      </form>
    </div>
  )
}

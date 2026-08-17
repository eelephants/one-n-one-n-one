import { minutesOf, type Session } from '@onehour/domain'

/**
 * 오늘 한 일의 기록. 화면 C 와 화면 A(중단 후) 가 공유한다.
 * "실패"·"미달성" 같은 라벨을 쓰지 않는다 — 소요 시간만 말한다 (철학 2).
 */
export function RecordList({ sessions, nowMs }: { sessions: Session[]; nowMs: number }) {
  return (
    <ul className="flex flex-col gap-6">
      {sessions.map((s) => {
        const minutes = minutesOf(s, nowMs)
        return (
          <li key={s.id} className="flex flex-col gap-1">
            <p className="text-xl leading-snug">{s.title}</p>
            <p className="text-sm text-neutral-500">
              {minutes >= 60 ? '한 시간 했어요' : `${minutes}분 했어요`}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

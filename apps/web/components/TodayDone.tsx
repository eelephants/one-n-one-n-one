import { minutesOf, type Session } from '@onehour/domain'
import { RecordList } from './RecordList'

/**
 * 화면 C — 오늘은 끝. 시작 버튼을 disabled 로 두지 않고 아예 렌더링하지 않는다 (스펙).
 */
export function TodayDone({ sessions, nowMs }: { sessions: Session[]; nowMs: number }) {
  const total = sessions.reduce((sum, s) => sum + minutesOf(s, nowMs), 0)

  return (
    <div className="flex flex-col gap-8">
      <RecordList sessions={sessions} nowMs={nowMs} />

      {/* spec E6: 두 번 했으면 합계도 중립적으로 알려준다 */}
      {sessions.length > 1 && (
        <p className="text-sm text-neutral-500">오늘 모두 {total}분</p>
      )}

      {/* 마침표. 이게 없으면 09:05 화면과 22:40 화면이 똑같고, 완결감이 아니라 원장이 된다. */}
      <p className="text-sm text-neutral-500">오늘은 여기까지.</p>
    </div>
  )
}

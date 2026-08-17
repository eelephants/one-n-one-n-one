import { grassLevel, monthCells } from '@onehour/domain'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const FILL = [
  'bg-neutral-100', // 없음
  'bg-neutral-400', // 부분
  'bg-neutral-900', // 완주
] as const

export function MonthGrid({ year, month, minutesByDate, today }: {
  year: number
  month: number
  minutesByDate: Record<string, number>
  today: string
}) {
  const cells = monthCells(year, month)
  // 1일의 요일. service_date 는 순수 날짜라 UTC 로 읽어도 안전하다.
  const leading = new Date(`${cells[0]}T00:00:00Z`).getUTCDay()

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1.5" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-neutral-500">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leading }, (_, i) => <div key={`pad-${i}`} />)}
        {cells.map((date) => {
          const minutes = minutesByDate[date] ?? 0
          const future = date > today
          const [, m = '', d = ''] = date.split('-')
          // title 속성은 터치 기기에서 아예 보이지 않는다. 보조기술에는 aria-label 로 준다.
          const label = minutes > 0
            ? `${Number(m)}월 ${Number(d)}일, ${minutes}분`
            : `${Number(m)}월 ${Number(d)}일`
          return (
            <div
              key={date}
              role="img"
              aria-label={label}
              title={label}
              className={`aspect-square rounded-sm ${future ? 'bg-transparent' : FILL[grassLevel(minutes)]}`}
            />
          )
        })}
      </div>
    </div>
  )
}

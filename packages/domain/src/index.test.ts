import { describe, expect, it } from 'vitest'
import {
  SESSION_MS, elapsedMinutes, formatRemaining, minutesOf, monthCells, remainingMs,
  serviceDateKST, shiftDay, streak, todayState, totalMinutes, type Session,
} from './index'

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

describe('minutesOf — 확정 전 running 도 센다 (spec D4)', () => {
  const now = Date.parse('2026-08-17T01:40:00Z')
  it('끝난 세션은 elapsedMinutes 와 같다', () => {
    const s = session({ status: 'stopped', finished_at: '2026-08-17T01:23:00Z' })
    expect(minutesOf(s, now)).toBe(23)
  })
  it('진행 중인 세션은 지금까지의 경과를 준다', () => {
    expect(minutesOf(session({ status: 'running' }), now)).toBe(40)
  })
  it('만료된 running 은 60 을 넘지 않는다', () => {
    expect(minutesOf(session({ status: 'running' }), Date.parse('2026-08-20T00:00:00Z'))).toBe(60)
  })
  it('막 시작한 running 도 0 이라고 하지 않는다', () => {
    expect(minutesOf(session({ status: 'running' }), Date.parse('2026-08-17T01:00:05Z'))).toBe(1)
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

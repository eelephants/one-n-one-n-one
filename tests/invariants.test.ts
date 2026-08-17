import { beforeAll, describe, expect, it } from 'vitest'
import { serviceDateKST } from '@onehour/domain'
import {
  admin, anonClient, inTodayServiceDay, makeUser, minutesAgo, seedSession,
} from './helpers/supabase'

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

  // 알려진 한계 (spec INV-1'' 참조): "2번째는 1번째가 stopped 일 때만"은 제약이 아니라
  // start_session 의 PL/pgSQL 가드다. 다른 행을 참조해야 해서 CHECK 로 표현할 수 없다.
  // 클라이언트에는 INSERT 권한이 없으므로 실효는 같지만, 구조적 강제라고 주장하면 거짓이다.
  // 이 테스트는 "막힌다"가 아니라 "여기까지가 경계다"를 못박는다.
  it('service_role 은 attempt 1 없이 attempt 2 를 만들 수 있다 (구조적 강제 아님)', async () => {
    const u = await makeUser()
    const started = inTodayServiceDay(30)
    const row = await seedSession(u.id, {
      started_at: started, status: 'stopped', attempt: 2,
      finished_at: new Date(Date.parse(started) + 300_000).toISOString(),
    })
    expect(row.attempt).toBe(2)
    // 하지만 RPC 는 그 상태에서도 안전하게 동작한다: max(attempt)+1 = 3 이므로 거부한다.
    // 즉 구멍은 "service_role 이 이상한 모양을 만들 수 있다"까지이고,
    // 거기서부터 규칙이 무너지지는 않는다.
    const viaRpc = await u.client.rpc('start_session', { p_title: 'RPC 경유' })
    expect(viaRpc.error?.message).toContain('day_exhausted')
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
    // 길이도 시작 시각도 인자로 받지 않는다 (INV-2, INV-4)
    expect((await u.client.rpc('start_session', { p_title: 'x', p_minutes: 180 })).error?.code)
      .toBe('PGRST202')
    expect((await u.client.rpc('start_session', {
      p_title: 'x', p_started_at: '2020-01-01T00:00:00Z',
    })).error?.code).toBe('PGRST202')
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
    await seedSession(u.id, {
      started_at: new Date(Date.now() - 30 * HOUR).toISOString(), status: 'running',
    })
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
  // start_session 이 started_at 을 인자로 안 받는다는 검증은 INV-2 의 시그니처 테스트에 있다.
  // 여기서 단독으로 하면 PGRST202 가 "함수 없음"과 구분이 안 돼 동어반복이 된다.

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
    // 같은 삽입이 service_date 없이는 성공해야 한다 — 그래야 실패가 "테이블 없음"이 아니라
    // "생성 컬럼이라서"임이 증명된다
    const ok = await makeUser()
    expect((await admin().from('sessions').insert({
      user_id: ok.id, title: '정상', status: 'running', attempt: 1,
    })).error).toBeNull()

    const bad = await makeUser()
    const { error } = await admin().from('sessions').insert({
      user_id: bad.id, title: '날짜 조작', status: 'running', attempt: 1,
      service_date: '2000-01-01',
    } as never)
    // 428C9 = ERRCODE_GENERATED_ALWAYS. 메시지 문구는 PG 버전마다 달라지므로 코드로 못박는다.
    expect(error?.code).toBe('428C9')
    expect(error?.message).toContain('service_date')
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
    expect(Date.parse(data.running.started_at)).toBe(Date.parse(started))
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

describe('INV-5: 기록은 클라이언트로부터 불변', () => {
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
    expect(after!.title).toBe('원래 제목')
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
    //
    // 먼저 함수가 실제로 존재함을 증명한다. 안 그러면 "함수 없음"도 통과시키는 동어반복이 된다.
    const u = await makeUser()
    expect((await u.client.rpc('today_state')).error).toBeNull()

    const anon = anonClient()
    for (const fn of ['start_session', 'finish_session', 'today_state', 'finalize_overdue']) {
      const args = fn === 'start_session' ? { p_title: '익명' } : undefined
      const r = await anon.rpc(fn, args as never)
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
    expect(data!.status).toBe('running')
  })

  it('제목은 공백만일 수 없고 60 자를 넘을 수 없다', async () => {
    const u = await makeUser()
    expect((await u.client.rpc('start_session', { p_title: '   ' })).error?.code).toBe('23514')
    expect((await u.client.rpc('start_session', { p_title: 'ㄱ'.repeat(61) })).error?.code).toBe('23514')
    // 경계의 통과하는 쪽도 확인한다 — 60 자가 거부되면 그것도 버그다
    expect((await u.client.rpc('start_session', { p_title: 'ㄱ'.repeat(60) })).error).toBeNull()
  })
})

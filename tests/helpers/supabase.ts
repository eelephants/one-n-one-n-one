import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { serviceDateKST } from '@onehour/domain'

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

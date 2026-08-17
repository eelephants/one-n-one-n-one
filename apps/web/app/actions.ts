'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Session } from '@onehour/domain'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type TodayPayload = {
  server_now: string
  service_date: string
  /** 날짜 무관 전역 진행 세션. 경계를 걸친 세션을 잃지 않기 위해 sessions 와 별도로 온다 */
  running: Session | null
  /** 오늘 service_date 의 행들 (0~2개) */
  sessions: Session[]
}

export type StartState = { error?: string; title?: string }

/** 동시성으로 인한 실패. 다른 탭이 먼저 시작했을 뿐이므로 사용자에게 에러가 아니다. */
function isRaceError(message: string): boolean {
  return message.includes('already_running') || message.includes('day_exhausted')
}

export async function startSession(_prev: StartState, formData: FormData): Promise<StartState> {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: '한 글자 이상 입력해주세요.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('start_session', { p_title: title })

  if (error) {
    // 레이스는 조용히 넘긴다 — 재조회하면 B/C 가 보이는 게 정답이다.
    if (!isRaceError(error.message)) {
      console.error('start_session', error.code, error.message)
      // 입력한 제목을 돌려준다. 폼이 비어서 재렌더되면 사용자는 자기가 쓴 걸 잃는다.
      return {
        title,
        error: error.code === '23514'
          ? '제목이 너무 길거나 비어 있습니다.'
          : '지금은 시작할 수 없습니다. 잠시 뒤 다시 시도해주세요.',
      }
    }
  }

  revalidatePath('/')
  return {}
}

export async function finishSession() {
  const supabase = await createClient()
  const { error } = await supabase.rpc('finish_session')
  // 다른 탭이 먼저 끝냈으면 no_running_session 이 온다. 정상 상황이다.
  if (error && !error.message.includes('no_running_session')) {
    console.error('finish_session', error.code, error.message)
  }
  revalidatePath('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function deleteAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // auth.users 삭제에는 service_role 이 필요하다. 이 키는 서버 액션 밖으로 나가지 않는다.
  // sessions 는 on delete cascade 로 함께 지워진다 — 이래서 BEFORE DELETE 트리거를
  // 만들지 않았다 (spec D7).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    // Preview 배포에는 이 키를 넣지 않는다. `!` 로 단언하면 여기서 정체불명의 에러가 난다.
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (이 환경에서는 계정 삭제 불가)')
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  })
  const { error } = await admin.auth.admin.deleteUser(user.id)
  // 삼키면 안 되는 유일한 에러 경로다. 실패했는데 로그아웃시키면
  // 사용자는 자기 기록이 지워졌다고 믿는다.
  if (error) throw new Error(`account_delete_failed: ${error.message}`)

  await supabase.auth.signOut()
  redirect('/login')
}

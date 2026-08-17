'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Session } from '@onehour/domain'
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

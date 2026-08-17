import { redirect } from 'next/navigation'
import { signOut } from '@/app/actions'
import { createClient } from '@/lib/supabase/server'

// Phase 3 에서 오늘 화면(A/B/C)으로 교체된다. 지금은 인증만 확인한다.
export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <p className="text-sm text-neutral-500">{user.email}</p>
      <form action={signOut}>
        <button className="-m-3 p-3 text-sm text-neutral-600">로그아웃</button>
      </form>
    </main>
  )
}

'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const expired = useSearchParams().get('e') === 'expired'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const res = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm` },
    })
    setBusy(false)
    if (res.error) {
      // 침묵하면 두 번째 죽은 버튼이 된다. Supabase 는 연속 요청을 레이트리밋한다.
      setError(
        res.error.status === 429
          ? '조금 뒤에 다시 시도해주세요.'
          : '링크를 보내지 못했습니다. 잠시 뒤 다시 시도해주세요.',
      )
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <p className="text-base leading-relaxed text-neutral-600">
        메일로 링크를 보냈습니다.
        <br />
        <span className="text-neutral-500">{email}</span>
      </p>
    )
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      {expired && (
        <p role="status" className="text-sm text-neutral-600">
          링크가 만료되었습니다. 다시 받아주세요.
        </p>
      )}
      <label htmlFor="email" className="sr-only">
        이메일
      </label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        placeholder="이메일"
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-neutral-300 px-4 py-3 text-base outline-none placeholder:text-neutral-400 focus-visible:border-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      />
      <button
        type="submit"
        disabled={busy}
        aria-busy={busy}
        className="rounded-lg bg-neutral-900 px-4 py-3 text-base text-white disabled:opacity-50"
      >
        {busy ? '보내는 중' : '링크 받기'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-neutral-600">
          {error}
        </p>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">하루에 하나씩</h1>
        {/* 제약을 여기서 한 번은 말해준다. 빈 화면 원칙은 홈에 적용되는 것이고
            로그인 화면은 빈 상태가 아니다. */}
        <p className="text-sm text-neutral-500">하루에 딱 하나의 일을, 한 시간 동안만.</p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}

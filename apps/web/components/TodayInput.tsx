'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { startSession, type StartState } from '@/app/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="self-start rounded-lg bg-neutral-900 px-5 py-3 text-base text-white disabled:opacity-50"
    >
      {pending ? '시작하는 중' : '한 시간 시작'}
    </button>
  )
}

/**
 * 화면 A. 빈 화면이 기본값이라 인풋과 버튼 외에는 아무 문구도 두지 않는다 (철학 4).
 *
 * autoFocus 는 오늘 기록이 없을 때만 준다. 방금 중단하고 돌아온 사람에게 커서를 들이미는 건
 * 카피 없는 재촉이다.
 */
export function TodayInput({ autoFocus }: { autoFocus: boolean }) {
  const [state, action] = useActionState<StartState, FormData>(startSession, {})

  return (
    <form action={action} className="flex flex-col gap-3">
      <label htmlFor="title" className="sr-only">
        오늘 할 일
      </label>
      <input
        id="title"
        name="title"
        required
        autoFocus={autoFocus}
        maxLength={60}
        autoComplete="off"
        defaultValue={state.title ?? ''}
        placeholder="오늘 할 일 하나"
        className="w-full border-b border-neutral-300 bg-transparent pb-3 text-xl outline-none placeholder:text-neutral-400 focus-visible:border-neutral-900"
      />
      <SubmitButton />
      {state.error && (
        <p role="alert" className="text-sm text-neutral-600">
          {state.error}
        </p>
      )}
    </form>
  )
}

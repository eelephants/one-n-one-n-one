'use client'

import { useState } from 'react'
import { Nav } from '@/components/Nav'
import { deleteAccount, signOut } from '@/app/actions'

export default function SettingsPage() {
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <main className="mx-auto flex w-full max-w-sm flex-col gap-8 px-6 pt-12 pb-28">
        <form action={signOut}>
          <button className="-m-3 p-3 text-sm text-neutral-600">로그아웃</button>
        </form>

        {confirming ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-neutral-600">
              계정과 지금까지의 기록이 모두 삭제됩니다. 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <form action={deleteAccount}>
                <button className="-m-3 p-3 text-sm text-red-700">삭제하기</button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="-m-3 p-3 text-sm text-neutral-600"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="-m-3 self-start p-3 text-sm text-neutral-600"
          >
            계정 삭제
          </button>
        )}
      </main>
      <Nav current="/settings" />
    </>
  )
}

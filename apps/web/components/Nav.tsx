import Link from 'next/link'

const ITEMS = [
  { href: '/', label: '오늘' },
  { href: '/history', label: '기록' },
  { href: '/settings', label: '설정' },
] as const

/**
 * ⚠ layout.tsx 에 두지 않는다. 스펙상 화면 B 는 "남은 시간, 지금 하는 일 제목,
 * 다른 건 아무것도 없다" 이므로, 각 화면이 필요할 때만 직접 렌더한다.
 * (오늘 화면은 상태 A·C 에서만 그린다.)
 */
export function Nav({ current }: { current: '/' | '/history' | '/settings' }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-sm justify-center gap-2 px-6 py-2">
        {ITEMS.map(({ href, label }) => {
          const active = href === current
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`px-4 py-3 text-xs ${active ? 'text-neutral-900' : 'text-neutral-500'}`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

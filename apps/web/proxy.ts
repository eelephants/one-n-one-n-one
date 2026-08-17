import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

// Next 16 에서 middleware.ts 는 proxy.ts 로 이름이 바뀌었다 (export 도 middleware → proxy).
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // apple-icon 은 확장자 없이 /apple-icon?<hash> 로 서빙되므로 명시적으로 제외한다.
  // 안 그러면 로그아웃 상태에서 307 로 /login HTML 을 아이콘으로 반환한다.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-icon|icon|manifest.webmanifest|.*\\.(?:svg|png|ico)$).*)',
  ],
}

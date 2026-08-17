import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { redirectUrl } from '@/lib/request-url'

const PUBLIC_PATHS = ['/login', '/auth']

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * Supabase 인증 쿠키를 갱신하고, 로그인 여부에 따라 낙관적으로 리다이렉트한다.
 *
 * 여기서의 리다이렉트는 **UX 편의이지 보안 경계가 아니다** (Next 16 인증 가이드).
 * 진짜 인가는 데이터 가까이에서 한다 — RPC 가 auth.uid() 가 null 이면 unauthenticated 를
 * raise 하고, RLS 가 남의 행을 막는다. proxy 를 우회해도 데이터는 안 나온다.
 *
 * ponytail: getUser() 는 매 요청 Auth API 왕복이다. 이게 @supabase/ssr 에서 토큰 갱신을
 * 유발하는 방법이라 지금은 그대로 둔다. 지연이 문제가 되면 비대칭 JWT 서명키 + getClaims()
 * 로 바꿔 로컬 검증하면 왕복이 사라진다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // getSession() 이 아니라 getUser() — 쿠키의 JWT 를 서버에서 실제로 검증하고 갱신한다
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // redirectUrl 을 쓰는 이유는 lib/request-url.ts 주석 참조.
  // nextUrl.clone() 을 쓰면 호스트가 localhost 로 정규화돼서 127.0.0.1 로 들어온 사용자가
  // 쿠키를 잃고 /login ↔ / 사이를 무한 바운스한다.
  if (!user && !isPublic(path)) {
    return NextResponse.redirect(redirectUrl(request, '/login'))
  }
  if (user && path === '/login') {
    return NextResponse.redirect(redirectUrl(request, '/'))
  }

  return response
}

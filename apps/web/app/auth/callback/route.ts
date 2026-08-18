import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirectUrl } from '@/lib/request-url'

/**
 * PKCE 착지점 (`?code=`).
 *
 * 왜 /auth/confirm 과 둘 다 있나:
 * Supabase 무료 티어 + 기본 이메일 제공자는 **이메일 템플릿 수정을 허용하지 않는다**
 * ("Email template modification is not available for free tier projects").
 * 그래서 기본 템플릿의 {{ .ConfirmationURL }} 이 그대로 나가고, 그건 GoTrue /verify 를 거쳐
 * 여기로 `?code=` 를 준다. token_hash 만 받으면 프로덕션 로그인이 조용히 실패한다.
 *
 * 커스텀 SMTP 를 붙이면 템플릿을 token_hash 로 바꿀 수 있고, 그쪽이 기기 간 로그인까지 된다.
 * 앱이 이메일 설정에 따라 깨지지 않도록 두 경로를 모두 유지한다.
 *
 * 한계: PKCE 는 verifier 쿠키가 링크를 연 기기에 있어야 한다. 다른 기기에서 열면 실패한다.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(redirectUrl(request, '/'))
  }

  return NextResponse.redirect(redirectUrl(request, '/login', '?e=expired'))
}

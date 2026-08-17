import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirectUrl } from '@/lib/request-url'

/**
 * 매직링크 착지점. PKCE(`?code=` + exchangeCodeForSession)가 아니라 token-hash 플로우다.
 *
 * PKCE 는 verifier 쿠키가 **링크를 연 기기에** 있어야 해서, 폰으로 메일을 열면
 * 아무 설명 없이 /login 으로 되돌아간다. token-hash 는 기기에 묶이지 않는다.
 * (E2E 에서 admin.generateLink 로 링크를 뽑아 쓸 수 있다는 것도 같은 이유다.)
 *
 * 이메일 템플릿이 이 경로를 직접 가리키므로 GoTrue 의 /verify 를 거치지 않는다 —
 * redirect_to 허용목록 관리도 필요 없다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const token_hash = params.get('token_hash')
  const type = params.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    // redirectUrl 을 쓰는 이유는 그 파일의 주석 참조 — request.url 로 만들면 쿠키가 유실된다.
    if (!error) return NextResponse.redirect(redirectUrl(request, '/'))
  }

  // 만료됐거나 이미 쓴 링크. 이유를 알려준다 — 조용히 폼으로 되돌리면 사용자는 영문을 모른다.
  return NextResponse.redirect(redirectUrl(request, '/login', '?e=expired'))
}

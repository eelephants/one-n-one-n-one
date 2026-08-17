import type { NextRequest } from 'next/server'

/**
 * 리다이렉트 대상 URL 을 **실제 요청 호스트** 기준으로 만든다.
 *
 * Next 의 `request.url` 과 `request.nextUrl` 은 dev 서버에서 내부 바인드 호스트(localhost)로
 * 정규화된다. 사용자가 127.0.0.1 로 들어와도 localhost 로 리다이렉트되고, 세션 쿠키는
 * 호스트가 다르면 따라가지 않으므로 로그인이 **조용히** 실패한다 (에러도 안 뜬다).
 * 리버스 프록시 뒤에 두면 프로덕션에서도 같은 일이 난다.
 *
 * 경로는 항상 호출부가 하드코딩한 값이라 오픈 리다이렉트가 되지 않는다.
 * Host 헤더는 오리진을 복원하는 데만 쓴다.
 */
export function redirectUrl(request: NextRequest, pathname: string, search = ''): URL {
  const url = new URL(request.nextUrl.toString())
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host) {
    url.host = host
    const proto = request.headers.get('x-forwarded-proto')
    if (proto) url.protocol = `${proto}:`
  }
  url.pathname = pathname
  url.search = search
  return url
}

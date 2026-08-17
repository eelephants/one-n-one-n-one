import type { MetadataRoute } from 'next'

/**
 * display 를 'standalone' 으로 두지 않는다.
 *
 * 서비스워커 없이 standalone 을 켜면 오프라인에서 앱 크롬 안에 브라우저 에러 페이지가 뜬다.
 * 그리고 이 제품의 모바일 경험은 앱인토스 미니앱이 담당하므로, 웹을 설치형으로 만들 이유가 없다.
 * 매니페스트는 아이콘·이름·테마색을 위해 남긴다.
 *
 * 웹을 설치형으로 가려면 오프라인 폴백 + 갱신 전략까지 같이 와야 한다. 지금은 범위 밖.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '하루에 하나씩',
    short_name: '하루하나',
    description: '하루에 딱 하나의 일을, 한 시간 동안만.',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    theme_color: '#171717',
    lang: 'ko',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}

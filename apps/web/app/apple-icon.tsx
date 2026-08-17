import { ImageResponse } from 'next/og'

// next/og 는 next 에 포함돼 있다. 아이콘 하나 만들자고 이미지 툴체인을 들이지 않는다.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#171717',
          color: '#ffffff',
          fontSize: 104,
        }}
      >
        1
      </div>
    ),
    size,
  )
}

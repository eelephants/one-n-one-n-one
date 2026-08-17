import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

const DESCRIPTION = '하루에 딱 하나의 일을, 한 시간 동안만.'

export const metadata: Metadata = {
  title: '하루에 하나씩',
  description: DESCRIPTION,
  applicationName: '하루에 하나씩',
  openGraph: {
    title: '하루에 하나씩',
    description: DESCRIPTION,
    locale: 'ko_KR',
    type: 'website',
  },
  // 개인 기록 앱이라 검색에 노출될 이유가 없다.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#171717',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}

import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

function localEnv(): Record<string, string> {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const env: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    const [, key, value] = m ?? []
    if (key) env[key] = value ?? ''
  }
  return env
}

/**
 * 가입 → 등록 → 완료 → 히스토리.
 *
 * 매직링크는 메일함을 파싱하지 않고 admin.generateLink 로 token_hash 를 받아 연다.
 * 그 뒤 경로(우리 /auth/confirm → verifyOtp → 쿠키 → /)는 프로덕션과 완전히 같다.
 * PKCE(?code=)였다면 이 방식이 아예 불가능하다 — generateLink 에는 code challenge 가 없어서
 * implicit 로 떨어지고 토큰이 URL fragment 로 와서 서버가 읽을 수 없다. token-hash 를 쓴 이유 중 하나다.
 */
test('가입 → 등록 → 완료 → 히스토리', async ({ page, baseURL }) => {
  const env = localEnv()
  const email = `e2e-${Date.now()}@example.test`
  const admin = createClient(env.API_URL!, env.SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  await admin.auth.admin.createUser({ email, email_confirm: true })
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  expect(error).toBeNull()
  const tokenHash = data?.properties?.hashed_token
  expect(tokenHash).toBeTruthy()

  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`)
  await expect(page).toHaveURL(`${baseURL}/`)

  // 화면 A
  const input = page.getByPlaceholder('오늘 할 일 하나')
  await expect(input).toBeVisible()
  await input.fill('E2E 테스트 통과시키기')
  await page.getByRole('button', { name: '한 시간 시작' }).click()

  // 화면 B — 제목·카운트다운·끝내기 외에 아무것도 없다
  await expect(page.getByRole('heading', { name: 'E2E 테스트 통과시키기' })).toBeVisible()
  await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible()
  await expect(page.locator('nav')).toHaveCount(0)

  await page.getByRole('button', { name: '끝내기' }).click()

  // 중단하면 그날 1 회 재시작할 수 있고, 방금 한 기록은 화면에 남아 있어야 한다
  await expect(page.getByText('E2E 테스트 통과시키기')).toBeVisible()
  await expect(page.getByText(/\d+분 했어요/)).toBeVisible()
  await expect(page.getByPlaceholder('오늘 할 일 하나')).toBeVisible()

  // 히스토리
  await page.getByRole('link', { name: '기록' }).click()
  await expect(page).toHaveURL(`${baseURL}/history`)
  await expect(page.getByText('E2E 테스트 통과시키기')).toBeVisible()
  await expect(page.getByText('누적')).toBeVisible()

  // 철학 2: 부정적 라벨은 어디에도 없다
  await expect(page.getByText(/실패|미달성|놓쳤|화이팅/)).toHaveCount(0)
})

import { defineConfig } from '@playwright/test'

const PORT = 3300
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  // 로컬 Supabase 를 공유하므로 병렬로 돌리지 않는다
  workers: 1,
  use: { baseURL: BASE_URL },
  webServer: {
    // dev 가 아니라 프로덕션 빌드로 돈다 — 실제로 배포되는 것을 검증한다
    command: `npm -w apps/web run build && npm -w apps/web run start -- -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
})

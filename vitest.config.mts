import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 20_000,
    // 불변 규칙 테스트는 같은 테이블의 유니크 인덱스를 공유하므로 순차 실행한다
    fileParallelism: false,
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
})

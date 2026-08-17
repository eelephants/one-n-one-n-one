import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 20_000,
    // 불변 규칙 테스트는 같은 테이블의 유니크 인덱스를 공유하므로 순차 실행한다
    fileParallelism: false,
    include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'apps/**'],
  },
  resolve: {
    alias: {
      // 워크스페이스 심볼릭 링크에 의존하지 않고 소스를 직접 가리킨다
      '@onehour/domain/database.types': fileURLToPath(
        new URL('./packages/domain/src/database.types.ts', import.meta.url),
      ),
      '@onehour/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url),
      ),
    },
  },
})

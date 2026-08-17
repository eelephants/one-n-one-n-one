import { execFileSync } from 'node:child_process'

/**
 * 로컬 Supabase 의 URL/키를 process.env 로 주입한다.
 * 키가 CLI 버전마다 달라질 수 있으므로 하드코딩하지 않고 매번 읽는다.
 *
 * supabase 가 안 떠 있어도 조용히 넘어간다 — 도메인 테스트는 DB 없이 돌아야 하기 때문이다.
 * 대신 invariants.test.ts 의 beforeAll 이 API_URL 부재를 시끄럽게 실패시킨다.
 */
export default function setup() {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return
  }
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2]
  }
}

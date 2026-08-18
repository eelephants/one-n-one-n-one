/**
 * 프로덕션 마이그레이션 푸시.
 *
 * `supabase db push` 기본 경로는 pooler 의 5432(session) 포트를 쓰는데,
 * 이 프로젝트의 pooler 는 **6543(transaction) 하나만 열려 있어서** ECONNREFUSED 가 난다.
 * (Network Restrictions 는 0.0.0.0/0 로 전체 허용 상태였다 — 에러 힌트가 가리키는 방향이 아니다.)
 * 직접 연결 db.<ref>.supabase.co 는 무료 플랜에서 IPv6 전용이라 IPv4 망에서는 못 쓴다.
 *
 * 그래서 --db-url 로 6543 을 명시한다.
 *
 *   SUPABASE_DB_PASSWORD='...' npm run db:push
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const pw = process.env.SUPABASE_DB_PASSWORD
if (!pw) {
  console.error('SUPABASE_DB_PASSWORD 가 필요합니다:')
  console.error("  SUPABASE_DB_PASSWORD='비밀번호' npm run db:push")
  process.exit(2)
}

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const host = process.env.SUPABASE_POOLER_HOST ?? 'aws-0-ap-northeast-2.pooler.supabase.com'
const url = `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${host}:6543/postgres`

console.log(`push → ${ref} (pooler 6543)`)
try {
  execFileSync('npx', ['supabase', 'db', 'push', '--db-url', url, '--yes'], { stdio: 'inherit' })
} catch {
  process.exit(1)
}

/**
 * 계정 생성기.
 *
 * 신규 가입은 차단돼 있다 (config.toml `[auth] enable_signup = false`).
 * 저장소가 public 이고 Hobby 플랜은 프로덕션 URL 에 Vercel Authentication 을 걸 수 없어서,
 * 가입 차단이 유일한 방어선이기 때문이다. 그래서 계정은 service_role 로만 만든다.
 *
 * 로컬:
 *   npm run create-owner -- me@example.com
 *
 * 프로덕션:
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   npm run create-owner -- me@example.com
 *
 * 생성 후 로그인 링크는 `npm run login-link -- me@example.com` 으로 뽑는다.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const email = process.argv[2]
if (!email) {
  console.error('사용법: npm run create-owner -- me@example.com')
  process.exit(2)
}

let url = process.env.SUPABASE_URL
let key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
  const env = {}
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  url ??= env.API_URL
  key ??= env.SERVICE_ROLE_KEY
  console.log('로컬 Supabase 사용:', url)
}

const admin = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })

if (error) {
  // 이미 있으면 실패가 아니다 — 멱등하게 다룬다
  if (/already|exists|registered/i.test(error.message)) {
    console.log(`이미 존재: ${email}`)
    process.exit(0)
  }
  console.error('ERR', error.message)
  process.exit(1)
}
console.log(`생성됨: ${email} (${data.user.id})`)

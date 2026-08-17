/**
 * 로컬 개발용 로그인 링크 생성기.
 *
 * 이 앱은 비밀번호 로그인이 없어서 메일함을 열지 않으면 로컬에서 로그인할 수 없다.
 * admin.generateLink 로 token-hash 를 뽑아 /auth/confirm 링크를 만들어 준다.
 * (프로덕션과 같은 경로를 탄다 — 메일 전송만 건너뛴다.)
 *
 *   npm run login-link                 # phase3@example.test
 *   npm run login-link -- me@test.dev
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
const env = {}
for (const line of out.split('\n')) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}

const email = process.argv[2] ?? 'phase3@example.test'
const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3100'
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {})
const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
if (error) {
  console.error('ERR', error.message)
  process.exit(1)
}
console.log(`${origin}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`)

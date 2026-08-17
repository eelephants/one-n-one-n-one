/**
 * 히스토리 화면 검증용 시드. Phase 4 DoD 가 "데이터 0 / 1 / 100 개 모두 정상"이다.
 *
 *   npm run seed-history -- 100 me@test.dev
 *   npm run seed-history -- 0            # 지우기만
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
const env = {}
for (const line of out.split('\n')) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
  if (m) env[m[1]] = m[2]
}

const count = Number(process.argv[2] ?? 100)
const email = process.argv[3] ?? 'phase3@example.test'
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: users } = await admin.auth.admin.listUsers()
const user = users.users.find((u) => u.email === email)
if (!user) {
  console.error(`사용자 없음: ${email}`)
  process.exit(1)
}

await admin.from('sessions').delete().eq('user_id', user.id)

const DAY = 24 * 60 * 60 * 1000
const rows = []
for (let i = 1; i <= count; i++) {
  // 5 일에 한 번은 건너뛴다 (연속 일수가 끊기는 모습을 봐야 한다)
  if (i % 5 === 0) continue
  const started = new Date(Date.now() - i * DAY)
  const full = i % 3 !== 0
  const seconds = full ? 3600 : 12 * 60 + (i % 40)
  rows.push({
    user_id: user.id,
    title: `${i}일 전에 한 일`,
    attempt: 1,
    status: full ? 'completed' : 'stopped',
    started_at: started.toISOString(),
    finished_at: new Date(started.getTime() + seconds * 1000).toISOString(),
  })
}

if (rows.length) {
  const { error } = await admin.from('sessions').insert(rows)
  if (error) {
    console.error('ERR', error.message)
    process.exit(1)
  }
}
console.log(`${email}: ${rows.length} 행 시드 (요청 ${count}일치)`)

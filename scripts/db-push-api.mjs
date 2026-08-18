/**
 * Management API(HTTPS)로 마이그레이션 적용.
 *
 * 왜 이게 필요한가: 이 환경에서는 pooler 의 5432 와 6543 이 **둘 다** ECONNREFUSED 다.
 * (프로젝트는 ACTIVE_HEALTHY 이고 Network Restrictions 는 0.0.0.0/0 전체 허용이며
 *  pooler config API 는 6543 이 존재한다고 답한다 → 클라이언트 쪽 아웃바운드 차단으로 보인다.)
 * 직접 연결 db.<ref>.supabase.co 는 무료 플랜에서 IPv6 전용이라 대안이 못 된다.
 *
 * 그래서 443 으로 나가는 Management API 의 query 엔드포인트를 쓴다.
 * supabase_migrations.schema_migrations 에도 같이 기록해서 나중에 `supabase db push` 와
 * 어긋나지 않게 한다.
 *
 *   npm run db:push:api
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const token = process.env.SUPABASE_ACCESS_TOKEN ?? execFileSync(
  'security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' },
).trim()

const api = `https://api.supabase.com/v1/projects/${ref}/database/query`

async function run(query, label) {
  const res = await fetch(api, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`✗ ${label}\n${body.slice(0, 600)}`)
    process.exit(1)
  }
  console.log(`✓ ${label}`)
}

await run(
  `create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key, statements text[], name text);`,
  'migration 이력 테이블 확인',
)

const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  const version = f.split('_')[0]
  const sql = readFileSync(`supabase/migrations/${f}`, 'utf8')
  await run(
    `do $do$
     begin
       if not exists (select 1 from supabase_migrations.schema_migrations where version = '${version}') then
         ${sql}
         insert into supabase_migrations.schema_migrations(version, name)
         values ('${version}', '${f}');
       end if;
     end
     $do$;`,
    f,
  )
}
console.log('\n완료. 적용된 마이그레이션:')
await run("select version, name from supabase_migrations.schema_migrations order by version", '조회')

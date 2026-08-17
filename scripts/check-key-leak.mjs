/**
 * 배포 게이트: service_role 키가 클라이언트 번들에 들어갔는지 확인한다.
 *
 * 초안의 `curl / | grep service_role` 은 HTML 한 장에서 **키가 아닌 문자열**을 찾는다.
 * 실제 키가 JS 청크에 박혀 있어도 0 을 보고하므로, 검사하려는 것을 검사하지 못한다.
 * 여기서는 키 값 자체를 빌드 산출물 전체에서 찾는다.
 *
 *   npm run check-key-leak
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ENV_PATH = 'apps/web/.env.local'
const STATIC_DIR = 'apps/web/.next/static'

let key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) {
  try {
    const line = readFileSync(ENV_PATH, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='))
    key = line?.slice('SUPABASE_SERVICE_ROLE_KEY='.length).trim()
  } catch {
    /* 파일 없음 */
  }
}

if (!key) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 를 찾을 수 없습니다 (env 또는 apps/web/.env.local)')
  process.exit(2)
}

function* files(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else yield p
  }
}

const leaked = []
for (const f of files(STATIC_DIR)) {
  if (readFileSync(f, 'utf8').includes(key)) leaked.push(f)
}

if (leaked.length) {
  console.error('LEAK — service_role 키가 클라이언트 번들에 있습니다:')
  for (const f of leaked) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`ok — ${STATIC_DIR} 에 service_role 키 없음`)

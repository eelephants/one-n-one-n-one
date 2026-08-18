/**
 * 이메일 템플릿을 token_hash 방식으로 원격에 적용.
 *
 * **커스텀 SMTP 를 먼저 붙여야 한다** — 기본 제공자에서는 Supabase 가 템플릿 수정을 거부한다
 * ("Email template modification is not available for free tier projects").
 *
 * 적용되면 /auth/confirm (token_hash) 경로가 살아나고 **기기 간 로그인**이 된다.
 * 그 전까지는 /auth/callback (PKCE) 만 동작하고, 링크를 연 기기에서만 로그인된다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const token = process.env.SUPABASE_ACCESS_TOKEN ?? execFileSync(
  'security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' },
).trim()

const magic = readFileSync('supabase/templates/magic_link.html', 'utf8')
const confirm = readFileSync('supabase/templates/confirmation.html', 'utf8')

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mailer_subjects_magic_link: '하루에 하나씩 로그인 링크',
    mailer_templates_magic_link_content: magic,
    mailer_subjects_confirmation: '하루에 하나씩 시작하기',
    mailer_templates_confirmation_content: confirm,
  }),
})
const text = await res.text()
if (!res.ok) {
  console.error('✗ 템플릿 적용 실패')
  console.error(text.slice(0, 400))
  if (text.includes('free tier')) {
    console.error('\n→ 커스텀 SMTP 를 먼저 붙여야 한다: npm run setup-smtp -- 주소@example.com')
  }
  process.exit(1)
}
console.log('✓ 이메일 템플릿 적용됨 (token_hash 방식)')
console.log('  이제 /auth/confirm 이 동작하고 기기 간 로그인이 된다.')

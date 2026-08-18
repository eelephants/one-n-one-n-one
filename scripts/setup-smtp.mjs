/**
 * 커스텀 SMTP 설정 + 이메일 템플릿 적용.
 *
 * 무료 티어 + 기본 이메일 제공자에서는 두 가지가 막힌다:
 *   - 발송 시간당 2통 (rate_limit_email_sent)
 *   - **이메일 템플릿 수정 자체가 불가** → token_hash 플로우를 못 쓴다
 * 커스텀 SMTP 를 붙이면 둘 다 풀린다.
 *
 * 키는 인자나 환경변수로 받는다. 저장소에 남기지 않는다.
 *
 *   SMTP_PASS='re_xxx' npm run setup-smtp -- me@example.com
 *
 * 기본값은 Resend 다. 다른 공급자는 SMTP_HOST / SMTP_PORT / SMTP_USER 로 덮어쓴다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const senderEmail = process.argv[2]
const pass = process.env.SMTP_PASS
if (!senderEmail || !pass) {
  console.error("사용법: SMTP_PASS='re_xxx' npm run setup-smtp -- 보낼주소@example.com")
  console.error('  보낼주소는 Resend 에서 인증된 주소여야 한다.')
  console.error('  도메인 인증 전이면 onboarding@resend.dev 를 쓰고, 수신은 가입 이메일로만 된다.')
  process.exit(2)
}

const ref = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
const token = process.env.SUPABASE_ACCESS_TOKEN ?? execFileSync(
  'security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8' },
).trim()

const body = {
  smtp_host: process.env.SMTP_HOST ?? 'smtp.resend.com',
  smtp_port: Number(process.env.SMTP_PORT ?? 465),
  smtp_user: process.env.SMTP_USER ?? 'resend',
  smtp_pass: pass,
  smtp_admin_email: senderEmail,
  smtp_sender_name: '하루에 하나씩',
  // 기본 제공자일 때의 시간당 2통 제한을 푼다
  rate_limit_email_sent: Number(process.env.SMTP_RATE_LIMIT ?? 30),
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
if (!res.ok) {
  console.error('✗ SMTP 설정 실패\n' + (await res.text()).slice(0, 500))
  process.exit(1)
}
const cfg = await res.json()
console.log(`✓ SMTP 설정됨: ${cfg.smtp_host}:${cfg.smtp_port} (${cfg.smtp_admin_email})`)
console.log(`✓ 발송 제한: 시간당 ${cfg.rate_limit_email_sent}통`)
console.log('\n다음: npm run push-templates  (token_hash 이메일 템플릿 적용)')

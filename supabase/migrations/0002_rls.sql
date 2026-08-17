-- INV-5 의 절반: 쓰기 정책을 만들지 않는 것으로 수정·삭제를 막는다.
-- 나머지 절반(종료된 행의 변경 금지)은 0003 의 트리거가 담당한다.

alter table public.sessions enable row level security;
-- force row level security 는 쓰지 않는다: security definer RPC 가 테이블 소유자로
-- 실행되므로 FORCE 를 켜면 자기 RPC 의 쓰기까지 막힌다 (spec E14).

-- ⚠ Supabase 기본값을 가정하지 않는다. 최신 CLI 의 default privileges 는 public 스키마의
-- 새 테이블에 anon/authenticated/service_role 모두에게 DML 을 주지 않고 Dxtm
-- (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) 만 준다. 필요한 걸 전부 명시한다.
revoke all on table public.sessions from anon, authenticated;
grant select on table public.sessions to authenticated;

-- service_role 은 관리자 자격증명이다. 계정 삭제와 운영을 위해 필요하고,
-- 이 앱은 어차피 그 키를 배포에 싣는다 (spec INV-5 가 "클라이언트로부터 불변"인 이유).
-- 중요한 부작용: 이걸 주면 0003 의 트리거 테스트가 "권한이 없어서 막힘"이 아니라
-- "트리거가 막음"을 증명하게 된다 — INV-5 의 실제 방어선이 무엇인지 검증된다.
grant select, insert, update, delete on table public.sessions to service_role;

-- 읽기 정책 하나뿐. INSERT / UPDATE / DELETE 정책은 의도적으로 부재 = 전부 거부.
-- (select auth.uid()) 로 감싸면 행마다 재평가되지 않고 initplan 으로 한 번만 계산된다.
create policy sessions_select_own
  on public.sessions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- 하루에 하나씩 — 세션 테이블
-- ends_at 컬럼은 의도적으로 두지 않는다: 항상 started_at + 1 hour 이며,
-- 존재하지 않는 필드는 드리프트하거나 조작될 수 없다 (INV-2, spec D1).
--
-- pgcrypto 확장은 걸지 않는다: gen_random_uuid() 는 PG13 부터 pg_catalog 내장이다.

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null,
  attempt      smallint not null,

  -- INV-6: 하루 경계는 KST 04:00. 제약을 강제하는 주체(DB)가 키를 계산한다 (spec D2).
  -- lib/domain.ts 의 serviceDateKST() 가 이 식의 TS 미러다.
  -- timezone(text, timestamptz) 는 IMMUTABLE 이라 생성 컬럼으로 쓸 수 있다.
  -- (STABLE 인 것은 timestamptz::date 와 date_trunc(text, timestamptz) 인데 둘 다 여기 없다.)
  -- 주의: pg_dump 는 stored 생성 컬럼을 덤프하지 않고 복원 시 재계산한다. 즉 spec E5 의
  -- "기존 행은 재계산하지 않는다"는 dump/restore 를 건너면 성립하지 않는다. KST 는 1988 년
  -- 이후 +09:00 고정이라 실질 위험은 0 이지만, 타임존을 바꾸는 날에는 이게 함정이 된다.
  service_date date generated always as
    (((started_at at time zone 'Asia/Seoul') - interval '4 hours')::date) stored,

  constraint sessions_title_length
    check (char_length(btrim(title)) between 1 and 60),
  constraint sessions_status_valid
    check (status in ('running', 'completed', 'stopped')),
  constraint sessions_attempt_valid
    check (attempt in (1, 2)),

  -- INV-2 를 상태별로 못박는다. 이 제약 하나가 세 가지를 동시에 강제한다:
  --   running   → finished_at 없음
  --   completed → finished_at 이 정확히 started_at + 60분 (그 외 값은 completed 일 수 없다)
  --   stopped   → [started_at, started_at + 60분) 안. 60분을 채웠으면 stopped 가 아니다
  -- NTP 되감기(spec E11)도 하한으로 함께 막힌다.
  constraint sessions_timing_valid check (
    (status = 'running'   and finished_at is null)
    or (status = 'completed' and finished_at = started_at + interval '1 hour')
    or (status = 'stopped'   and finished_at >= started_at
                             and finished_at <  started_at + interval '1 hour')
  )
);

-- INV-1': 사용자·서비스일 기준 살아있거나 확정된 세션은 하나뿐
create unique index sessions_one_live_per_day
  on public.sessions (user_id, service_date)
  where status in ('running', 'completed');

-- INV-1'': 사용자·서비스일 기준 총 2행 상한.
-- attempt 컬럼이 존재하는 유일한 이유가 이 "그룹당 최대 N행"을 유니크 인덱스로 표현하는 것이다.
-- 히스토리 조회 (user_id = ? order by service_date desc) 도 이 인덱스를 후방 스캔으로 탄다.
create unique index sessions_attempt_per_day
  on public.sessions (user_id, service_date, attempt);

-- INV-3: 진행 중인 세션은 사용자당 전역 하나 (날짜 무관)
create unique index sessions_one_running
  on public.sessions (user_id)
  where status = 'running';
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
-- 세션의 생성·종료가 일어나는 유일한 경로.
-- 모든 definer 함수는 search_path 를 고정하고 스키마를 명시한다 (spec E10).

-- ⚠ Supabase 버전에 따라 public 스키마의 신규 함수가 anon/authenticated 에게 자동으로
-- EXECUTE 되어 있을 수 있다 (레거시 auto_expose_new_tables 동작). 그 grant 는 PUBLIC
-- 유사롤이 아니라 명시적 role grant 라서 `revoke ... from public` 으로는 안 지워진다.
-- 최신 CLI 는 자동 노출을 안 하지만, 어느 쪽이든 맞게 동작하도록 기본값을 끄고
-- 모든 revoke 에 롤 이름을 명시한다. 노출 여부는 테스트로 검증한다
-- (`anon 키로는 어떤 RPC 도 실행할 수 없다`).
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- ── 만료 세션 지연 확정 ────────────────────────────────────────────────
-- 60 분이 지났는데 아무도 안 닫은 running 행을 확정한다. 멱등.
-- 크론을 쓰지 않는다 (spec D4). 대신 start_session 과 today_state 양쪽에서 부른다 —
-- 쓰기 경로에만 두면 화면 C 에 갇힌 사용자가 아무 쓰기도 일으킬 수 없어 행이 영영 running 으로 남는다.
-- finished_at 을 now() 로 찍으면 3 일 뒤 접속한 사용자에게 3 일짜리 세션이 남는다 (spec D5).
--
-- 인자를 받지 않고 auth.uid() 를 쓴다. p_user 를 받으면 노출됐을 때 남의 세션을 닫는
-- 크로스테넌트 쓰기 프리미티브가 된다. 인자를 없애면 권한 설정이 틀려도 자기 행밖에 못 건드린다.
create or replace function public.finalize_overdue()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.sessions
     set status = 'completed',
         finished_at = started_at + interval '1 hour'
   where user_id = (select auth.uid())
     and status = 'running'
     and now() >= started_at + interval '1 hour';
$$;

-- ── 세션 시작 ─────────────────────────────────────────────────────────
create or replace function public.start_session(p_title text)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_today   date;
  v_attempt smallint;
  v_row     public.sessions;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- 여러 탭/기기의 동시 요청을 에러 대신 순서로 바꾼다 (spec E3).
  -- 그래도 충돌하면 유니크 인덱스가 최종 심판이다.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  perform public.finalize_overdue();

  v_today := ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date;

  -- INV-3
  if exists (select 1 from public.sessions
              where user_id = v_user and status = 'running') then
    raise exception 'already_running' using errcode = 'P0001';
  end if;

  -- INV-1': 그날 살아있거나 확정된 세션이 이미 있으면 끝
  if exists (select 1 from public.sessions
              where user_id = v_user
                and service_date = v_today
                and status in ('running', 'completed')) then
    raise exception 'day_exhausted' using errcode = 'P0001';
  end if;

  -- INV-1'': attempt 는 서버가 센다. 클라이언트는 보내지 않는다.
  select coalesce(max(attempt), 0) + 1 into v_attempt
    from public.sessions
   where user_id = v_user and service_date = v_today;

  if v_attempt > 2 then
    raise exception 'day_exhausted' using errcode = 'P0001';
  end if;

  insert into public.sessions (user_id, title, status, attempt)
  values (v_user, btrim(p_title), 'running', v_attempt)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 세션 종료 ─────────────────────────────────────────────────────────
-- 사용자에게 보이는 액션은 "끝내기" 하나. completed / stopped 구분은 시각의 함수이므로
-- 클라이언트가 고르게 두지 않는다 (spec D3).
create or replace function public.finish_session()
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_now  timestamptz := now();
  v_id   uuid;
  v_row  public.sessions;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select id into v_id
    from public.sessions
   where user_id = v_user and status = 'running'
     for update;

  if v_id is null then
    raise exception 'no_running_session' using errcode = 'P0001';
  end if;

  update public.sessions
     set status = case
                    when v_now >= started_at + interval '1 hour' then 'completed'
                    else 'stopped'
                  end,
         -- [시작, 시작+60분] 으로 클램프: 만료 확정과 NTP 되감기를 한 식으로 처리
         finished_at = least(greatest(v_now, started_at),
                             started_at + interval '1 hour')
   where id = v_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ── 오늘 화면이 필요한 전부 ────────────────────────────────────────────
-- server_now 는 클라이언트 시계 오차 보정용이다 (INV-4, spec E4).
--
-- stable 이 아니라 volatile + security definer 다. 이유 두 가지:
--   1) 만료 행을 여기서 확정해야 한다. 화면 C 에 갇힌 사용자는 버튼이 없어서
--      어떤 쓰기도 일으킬 수 없고, 그러면 그 행은 다음 start_session 까지 running 으로 남아
--      히스토리·연속 일수에서 통째로 빠진다.
--   2) 'running' 키는 service_date 로 필터하지 않는다. 03:30 KST 에 시작한 세션은
--      service_date 가 어제인데, 04:00 에 v_today 가 넘어가면 진행 중인 세션이 payload 에서
--      사라져 화면 A 가 뜬다. 사용자가 입력하면 already_running 이 나고 조용히 삼켜져서
--      04:30 까지 무반응 루프가 된다. 전역 running 을 따로 실어 보내 이걸 막는다.
--      ⚠ 이 술어를 되살리지 말 것.
--
-- to_jsonb(s.*) - 'user_id': 나중에 컬럼이 추가돼도 자동으로 클라이언트에 노출되지 않게.
create or replace function public.today_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid := (select auth.uid());
  v_today date;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  perform public.finalize_overdue();

  v_today := ((now() at time zone 'Asia/Seoul') - interval '4 hours')::date;

  return jsonb_build_object(
    'server_now',   now(),
    'service_date', v_today,
    -- 날짜 무관. 경계를 걸친 진행 중 세션을 잃지 않기 위해.
    'running', (select to_jsonb(s.*) - 'user_id'
                  from public.sessions s
                 where s.user_id = v_user and s.status = 'running'),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s.*) - 'user_id' order by s.attempt)
        from public.sessions s
       where s.user_id = v_user and s.service_date = v_today
    ), '[]'::jsonb)
  );
end;
$$;

-- ── INV-5: 종료된 기록은 누구도 못 바꾼다 ───────────────────────────────
-- BEFORE DELETE 트리거는 만들지 않는다: auth.users 의 on delete cascade 까지
-- 막혀서 계정 삭제가 실패한다 (spec D7). 삭제는 RLS 정책 부재로만 막는다.
create or replace function public.block_terminal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'running' then
    raise exception 'record_is_immutable' using errcode = 'P0001';
  end if;
  if new.user_id      is distinct from old.user_id
     or new.started_at is distinct from old.started_at
     or new.title      is distinct from old.title
     or new.attempt    is distinct from old.attempt then
    raise exception 'record_is_immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger sessions_block_terminal_mutation
  before update on public.sessions
  for each row execute function public.block_terminal_mutation();

-- ── 권한 ──────────────────────────────────────────────────────────────
-- 롤 이름을 명시한다. `from public` 만으로는 Supabase 의 기본 role grant 가 안 지워진다.
revoke all on function public.finalize_overdue()     from public, anon, authenticated;
revoke all on function public.start_session(text)    from public, anon, authenticated;
revoke all on function public.finish_session()       from public, anon, authenticated;
revoke all on function public.today_state()          from public, anon, authenticated;

grant execute on function public.finalize_overdue()  to authenticated;  -- /history 가 부른다
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.finish_session()    to authenticated;
grant execute on function public.today_state()       to authenticated;
-- 누적 통계.
--
-- 히스토리 화면은 최근 400 행만 가져온다(잔디·리스트에는 충분하다). 그런데 그 400 행을
-- 합산해서 "누적 시간"이라고 부르면 라벨이 거짓말이 된다 — 하루 최대 2 행이므로
-- 최악 200 일이면 값이 더 이상 자라지 않는다. 집계는 DB 에서 전체를 훑는다.
--
-- 분 계산은 lib/domain 의 elapsedMinutes 와 같은 규칙이다:
-- 반올림하되 최소 1 분 (20 초를 했어도 "0 분"이라고 말하지 않는다 — 철학 2).
-- 두 구현이 일치하는지는 tests/invariants.test.ts 가 실제로 대조한다.
create or replace function public.lifetime_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_minutes', coalesce(sum(
      greatest(1, round(extract(epoch from (finished_at - started_at)) / 60))
    ), 0)::int,
    'active_days', count(distinct service_date)::int
  )
  from public.sessions
  where user_id = (select auth.uid())
    and finished_at is not null;
$$;

revoke all on function public.lifetime_stats() from public, anon, authenticated;
grant execute on function public.lifetime_stats() to authenticated;

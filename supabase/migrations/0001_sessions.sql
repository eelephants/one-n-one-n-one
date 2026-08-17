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

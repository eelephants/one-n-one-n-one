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

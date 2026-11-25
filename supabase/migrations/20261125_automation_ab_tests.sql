-- Chromex Automations: optional A/B design previews
-- Run this once in the EXISTING project's Supabase SQL Editor.
-- No existing email images or automations are modified.
alter table public.automations
  add column if not exists ab_tests jsonb not null default '{}'::jsonb;

-- Keep the A/B metadata as a keyed object (email index => variations).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'automations_ab_tests_object_check'
      and conrelid = 'public.automations'::regclass
  ) then
    alter table public.automations
      add constraint automations_ab_tests_object_check
      check (jsonb_typeof(ab_tests) = 'object');
  end if;
end $$;

-- A winner cannot be changed or cleared once stored. Disabled A/B tests
-- retain their variants and winner. Only the frontend controls who can
-- choose a winner; existing automations RLS controls who can edit rows.
create or replace function public.automations_lock_ab_winner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_index text;
  previous_test jsonb;
  next_test jsonb;
  selected_id text;
begin
  for old_index, previous_test in
    select key, value from jsonb_each(coalesce(old.ab_tests, '{}'::jsonb))
  loop
    selected_id := previous_test->>'winner';
    if selected_id is null or selected_id = '' then
      continue;
    end if;
    next_test := new.ab_tests -> old_index;
    if next_test is null or next_test->>'winner' is distinct from selected_id then
      raise exception 'The selected A/B winner is locked and cannot be changed or removed';
    end if;
    if selected_id <> 'original' and not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(next_test->'variants') = 'array'
          then next_test->'variants' else '[]'::jsonb end
      ) as v where v->>'id' = selected_id
    ) then
      raise exception 'The winning A/B design cannot be removed';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists automations_lock_ab_winner_trigger on public.automations;
create trigger automations_lock_ab_winner_trigger
before update of ab_tests on public.automations
for each row execute function public.automations_lock_ab_winner();

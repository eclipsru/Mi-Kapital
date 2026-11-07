-- Tombstones let clients pull only what changed (updates + deletions) instead of the whole ledger.
-- Applied after 202611060001_initial_schema.sql.

create table if not exists public.ledger_deletions (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (owner_id, entry_id)
);

create index if not exists ledger_deletions_owner_deleted_idx
  on public.ledger_deletions (owner_id, deleted_at desc);

alter table public.ledger_deletions enable row level security;
alter table public.ledger_deletions force row level security;

drop policy if exists "Owners can read their own deletions" on public.ledger_deletions;
create policy "Owners can read their own deletions"
  on public.ledger_deletions for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can record their own deletions" on public.ledger_deletions;
create policy "Owners can record their own deletions"
  on public.ledger_deletions for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can forget their own deletions" on public.ledger_deletions;
create policy "Owners can forget their own deletions"
  on public.ledger_deletions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Every delete of a ledger row leaves a tombstone so other devices can remove their copy incrementally.
create or replace function public.record_ledger_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.ledger_deletions (owner_id, entry_id, deleted_at)
  values (old.owner_id, old.id, now())
  on conflict (owner_id, entry_id) do update set deleted_at = now();
  return old;
end;
$$;

revoke all on function public.record_ledger_deletion() from anon, authenticated;

drop trigger if exists ledger_entries_record_deletion on public.ledger_entries;
create trigger ledger_entries_record_deletion
  after delete on public.ledger_entries
  for each row execute function public.record_ledger_deletion();

-- Keep Realtime usable for incremental refreshes triggered by other devices.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ledger_deletions'
  ) then
    alter publication supabase_realtime add table public.ledger_deletions;
  end if;
end $$;

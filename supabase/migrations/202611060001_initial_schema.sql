-- Personal ledger records. Client access is always scoped to the authenticated owner.
create table if not exists public.ledger_entries (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('resale', 'job', 'consumerDebt', 'investor', 'category')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ledger_entries_owner_created_idx
  on public.ledger_entries (owner_id, created_at desc);
create index if not exists ledger_entries_owner_kind_idx
  on public.ledger_entries (owner_id, kind);

alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;

drop policy if exists "Owners can read their own ledger entries" on public.ledger_entries;
create policy "Owners can read their own ledger entries"
  on public.ledger_entries for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Owners can insert their own ledger entries" on public.ledger_entries;
create policy "Owners can insert their own ledger entries"
  on public.ledger_entries for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can update their own ledger entries" on public.ledger_entries;
create policy "Owners can update their own ledger entries"
  on public.ledger_entries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can delete their own ledger entries" on public.ledger_entries;
create policy "Owners can delete their own ledger entries"
  on public.ledger_entries for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Voice notes are stored as private objects, not embedded in ledger JSON.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 4194304, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'])
on conflict (id) do nothing;

drop policy if exists "Owners can read their voice notes" on storage.objects;
create policy "Owners can read their voice notes"
  on storage.objects for select to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners can upload their voice notes" on storage.objects;
create policy "Owners can upload their voice notes"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners can update their voice notes" on storage.objects;
create policy "Owners can update their voice notes"
  on storage.objects for update to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Owners can delete their voice notes" on storage.objects;
create policy "Owners can delete their voice notes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime is used to refresh other signed-in clients for the same account.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ledger_entries'
  ) then
    alter publication supabase_realtime add table public.ledger_entries;
  end if;
end $$;

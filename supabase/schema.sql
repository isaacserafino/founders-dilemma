-- ============================================================
-- Founder's Dilemma — Supabase schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- voters
-- Created client-side (UUID stored in localStorage).
-- ────────────────────────────────────────────────────────────
create table if not exists voters (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),
  metadata                    jsonb,        -- optional: user-agent, screen size, etc.
  device_fingerprint_hash     text,         -- sha256 hex; bound server-side (see index below)
  playthrough_completed_at    timestamptz   -- set when a full deck is finished once
);

-- One voter per device fingerprint (clears localStorage replay → same voter id).
alter table voters add column if not exists device_fingerprint_hash text;
alter table voters add column if not exists playthrough_completed_at timestamptz;
create unique index if not exists voters_device_fp_unique
  on voters (device_fingerprint_hash)
  where device_fingerprint_hash is not null;

-- ────────────────────────────────────────────────────────────
-- ideas
-- Seeded manually; never written by the client.
-- ────────────────────────────────────────────────────────────
create table if not exists ideas (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,           -- e.g. "ai-copilot"
  title        text not null,
  tagline      text not null,
  description  text,
  poster_url   text,                           -- Supabase Storage public URL
  video_url    text,                           -- Supabase Storage public URL
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- votes
-- One row per swipe; direction is LEFT / RIGHT / UP (super-like)
-- ────────────────────────────────────────────────────────────
create table if not exists votes (
  id          uuid primary key default gen_random_uuid(),
  voter_id    uuid not null references voters(id) on delete cascade,
  idea_id     uuid not null references ideas(id)  on delete cascade,
  direction   text not null check (direction in ('left', 'right', 'up')),
  swiped_at   timestamptz not null default now(),
  unique (voter_id, idea_id)
);

-- ────────────────────────────────────────────────────────────
-- Cap positive votes (right + up combined) per voter.
-- Each voter picks at most 3 favorites across the whole deck. Voters may
-- replay and change their votes (upsert by (voter_id, idea_id)); the count
-- below excludes the row being inserted/updated so flipping the same idea's
-- direction never trips the cap.
-- ────────────────────────────────────────────────────────────
-- SECURITY DEFINER + explicit search_path so the count below is not subject
-- to anon's RLS on `votes` (anon has no SELECT policy on votes by design).
create or replace function public.enforce_positive_vote_budget()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing int;
begin
  if new.direction in ('right', 'up') then
    select count(*) into v_existing
    from votes
    where voter_id = new.voter_id
      and idea_id <> new.idea_id
      and direction in ('right', 'up');

    if v_existing >= 3 then
      raise exception 'positive vote budget exceeded for voter %', new.voter_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_positive_vote_budget on votes;
create trigger trg_enforce_positive_vote_budget
  before insert or update on votes
  for each row execute function public.enforce_positive_vote_budget();

-- ────────────────────────────────────────────────────────────
-- engagements
-- Tracks how long a voter watched the video for each idea.
-- Upserted when drawer closes (or on pagehide).
-- ────────────────────────────────────────────────────────────
create table if not exists engagements (
  id              uuid primary key default gen_random_uuid(),
  voter_id        uuid not null references voters(id) on delete cascade,
  idea_id         uuid not null references ideas(id)  on delete cascade,
  watch_seconds   numeric(6,1) not null default 0,
  drawer_opens    int          not null default 0,
  updated_at      timestamptz  not null default now(),
  unique (voter_id, idea_id)
);

-- ────────────────────────────────────────────────────────────
-- sessions
-- One row per page-load / voting round.
-- ────────────────────────────────────────────────────────────
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  voter_id      uuid not null references voters(id) on delete cascade,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  ideas_seen    int not null default 0,
  user_agent    text,
  screen_width  int,
  screen_height int
);

-- ────────────────────────────────────────────────────────────
-- Row Level Security
-- Anon users can insert their own rows; never read others'.
-- ────────────────────────────────────────────────────────────

alter table voters      enable row level security;
alter table ideas       enable row level security;
alter table votes       enable row level security;
alter table engagements enable row level security;
alter table sessions    enable row level security;

drop policy if exists "anon insert voters" on voters;
drop policy if exists "anon no direct voter insert" on voters;

-- voters: created only via get_or_create_voter_by_fp (security definer); no direct anon insert.
create policy "anon no direct voter insert"
  on voters for insert
  to anon
  with check (false);

-- Resolve or create voter by device fingerprint (prevents replay after localStorage clear).
-- Returns the voter's existing positive votes so the client can seed the
-- picks-remaining budget and pre-populate the "liked" list when replaying.
drop function if exists public.get_or_create_voter_by_fp(text, jsonb);

create function public.get_or_create_voter_by_fp(
  p_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_positive jsonb := '[]'::jsonb;
begin
  if p_hash is null or char_length(p_hash) < 32 then
    raise exception 'invalid fingerprint hash';
  end if;

  select id
  into v_id
  from voters
  where device_fingerprint_hash = p_hash
  limit 1;

  if v_id is null then
    begin
      insert into voters (metadata, device_fingerprint_hash)
      values (p_metadata, p_hash)
      returning id into v_id;
    exception
      when unique_violation then
        select id into v_id
        from voters
        where device_fingerprint_hash = p_hash
        limit 1;
        if v_id is null then
          raise;
        end if;
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'idea_id', idea_id,
    'direction', direction
  )), '[]'::jsonb)
  into v_positive
  from votes
  where voter_id = v_id and direction in ('right', 'up');

  return jsonb_build_object(
    'id', v_id,
    'positive_votes', v_positive
  );
end;
$$;

revoke all on function public.get_or_create_voter_by_fp(text, jsonb) from public;
grant execute on function public.get_or_create_voter_by_fp(text, jsonb) to anon;

-- Create a fresh session atomically after closing abandoned open sessions.
create or replace function public.create_voter_session(
  p_voter_id uuid,
  p_user_agent text,
  p_screen_width int,
  p_screen_height int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  update sessions
  set completed_at = now()
  where voter_id = p_voter_id
    and completed_at is null;

  insert into sessions (voter_id, user_agent, screen_width, screen_height)
  values (p_voter_id, p_user_agent, p_screen_width, p_screen_height)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

revoke all on function public.create_voter_session(uuid, text, int, int) from public;
grant execute on function public.create_voter_session(uuid, text, int, int) to anon;

-- Mark session complete. Voters may replay and change their votes, so this
-- no longer locks the voter; the 3-positive cap is the only registration
-- limit (enforced by trg_enforce_positive_vote_budget).
create or replace function public.complete_voter_session(
  p_session_id uuid,
  p_ideas_seen int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sessions
  set completed_at = now(),
      ideas_seen = p_ideas_seen
  where id = p_session_id;

  if not found then
    raise exception 'session not found';
  end if;
end;
$$;

revoke all on function public.complete_voter_session(uuid, int) from public;
grant execute on function public.complete_voter_session(uuid, int) to anon;

-- ────────────────────────────────────────────────────────────
-- Additive engagement upsert.
-- Each delta row {idea_id, watch_seconds, drawer_opens} is added to the
-- voter's existing engagement row (or inserted if absent), so engagement
-- accumulates across replays instead of being overwritten by the latest
-- session's totals. Anon writes only flow through this RPC; the table
-- itself has no direct anon insert/update policies.
-- ────────────────────────────────────────────────────────────
create or replace function public.add_engagement_deltas(
  p_voter_id uuid,
  p_deltas jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_deltas) <> 'array' then
    raise exception 'p_deltas must be a JSON array';
  end if;

  insert into engagements (voter_id, idea_id, watch_seconds, drawer_opens, updated_at)
  select
    p_voter_id,
    (d->>'idea_id')::uuid,
    coalesce((d->>'watch_seconds')::numeric, 0),
    coalesce((d->>'drawer_opens')::int, 0),
    now()
  from jsonb_array_elements(p_deltas) as d
  where (d->>'idea_id') is not null
    and (
      coalesce((d->>'watch_seconds')::numeric, 0) > 0
      or coalesce((d->>'drawer_opens')::int, 0) > 0
    )
  on conflict (voter_id, idea_id) do update
    set watch_seconds = engagements.watch_seconds + excluded.watch_seconds,
        drawer_opens  = engagements.drawer_opens  + excluded.drawer_opens,
        updated_at    = now();
end;
$$;

revoke all on function public.add_engagement_deltas(uuid, jsonb) from public;
grant execute on function public.add_engagement_deltas(uuid, jsonb) to anon;

-- ideas: anyone can read (cards need title, poster, video)
drop policy if exists "public read ideas" on ideas;
create policy "public read ideas"
  on ideas for select
  to anon
  using (true);

drop policy if exists "anon insert votes" on votes;
drop policy if exists "anon update votes" on votes;
drop policy if exists "anon insert votes until playthrough done" on votes;
drop policy if exists "anon insert engagements" on engagements;
drop policy if exists "anon update engagements" on engagements;
drop policy if exists "anon insert engagements until playthrough done" on engagements;
drop policy if exists "anon update engagements until playthrough done" on engagements;
drop policy if exists "anon insert sessions" on sessions;
drop policy if exists "anon update sessions" on sessions;
drop policy if exists "anon insert sessions until playthrough done" on sessions;
drop policy if exists "anon update sessions until playthrough done" on sessions;

-- votes: anon may insert and update their own votes (PostgREST upsert path);
-- the 3-positive cap is enforced server-side by trg_enforce_positive_vote_budget.
create policy "anon insert votes"
  on votes for insert
  to anon
  with check (true);

create policy "anon update votes"
  on votes for update
  to anon
  using (true)
  with check (true);

-- engagements: writes flow exclusively through add_engagement_deltas
-- (security definer), so the table has no anon insert/update policy.
-- This guarantees deltas are added (not overwritten) on replay.

-- sessions: insert + update (complete_voter_session uses security definer)
create policy "anon insert sessions"
  on sessions for insert
  to anon
  with check (true);

create policy "anon update sessions"
  on sessions for update
  to anon
  using (true)
  with check (true);

-- ────────────────────────────────────────────────────────────
-- Seed ideas (replace poster_url / video_url after upload)
-- ────────────────────────────────────────────────────────────
insert into ideas (slug, title, tagline, description, sort_order) values
  ('madman',        'Madman',     'Real coding for everyone',   'A digital scientist in a laboratory environment that follows strict recipes, repeats processes, and makes autonomous choices to perform high-level engineering work.', 1),
  ('spoons',        'Spoons',     'Gamified wellbeing app',     'An addictive, high-engagement game that turns basic hygiene, hydration, and diet into a quest, helping neurodivergent founders manage energy through customizable daily wins.', 2),
  ('market-bot',    'Market-bot', 'Marketing cofounder',        'The non-technical bridge for technical founders; a marketing-heavy co-pilot that handles growth, soft skills, and outreach so you can stay focused on the code.', 3),
  ('unbabble',      'Unbabble',   'Frontier Bible translation', 'A "No Human In The Loop" (NHITL) engine designed for rapid-fire, high-accuracy scripture translation using frontier AI models without human intervention.', 4),
  ('meeting-place', 'The Meeting Place',    'Discipleship app', 'A comprehensive community hub for fellowship and evangelism, focusing on practical discipleship like food distribution, clothing, and ride-sharing.', 5),
  ('delta-ai',      'Delta AI',   'Self-improving software',    'An AI development tool that creates new skills for a universal shared library, allowing the tool''s collective intelligence and ability to improve progressively with every use.', 6),
  ('oi',            'Organic Intelligence', 'Verified job applicants', 'A platform solving the fake resume crisis by providing verified human workers through institutional verification, employer vetting, and rigorous identity screening.', 7);
on conflict (slug) do nothing;

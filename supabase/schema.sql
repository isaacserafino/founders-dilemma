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
  v_done boolean;
begin
  if p_hash is null or char_length(p_hash) < 32 then
    raise exception 'invalid fingerprint hash';
  end if;

  select id, (playthrough_completed_at is not null)
  into v_id, v_done
  from voters
  where device_fingerprint_hash = p_hash
  limit 1;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'playthrough_completed', v_done);
  end if;

  insert into voters (metadata, device_fingerprint_hash)
  values (p_metadata, p_hash)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'playthrough_completed', false);
exception
  when unique_violation then
    select id, (playthrough_completed_at is not null)
    into v_id, v_done
    from voters
    where device_fingerprint_hash = p_hash
    limit 1;
    if v_id is null then
      raise;
    end if;
    return jsonb_build_object('id', v_id, 'playthrough_completed', coalesce(v_done, false));
end;
$$;

revoke all on function public.get_or_create_voter_by_fp(text, jsonb) from public;
grant execute on function public.get_or_create_voter_by_fp(text, jsonb) to anon;

-- Mark session complete; if full deck, lock voter to one playthrough.
create or replace function public.complete_voter_session(
  p_session_id uuid,
  p_ideas_seen int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voter uuid;
  n_ideas int;
begin
  select voter_id into v_voter from sessions where id = p_session_id;
  if v_voter is null then
    raise exception 'session not found';
  end if;

  update sessions
  set completed_at = now(),
      ideas_seen = p_ideas_seen
  where id = p_session_id;

  select count(*)::int into n_ideas from ideas;

  if p_ideas_seen >= n_ideas and n_ideas > 0 then
    update voters
    set playthrough_completed_at = coalesce(playthrough_completed_at, now())
    where id = v_voter;
  end if;
end;
$$;

revoke all on function public.complete_voter_session(uuid, int) from public;
grant execute on function public.complete_voter_session(uuid, int) to anon;

-- ideas: anyone can read (cards need title, poster, video)
create policy "public read ideas"
  on ideas for select
  to anon
  using (true);

drop policy if exists "anon insert votes" on votes;
drop policy if exists "anon insert engagements" on engagements;
drop policy if exists "anon update engagements" on engagements;
drop policy if exists "anon insert sessions" on sessions;
drop policy if exists "anon update sessions" on sessions;

-- votes: blocked after this voter has finished one full playthrough
create policy "anon insert votes until playthrough done"
  on votes for insert
  to anon
  with check (
    not exists (
      select 1 from voters v
      where v.id = voter_id and v.playthrough_completed_at is not null
    )
  );

-- engagements: same gate (insert + upsert update)
create policy "anon insert engagements until playthrough done"
  on engagements for insert
  to anon
  with check (
    not exists (
      select 1 from voters v
      where v.id = voter_id and v.playthrough_completed_at is not null
    )
  );

create policy "anon update engagements until playthrough done"
  on engagements for update
  to anon
  using (
    not exists (
      select 1 from voters v
      where v.id = engagements.voter_id and v.playthrough_completed_at is not null
    )
  )
  with check (
    not exists (
      select 1 from voters v
      where v.id = engagements.voter_id and v.playthrough_completed_at is not null
    )
  );

-- sessions: no new rounds after playthrough completed (complete_voter_session uses definer)
create policy "anon insert sessions until playthrough done"
  on sessions for insert
  to anon
  with check (
    not exists (
      select 1 from voters v
      where v.id = voter_id and v.playthrough_completed_at is not null
    )
  );

create policy "anon update sessions until playthrough done"
  on sessions for update
  to anon
  using (
    not exists (
      select 1 from voters v
      where v.id = sessions.voter_id and v.playthrough_completed_at is not null
    )
  )
  with check (
    not exists (
      select 1 from voters v
      where v.id = sessions.voter_id and v.playthrough_completed_at is not null
    )
  );

-- ────────────────────────────────────────────────────────────
-- Seed ideas (replace poster_url / video_url after upload)
-- ────────────────────────────────────────────────────────────
insert into ideas (slug, title, tagline, description, sort_order) values
  ('ai-copilot',    'AI Copilot',        'Your second brain for every decision',    'An AI assistant that sits beside every founder, surfaces blind spots, and drafts options before you ask.', 1),
  ('equity-split',  'Equity Split',      'Fair shares, from day one',               'A structured conversation tool that guides co-founders through the equity-split talk with data and precedent.', 2),
  ('pivot-radar',   'Pivot Radar',       'Know when to turn before it is too late', 'Real-time signal aggregation that flags leading indicators your core metrics are about to shift.', 3),
  ('board-deck',    'Board Deck AI',     'Decks that write themselves',             'Pulls your metrics, drafts narrative slides, and formats them to your board template — in minutes.', 4),
  ('burn-lens',     'Burn Lens',         'See your runway in real time',            'Connects to your bank and payroll so you always know exactly how many months of runway remain.', 5),
  ('cofounder-fit', 'Co-founder Fit',    'Find the yin to your yang',              'A matchmaking layer for technical and operator co-founders based on work-style and value alignment.', 6),
  ('exit-sim',      'Exit Simulator',    'Model the outcome before you commit',     'Scenario planner that shows every stakeholder''s payout across acquisition, IPO, and secondary paths.', 7)
on conflict (slug) do nothing;

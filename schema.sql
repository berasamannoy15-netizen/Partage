-- ============================================================
-- Partage — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── pins ─────────────────────────────────────────────────────
create table if not exists pins (
  id              text        primary key default concat('pin-', extract(epoch from now())::text),
  title           text        not null,
  description     text        not null default '',
  image_url       text        not null default '',
  video_url       text,
  media_type      text        check (media_type in ('image','video')),
  category        text        not null default 'Aesthetic',
  tags            text[]      not null default '{}',
  likes           integer     not null default 0,
  comments_count  integer     not null default 0,
  board           text,
  aspect_ratio    text,
  location        text,
  author_name     text        not null default '',
  author_username text        not null default '',
  author_avatar   text        not null default '',
  metadata        jsonb,
  -- auth-ready: will reference auth.users(id) once Auth is enabled
  user_id         uuid,
  created_at      timestamptz not null default now()
);

-- ── comments ─────────────────────────────────────────────────
create table if not exists comments (
  id            uuid        primary key default uuid_generate_v4(),
  pin_id        text        not null references pins(id) on delete cascade,
  user_id       uuid,                        -- auth-ready
  author_name   text        not null,
  author_avatar text        not null default '',
  text          text        not null,
  likes         integer     not null default 0,
  created_at    timestamptz not null default now()
);

-- ── user_likes ───────────────────────────────────────────────
create table if not exists user_likes (
  pin_id    text  not null references pins(id) on delete cascade,
  user_id   text  not null,                  -- 'anonymous' until Auth is wired in
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

-- ── user_saves ───────────────────────────────────────────────
create table if not exists user_saves (
  pin_id     text  not null references pins(id) on delete cascade,
  user_id    text  not null,
  board_name text  not null default 'All Saved',
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

-- ── Helper RPC functions (called by db.ts) ───────────────────

create or replace function increment_likes(pin_id text)
returns void language sql as $$
  update pins set likes = likes + 1 where id = pin_id;
$$;

create or replace function decrement_likes(pin_id text)
returns void language sql as $$
  update pins set likes = greatest(0, likes - 1) where id = pin_id;
$$;

-- ── Row Level Security (RLS) — enable when Auth is ready ─────
-- Uncomment the block below after you enable Supabase Auth.

/*
alter table pins        enable row level security;
alter table comments    enable row level security;
alter table user_likes  enable row level security;
alter table user_saves  enable row level security;

-- Anyone can read pins
create policy "pins_select_all" on pins for select using (true);

-- Only the owner can insert/update/delete their own pins
create policy "pins_insert_owner" on pins for insert with check (auth.uid() = user_id);
create policy "pins_update_owner" on pins for update using (auth.uid() = user_id);
create policy "pins_delete_owner" on pins for delete using (auth.uid() = user_id);

-- Comments: read all, write own
create policy "comments_select_all" on comments for select using (true);
create policy "comments_insert_owner" on comments for insert with check (auth.uid() = user_id);

-- Likes & saves: manage your own rows
create policy "likes_all_own"  on user_likes using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "saves_all_own"  on user_saves using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
*/

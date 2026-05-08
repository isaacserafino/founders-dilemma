# Founder's Dilemma

Mobile-first swipe-to-vote app. Seven startup ideas, Tinder-style cards, full engagement tracking. Each voter has a budget of **3 positive votes** (Like + Love combined) to spend across the deck.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS
- **Framer Motion** — drag physics, spring reset, stack depth
- **Supabase** — Postgres + RLS + Storage (posters & videos)

## Quick start

```bash
# 1. Clone and install
npm install

# 2. Configure Supabase
cp .env.local.example .env.local
# → fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Provision the database
# Paste supabase/schema.sql into the Supabase SQL Editor and run it.

# 4. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Supabase setup

1. **SQL schema** — run `supabase/schema.sql` in the SQL Editor. It creates tables, RLS policies, and seeds the 7 starter ideas.
2. **Storage** — create a public bucket named `media`. Upload poster JPEGs and MP4 pitch videos. Update the `poster_url` / `video_url` columns in the `ideas` table with the public URLs.

## Data model

| Table | Purpose |
|---|---|
| `voters` | Anonymous voter UUID (created client-side) |
| `ideas` | The 7 idea cards (seeded via SQL) |
| `votes` | One row per swipe (`left` / `right` / `up`) |
| `engagements` | Watch time + drawer opens per voter/idea |
| `sessions` | One row per voting round |

## Swipe directions

| Gesture | Meaning |
|---|---|
| Swipe right | Like ✅ (counts toward your 3-pick budget) |
| Swipe left | Pass ❌ (unlimited) |
| Swipe up | Love ❤️‍🔥 (counts toward your 3-pick budget) |
| Tap "Watch pitch" | Opens video drawer |

Once you've spent all 3 positive votes, right/up swipes spring back to center — only Pass is allowed for the rest of the deck. Server-enforced via a `BEFORE INSERT` trigger on `votes`.

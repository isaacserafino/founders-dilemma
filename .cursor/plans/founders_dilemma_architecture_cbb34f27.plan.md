---
name: Founders Dilemma Architecture
overview: Minimal architecture for a mobile-first, swipe-to-vote app (~dozen users, one session day). Favor fewer deps and immediate writes; keep one “polish” layer for Tinder-like motion.
todos:
  - id: scaffold
    content: Scaffold Next.js (App Router) + TypeScript + Tailwind + Framer Motion + Supabase client
    status: pending
  - id: schema
    content: Provision Supabase tables (voters, ideas, votes, engagements, sessions) + RLS
    status: pending
  - id: state
    content: Game state with React useState/useReducer; voterId in localStorage; naive shuffle of 7 ideas
    status: pending
  - id: landing
    content: Build cinematic Landing screen
    status: pending
  - id: cardstack
    content: CardStack with Framer Motion drag + spring (constraints, rotate, opacity); static posters
    status: pending
  - id: drawer
    content: Video detail as fixed bottom sheet or full-screen overlay (CSS), lazy <video>
    status: pending
  - id: tracking
    content: Direct Supabase inserts/updates on swipe and drawer close; optional sendBeacon on pagehide
    status: pending
  - id: results
    content: End/Results screen with conversion CTA
    status: pending
isProject: false
---

# Founder's Dilemma — Logical Architecture

## Audience and constraints

Optimize for **implementation surface area**, not throughput. Prefer “almost vanilla” where a library does not clearly buy speed or UX.

## Stack

Next.js (App Router) + TypeScript + Tailwind + **Framer Motion** (swipe only) + Supabase (Postgres + Storage + RLS). 

## What to use


| Optimization Feature  | Verdict                                                                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Framer Motion**     | **Keep** for Tinder-like swipe. A convincing throw, stack offset, and spring reset in raw pointer + CSS is doable but usually *more* code and tuning than one `motion` card with `drag` + `dragConstraints`. If you later delete it, replace with `@use-gesture/react` + CSS transitions—not “free” vanilla. |
|                       |                                                                                                                                                                                                                                                                                                              |
| **Prefetch next + 1** | **Relax.** Use `preload="metadata"` (or `none` until drawer open) on `<video>`. Optional: load next poster `Image` when index advances—no dedicated prefetch pipeline.                                                                                                                                       |
| **LQIP**              | **Skip unless trivial.** Small WebP posters + `placeholder="blur"` on `next/image` if you already use static imports; skip blurhash/data-URL machinery.                                                                                                                                                      |
| **Route handlers**    | Client → Supabase with anon key + RLS is the default; edge does not matter at this scale.                                                                                                                                                                                                                    |


## Flow

`Landing` → `Game` (CardStack) → **video sheet / overlay** (lazy MP4) → repeat ×7 → `Results`.

## State 

- `voterId` in `localStorage` (UUID), created on first visit.
- Shuffled list of 7 ideas in component state (or reducer).
- Optional: single “current engagement” row id or merge writes per idea—keep schema simple.

## Media / performance 

- Supabase Storage URLs; one `<video>` when sheet is open; poster `Image` on cards.
- No separate “engagement buffer” abstraction unless one `useRef` array is enough for a last-chance flush (prefer direct writes).

## Suggested schema

Unchanged from prior plan: `voters`, `ideas`, `votes`, `engagements`, `sessions` with RLS (anon insert scoped by `voter_id`).

## Aesthetic without the cut stack

Motion comes from **Framer on the cards** (drag, slight rotation, next card peek), typography, spacing, full-bleed posters, and a **CSS** sheet (backdrop, rounded top, shadow)—not from extra data or infra layers.


// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma

export type SwipeDirection = "left" | "right" | "up";

export interface Idea {
  id: string;
  slug: string;
  title: string;
  tagline: string;
  description: string | null;
  poster_url: string | null;
  video_url: string | null;
  sort_order: number;
  created_at: string;
}

export interface Vote {
  id: string;
  voter_id: string;
  idea_id: string;
  direction: SwipeDirection;
  swiped_at: string;
}

export interface Engagement {
  id: string;
  voter_id: string;
  idea_id: string;
  watch_seconds: number;
  drawer_opens: number;
  updated_at: string;
}

export interface Session {
  id: string;
  voter_id: string;
  started_at: string;
  completed_at: string | null;
  ideas_seen: number;
  user_agent: string | null;
  screen_width: number | null;
  screen_height: number | null;
}

/** Per-idea engagement accumulated in memory before flushing */
export interface EngagementAccum {
  ideaId: string;
  watchSeconds: number;
  drawerOpens: number;
}

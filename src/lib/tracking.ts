// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { supabase } from "./supabase";
import type { SwipeDirection, EngagementAccum } from "@/types";

// ─── Votes ────────────────────────────────────────────────────────────────────

export async function recordVote(
  voterId: string,
  ideaId: string,
  direction: SwipeDirection
): Promise<void> {
  const { error } = await supabase.from("votes").insert({
    voter_id: voterId,
    idea_id: ideaId,
    direction,
  });

  if (error) {
    console.error("[tracking] vote insert failed", error.message);
  }
}

// ─── Engagements ──────────────────────────────────────────────────────────────

/** Upsert engagement row for a single idea. */
export async function flushEngagement(
  voterId: string,
  accum: EngagementAccum
): Promise<void> {
  if (accum.watchSeconds === 0 && accum.drawerOpens === 0) return;

  const { error } = await supabase.from("engagements").upsert(
    {
      voter_id: voterId,
      idea_id: accum.ideaId,
      watch_seconds: accum.watchSeconds,
      drawer_opens: accum.drawerOpens,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "voter_id,idea_id" }
  );

  if (error) {
    console.error("[tracking] engagement upsert failed", error.message);
  }
}

/**
 * Best-effort flush on pagehide. Uses `fetch` with `keepalive` (not `sendBeacon`)
 * so we can send Supabase REST auth headers and upsert `Prefer`; `sendBeacon`
 * cannot set custom headers.
 */
export function flushEngagementsOnExit(
  voterId: string,
  accums: EngagementAccum[]
): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  const rows = accums
    .filter((a) => a.watchSeconds > 0 || a.drawerOpens > 0)
    .map((a) => ({
      voter_id: voterId,
      idea_id: a.ideaId,
      watch_seconds: a.watchSeconds,
      drawer_opens: a.drawerOpens,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  const url = `${supabaseUrl}/rest/v1/engagements?on_conflict=voter_id,idea_id`;
  const payload = JSON.stringify(rows);

  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: payload,
  });
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(voterId: string): Promise<string | null> {
  const now = new Date().toISOString();

  // Close abandoned sessions so we do not accumulate open rows per voter.
  await supabase
    .from("sessions")
    .update({ completed_at: now })
    .eq("voter_id", voterId)
    .is("completed_at", null);

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      voter_id: voterId,
      user_agent: navigator.userAgent,
      screen_width: screen.width,
      screen_height: screen.height,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[tracking] session create failed", error.message);
    return null;
  }
  return data.id;
}

export async function completeSession(
  sessionId: string,
  ideasSeen: number
): Promise<void> {
  const { error } = await supabase.rpc("complete_voter_session", {
    p_session_id: sessionId,
    p_ideas_seen: ideasSeen,
  });

  if (error) {
    console.error("[tracking] complete_voter_session failed", error.message);
  }
}

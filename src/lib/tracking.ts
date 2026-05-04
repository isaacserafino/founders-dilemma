// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { supabase } from "./supabase";
import type { SwipeDirection, EngagementAccum } from "@/types";

const RETRY_DELAYS_MS = [0, 350, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOperation(
  operationName: string,
  operation: () => Promise<{ error: { message: string } | null }>
): Promise<boolean> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    // During page-hide/unload, delayed retries are unlikely to run reliably.
    if (attempt > 0 && typeof document !== "undefined" && document.visibilityState === "hidden") {
      return false;
    }

    if (RETRY_DELAYS_MS[attempt] > 0) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }

    const { error } = await operation();
    if (!error) return true;

    const isLastAttempt = attempt === RETRY_DELAYS_MS.length - 1;
    if (isLastAttempt) {
      console.error(`[tracking] ${operationName} failed`, error.message);
      return false;
    }
  }

  return false;
}

// ─── Votes ────────────────────────────────────────────────────────────────────

export async function recordVote(
  voterId: string,
  ideaId: string,
  direction: SwipeDirection
): Promise<boolean> {
  return retryOperation("vote insert", async () =>
    supabase.from("votes").insert({
      voter_id: voterId,
      idea_id: ideaId,
      direction,
    })
  );
}

// ─── Engagements ──────────────────────────────────────────────────────────────

/** Upsert engagement row for a single idea. */
export async function flushEngagement(
  voterId: string,
  accum: EngagementAccum
): Promise<boolean> {
  if (accum.watchSeconds === 0 && accum.drawerOpens === 0) return true;

  return retryOperation("engagement upsert", async () =>
    supabase.from("engagements").upsert(
      {
        voter_id: voterId,
        idea_id: accum.ideaId,
        watch_seconds: accum.watchSeconds,
        drawer_opens: accum.drawerOpens,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "voter_id,idea_id" }
    )
  );
}

/**
 * Best-effort flush used during page lifecycle transitions. Uses `fetch` with
 * `keepalive` (not `sendBeacon`) so we can send Supabase REST auth headers and
 * upsert `Prefer`; `sendBeacon` cannot set custom headers.
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
  const { data, error } = await supabase.rpc("create_voter_session", {
    p_voter_id: voterId,
    p_user_agent: navigator.userAgent,
    p_screen_width: screen.width,
    p_screen_height: screen.height,
  });

  if (error) {
    console.error("[tracking] create_voter_session failed", error.message);
    return null;
  }

  if (typeof data !== "string") {
    console.error("[tracking] create_voter_session returned invalid id");
    return null;
  }

  return data;
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

/**
 * Best-effort session completion during page lifecycle transitions.
 * Uses `keepalive` so the request can still be sent while the page unloads.
 */
export function completeSessionOnExit(
  sessionId: string,
  ideasSeen: number
): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  const url = `${supabaseUrl}/rest/v1/rpc/complete_voter_session`;
  const payload = JSON.stringify({
    p_session_id: sessionId,
    p_ideas_seen: ideasSeen,
  });

  void fetch(url, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: payload,
  });
}

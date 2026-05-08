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

/**
 * Record (or change) a voter's swipe on a single idea. Uses upsert by
 * (voter_id, idea_id) so a voter may replay the deck and overwrite a
 * prior swipe; the 3-positive cap is enforced server-side via
 * trg_enforce_positive_vote_budget.
 */
export async function recordVote(
  voterId: string,
  ideaId: string,
  direction: SwipeDirection
): Promise<boolean> {
  return retryOperation("vote upsert", async () =>
    supabase.from("votes").upsert(
      {
        voter_id: voterId,
        idea_id: ideaId,
        direction,
        swiped_at: new Date().toISOString(),
      },
      { onConflict: "voter_id,idea_id" }
    )
  );
}

// ─── Engagements ──────────────────────────────────────────────────────────────

interface EngagementDeltaPayload {
  idea_id: string;
  watch_seconds: number;
  drawer_opens: number;
}

function toDeltaPayload(accum: EngagementAccum): EngagementDeltaPayload {
  return {
    idea_id: accum.ideaId,
    watch_seconds: accum.watchSeconds,
    drawer_opens: accum.drawerOpens,
  };
}

/**
 * Add a single engagement delta to the voter's running totals via the
 * additive `add_engagement_deltas` RPC. The accumulator passed here must
 * represent the *unflushed* delta since the last flush — the server adds it
 * to the existing row so totals accumulate across replays.
 */
export async function flushEngagement(
  voterId: string,
  accum: EngagementAccum
): Promise<boolean> {
  if (accum.watchSeconds === 0 && accum.drawerOpens === 0) return true;

  return retryOperation("engagement delta", async () =>
    supabase.rpc("add_engagement_deltas", {
      p_voter_id: voterId,
      p_deltas: [toDeltaPayload(accum)],
    })
  );
}

/**
 * Best-effort delta flush used during page lifecycle transitions. Uses
 * `fetch` with `keepalive` (not `sendBeacon`) so we can send Supabase REST
 * auth headers; `sendBeacon` cannot set custom headers. Routed through the
 * additive RPC so values accumulate rather than overwrite.
 */
export function flushEngagementsOnExit(
  voterId: string,
  accums: EngagementAccum[]
): void {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;

  const deltas = accums
    .filter((a) => a.watchSeconds > 0 || a.drawerOpens > 0)
    .map(toDeltaPayload);

  if (deltas.length === 0) return;

  const url = `${supabaseUrl}/rest/v1/rpc/add_engagement_deltas`;
  const payload = JSON.stringify({
    p_voter_id: voterId,
    p_deltas: deltas,
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

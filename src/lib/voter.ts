// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { supabase } from "./supabase";
import { getDeviceFingerprintHash } from "./deviceFingerprint";

const VOTER_KEY = "fd_voter_id";

/** A previously-recorded positive vote returned from the bootstrap RPC. */
export interface PositiveVote {
  ideaId: string;
  direction: "right" | "up";
}

export type VoterBootstrap = {
  voterId: string;
  /**
   * Positive votes (right + up) this voter has already cast. Used to seed
   * the picks-remaining budget and pre-populate the "liked" list when the
   * voter replays the deck. The 3-positive cap is enforced server-side
   * regardless of this list.
   */
  positiveVotes: PositiveVote[];
};

type RpcVoterRow = {
  id: string;
  positive_votes: PositiveVote[];
};

function parsePositiveVotes(raw: unknown): PositiveVote[] {
  if (!Array.isArray(raw)) return [];
  const out: PositiveVote[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ideaId = o.idea_id;
    const direction = o.direction;
    if (typeof ideaId !== "string") continue;
    if (direction !== "right" && direction !== "up") continue;
    out.push({ ideaId, direction });
  }
  return out;
}

function parseRpcPayload(raw: unknown): RpcVoterRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "string") return null;
  return {
    id,
    positive_votes: parsePositiveVotes(o.positive_votes),
  };
}

/**
 * Returns the voter id (bound to device fingerprint) and the positive votes
 * the voter has previously registered. Voters may replay and change votes;
 * the server caps total positive votes at 3.
 */
export async function getOrCreateVoter(): Promise<VoterBootstrap> {
  let fp: string;
  try {
    fp = await getDeviceFingerprintHash();
  } catch {
    fp = "";
  }

  const metadata = {
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
  };

  const { data: raw, error: rpcError } = await supabase.rpc(
    "get_or_create_voter_by_fp",
    { p_hash: fp, p_metadata: metadata }
  );

  const row = parseRpcPayload(raw);

  if (!rpcError && row) {
    localStorage.setItem(VOTER_KEY, row.id);
    return {
      voterId: row.id,
      positiveVotes: row.positive_votes,
    };
  }

  if (rpcError) {
    console.error("[voter] get_or_create_voter_by_fp failed", rpcError.message);
  }

  const existing = localStorage.getItem(VOTER_KEY);
  if (existing) {
    return { voterId: existing, positiveVotes: [] };
  }

  const fallback = crypto.randomUUID();
  localStorage.setItem(VOTER_KEY, fallback);
  return { voterId: fallback, positiveVotes: [] };
}

/** @deprecated Prefer getOrCreateVoter when you need prior-vote state. */
export async function getOrCreateVoterId(): Promise<string> {
  const v = await getOrCreateVoter();
  return v.voterId;
}

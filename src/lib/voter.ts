// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { supabase } from "./supabase";
import { getDeviceFingerprintHash } from "./deviceFingerprint";

const VOTER_KEY = "fd_voter_id";

export type VoterBootstrap = {
  voterId: string;
  /** True after this voter has finished a full deck (server-side). */
  playthroughCompleted: boolean;
};

type RpcVoterRow = {
  id: string;
  playthrough_completed?: boolean;
};

function parseRpcPayload(raw: unknown): RpcVoterRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "string") return null;
  return {
    id,
    playthrough_completed:
      typeof o.playthrough_completed === "boolean"
        ? o.playthrough_completed
        : Boolean(o.playthrough_completed),
  };
}

/**
 * Returns voter id (bound to device fingerprint) and whether they already
 * finished one full playthrough.
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
      playthroughCompleted: Boolean(row.playthrough_completed),
    };
  }

  if (rpcError) {
    console.error("[voter] get_or_create_voter_by_fp failed", rpcError.message);
  }

  const existing = localStorage.getItem(VOTER_KEY);
  if (existing) {
    return { voterId: existing, playthroughCompleted: false };
  }

  const fallback = crypto.randomUUID();
  localStorage.setItem(VOTER_KEY, fallback);
  return { voterId: fallback, playthroughCompleted: false };
}

/** @deprecated Prefer getOrCreateVoter when you need playthrough state. */
export async function getOrCreateVoterId(): Promise<string> {
  const v = await getOrCreateVoter();
  return v.voterId;
}

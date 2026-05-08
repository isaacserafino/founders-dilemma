// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import CardStack from "./CardStack";
import VideoDrawer from "./VideoDrawer";
import { getOrCreateVoter } from "@/lib/voter";
import {
  recordVote,
  flushEngagement,
  flushEngagementsOnExit,
  createSession,
  completeSession,
  completeSessionOnExit,
} from "@/lib/tracking";
import { supabase } from "@/lib/supabase";
import { POSITIVE_VOTE_BUDGET } from "@/lib/constants";
import type { Idea, SwipeDirection, EngagementAccum } from "@/types";

const LIKED_KEY = "fd_liked_ideas";

interface LikedIdea {
  slug: string;
  title: string;
  direction: "right" | "up";
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function GameScreen() {
  const router = useRouter();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerIdea, setDrawerIdea] = useState<Idea | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [showSyncing, setShowSyncing] = useState(false);
  const [picksUsed, setPicksUsed] = useState(0);

  const picksRemaining = useMemo(
    () => Math.max(0, POSITIVE_VOTE_BUDGET - picksUsed),
    [picksUsed]
  );

  // Refs so event handlers always see the current value without re-registering
  const voterIdRef   = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accumsRef    = useRef<Map<string, EngagementAccum>>(new Map());
  // Keyed by idea.id so we can add/replace/remove on revote without dupes.
  const likedIdeasRef = useRef<Map<string, LikedIdea>>(new Map());
  // Prior positive votes (right or up) — seeded from the bootstrap RPC so a
  // replaying voter's picks-remaining budget reflects votes already on file.
  const positiveVotedIdsRef = useRef<Set<string>>(new Set());
  const swipedCount  = useRef(0);

  const persistLikedIdeas = useCallback(() => {
    try {
      sessionStorage.setItem(
        LIKED_KEY,
        JSON.stringify(Array.from(likedIdeasRef.current.values()))
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const trackSyncPromise = useCallback(<T,>(work: Promise<T>) => {
    setPendingSyncCount((count) => count + 1);
    void work.finally(() => {
      setPendingSyncCount((count) => Math.max(0, count - 1));
    });
  }, []);

  useEffect(() => {
    if (pendingSyncCount === 0) {
      setShowSyncing(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShowSyncing(true);
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [pendingSyncCount]);

  // Stable identity for add/removeEventListener (avoids orphaned listeners if deps churn).
  const visibilityHiddenFlushRef = useRef(() => {
    const voterId = voterIdRef.current;
    if (!voterId) return;
    flushEngagementsOnExit(voterId, Array.from(accumsRef.current.values()));
  });

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1. Ensure voter exists. Voters may replay and change votes; the
      //    3-positive cap is enforced server-side.
      const { voterId, positiveVotes } = await getOrCreateVoter();
      voterIdRef.current = voterId;

      const priorIds = new Set(positiveVotes.map((v) => v.ideaId));
      const priorDirByIdeaId = new Map(
        positiveVotes.map((v) => [v.ideaId, v.direction] as const)
      );
      positiveVotedIdsRef.current = priorIds;
      // Seed the budget counter so the voter can't acquire a fresh allotment
      // by replaying (server trigger is the ultimate gate).
      if (mounted) setPicksUsed(priorIds.size);

      // 2. Load ideas
      const { data: rows, error } = await supabase
        .from("ideas")
        .select("*")
        .order("sort_order");

      if (!mounted) return;

      if (error || !rows || rows.length === 0) {
        console.error("[game] failed to load ideas", error?.message);
        setLoading(false);
        return;
      }

      const ideaRows = rows as Idea[];

      // Pre-populate the liked map from prior positives so the results
      // screen reflects the latest registered state if the voter exits
      // without finishing this replay.
      const initialLiked = new Map<string, LikedIdea>();
      for (const idea of ideaRows) {
        const direction = priorDirByIdeaId.get(idea.id);
        if (direction) {
          initialLiked.set(idea.id, {
            slug: idea.slug,
            title: idea.title,
            direction,
          });
        }
      }
      likedIdeasRef.current = initialLiked;
      persistLikedIdeas();

      setIdeas(shuffle(ideaRows));
      setLoading(false);

      // 3. Start session
      const sessionId = await createSession(voterId);
      sessionIdRef.current = sessionId;
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ── Flush when tab becomes hidden (keepalive fetch) ───────────────────────
  useLayoutEffect(() => {
    const flushOnHidden = visibilityHiddenFlushRef.current;
    const handler = () => {
      if (document.visibilityState === "hidden") {
        flushOnHidden();
        const sessionId = sessionIdRef.current;
        if (sessionId) {
          completeSessionOnExit(sessionId, swipedCount.current);
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // ── Swipe handler ────────────────────────────────────────────────────────
  const handleSwipe = useCallback(
    (idea: Idea, direction: SwipeDirection) => {
      const voterId = voterIdRef.current;
      swipedCount.current += 1;

      // Fire-and-forget vote upsert. The server trigger will reject any
      // upsert that would push positive vote count past 3.
      if (voterId) {
        trackSyncPromise(recordVote(voterId, idea.id, direction));
      }

      const wasPositive = positiveVotedIdsRef.current.has(idea.id);
      const isPositive = direction === "right" || direction === "up";

      if (isPositive && !wasPositive) {
        positiveVotedIdsRef.current.add(idea.id);
        setPicksUsed((n) => Math.min(POSITIVE_VOTE_BUDGET, n + 1));
      } else if (!isPositive && wasPositive) {
        positiveVotedIdsRef.current.delete(idea.id);
        setPicksUsed((n) => Math.max(0, n - 1));
      }

      if (isPositive) {
        likedIdeasRef.current.set(idea.id, {
          slug: idea.slug,
          title: idea.title,
          direction,
        });
      } else {
        likedIdeasRef.current.delete(idea.id);
      }
      persistLikedIdeas();
    },
    [persistLikedIdeas, trackSyncPromise]
  );

  // ── Drawer open ──────────────────────────────────────────────────────────
  const handleOpenDrawer = useCallback((idea: Idea) => {
    setDrawerIdea(idea);

    // Increment drawer_opens for this idea
    const existing = accumsRef.current.get(idea.id) ?? {
      ideaId: idea.id,
      watchSeconds: 0,
      drawerOpens: 0,
    };
    accumsRef.current.set(idea.id, {
      ...existing,
      drawerOpens: existing.drawerOpens + 1,
    });
  }, []);

  // ── Drawer close ─────────────────────────────────────────────────────────
  const handleDrawerClose = useCallback(
    (watchSeconds: number) => {
      const idea = drawerIdea;
      setDrawerIdea(null);

      if (!idea) return;

      const voterId = voterIdRef.current;

      // Update accumulator
      const existing = accumsRef.current.get(idea.id) ?? {
        ideaId: idea.id,
        watchSeconds: 0,
        drawerOpens: 0,
      };
      const updated = {
        ...existing,
        watchSeconds: existing.watchSeconds + watchSeconds,
      };
      accumsRef.current.set(idea.id, updated);

      // Flush directly (drawer close is a natural write point)
      if (voterId) {
        trackSyncPromise(flushEngagement(voterId, updated));
      }
    },
    [drawerIdea, trackSyncPromise]
  );

  // ── All cards done ───────────────────────────────────────────────────────
  const handleDone = useCallback(async () => {
    const voterId   = voterIdRef.current;
    const sessionId = sessionIdRef.current;

    if (voterId) {
      const accums = Array.from(accumsRef.current.values());
      await Promise.all(accums.map((a) => flushEngagement(voterId, a)));
    }

    if (sessionId) {
      await completeSession(sessionId, swipedCount.current);
    }

    router.push("/results");
  }, [router]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/40">Loading ideas…</p>
        </div>
      </div>
    );
  }

  if (ideas.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#0a0a0f]">
        <p className="text-white/40 text-sm">No ideas loaded yet. Check your Supabase setup.</p>
      </div>
    );
  }

  return (
    <main className="relative flex flex-col h-dvh bg-[#0a0a0f] overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
        <span className="text-sm font-semibold text-white/40 tracking-wide uppercase">
          Founder&apos;s Dilemma
        </span>
        {showSyncing ? (
          <span className="text-xs text-amber-300/90">Syncing…</span>
        ) : (
          <PicksRemainingBadge remaining={picksRemaining} />
        )}
      </header>

      {/* Card area */}
      <div className="flex-1 min-h-0 relative px-5 pb-16 flex flex-col">
        <CardStack
          ideas={ideas}
          picksRemaining={picksRemaining}
          onSwipe={handleSwipe}
          onOpenDrawer={handleOpenDrawer}
          onDone={handleDone}
        />
      </div>

      {/* Action hint bar */}
      <footer className="flex justify-around items-center px-8 pb-10 pt-2 shrink-0">
        <HintButton label="Pass" emoji="👈" color="text-red-400" />
        <HintButton
          label="Love"
          emoji="☝️"
          color="text-brand-400"
          dimmed={picksRemaining === 0}
        />
        <HintButton
          label="Like"
          emoji="👉"
          color="text-green-400"
          dimmed={picksRemaining === 0}
        />
      </footer>

      {/* Video drawer (portal-style, above everything) */}
      <VideoDrawer idea={drawerIdea} onClose={handleDrawerClose} />
    </main>
  );
}

function HintButton({
  label,
  emoji,
  color,
  dimmed = false,
}: {
  label: string;
  emoji: string;
  color: string;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 transition-opacity ${color} ${
        dimmed ? "opacity-25 grayscale" : ""
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-medium opacity-70">{label}</span>
    </div>
  );
}

function PicksRemainingBadge({ remaining }: { remaining: number }) {
  if (remaining === 0) {
    return (
      <span className="text-xs font-medium text-red-300/90">
        Out of picks · pass to finish
      </span>
    );
  }
  return (
    <span className="text-xs text-white/50">
      <span className="font-semibold text-brand-300">{remaining}</span>
      <span className="text-white/40">
        {" "}/ {POSITIVE_VOTE_BUDGET} pick{remaining === 1 ? "" : "s"} left
      </span>
    </span>
  );
}

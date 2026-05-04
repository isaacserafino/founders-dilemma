// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
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
} from "@/lib/tracking";
import { supabase } from "@/lib/supabase";
import type { Idea, SwipeDirection, EngagementAccum } from "@/types";

const LIKED_KEY = "fd_liked_ideas";

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
  const [alreadyPlayed, setAlreadyPlayed] = useState(false);
  const [drawerIdea, setDrawerIdea] = useState<Idea | null>(null);

  // Refs so event handlers always see the current value without re-registering
  const voterIdRef   = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accumsRef    = useRef<Map<string, EngagementAccum>>(new Map());
  const swipedCount  = useRef(0);

  // Stable identity for add/removeEventListener (avoids orphaned listeners if deps churn).
  const pageHideFlushRef = useRef(() => {
    const voterId = voterIdRef.current;
    if (!voterId) return;
    flushEngagementsOnExit(voterId, Array.from(accumsRef.current.values()));
  });

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1. Ensure voter exists (one full playthrough per voter, server-enforced)
      const { voterId, playthroughCompleted } = await getOrCreateVoter();
      voterIdRef.current = voterId;

      if (playthroughCompleted) {
        setAlreadyPlayed(true);
        setLoading(false);
        return;
      }

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

      // Fresh deck: likes are only for this run (sessionStorage survives reloads).
      try {
        sessionStorage.removeItem(LIKED_KEY);
      } catch {
        /* ignore quota / private mode */
      }

      setIdeas(shuffle(rows as Idea[]));
      setLoading(false);

      // 3. Start session
      const sessionId = await createSession(voterId);
      sessionIdRef.current = sessionId;
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ── pagehide flush (keepalive fetch; same unload semantics as sendBeacon) ─
  useLayoutEffect(() => {
    const handler = pageHideFlushRef.current;
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);

  // ── Swipe handler ────────────────────────────────────────────────────────
  const handleSwipe = useCallback(
    (idea: Idea, direction: SwipeDirection) => {
      const voterId = voterIdRef.current;
      swipedCount.current += 1;

      // Fire-and-forget vote insert
      if (voterId) {
        recordVote(voterId, idea.id, direction);
      }

      // Accumulate for results screen
      if (direction === "right" || direction === "up") {
        const liked: { slug: string; title: string; direction: "right" | "up" }[] = [];
        try {
          const raw = sessionStorage.getItem(LIKED_KEY);
          if (raw) liked.push(...JSON.parse(raw));
        } catch { /* ignore */ }
        liked.push({ slug: idea.slug, title: idea.title, direction });
        sessionStorage.setItem(LIKED_KEY, JSON.stringify(liked));
      }
    },
    []
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
        flushEngagement(voterId, updated);
      }
    },
    [drawerIdea]
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

  if (alreadyPlayed) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 min-h-dvh bg-[#0a0a0f] px-6 text-center">
        <p className="text-white/80 text-lg max-w-sm">
          You have already completed the deck. Each visitor gets one playthrough.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-brand-400 hover:text-brand-300 underline underline-offset-4"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <main className="relative flex flex-col min-h-dvh bg-[#0a0a0f] overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-12 pb-4 shrink-0">
        <span className="text-sm font-semibold text-white/40 tracking-wide uppercase">
          Founder&apos;s Dilemma
        </span>
        <span className="text-xs text-white/30">Swipe to vote</span>
      </header>

      {/* Card area */}
      <div className="flex-1 relative px-5 pb-16">
        <CardStack
          ideas={ideas}
          onSwipe={handleSwipe}
          onOpenDrawer={handleOpenDrawer}
          onDone={handleDone}
        />
      </div>

      {/* Action hint bar */}
      <footer className="flex justify-around items-center px-8 pb-10 pt-2 shrink-0">
        <HintButton label="Pass" emoji="👈" color="text-red-400" />
        <HintButton label="Love" emoji="☝️" color="text-brand-400" />
        <HintButton label="Like" emoji="👉" color="text-green-400" />
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
}: {
  label: string;
  emoji: string;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-1 ${color}`}>
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs font-medium opacity-70">{label}</span>
    </div>
  );
}

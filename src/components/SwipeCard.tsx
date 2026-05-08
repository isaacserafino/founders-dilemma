// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import Image from "next/image";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimation,
  type PanInfo,
} from "framer-motion";
import type { Idea, SwipeDirection } from "@/types";

// ─── Physics constants ────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 100;   // px before a drag commits to a swipe
const FLY_DISTANCE   = 600;    // px cards fly off-screen
const ROTATION_RANGE = 18;     // max deg tilt at card edge
const INPUT_RANGE    = 200;    // drag px mapped to full rotation

interface SwipeCardProps {
  idea: Idea;
  stackIndex: number; // 0 = top card, 1 = second, 2 = third…
  totalCards: number;
  /** Positive votes the voter can still cast; 0 disables right/up commit. */
  picksRemaining: number;
  onSwipe: (direction: SwipeDirection) => void;
  onOpenDrawer: () => void;
}

export default function SwipeCard({
  idea,
  stackIndex,
  totalCards,
  picksRemaining,
  onSwipe,
  onOpenDrawer,
}: SwipeCardProps) {
  const isTop = stackIndex === 0;
  const outOfPicks = picksRemaining === 0;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const controls = useAnimation();

  function springToCenter() {
    controls.start({
      x: 0,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 20 },
    });
  }

  // Rotate based on horizontal drag (natural throw feel)
  const rotate = useTransform(x, [-INPUT_RANGE, 0, INPUT_RANGE], [-ROTATION_RANGE, 0, ROTATION_RANGE]);

  // Overlay opacities
  const likeOpacity  = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity  = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const superOpacity = useTransform(y, [-SWIPE_THRESHOLD, -20], [1, 0]);

  // Stack peek: cards below are scaled down and offset upward
  const scale = 1 - stackIndex * 0.04;
  const yOffset = stackIndex * 12; // px gap between stacked cards

  async function flyOut(direction: SwipeDirection) {
    const xTarget =
      direction === "left"  ? -FLY_DISTANCE :
      direction === "right" ?  FLY_DISTANCE : 0;
    const yTarget = direction === "up" ? -FLY_DISTANCE : 40;

    await controls.start({
      x: xTarget,
      y: yTarget,
      opacity: 0,
      transition: { duration: 0.35, ease: [0.32, 0, 0.67, 0] },
    });
    onSwipe(direction);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);

    const wantsLove = offset.y < -SWIPE_THRESHOLD && absY > absX;
    const wantsLike = offset.x > SWIPE_THRESHOLD || velocity.x > 500;
    const wantsPass = offset.x < -SWIPE_THRESHOLD || velocity.x < -500;

    // Out of picks: refuse to commit positive votes, but allow passes through.
    if (outOfPicks && (wantsLove || wantsLike)) {
      springToCenter();
      return;
    }

    if (wantsLove) {
      flyOut("up");
    } else if (wantsLike) {
      flyOut("right");
    } else if (wantsPass) {
      flyOut("left");
    } else {
      springToCenter();
    }
  }

  return (
    <motion.div
      className="absolute inset-0 no-select"
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : yOffset,
        rotate: isTop ? rotate : 0,
        scale,
        zIndex: totalCards - stackIndex,
        originX: 0.5,
        originY: 1,
      }}
      animate={isTop ? controls : undefined}
      drag={isTop ? true : false}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.9}
      onDragEnd={isTop ? handleDragEnd : undefined}
      // Propagate motion values to the live x/y refs
      onDrag={(_, info) => {
        if (!isTop) return;
        x.set(info.offset.x);
        y.set(info.offset.y);
      }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl">
        {/* Poster image */}
        {idea.poster_url ? (
          <Image
            src={idea.poster_url}
            alt={idea.title}
            fill
            className="object-cover"
            priority={stackIndex === 0}
            draggable={false}
          />
        ) : (
          <PlaceholderPoster idea={idea} />
        )}

        {/* Bottom gradient + text */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 flex flex-col gap-1">
          <h2 className="text-2xl font-bold leading-tight">{idea.title}</h2>
          <p className="text-sm text-white/70 leading-snug">{idea.tagline}</p>

          {/* "Watch pitch" tap target — only on top card */}
          {isTop && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDrawer();
              }}
              className="mt-3 self-start flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-sm font-medium backdrop-blur-sm active:bg-white/20 transition-colors"
            >
              <span>▶</span> Watch pitch
            </button>
          )}
        </div>

        {/* Swipe hint overlays */}
        {isTop && (
          <>
            <motion.div
              className={`absolute inset-0 rounded-3xl pointer-events-none ${
                outOfPicks ? "swipe-nope" : "swipe-like"
              }`}
              style={{ opacity: likeOpacity }}
            >
              {outOfPicks ? (
                <span className="absolute top-8 left-6 right-6 text-red-400 font-black text-2xl tracking-widest rotate-[-8deg]">
                  OUT OF PICKS
                </span>
              ) : (
                <span className="absolute top-8 left-6 text-green-400 font-black text-3xl tracking-widest rotate-[-12deg]">
                  LIKE
                </span>
              )}
            </motion.div>

            <motion.div
              className="absolute inset-0 rounded-3xl swipe-nope pointer-events-none"
              style={{ opacity: nopeOpacity }}
            >
              <span className="absolute top-8 right-6 text-red-400 font-black text-3xl tracking-widest rotate-[12deg]">
                NOPE
              </span>
            </motion.div>

            <motion.div
              className={`absolute inset-0 rounded-3xl pointer-events-none ${
                outOfPicks ? "swipe-nope" : "swipe-super"
              }`}
              style={{ opacity: superOpacity }}
            >
              {outOfPicks ? (
                <span className="absolute top-8 left-6 right-6 text-center text-red-400 font-black text-2xl tracking-widest">
                  OUT OF PICKS
                </span>
              ) : (
                <span className="absolute top-8 left-1/2 -translate-x-1/2 text-brand-400 font-black text-3xl tracking-widest">
                  LOVE
                </span>
              )}
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}

/** Gradient placeholder when no poster is available yet */
function PlaceholderPoster({ idea }: { idea: Idea }) {
  const gradients = [
    "from-violet-900 via-purple-800 to-indigo-900",
    "from-rose-900 via-pink-800 to-fuchsia-900",
    "from-sky-900 via-blue-800 to-indigo-900",
    "from-emerald-900 via-teal-800 to-cyan-900",
    "from-amber-900 via-orange-800 to-red-900",
    "from-slate-900 via-gray-800 to-zinc-900",
    "from-lime-900 via-green-800 to-emerald-900",
  ];
  const gradient = gradients[idea.sort_order % gradients.length];

  return (
    <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
      <span className="text-7xl opacity-30 select-none">⚡</span>
    </div>
  );
}

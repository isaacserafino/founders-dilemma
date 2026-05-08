// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 isaacserafino — https://github.com/isaacserafino/founders-dilemma
"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import SwipeCard from "./SwipeCard";
import type { Idea, SwipeDirection } from "@/types";

interface CardStackProps {
  ideas: Idea[];
  /** Positive votes (right + up) the voter can still cast across the deck. */
  picksRemaining: number;
  onSwipe: (idea: Idea, direction: SwipeDirection) => void;
  onOpenDrawer: (idea: Idea) => void;
  onDone: () => void;
}

// How many cards to render in the DOM at once (top + peeking cards beneath)
const VISIBLE_STACK_DEPTH = 3;

export default function CardStack({
  ideas,
  picksRemaining,
  onSwipe,
  onOpenDrawer,
  onDone,
}: CardStackProps) {
  const [index, setIndex] = useState(0);

  const remaining = ideas.slice(index);
  const visible = remaining.slice(0, VISIBLE_STACK_DEPTH);

  function handleSwipe(idea: Idea, direction: SwipeDirection) {
    onSwipe(idea, direction);
    const next = index + 1;
    setIndex(next);
    if (next >= ideas.length) {
      // Small delay so the last card finishes flying before transitioning
      setTimeout(onDone, 400);
    }
  }

  if (remaining.length === 0) return null;

  return (
    <div className="relative w-full flex-1 min-h-0">
      <AnimatePresence>
        {visible.map((idea, stackIndex) => (
          <SwipeCard
            key={idea.id}
            idea={idea}
            stackIndex={stackIndex}
            totalCards={visible.length}
            picksRemaining={picksRemaining}
            onSwipe={(dir) => {
              if (stackIndex === 0) handleSwipe(idea, dir);
            }}
            onOpenDrawer={() => {
              if (stackIndex === 0) onOpenDrawer(idea);
            }}
          />
        ))}
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5">
        {ideas.map((_, i) => (
          <span
            key={i}
            className={`block w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i < index
                ? "bg-white/70 scale-100"
                : i === index
                ? "bg-brand-400 scale-125"
                : "bg-white/20"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
